-- AIP-FIX-NEWMODELSAFE-1026-201
-- New AI players are born inactive, and only one live player may exist per model_id.
--   (1) Column defaults is_active / is_active_daily / is_active_practice become
--       false, so a newly inserted ai_players row is never instantly spendable by
--       the daily runner. Existing rows are NOT touched (defaults only).
--   (2) Partial UNIQUE index on model_id for live (deleted_at IS NULL) rows.
--       PROD verified 2026-10-26: zero duplicate model_id groups, so the index
--       builds cleanly. Soft-deleted rows may still share a model_id.
-- DDL only: no UPDATE, no DELETE. Idempotent (SET DEFAULT is repeatable,
-- CREATE UNIQUE INDEX IF NOT EXISTS). Applied to PROD by the CTO via the
-- Supabase connector.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.ai_players_model_id_live_uniq;
--   ALTER TABLE public.ai_players ALTER COLUMN is_active SET DEFAULT true;
--   ALTER TABLE public.ai_players ALTER COLUMN is_active_daily SET DEFAULT true;
--   ALTER TABLE public.ai_players ALTER COLUMN is_active_practice SET DEFAULT true;

ALTER TABLE public.ai_players ALTER COLUMN is_active SET DEFAULT false;
ALTER TABLE public.ai_players ALTER COLUMN is_active_daily SET DEFAULT false;
ALTER TABLE public.ai_players ALTER COLUMN is_active_practice SET DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ai_players_model_id_live_uniq
  ON public.ai_players (model_id)
  WHERE deleted_at IS NULL;
