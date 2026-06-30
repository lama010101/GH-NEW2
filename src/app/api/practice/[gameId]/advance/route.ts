import { NextResponse } from "next/server";
import { advanceRound, loadCompeteSessionSnapshot } from "@/server/sessionCore";
import { TransitionCause } from "@/core/transitionCause";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const gameId = params.gameId.trim();
  let body: { playerId?: string; roundIndex?: number } = {};
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    body = (await request.json().catch(() => ({}))) as {
      playerId?: string;
      roundIndex?: number;
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

    const snapshot = await advanceRound({
      gameId,
      cause: TransitionCause.PLAYER,
      playerId: body.playerId,
      roundIndex: body.roundIndex,
      _executionContext: "api",
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to advance round";
    if (message.includes("duplicate key") || message.includes("unique constraint") || message.includes("idx_round_events_unique_round_started")) {
      const currentSnapshot = await loadCompeteSessionSnapshot(gameId, body.playerId);
      if (currentSnapshot) {
        return NextResponse.json(currentSnapshot);
      }
    }
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
