-- AIP-BUILD-BUDGET-1103-004 — fleet budget settings + skipped-by-budget counter.
-- Sorts after 20261102140000_ai_fleet_runs_alerts.sql.
-- Additive only: CREATE TABLE IF NOT EXISTS, INSERT ON CONFLICT DO NOTHING,
-- ALTER TABLE ADD COLUMN IF NOT EXISTS. No policies on ai_fleet_settings
-- (service_role access only via GRANT; RLS enabled with zero policies =
-- deny-by-default for every other principal).

CREATE TABLE IF NOT EXISTS public.ai_fleet_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_fleet_settings (key, value)
VALUES ('fleet_daily_cap_usd', '2.0'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.ai_fleet_runs
  ADD COLUMN IF NOT EXISTS plays_skipped_budget int NOT NULL DEFAULT 0;

ALTER TABLE public.ai_fleet_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_fleet_settings FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ai_fleet_settings TO service_role;
