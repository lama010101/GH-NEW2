import { NextResponse } from "next/server";
import { submitGuess, getRoundResults } from "@/server/sessionCore";
import { requireAuthenticatedPlayer } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const auth = await requireAuthenticatedPlayer(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as {
      playerId?: string;
      roundIndex?: number;
      yearGuess?: number | null;
      locationGuess?: { lat?: number | null; lng?: number | null } | null;
      year?: number | null;
      lat?: number | null;
      lng?: number | null;
      hintsUsed?: string[];
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }
    if (body.playerId !== auth.playerId) {
      return NextResponse.json({ error: "playerId does not match authenticated user" }, { status: 403 });
    }

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const parsedLocation =
      body.locationGuess &&
      body.locationGuess.lat != null &&
      body.locationGuess.lng != null
        ? { lat: body.locationGuess.lat, lng: body.locationGuess.lng }
        : body.lat != null && body.lng != null
          ? { lat: body.lat, lng: body.lng }
          : null;

    const snapshot = await submitGuess({
      gameId,
      playerId: body.playerId,
      roundIndex: body.roundIndex,
      yearGuess: body.yearGuess ?? body.year ?? null,
      locationGuess: parsedLocation,
      hintsUsed: Array.isArray(body.hintsUsed) ? body.hintsUsed : [],
      _executionContext: "api"
    });

    // Get results if round is complete
    let results = null;
    if (snapshot.status === "ROUND_COMPLETE") {
      results = await getRoundResults(gameId, body.roundIndex);
    }

    return NextResponse.json({ ...snapshot, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit guess";
    const status = message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
