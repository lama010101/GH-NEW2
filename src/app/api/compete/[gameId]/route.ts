import { NextResponse } from "next/server";
import { loadCompeteSessionSnapshot, assertParticipantOrPartyKit, isActiveSessionPlayer } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    const auth = await assertParticipantOrPartyKit(request, gameId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // PartyKit cold-start viewer ids must correspond to an active session_players row.
    // If the supplied viewer is not an active member, fall back to the base snapshot.
    let viewerPlayerId = auth.playerId;
    if (
      viewerPlayerId &&
      request.headers.get("x-partykit-secret") &&
      request.headers.get("x-viewer-player-id") === viewerPlayerId
    ) {
      const active = await isActiveSessionPlayer(gameId, viewerPlayerId);
      if (!active) {
        viewerPlayerId = null;
      }
    }

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
