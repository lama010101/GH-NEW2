import { NextResponse } from "next/server";
import { loadCompeteSessionSnapshot } from "@/server/sessionCore";

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

    const viewerPlayerIdHeader = _request.headers.get("x-viewer-player-id");
    const url = new URL(_request.url);
    const viewerPlayerIdQuery = url.searchParams.get("playerId");
    const viewerPlayerId = viewerPlayerIdQuery || viewerPlayerIdHeader;
    const snapshot = await loadCompeteSessionSnapshot(gameId, viewerPlayerId);

    if (!snapshot) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load compete session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
