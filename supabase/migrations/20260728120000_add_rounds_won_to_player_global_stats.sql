-- Migration 20260728120000: Add rounds_won to player_global_stats
-- Tracks total rounds won across non-Practice Compete sessions.
-- Updated at game end only. Never updated for Practice sessions.

ALTER TABLE player_global_stats
  ADD COLUMN IF NOT EXISTS rounds_won INT NOT NULL DEFAULT 0 CHECK (rounds_won >= 0);
