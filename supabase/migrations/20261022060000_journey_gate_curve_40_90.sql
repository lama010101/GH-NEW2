-- HJ-BUILD-GATECURVE-40-90-1022-B06
-- Re-derive journey_stages.min_accuracy_pct on the new locked pass-mark curve:
--   min_accuracy_pct(N) = ROUND(40 + 50 * (N - 1) / 99, 1)
-- linear across all 100 stages: 40.0% at stage 1 -> 90.0% at stage 100.
-- Stored rounded to 1 decimal place (column is NUMERIC, CHECK 0-100).
-- UPDATE-only: no DDL, no inserts, no other columns touched. Idempotent
-- (recomputes the same values on re-run). Applied to prod by the
-- supabase-migrations workflow on merge to main.

UPDATE public.journey_stages
SET
  min_accuracy_pct = ROUND(40 + 50 * (stage_number - 1)::numeric / 99, 1),
  updated_at = now()
WHERE stage_number BETWEEN 1 AND 100;
