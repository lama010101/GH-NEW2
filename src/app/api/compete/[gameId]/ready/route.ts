import { NextResponse } from "next/server";
import { setCompetePlayerReady } from "@/server/sessionCore";
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
    const body = (await request.json().catch(() => ({}))) as { playerId?: unknown; ready?: unknown };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }
    if (body.playerId !== auth.playerId) {
      return NextResponse.json({ error: "playerId does not match authenticated user" }, { status: 403 });
    }

    if (typeof body.ready !== "boolean") {
      return NextResponse.json({ error: "ready is required" }, { status: 400 });
    }

    const snapshot = await setCompetePlayerReady({
      gameId,
      playerId: body.playerId,
      ready: body.ready
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update readiness";
    const status = message === "Player not found in session" || message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
