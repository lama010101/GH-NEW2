import {
  RANK_GATE_COUNTED_MODES,
  RANK_GATE_WINDOW_ROUNDS,
  evaluatePromotion,
} from "@/core/rank";
import { getDbPool } from "./db";

// RANK-BUILD-ACCGATE-1103-003: server-side rank gate evaluation.
// Rolling accuracy = AVG((location_score + time_score) / 2.0) over the
// player's last RANK_GATE_WINDOW_ROUNDS counted rounds. Counted =
// sessions.mode IN RANK_GATE_COUNTED_MODES only (practice/journey excluded);
// rows with NULL location_score or time_score are excluded, zero-score rounds
// are included. Window order: sessions.created_at DESC NULLS LAST,
// round_index DESC.

export interface RankGateSnapshot {
  totalXp: number;
  maxRankTier: number;
  rollingAccPct: number | null;
  roundsSampled: number;
}

// Reads the player's stats row + rolling window, evaluates promotion, and
// persists the new high-water mark only when it is higher (guarded by
// GREATEST so a concurrent writer can never be pushed down). Idempotent.
export async function evaluateAndPersistRank(playerId: string): Promise<RankGateSnapshot> {
  const db = getDbPool();

  const [statsResult, rollingResult] = await Promise.all([
    db.query<{ total_xp: number | null; max_rank_tier: number | null }>(
      `SELECT total_xp, max_rank_tier
       FROM player_global_stats
       WHERE player_id = $1
       LIMIT 1`,
      [playerId]
    ),
    db.query<{ rolling_acc: string | null; rounds_sampled: string }>(
      `SELECT AVG((w.location_score + w.time_score) / 2.0) AS rolling_acc,
              COUNT(*)::int AS rounds_sampled
       FROM (
         SELECT rr.location_score, rr.time_score
         FROM round_results rr
         JOIN sessions s ON s.game_id = rr.game_id
         WHERE rr.player_id = $1
           AND s.mode = ANY($2::text[])
           AND rr.location_score IS NOT NULL
           AND rr.time_score IS NOT NULL
         ORDER BY s.created_at DESC NULLS LAST, rr.round_index DESC
         LIMIT $3
       ) w`,
      [playerId, [...RANK_GATE_COUNTED_MODES], RANK_GATE_WINDOW_ROUNDS]
    ),
  ]);

  const statsRow = statsResult.rows[0];
  const totalXp = statsRow?.total_xp == null ? 0 : Number(statsRow.total_xp);
  const maxRankTier = statsRow?.max_rank_tier == null ? 1 : Number(statsRow.max_rank_tier);

  const rollRow = rollingResult.rows[0];
  const rollingAccPct = rollRow?.rolling_acc == null ? null : Number(rollRow.rolling_acc);
  const roundsSampled = rollRow?.rounds_sampled == null ? 0 : Number(rollRow.rounds_sampled);

  const newMaxRankTier = evaluatePromotion(totalXp, maxRankTier, rollingAccPct, roundsSampled);

  if (newMaxRankTier > maxRankTier) {
    await db.query(
      `UPDATE player_global_stats
       SET max_rank_tier = GREATEST(max_rank_tier, $2)
       WHERE player_id = $1`,
      [playerId, newMaxRankTier]
    );
  }

  return { totalXp, maxRankTier: newMaxRankTier, rollingAccPct, roundsSampled };
}
