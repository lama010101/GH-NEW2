import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Legacy snapshot loading is disabled. Use /api/session routes instead." }, { status: 410 });
}
