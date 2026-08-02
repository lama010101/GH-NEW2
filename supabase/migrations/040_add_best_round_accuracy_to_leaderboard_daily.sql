-- Migration 040: Add best_round_accuracy tiebreak to leaderboard_daily
-- Per ruling MP-FIX-DAILY-TIEBREAK-001: tiebreak on best single-round accuracy
-- instead of total_xp. Historical rows remain NULL.

ALTER TABLE leaderboard_daily
ADD COLUMN best_round_accuracy NUMERIC(5,2)
CHECK (best_round_accuracy >= 0 AND best_round_accuracy <= 100);

COMMENT ON COLUMN leaderboard_daily.best_round_accuracy IS
'Best single-round accuracy for the day, computed as ROUND((location_score + time_score) / 2.0, 2).';

-- Replace the daily ranking index to use best_round_accuracy as the tiebreak.
DROP INDEX IF EXISTS idx_leaderboard_daily_date_rank;
CREATE INDEX idx_leaderboard_daily_date_rank
  ON leaderboard_daily (date, avg_accuracy DESC, best_round_accuracy DESC);
