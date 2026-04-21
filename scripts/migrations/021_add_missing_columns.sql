-- Migration: add display_name to session_players, seed to sessions
-- Task: MP-DB-FIX-001

ALTER TABLE public.session_players
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(32) NOT NULL DEFAULT '';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS seed BIGINT NOT NULL DEFAULT 0;
