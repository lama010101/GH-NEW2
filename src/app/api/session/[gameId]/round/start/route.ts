import { NextResponse } from "next/server";
import { startPracticeRound } from "@/server/practiceSessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as { roundIndex?: unknown };
    const roundIndex = body.roundIndex;

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof roundIndex !== "number" || !Number.isInteger(roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const state = await startPracticeRound(gameId, roundIndex);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start round";
    const status = message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
