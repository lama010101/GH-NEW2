import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ error: "Legacy snapshot persistence is disabled. Use /api/session routes instead." }, { status: 410 });
}
