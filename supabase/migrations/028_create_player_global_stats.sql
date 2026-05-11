-- Migration 028: Create player_global_stats table
-- Tracks cumulative accuracy and XP across all non-Practice sessions per player.
-- Powers the home page identity pill (accuracy % + total XP).
-- Updated at game end only. Never updated for Practice sessions.

CREATE TABLE player_global_stats (
  player_id      UUID         PRIMARY KEY,
  rounds_played  INT          NOT NULL DEFAULT 0 CHECK (rounds_played >= 0),
  avg_accuracy   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (avg_accuracy >= 0 AND avg_accuracy <= 100),
  total_xp       INT          NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- RLS: players can read all rows, no authenticated writes
ALTER TABLE player_global_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_global_stats_select"
  ON player_global_stats
  FOR SELECT
  TO authenticated
  USING (true);
