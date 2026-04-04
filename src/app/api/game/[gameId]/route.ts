import { NextResponse } from "next/server";
import { loadPersistedGameState } from "@/server/gameSessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    const state = await loadPersistedGameState(gameId);

    if (!state) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load game state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
