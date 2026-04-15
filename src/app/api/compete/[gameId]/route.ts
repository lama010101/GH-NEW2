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
    const snapshot = await loadCompeteSessionSnapshot(gameId, viewerPlayerIdHeader);

    if (!snapshot) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load compete session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
