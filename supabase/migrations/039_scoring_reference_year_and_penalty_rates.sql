-- Migration: Add scoring_reference_year to sessions + penalty rate columns to round_commits
-- Task: MP-SCORING-PENALTY-REWORK-001
-- Date: 2026-06-28
--
-- BACKGROUND:
--   calculateYearAccuracy (src/core/rules.ts) hardcoded CURRENT_YEAR = 2025 to compute
--   event age for era scaling. This is a determinism landmine: as wall-clock time advances,
--   the same (event, guess) pair scores differently, violating recomputability-from-DB
--   (scoring_spec.md §10 forbids time-based score variation). A temp validation script
--   (scripts/_temp_validate_scoring.mjs) already expected a 3-arg signature
--   calculateYearAccuracy(yearDiff, eventYear, referenceYear) — the referenceYear param
--   was intended but never landed in the implementation.
--
--   Separately, hint penalties were flat point subtraction on an exponential accuracy
--   curve, causing regressive punishment (weak players lose proportionally more than
--   strong players) and breaking the hint-as-strategic-tool intent for old events
--   (era scaling inflates accuracy, then flat penalty erases it).
--
--   This migration adds the columns needed for:
--     1. referenceYear frozen at session creation (determinism fix)
--     2. per-axis penalty RATES (0-100 = 0%-100%) replacing flat points (proportional fix)
--
--   Old columns acc_penalty / acc_penalty_when / acc_penalty_where (flat points) are NOT
--   dropped here — they become unused by new code. A follow-up cleanup migration may drop
--   them once confirmed unneeded. Existing round_results rows were written under the old
--   formula and are not recomputed.

-- 1. sessions: freeze the scoring reference year at creation time.
--    DEFAULT 2025 preserves existing rows (scored under the hardcoded-2025 formula).
--    New sessions set this to EXTRACT(YEAR FROM now()) at INSERT time (see sessionCore.ts).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS scoring_reference_year INT NOT NULL DEFAULT 2025;

-- 2. round_commits: per-axis penalty RATES (0-100 integer = 0%-100%).
--    Replaces the semantic of acc_penalty_when / acc_penalty_where (flat points).
--    Same INT type / 0-100 range, but interpreted as a percentage rate of raw accuracy,
--    not a flat point subtraction. DEFAULT 0 preserves existing rows.
ALTER TABLE round_commits
  ADD COLUMN IF NOT EXISTS acc_penalty_when_rate  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acc_penalty_where_rate INT NOT NULL DEFAULT 0;
