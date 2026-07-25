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
      session_deadline: Date;
      is_session_deadline: boolean;
      player_id: string | null;
      round_index: number | null;
      phase_ends_at: Date | null;
    }>(
      `WITH session_meta AS (
         SELECT mode, session_deadline
         FROM sessions
         WHERE game_id = $1
       ),
       per_player AS (
         SELECT
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
         LIMIT 1
       ),
       unfinalized_count AS (
         SELECT COUNT(*) AS cnt
         FROM session_players sp
         WHERE sp.game_id = $1
           AND sp.left_at IS NULL
           AND sp.kicked IS NOT TRUE
           AND NOT EXISTS (
             SELECT 1 FROM player_round_events pre
             WHERE pre.game_id = sp.game_id
               AND pre.player_id = sp.player_id
               AND pre.event_type = 'PLAYER_SESSION_COMPLETE'
           )
       )
       SELECT
         sm.session_deadline,
         (pp.phase_ends_at IS NULL OR pp.phase_ends_at >= sm.session_deadline) AS is_session_deadline,
         pp.player_id,
         pp.round_index,
         pp.phase_ends_at
       FROM session_meta sm
       CROSS JOIN unfinalized_count uc
       LEFT JOIN per_player pp ON true
       WHERE sm.mode = 'async'
         AND sm.session_deadline IS NOT NULL
         AND uc.cnt > 0`,
      [gameId]
    );

    const row = result.rows[0];
    if (!row) {
      return NextResponse.json(null);
    }

    const response: {
      phaseEndsAt: string;
      isSessionDeadline: boolean;
      playerId?: string;
      roundIndex?: number;
    } = {
      phaseEndsAt: (row.is_session_deadline ? row.session_deadline : row.phase_ends_at)?.toISOString() ?? "",
      isSessionDeadline: row.is_session_deadline,
    };

    if (!row.is_session_deadline && row.player_id && typeof row.round_index === "number") {
      response.playerId = row.player_id;
      response.roundIndex = row.round_index;
    }

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch next expiry";
    console.error("[next-expiry] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
