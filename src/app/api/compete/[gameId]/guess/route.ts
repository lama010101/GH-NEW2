import { NextResponse } from "next/server";
import { submitGuess, getRoundResults } from "@/server/sessionCore";
import { executeCommand } from "@/server/engine/executeCommand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as {
      playerId?: string;
      roundIndex?: number;
      year?: number | null;
      lat?: number | null;
      lng?: number | null;
      hintsUsed?: number;
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const snapshot = await executeCommand({
      type: "SUBMIT_GUESS",
      payload: {
        gameId,
        playerId: body.playerId,
        roundIndex: body.roundIndex,
        yearGuess: body.year ?? null,
        locationGuess:
          body.lat != null && body.lng != null
            ? { lat: body.lat, lng: body.lng }
            : null,
        hintsUsed: [],
        _executionContext: "api"
      }
    });

    // Get results if round is complete
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
