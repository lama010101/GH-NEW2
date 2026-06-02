-- Migration 036: Add games_played column to player_global_stats
-- Tracks total non-Practice games completed per player.
-- Incremented by 1 at each game end (Daily, Level Up, Compete).
-- Used by profile page to display total games played.

ALTER TABLE player_global_stats
  ADD COLUMN IF NOT EXISTS games_played INT NOT NULL DEFAULT 0 CHECK (games_played >= 0);
