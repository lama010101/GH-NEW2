import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOST = "firebasestorage.googleapis.com";
const ALLOWED_BUCKET_PATH = "/v0/b/historify-ai.firebasestorage.app/o/";

function isAllowedUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.hostname.toLowerCase() === ALLOWED_HOST &&
    url.pathname.startsWith(ALLOWED_BUCKET_PATH)
  );
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");

  if (!rawUrl || rawUrl.trim().length === 0) {
    return NextResponse.json(
      { error: "missing url" },
      { status: 400 }
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json(
      { error: "invalid url" },
      { status: 400 }
    );
  }

  if (!isAllowedUrl(parsedUrl)) {
    return NextResponse.json(
      { error: "url not allowed" },
      { status: 400 }
    );
  }

  let upstream: Response;
  try {
    // Use default redirect-follow; we validate the final URL below.
    upstream = await fetch(parsedUrl.toString());
  } catch (err) {
    console.error("[image-proxy] upstream fetch failed:", err);
    return NextResponse.json(
      { error: "upstream fetch failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  let finalUrl: URL;
  try {
    finalUrl = new URL(upstream.url);
  } catch {
    return NextResponse.json(
      { error: "upstream redirect rejected" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!isAllowedUrl(finalUrl)) {
    return NextResponse.json(
      { error: "upstream redirect rejected" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!upstream.ok || !upstream.body) {
    return new NextResponse(null, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("Content-Type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  } else {
    headers.set("Content-Type", "application/octet-stream");
  }

  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 405 });
}

export function POST() {
  return new NextResponse(null, { status: 405 });
}

export function PUT() {
  return new NextResponse(null, { status: 405 });
}

export function DELETE() {
  return new NextResponse(null, { status: 405 });
}

export function PATCH() {
  return new NextResponse(null, { status: 405 });
}
