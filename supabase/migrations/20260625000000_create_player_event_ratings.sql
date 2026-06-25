-- Migration 20260625000000: create player_event_ratings
-- Ref: MP-INV-FIX-RATING-B3-001
-- Stores per-player 1-10 ratings for events encountered in any mode.
-- Written from the round result screen "Rate" control (GAME_MODES_SPEC §1.2 item 4, §4.8).
-- This is the canonical rating storage shape; History Collection (profile) will read from it.
-- One rating per (player_id, event_id) — upsert on change.

CREATE TABLE IF NOT EXISTS public.player_event_ratings (
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id  UUID NOT NULL,
  rating    INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  rated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, event_id)
);

ALTER TABLE public.player_event_ratings ENABLE ROW LEVEL SECURITY;

-- Players can read their own ratings
CREATE POLICY "player_event_ratings_select_own"
  ON public.player_event_ratings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = player_id);

-- Players can insert their own ratings
CREATE POLICY "player_event_ratings_insert_own"
  ON public.player_event_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = player_id);

-- Players can update their own ratings
CREATE POLICY "player_event_ratings_update_own"
  ON public.player_event_ratings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);
