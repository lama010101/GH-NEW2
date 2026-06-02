-- Migration 035: Create leaderboard_levelup table
-- All-time Level Up ranking: one row per player.
-- Ranked by current_level DESC, tiebreaker best_accuracy DESC.
-- best_accuracy = accuracy at the player's highest level reached (not all-time best).
-- Updated only if level increases, or level same and accuracy improves.
-- Service role writes only.

CREATE TABLE leaderboard_levelup (
  player_id       UUID      PRIMARY KEY,
  current_level   INT       NOT NULL DEFAULT 1 CHECK (current_level >= 1),
  best_accuracy   INT       NOT NULL DEFAULT 0 CHECK (best_accuracy >= 0 AND best_accuracy <= 100),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leaderboard_levelup_rank
  ON leaderboard_levelup (current_level DESC, best_accuracy DESC);

ALTER TABLE leaderboard_levelup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaderboard_levelup_select"
  ON leaderboard_levelup
  FOR SELECT
  TO authenticated
  USING (true);
