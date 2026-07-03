-- Migration: create_daily_attempts
-- Per DAILY_MODE_SPEC.md §5.1 — enforces one attempt per player per UTC date,
-- including in-progress attempts (leaderboard_daily PK only protects completed).
-- PK (date, player_id) prevents double-start.
-- RLS: SELECT for authenticated on own rows only. INSERT/UPDATE/DELETE
-- service-role only (API writes via service client, not client-side).

CREATE TABLE daily_attempts (
  date         DATE NOT NULL,
  player_id    UUID NOT NULL,
  game_id      UUID NOT NULL,
  status       VARCHAR NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress', 'completed', 'expired')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (date, player_id)
);

ALTER TABLE daily_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_attempts_select_own"
  ON daily_attempts
  FOR SELECT
  TO authenticated
  USING (player_id = auth.uid());
