import { NextRequest, NextResponse } from "next/server";

/**
 * Routes that do NOT require authentication.
 * Everything else redirects to /login if no Supabase session cookie is present.
 */
const PUBLIC_PATHS = ["/", "/login", "/auth/callback"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Next.js internals, static assets, API routes
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

function hasSupabaseSession(request: NextRequest): boolean {
  // Supabase stores the session in a cookie whose name contains "auth-token"
  const cookies = request.cookies.getAll();
  return cookies.some(
    (c) => c.name.includes("auth-token") && c.value.length > 0
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSupabaseSession(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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
