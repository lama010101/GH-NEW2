import { NextResponse } from "next/server";
import { setCompetePlayerReady } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as { playerId?: unknown; ready?: unknown };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
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
