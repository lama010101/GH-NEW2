import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { submitAiGuessForRound, getRoundResults } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DO-triggered AI guess submission (AIP-BUILD-LIVEROUNDINJECTION-PIECE6-001).
// The DO sends only {playerId, roundIndex} — a pure trigger. The answer content
// is looked up from ai_answer_bank server-side and written through submitGuess
// (DB = canonical truth; the DO never sees or computes the answer).
// No usable banked answer → { submitted: false } with zero writes; the AI then
// takes the same absent path as a human no-show at round completion.
export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  if (!verifyPartyKitSecret(request.headers.get("x-partykit-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as {
      playerId?: string;
      roundIndex?: number;
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const result = await submitAiGuessForRound({
      gameId,
      playerId: body.playerId,
      roundIndex: body.roundIndex,
      _executionContext: "api"
    });

    if (!result.submitted) {
      return NextResponse.json({ submitted: false, reason: result.reason });
    }

    const snapshot = result.snapshot;

    // Same response contract as /guess: results attached when the round just
    // completed so the DO can populate roundResultsForClient on broadcast.
    let results = null;
    if (snapshot.status === "ROUND_COMPLETE") {
      results = await getRoundResults(gameId, body.roundIndex);
    }

    return NextResponse.json({ ...snapshot, results, submitted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit AI guess";
    console.error("[AI_GUESS_ERROR]", { message, gameId: params.gameId });
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
