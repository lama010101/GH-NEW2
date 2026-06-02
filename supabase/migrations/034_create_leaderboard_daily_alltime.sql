-- Migration 034: Create leaderboard_daily_alltime table
-- Running aggregate per player across all Daily sessions ever.
-- One row per player, upserted at each Daily game end.
-- avg_accuracy is a running average (not a simple mean of stored values).
-- Primary ranking: avg_accuracy DESC. Tiebreaker: total_xp DESC.
-- Service role writes only.

CREATE TABLE leaderboard_daily_alltime (
  player_id      UUID         PRIMARY KEY,
  games_played   INT          NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  avg_accuracy   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (avg_accuracy >= 0 AND avg_accuracy <= 100),
  total_xp       INT          NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_leaderboard_daily_alltime_rank
  ON leaderboard_daily_alltime (avg_accuracy DESC, total_xp DESC);

ALTER TABLE leaderboard_daily_alltime ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaderboard_daily_alltime_select"
  ON leaderboard_daily_alltime
  FOR SELECT
  TO authenticated
  USING (true);
