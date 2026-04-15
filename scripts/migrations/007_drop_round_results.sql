-- Drop unused round_results table
DROP TABLE IF EXISTS public.round_results;

-- Also clean up the related index
DROP INDEX IF EXISTS idx_round_results_game_round;
