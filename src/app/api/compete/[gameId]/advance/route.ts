import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { advanceRound, loadCompeteSessionSnapshot } from "@/server/sessionCore";
import { TransitionCause, isTransitionCause, ALL_TRANSITION_CAUSES } from "@/core/transitionCause";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  if (!verifyPartyKitSecret(request.headers.get("x-partykit-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let gameId = "";
  let body: { cause?: string; playerId?: string; roundIndex?: number } = {};
  try {
    gameId = params.gameId.trim();
    body = (await request.json().catch(() => ({}))) as {
      cause?: string;
      playerId?: string;
      roundIndex?: number;
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (!isTransitionCause(body.cause)) {
      return NextResponse.json(
        { error: `cause must be one of: ${ALL_TRANSITION_CAUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const cause = body.cause;

    if (cause === TransitionCause.PLAYER && typeof body.playerId !== "string") {
      return NextResponse.json(
        { error: `playerId is required when cause is '${TransitionCause.PLAYER}'` },
        { status: 400 }
      );
    }


    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const snapshot = await advanceRound({
      gameId,
      cause,
      playerId: cause === TransitionCause.PLAYER ? body.playerId : undefined,
      roundIndex: body.roundIndex,
      _executionContext: "api"
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to advance round";
    // Idempotency: if another request already advanced the round (unique constraint
    // violation on ROUND_STARTED), treat as success and return current snapshot.
    if (message.includes("duplicate key") || message.includes("unique constraint") || message.includes("idx_round_events_unique_round_started")) {
      const currentSnapshot = await loadCompeteSessionSnapshot(gameId, body.playerId ?? undefined);
      if (currentSnapshot) {
        return NextResponse.json(currentSnapshot);
      }
    }
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
