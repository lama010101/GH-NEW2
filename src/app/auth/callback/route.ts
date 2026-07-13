import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!code) {
    console.error("[auth/callback] No code parameter in callback URL");
    return NextResponse.redirect(new URL(`/login?error=missing_code`, request.url));
  }

  // Note: the @supabase/ssr PKCE flow does NOT include a `state` query param
  // in the callback redirect URL. CSRF protection is provided by the PKCE
  // code_verifier: only the browser that initiated the OAuth flow holds the
  // verifier, so exchangeCodeForSession() will fail for any attacker-injected
  // code. Do NOT add a `state` presence check here — it blocks all valid
  // PKCE callbacks.

  const cookieStore = await cookies();

  // Log incoming cookies (names only) to diagnose PKCE code-verifier presence
  const incomingCookies = cookieStore.getAll();
  const cookieNames = incomingCookies.map(c => c.name);
  const hasCodeVerifier = cookieNames.some(n => n.includes("code-verifier"));
  console.log("[auth/callback] Incoming cookies:", cookieNames.length, "names:", cookieNames.join(", "));
  console.log("[auth/callback] Has PKCE code-verifier cookie:", hasCodeVerifier);

  // Collect cookies that @supabase/ssr asks us to set during
  // exchangeCodeForSession(). We avoid using NextResponse.next() as an
  // intermediary cookie container — instead we gather them in an array and
  // apply them directly to the final redirect response. This eliminates any
  // risk of cookies being lost between the NextResponse.next() object and the
  // redirect response.
  const collectedCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          for (const c of cookiesToSet) {
            collectedCookies.push({ name: c.name, value: c.value, options: c.options });
          }
          // Also set on request.cookies so downstream handlers see the updated
          // session (harmless if this throws — the redirect response carries
          // the authoritative Set-Cookie headers).
          try {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
          } catch {
            // request.cookies may be readonly in some contexts; safe to ignore
            // because the redirect response carries the Set-Cookie headers.
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  console.log("[auth/callback] exchangeCodeForSession result:", error ? `ERROR: ${error.message}` : "SUCCESS");
  console.log("[auth/callback] Cookies collected for redirect:", collectedCookies.length, "names:", collectedCookies.map(c => c.name).join(", "));

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    const redirectResponse = NextResponse.redirect(new URL(`/?error=auth_failed`, request.url));
    collectedCookies.forEach(({ name, value, options }) =>
      redirectResponse.cookies.set(name, value, options as Record<string, unknown> | undefined)
    );
    return redirectResponse;
  }

  const redirectResponse = NextResponse.redirect(new URL(next, request.url));
  collectedCookies.forEach(({ name, value, options }) =>
    redirectResponse.cookies.set(name, value, options as Record<string, unknown> | undefined)
  );
  console.log("[auth/callback] Redirecting to:", new URL(next, request.url).toString());
  return redirectResponse;
}
