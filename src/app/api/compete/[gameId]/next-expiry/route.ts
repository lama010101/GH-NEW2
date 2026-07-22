import { NextResponse } from "next/server";
import { dbPool } from "@/server/db";
import { verifyPartyKitSecret } from "@/server/partykitAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the single earliest expiring active player for an async (Relax) session.
 * Used by the PartyKit DO per-player round timer alarm scheduler.
 */
export async function GET(
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
    const result = await dbPool.query<{
      player_id: string;
      round_index: number;
      phase_ends_at: Date;
    }>(
      `SELECT
        pre.player_id,
        pre.round_index,
        pre.phase_ends_at
      FROM player_round_events pre
      JOIN session_players sp
        ON sp.game_id = pre.game_id
       AND sp.player_id = pre.player_id
      WHERE pre.game_id = $1
        AND pre.event_type = 'ROUND_STARTED'
        AND pre.phase_ends_at IS NOT NULL
        AND sp.left_at IS NULL
        AND sp.kicked IS NOT TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM player_round_events pre2
          WHERE pre2.game_id = pre.game_id
            AND pre2.player_id = pre.player_id
            AND pre2.round_index = pre.round_index
            AND pre2.event_type = 'ROUND_COMPLETE'
        )
      ORDER BY pre.phase_ends_at ASC
      LIMIT 1`,
      [gameId]
    );

    const row = result.rows[0];
    if (!row) {
      return NextResponse.json(null);
    }

    return NextResponse.json({
      playerId: row.player_id,
      roundIndex: row.round_index,
      phaseEndsAt: row.phase_ends_at.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch next expiry";
    console.error("[next-expiry] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
