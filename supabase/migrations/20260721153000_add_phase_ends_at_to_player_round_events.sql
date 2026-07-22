-- Per-player round timer deadline column for async (Relax) Compete Option A.
-- phase_ends_at is set to startedAt + sessions.round_timer_sec when a per-player
-- ROUND_STARTED event is written and the host has enabled a round timer;
-- it remains NULL when the timer is off.
ALTER TABLE public.player_round_events
  ADD COLUMN IF NOT EXISTS phase_ends_at TIMESTAMP NULL;

-- Support the "earliest expiring active player" query used by the PartyKit DO
-- per-player timer scheduler. Partial index scoped to ROUND_STARTED rows with a
-- timer set keeps the index small and fast.
CREATE INDEX IF NOT EXISTS idx_player_round_events_phase_ends_at
  ON public.player_round_events (game_id, phase_ends_at)
  WHERE event_type = 'ROUND_STARTED' AND phase_ends_at IS NOT NULL;
