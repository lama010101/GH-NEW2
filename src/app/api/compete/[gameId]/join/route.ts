import { NextResponse } from "next/server";
import { joinCompeteSession, loadCompeteSessionSnapshot } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as { playerId?: string; displayName?: string };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.displayName !== "string") {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const snapshot = await joinCompeteSession({
      gameId,
      displayName: body.displayName,
      playerId: body.playerId
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join compete session";
    const status = message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
