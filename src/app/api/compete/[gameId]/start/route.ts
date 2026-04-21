import { NextResponse } from "next/server";
import { startCompeteSession } from "@/server/sessionCore";
import { TransitionCause } from "@/core/transitionCause";
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
    const body = (await request.json().catch(() => ({}))) as { playerId?: unknown };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }
    if (body.playerId !== auth.playerId) {
      return NextResponse.json({ error: "playerId does not match authenticated user" }, { status: 403 });
    }

    const snapshot = await startCompeteSession({
      gameId,
      playerId: body.playerId,
      cause: TransitionCause.PLAYER
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start compete session";
    const status = message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
