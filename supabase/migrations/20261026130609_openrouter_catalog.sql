-- AIP-BUILD-CATALOGSTORE-1026-204
-- Persist the OpenRouter model catalog daily.
--   (1) openrouter_models        snapshot, one row per model slug.
--   (2) openrouter_model_history append-only; a row ONLY on first sight or a
--       tracked change (price / modality / context / delisted / relisted /
--       expiring). No FK to openrouter_models on purpose: history outlives
--       the snapshot row.
--   (3) openrouter_sync_runs     one row per sync attempt (cron/admin/cli).
-- Additive DDL only: no UPDATE, no DELETE, no existing table touched. Every
-- table has RLS enabled with NO policies (service-role / direct pool only).
-- Reuses the existing public.enforce_append_only() trigger function defined in
-- 20260810043000_create_eval_dataset_phase1.sql; it is NOT redefined here.
-- Applied to PROD by the CTO via the Supabase connector; the file is renamed
-- to PROD's recorded version at merge.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.openrouter_sync_runs;
--   DROP TABLE IF EXISTS public.openrouter_model_history;
--   DROP TABLE IF EXISTS public.openrouter_models;

CREATE TABLE IF NOT EXISTS public.openrouter_models (
  model_id              text PRIMARY KEY,
  canonical_slug        text,
  alias_target          text,
  provider_slug         text NOT NULL,
  name                  text NOT NULL,
  description           text,
  created_ts            timestamptz,
  context_length        integer,
  max_completion_tokens integer,
  input_modalities      text[] NOT NULL DEFAULT '{}',
  output_modalities     text[] NOT NULL DEFAULT '{}',
  is_vision             boolean NOT NULL DEFAULT false,
  supported_parameters  text[] NOT NULL DEFAULT '{}',
  -- USD per token; NULL when absent or variable (negative in the feed).
  price_prompt_usd      numeric(20,12),
  price_completion_usd  numeric(20,12),
  price_image_usd       numeric(20,12),
  price_request_usd     numeric(20,12),
  price_reasoning_usd   numeric(20,12),
  variable_pricing      boolean NOT NULL DEFAULT false,
  is_free               boolean NOT NULL DEFAULT false,
  expiration_date       date,
  -- Endpoint health columns stay NULL until a later task fills them.
  endpoints_count       integer,
  best_uptime_30m       numeric(5,2),
  endpoints_checked_at  timestamptz,
  availability_status   text NOT NULL DEFAULT 'unknown'
    CHECK (availability_status IN
      ('available','no_endpoints','not_in_catalog','expiring','unknown')),
  availability_reason   text,
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  missing_since         timestamptz,
  raw_hash              text NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS openrouter_models_provider_idx
  ON public.openrouter_models (provider_slug);
CREATE INDEX IF NOT EXISTS openrouter_models_vision_free_idx
  ON public.openrouter_models (is_vision, is_free);
CREATE INDEX IF NOT EXISTS openrouter_models_missing_since_idx
  ON public.openrouter_models (missing_since)
  WHERE missing_since IS NOT NULL;

ALTER TABLE public.openrouter_models ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.openrouter_model_history (
  id                   bigserial PRIMARY KEY,
  model_id             text NOT NULL,
  observed_at          timestamptz NOT NULL DEFAULT now(),
  -- subset of: new, price_changed, modality_changed, context_changed,
  --            delisted, relisted, expiring
  change_kinds         text[] NOT NULL,
  price_prompt_usd     numeric(20,12),
  price_completion_usd numeric(20,12),
  price_image_usd      numeric(20,12),
  context_length       integer,
  input_modalities     text[],
  availability_status  text,
  raw_hash             text
);

CREATE INDEX IF NOT EXISTS openrouter_model_history_model_observed_idx
  ON public.openrouter_model_history (model_id, observed_at DESC);

ALTER TABLE public.openrouter_model_history ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_openrouter_model_history_append_only
  BEFORE UPDATE OR DELETE ON public.openrouter_model_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();

CREATE TABLE IF NOT EXISTS public.openrouter_sync_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  source          text NOT NULL
    CHECK (source IN ('vercel_cron','github','admin','cli')),
  status          text NOT NULL
    CHECK (status IN ('running','ok','error')),
  models_seen     integer,
  new_count       integer,
  changed_count   integer,
  delisted_count  integer,
  relisted_count  integer,
  error           text
);

ALTER TABLE public.openrouter_sync_runs ENABLE ROW LEVEL SECURITY;
