import { NextResponse } from "next/server";
import { advanceRound, loadCompeteSessionSnapshot, assertParticipantOrPartyKit } from "@/server/sessionCore";
import { TransitionCause } from "@/core/transitionCause";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const gameId = params.gameId.trim();
  let body: { roundIndex?: number } = {};
  try {
    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    // BOLA check
    const authResult = await assertParticipantOrPartyKit(request, gameId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const playerId = authResult.playerId;
    if (!playerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    body = (await request.json().catch(() => ({}))) as { roundIndex?: number };

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const snapshot = await advanceRound({
      gameId,
      cause: TransitionCause.PLAYER,
      playerId,
      roundIndex: body.roundIndex,
      _executionContext: "api",
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to advance round";
    if (message.includes("duplicate key") || message.includes("unique constraint") || message.includes("idx_round_events_unique_round_started")) {
      const currentSnapshot = await loadCompeteSessionSnapshot(gameId, undefined);
      if (currentSnapshot) {
        return NextResponse.json(currentSnapshot);
      }
    }
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
