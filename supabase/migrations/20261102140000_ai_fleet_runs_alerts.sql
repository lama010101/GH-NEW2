-- AIP-BUILD-FLEETHALT-1102-043 — AI fleet run log + alerts tables.
-- Sorts after 20261102130000_admin_fleet_truth_views.sql.
-- Additive only: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- No policies on either table (service_role access only via GRANT; RLS
-- enabled with zero policies = deny-by-default for every other principal).

CREATE TABLE IF NOT EXISTS public.ai_fleet_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily', 'practice', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'ok', 'partial', 'halted', 'error')),
  halt_reason text,
  plays_attempted int NOT NULL DEFAULT 0,
  plays_ok int NOT NULL DEFAULT 0,
  plays_failed int NOT NULL DEFAULT 0,
  failed_auth int NOT NULL DEFAULT 0,
  failed_gone int NOT NULL DEFAULT 0,
  failed_rate_limit int NOT NULL DEFAULT 0,
  failed_bad_output int NOT NULL DEFAULT 0,
  failed_other int NOT NULL DEFAULT 0,
  github_run_url text
);

CREATE TABLE IF NOT EXISTS public.ai_fleet_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('auth_fleet', 'budget', 'model_gone', 'circuit_open')),
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  message text NOT NULL,
  model_id text,
  run_id uuid REFERENCES public.ai_fleet_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences int NOT NULL DEFAULT 1,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_fleet_runs_started_at_idx
  ON public.ai_fleet_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS ai_fleet_alerts_resolved_created_idx
  ON public.ai_fleet_alerts (resolved_at, created_at DESC);

ALTER TABLE public.ai_fleet_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_fleet_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_fleet_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_fleet_alerts FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ai_fleet_runs TO service_role;
GRANT ALL ON public.ai_fleet_alerts TO service_role;
