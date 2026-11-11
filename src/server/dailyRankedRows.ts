import { dbPool } from "@/server/db";
import { resolvePlayerIdentities } from "@/core/playerIdentity";
import { AI_PLAYER_DAILY_SQL } from "@/core/aiPlayerPredicates";

// DLY-BUILD-PANELAPI-1111-106
// Shared loader for the Daily final-screen panel (/api/daily/panel).
// Ranking basis is humans + AI, identical to /api/daily/results
// (loadDailyResults): same human_daily UNION ai_daily SQL, copied verbatim,
// same filters, same RANK() semantics. is_ai is resolved through
// resolvePlayerIdentities — the same discriminator the results route uses.

export type DailyRankedRow = {
  player_id: string;
  rank: number;
  avg_accuracy: number;
  is_ai: boolean;
};

type RawDailyRow = {
  player_id: string;
  rank: number;
  avg_accuracy: number;
  total_xp: number;
  completed_at: Date | null;
  best_round_accuracy: number | null;
};

export async function loadDailyRankedRows(date: string): Promise<DailyRankedRow[]> {
  const result = await dbPool.query<RawDailyRow>(
    `WITH human_daily AS (
      SELECT
        player_id,
        avg_accuracy,
        total_xp,
        completed_at,
        best_round_accuracy
      FROM leaderboard_daily
      WHERE date = $1
    ),
    ai_daily AS (
      SELECT
        a.ai_player_id AS player_id,
        ROUND(AVG(a.round_accuracy)::numeric, 2) AS avg_accuracy,
        COALESCE(SUM(a.round_xp), 0)::int AS total_xp,
        MAX(a.created_at) AS completed_at,
        MAX(a.round_accuracy)::numeric(5,2) AS best_round_accuracy
      FROM ai_answer_bank a
      JOIN ai_players ap ON ap.id = a.ai_player_id AND ${AI_PLAYER_DAILY_SQL}
      JOIN daily_challenges dc ON dc.date = $1 AND a.event_id = ANY(dc.event_ids)
      WHERE a.error IS NULL
      GROUP BY a.ai_player_id
    ),
    combined AS (
      SELECT * FROM human_daily
      UNION ALL
      SELECT * FROM ai_daily
    ),
    ranked AS (
      SELECT
        player_id,
        avg_accuracy,
        total_xp,
        completed_at,
        best_round_accuracy,
        RANK() OVER (ORDER BY avg_accuracy DESC, best_round_accuracy DESC NULLS LAST)::int AS rank
      FROM combined
    )
    SELECT player_id, rank, avg_accuracy, total_xp, completed_at, best_round_accuracy
    FROM ranked
    ORDER BY rank`,
    [date]
  );

  const rows = result.rows;
  const allPlayerIds = Array.from(new Set(rows.map((r) => r.player_id)));
  const identityMap = await resolvePlayerIdentities(dbPool, allPlayerIds);

  return rows.map((row) => ({
    player_id: row.player_id,
    rank: Number(row.rank),
    avg_accuracy: Number(row.avg_accuracy),
    is_ai: identityMap.get(row.player_id)?.is_ai ?? false,
  }));
}
