-- Per-player round progress events for async (Relax) Compete Option A.
-- This table is append-only and scoped to a single player; it is NOT used by
-- the sync (Rush) FSM, which continues to use round_events exclusively.
CREATE TABLE IF NOT EXISTS public.player_round_events (
  id                 BIGSERIAL PRIMARY KEY,
  game_id            UUID NOT NULL,
  player_id          UUID NOT NULL,
  round_index        INT NOT NULL,
  event_type         VARCHAR NOT NULL,
  payload            JSONB,
  occurred_at        TIMESTAMP NOT NULL DEFAULT now(),
  verification_token UUID NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX IF NOT EXISTS idx_player_round_events_game_player
  ON public.player_round_events (game_id, player_id, round_index);

-- Idempotency: one ROUND_STARTED and one ROUND_COMPLETE per (game_id, player_id, round_index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_round_events_unique_started
  ON public.player_round_events (game_id, player_id, round_index)
  WHERE event_type = 'ROUND_STARTED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_round_events_unique_complete
  ON public.player_round_events (game_id, player_id, round_index)
  WHERE event_type = 'ROUND_COMPLETE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_round_events_unique_session_complete
  ON public.player_round_events (game_id, player_id)
  WHERE event_type = 'PLAYER_SESSION_COMPLETE';

ALTER TABLE public.player_round_events ENABLE ROW LEVEL SECURITY;

-- Match the current round_events/round_commits participant-scoped SELECT policy.
-- Service role bypasses RLS automatically; no INSERT/UPDATE/DELETE policy means
-- implicit deny for the authenticated role.
DROP POLICY IF EXISTS player_round_events_select_policy ON public.player_round_events;
CREATE POLICY player_round_events_select_policy ON public.player_round_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.session_players
            WHERE game_id = player_round_events.game_id AND player_id = auth.uid())
  );
