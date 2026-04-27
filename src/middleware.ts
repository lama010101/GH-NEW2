import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/compete/")) {
    const secret = request.headers.get("x-partykit-secret");
    const expected = process.env.PARTYKIT_SECRET;
    const origin = request.headers.get("origin");
    const isServerToServer = !origin;

    if (expected && isServerToServer && secret !== expected) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/compete/:path*"
};
