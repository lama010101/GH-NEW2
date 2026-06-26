import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that do NOT require authentication.
 * Everything else redirects to /login if no Supabase session is present.
 */
const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/help"];

// Public API routes that must remain reachable without authentication.
// All other /api/* routes are required to pass the middleware auth check.
const PUBLIC_API_ROUTES = [
  "/api/events",
  "/api/compete/join",
  "/api/compete/create",
  "/api/geocode",
  "/api/waitlist",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  // Build a mutable response object that Supabase can write refreshed cookies onto.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // IMPORTANT: getUser() triggers session refresh if the access token is stale.
  // Do not remove or replace with getSession() — getSession() does not refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Admin bypass: only on exact path "/".
  if (pathname === "/") {
    const adminParam = request.nextUrl.searchParams.get("admin");
    if (adminParam !== null) {
      if (adminParam === process.env.ADMIN_BYPASS_TOKEN) {
        const bypassResponse = NextResponse.redirect(
          new URL("/home", request.url),
          302
        );
        bypassResponse.cookies.set("gh_admin_bypass", "1", {
          httpOnly: true,
          maxAge: 90 * 24 * 60 * 60,
        });
        return bypassResponse;
      }
      // Wrong value: fall through silently to normal landing page serving.
    } else if (request.cookies.get("gh_admin_bypass")?.value === "1") {
      return NextResponse.redirect(new URL("/home", request.url), 302);
    }
  }

  if (isPublicPath(pathname)) {
    return response;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
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
