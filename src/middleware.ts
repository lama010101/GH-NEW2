import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";

/**
 * Routes that do NOT require authentication.
 * Everything else redirects to /login if no Supabase session is present.
 */
// /sw.js is a self-unregistering kill-switch service worker served as a static
// file from public/. It must be reachable without auth so stale SWs from prior
// deployments can update/unregister instead of receiving a /login HTML redirect.
const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/help", "/privacy", "/terms", "/sw.js", "/grow"];

// Public API routes that must remain reachable without authentication.
// All other /api/* routes are required to pass the middleware auth check.
const PUBLIC_API_ROUTES = [
  "/api/events",
  "/api/compete/join",
  "/api/compete/create",
  "/api/geocode",
  "/api/waitlist",
  "/api/leaderboard",
  "/api/image-proxy",
  "/api/push/subscribe",
];

// PartyKit DO routes that carry their own x-partykit-secret validation. They must
// be reachable without a browser session so the route handler can return 401/403.
const PARTYKIT_SECRET_ROUTES = [
  /^\/api\/compete\/[0-9a-fA-F-]+\/finalize-deadline$/,
];

const STATIC_ASSET_EXTENSIONS = [
  ".webp", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".gif", ".css", ".woff", ".woff2", ".mp3",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/prototype")) return true;
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) return true;
  if (PARTYKIT_SECRET_ROUTES.some((route) => route.test(pathname))) return true;
  const lastDot = pathname.lastIndexOf(".");
  if (lastDot !== -1 && STATIC_ASSET_EXTENSIONS.includes(pathname.slice(lastDot).toLowerCase())) {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  // Build a mutable response object that Supabase can write refreshed cookies onto.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // FLAG: middleware previously used the user-refreshing auth call here, which
  // holds the GoTrue shared mutex. Per the project auth-session resilience
  // rule, we now use a single getSession() call with a bounded timeout. A
  // timeout is treated as "no valid session" and falls through to the
  // existing null-session path.
  const SESSION_TIMEOUT_MS = 5000;
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<{ data: { session: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null } }), SESSION_TIMEOUT_MS)
    ),
  ]);
  const user = sessionResult.data.session?.user ?? null;

  const { pathname } = request.nextUrl;

  // Root path: signed-in users go to /home. Signed-out users see the
  // public landing page rendered by src/app/page.tsx (handled below by
  // falling through to isPublicPath).
  if (pathname === "/" && user) {
    return NextResponse.redirect(new URL("/home", request.url), 307);
  }

  // Authenticated users visiting /login are redirected to their destination
  // instead of seeing the AuthModal. This prevents redundant OAuth flows when
  // a user already has a valid session (e.g. after a callback redirect loop
  // or direct navigation to /login while signed in).
  if (pathname === "/login" && user) {
    const rawNext = request.nextUrl.searchParams.get("next") ?? "/home";
    const nextPath = rawNext.startsWith("/") && rawNext !== "/" ? rawNext : "/home";
    return NextResponse.redirect(new URL(nextPath, request.url), 302);
  }

  if (isPublicPath(pathname)) {
    return response;
  }

  // Server-to-server calls from the PartyKit Durable Object carry a valid
  // x-partykit-secret header. These are legitimate service calls (cold-start
  // session load, join/state mutations) with no browser session cookie, so
  // they must NOT be redirected to /login. Routes whose handlers also
  // validate this secret (e.g. /api/compete/[gameId]/join) keep their own
  // enforcement; this only skips the middleware redirect for the secret path.
  if (verifyPartyKitSecret(request.headers.get("x-partykit-secret"))) {
    return response;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = !profileError && profile?.role === "admin";
    if (!isAdmin) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
