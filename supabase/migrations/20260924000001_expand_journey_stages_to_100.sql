-- Target: dev Supabase project jfggdhsducvjydnejypg
-- Scope: HJ-BUILD-STAGE100-NOAPPROVAL-001 — expand journey_stages to 100 rows
-- (stage_number 1-100) and re-derive min_accuracy_pct on the new locked curve.
-- Do NOT run on prod until v1 validated.
--
-- Host-check safety guard: same constraint as 20260811000001_create_journey_tables.sql
-- — no structurally reliable, project-identifying signal is queryable from inside
-- a PostgreSQL DO block, so project verification is done OUTSIDE this file by the
-- caller. Invoke only through scripts/migrate-journey-dev.sh (which enforces the
-- jfggdhsducvjydnejypg project ref) or against a connection string you have
-- independently verified is the dev project.

-- New locked accuracy-gate curve (spec §5.1):
--   min_accuracy_pct(N) = 50 + 25 * LEAST(N-1, 39) / 39
-- linear 50% -> 75% across stages 1-40, flat 75% for stages 41-100.
-- Stored rounded to 1 decimal place (column is NUMERIC, CHECK 0-100).

-- 1) Insert stage_number 11-100. Existing rows 1-10 are NOT touched here (they
--    keep their ids/created_at); all new rows are status='draft' — NOT 'live'.
--    Content playability under the N*40 recency window is a separate,
--    unverified concern this migration does not resolve. pool_size stays at
--    the column default 5 (draw size is fixed at MAX_ROUNDS in code; the
--    column remains for UI rounds-per-stage display).
INSERT INTO public.journey_stages (stage_number, min_accuracy_pct, pool_size, status)
SELECT
  n,
  ROUND((50 + 25 * LEAST(n - 1, 39)::numeric / 39), 1),
  5,
  'draft'
FROM generate_series(11, 100) AS n
ON CONFLICT (stage_number) DO NOTHING;

-- 2) Re-derive min_accuracy_pct for all 100 rows on the new curve — the
--    existing 1-10 rows hold the old 50%->75%-over-9-steps values, which are
--    inconsistent with the 100-stage curve. Applied to 1-100 (not just 1-10)
--    so any pre-existing row in the new range is corrected too.
UPDATE public.journey_stages
SET
  min_accuracy_pct = ROUND((50 + 25 * LEAST(stage_number - 1, 39)::numeric / 39), 1),
  updated_at = now()
WHERE stage_number BETWEEN 1 AND 100;
