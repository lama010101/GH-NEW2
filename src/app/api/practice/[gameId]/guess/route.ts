import { NextResponse } from "next/server";
import { submitGuess, getRoundResults } from "@/server/sessionCore";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gameId = params.gameId.trim();
    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      playerId?: string;
      roundIndex?: number;
      year?: number | null;
      lat?: number | null;
      lng?: number | null;
      hintsUsed?: string[];
    };

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (body.playerId !== user.id) {
      return NextResponse.json({ error: "playerId must match authenticated user" }, { status: 403 });
    }

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const snapshot = await submitGuess({
      gameId,
      playerId: body.playerId,
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
