import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import {
  loadCompeteSessionSnapshot,
  loadSessionPlayerRows,
  maybeFinalizeAsyncSessionDeadline
} from "@/server/sessionCore";
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

  const gameId = params.gameId.trim();
  if (gameId.length === 0) {
    return NextResponse.json({ error: "gameId is required" }, { status: 400 });
  }

  try {
    await maybeFinalizeAsyncSessionDeadline(gameId);

    const playerRows = await loadSessionPlayerRows(gameId);
    const activePlayerIds = playerRows
      .filter((p) => !p.left_at && !p.kicked)
      .map((p) => p.player_id);

    const playerSnapshots: Record<string, CompeteSessionSnapshot> = {};
    for (const playerId of activePlayerIds) {
      const snap = await loadCompeteSessionSnapshot(gameId, playerId);
      if (snap) playerSnapshots[playerId] = snap;
    }

    const firstPlayerId = activePlayerIds[0];
    const firstSnapshot = firstPlayerId
      ? playerSnapshots[firstPlayerId]
      : await loadCompeteSessionSnapshot(gameId, undefined);

    if (!firstSnapshot) {
      throw new Error("Session not found");
    }

    const response: CompeteSessionSnapshot & { playerSnapshots: Record<string, CompeteSessionSnapshot> } = {
      ...firstSnapshot,
      playerSnapshots
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finalize session deadline";
    const status = message.includes("Session not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
