import { NextResponse } from "next/server";
import { submitGuess, getRoundResults, assertParticipantOrPartyKit } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();
    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    // BOLA check — binds playerId to authenticated uid, verifies session_players row
    const authResult = await assertParticipantOrPartyKit(request, gameId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const playerId = authResult.playerId;
    if (!playerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      roundIndex?: number;
      year?: number | null;
      lat?: number | null;
      lng?: number | null;
      hintsUsed?: string[];
    };

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const snapshot = await submitGuess({
      gameId,
      playerId,
      roundIndex: body.roundIndex,
      yearGuess: body.year ?? null,
      locationGuess:
        body.lat != null && body.lng != null
          ? { lat: body.lat, lng: body.lng }
          : null,
      hintsUsed: Array.isArray(body.hintsUsed) ? body.hintsUsed : [],
      _executionContext: "api",
    });

    let results = null;
    if (snapshot.status === "ROUND_COMPLETE") {
      results = await getRoundResults(gameId, body.roundIndex);
    }

    return NextResponse.json({ ...snapshot, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit guess";
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
