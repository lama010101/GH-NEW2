import { NextResponse } from "next/server";
import { createPracticeSession } from "@/server/practiceSessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const state = await createPracticeSession();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
