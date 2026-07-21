import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { submitGuess, getRoundResults } from "@/server/sessionCore";
import type { CompeteSessionSnapshot } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  if (!verifyPartyKitSecret(request.headers.get("x-partykit-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as {
      playerId?: string;
      roundIndex?: number;
      year?: number | null;
      lat?: number | null;
      lng?: number | null;
      hintsUsed?: string[];
      mode?: "sync" | "async";
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
      sessionMode: body.mode
    });

    // Get results if round is complete
    let results = null;
    if (snapshot.status === "ROUND_COMPLETE") {
      results = await getRoundResults(gameId, body.roundIndex);
    }

    // Async per-player snapshots carry their own results inside the bundle.
    const snapshotWithPlayerSnapshots = snapshot as CompeteSessionSnapshot & {
      playerSnapshots?: Record<string, unknown>;
    };
    if (snapshotWithPlayerSnapshots.playerSnapshots && body.playerId) {
      const playerSnapshot = snapshotWithPlayerSnapshots.playerSnapshots[body.playerId] as Record<string, unknown> | undefined;
      if (playerSnapshot) {
        playerSnapshot.results = results;
      }
    }

    return NextResponse.json({ ...snapshotWithPlayerSnapshots, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit guess";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[GUESS_400_ERROR]", { message, stack, gameId: params.gameId });
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
