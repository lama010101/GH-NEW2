-- Migration 009: Recreate round_results table per FULL_CORE_GAME_MASTER_SPEC.md
-- Required per Section 6 SCORING SYSTEM: "Scores must be recomputable from DB only"
-- Note: Migration 007 incorrectly dropped this table; restoring per spec authority.

CREATE TABLE IF NOT EXISTS public.round_results (
  game_id UUID NOT NULL REFERENCES public.sessions(game_id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL CHECK (round_index >= 0 AND round_index < 5),
  player_id UUID NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  accuracy_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, round_index, player_id)
);

CREATE INDEX IF NOT EXISTS idx_round_results_game_round ON public.round_results(game_id, round_index);

COMMENT ON TABLE public.round_results IS 'Server-computed round scores. Canonical results for leaderboard/replay.';
