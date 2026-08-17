-- Model-level rollups computed periodically over eval_facts/eval_derived_results.
-- Each row is a snapshot for one (ai_player_id, window_label) pair at computed_at;
-- history is kept (no upsert) so trend-over-time is queryable directly from this table.
CREATE TABLE public.eval_model_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_player_id UUID NOT NULL REFERENCES public.ai_players(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  window_label TEXT NOT NULL CHECK (window_label IN ('7d', '30d', 'all')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample_size INTEGER NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_model_rollups_ai_player_id ON public.eval_model_rollups (ai_player_id);
CREATE INDEX idx_eval_model_rollups_model_window ON public.eval_model_rollups (model_id, window_label, computed_at DESC);

ALTER TABLE public.eval_model_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_eval_model_rollups_service_role"
  ON public.eval_model_rollups FOR SELECT TO service_role USING (true);
