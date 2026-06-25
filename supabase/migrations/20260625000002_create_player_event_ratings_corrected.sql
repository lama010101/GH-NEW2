-- Migration 20260625000002: create player_event_ratings (corrected)
-- Ref: MP-FIX-APPLY-RATINGS-LOCALE-MIGRATIONS-001
-- Supersedes the unapplied 20260625000000 (CTO-ratified schema correction).
-- Stores per-player 1-10 ratings for events encountered in any mode.
-- One rating per (player_id, event_id) — upsert on change overwrites in place.
--
-- CTO-ratified corrections vs 20260625000000:
--   1. event_id now has FK to events(id) ON DELETE CASCADE
--      (events.id is a stable UUID PK that predates this feature).
--   2. added updated_at TIMESTAMPTZ NOT NULL DEFAULT now() alongside rated_at,
--      so re-rates are distinguishable from first-rate. rated_at is preserved
--      on re-rate (set only on first INSERT); updated_at is set to now() on
--      every write via the API route's ON CONFLICT DO UPDATE clause.
--
-- CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS make this safe to apply
-- given live-state uncertainty, and idempotent if re-run.

CREATE TABLE IF NOT EXISTS public.player_event_ratings (
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id  UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  rating    INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  rated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, event_id)
);

ALTER TABLE public.player_event_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_event_ratings_select_own" ON public.player_event_ratings;
CREATE POLICY "player_event_ratings_select_own"
  ON public.player_event_ratings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "player_event_ratings_insert_own" ON public.player_event_ratings;
CREATE POLICY "player_event_ratings_insert_own"
  ON public.player_event_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "player_event_ratings_update_own" ON public.player_event_ratings;
CREATE POLICY "player_event_ratings_update_own"
  ON public.player_event_ratings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);
