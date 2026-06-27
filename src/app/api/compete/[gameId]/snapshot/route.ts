import { NextResponse } from "next/server";
import { loadCompeteSessionSnapshot, assertParticipantOrPartyKit } from "@/server/sessionCore";

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

    const snapshot = await loadCompeteSessionSnapshot(gameId, auth.playerId);

    if (!snapshot) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
