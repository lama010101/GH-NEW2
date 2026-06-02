-- Migration 033: Create leaderboard_daily table
-- Per-day per-player record for Daily mode.
-- One row per player per day. PK prevents duplicate daily attempts.
-- Primary ranking: avg_accuracy DESC. Tiebreaker: total_xp DESC.
-- Written at Daily game end only. Service role writes only.

CREATE TABLE leaderboard_daily (
  date           DATE         NOT NULL,
  player_id      UUID         NOT NULL,
  avg_accuracy   NUMERIC(5,2) NOT NULL CHECK (avg_accuracy >= 0 AND avg_accuracy <= 100),
  total_xp       INT          NOT NULL CHECK (total_xp >= 0 AND total_xp <= 1000),
  completed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (date, player_id)
);

CREATE INDEX idx_leaderboard_daily_date_rank
  ON leaderboard_daily (date, avg_accuracy DESC, total_xp DESC);

ALTER TABLE leaderboard_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaderboard_daily_select"
  ON leaderboard_daily
  FOR SELECT
  TO authenticated
  USING (true);
