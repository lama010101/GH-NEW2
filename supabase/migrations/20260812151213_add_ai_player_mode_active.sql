-- Add per-mode active flags to ai_players.
-- Backfill from the existing is_active value so current behavior is preserved.
-- The existing is_active column is intentionally left untouched; other code paths still read it.

ALTER TABLE ai_players
  ADD COLUMN is_active_practice BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN is_active_daily BOOLEAN NOT NULL DEFAULT true;

UPDATE ai_players
  SET is_active_practice = is_active,
      is_active_daily = is_active;
