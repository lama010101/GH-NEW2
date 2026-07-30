-- Migration: create_player_daily_streak
-- Per DAILY_MODE_SPEC.md §9 — stores daily streak current/best per player.
-- RLS: SELECT for authenticated on own rows only. INSERT/UPDATE/DELETE
-- service-role only (API writes via service client, not client-side).

CREATE TABLE player_daily_streak (
  player_id            UUID PRIMARY KEY,
  daily_streak_current INT NOT NULL DEFAULT 0,
  daily_streak_best    INT NOT NULL DEFAULT 0,
  last_attempt_date    DATE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE player_daily_streak ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_daily_streak_select_own"
  ON player_daily_streak
  FOR SELECT
  TO authenticated
  USING (player_id = auth.uid());
