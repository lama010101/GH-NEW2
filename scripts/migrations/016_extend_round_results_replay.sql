-- ============================================================
-- MIGRATION 016: Extend round_results for Full Replay
-- TASK: MP-ZERO-TRUST-001
-- Authority: ZERO-TRUST ENFORCEMENT PROMPT v2 Section 4
--
-- Adds columns required for deterministic replay validation:
--   - distance_km: Recomputed haversine distance
--   - year_diff: Absolute year difference
--   - location_score: Location accuracy score
--   - time_score: Year accuracy score
-- ============================================================

-- Add distance_km column
ALTER TABLE public.round_results
ADD COLUMN distance_km DOUBLE PRECISION;

-- Add year_diff column
ALTER TABLE public.round_results
ADD COLUMN year_diff INT;

-- Add location_score column
ALTER TABLE public.round_results
ADD COLUMN location_score INT;

-- Add time_score column
ALTER TABLE public.round_results
ADD COLUMN time_score INT;

-- Add indexes for replay verification queries
CREATE INDEX idx_round_results_replay_fields
ON public.round_results(game_id, round_index, player_id, distance_km, year_diff, location_score, time_score);

-- Comments
COMMENT ON COLUMN public.round_results.distance_km IS
'Haversine distance in km between player guess and actual event location. Used for deterministic replay validation.';

COMMENT ON COLUMN public.round_results.year_diff IS
'Absolute difference between player year guess and actual event year. Used for deterministic replay validation.';

COMMENT ON COLUMN public.round_results.location_score IS
'Location accuracy score (0-100). Used for deterministic replay validation.';

COMMENT ON COLUMN public.round_results.time_score IS
'Year accuracy score (0-100). Used for deterministic replay validation.';
