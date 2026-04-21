import { NextResponse } from "next/server";
import { advanceRound } from "@/server/sessionCore";
import { TransitionCause, isTransitionCause, ALL_TRANSITION_CAUSES } from "@/core/transitionCause";
import { requireAuthenticatedPlayer } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const auth = await requireAuthenticatedPlayer(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as {
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

    if (cause !== TransitionCause.PLAYER) {
      return NextResponse.json(
        { error: `Only '${TransitionCause.PLAYER}' transitions are allowed through this API route` },
        { status: 403 }
      );
    }

    if (cause === TransitionCause.PLAYER && typeof body.playerId !== "string") {
      return NextResponse.json(
        { error: `playerId is required when cause is '${TransitionCause.PLAYER}'` },
        { status: 400 }
      );
    }

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    if (body.playerId !== auth.playerId) {
      return NextResponse.json({ error: "playerId does not match authenticated user" }, { status: 403 });
    }

    const snapshot = await advanceRound({
      gameId,
      cause,
      playerId: auth.playerId,
      roundIndex: body.roundIndex,
      _executionContext: "api"
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to advance round";
    const status = message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
