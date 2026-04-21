import { NextResponse } from "next/server";
import { loadCompeteSessionSnapshot } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId");

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);

    if (!snapshot) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
