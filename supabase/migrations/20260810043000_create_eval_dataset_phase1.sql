-- Migration: Phase 1 LLM Evaluation Dataset architecture
-- Task: AIP-BUILD-EVALDATASET-PHASE1-001

-- AI model execution manifests (dedupe on content_hash, append-only via trigger).
CREATE TABLE public.ai_model_execution_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_model_execution_manifests_content_hash
  ON public.ai_model_execution_manifests (content_hash);

-- Ground-truth snapshots at evaluation time. Deduplication is by event_id + content_hash;
-- new content gets a monotonically increasing version for that event.
CREATE TABLE public.ground_truth_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, version)
);

CREATE INDEX idx_ground_truth_versions_event_id
  ON public.ground_truth_versions (event_id);
CREATE INDEX idx_ground_truth_versions_event_content_hash
  ON public.ground_truth_versions (event_id, content_hash);

-- Evaluation stimuli. Deduplication is by stimulus_hash (url + detail mode + source bytes hash).
CREATE TABLE public.eval_stimuli (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stimulus_hash TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  source_bytes_sha256 TEXT NOT NULL,
  detail_mode TEXT NOT NULL DEFAULT 'auto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_stimuli_stimulus_hash
  ON public.eval_stimuli (stimulus_hash);

-- Evaluation facts. Append-only; polymorphic player identity (exactly one of ai_player_id
-- or human_player_id must be set) enforced by CHECK constraint.
CREATE TABLE public.eval_facts (
  evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ai_player_id UUID REFERENCES public.ai_players(id) ON DELETE SET NULL,
  human_player_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  manifest_id UUID NOT NULL REFERENCES public.ai_model_execution_manifests(id) ON DELETE RESTRICT,
  ground_truth_version_id UUID NOT NULL REFERENCES public.ground_truth_versions(id) ON DELETE RESTRICT,
  stimulus_id UUID NOT NULL REFERENCES public.eval_stimuli(id) ON DELETE RESTRICT,
  game_context JSONB NOT NULL,
  time_budget_ms INTEGER,
  request_started_at TIMESTAMPTZ NOT NULL,
  response_received_at TIMESTAMPTZ NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  reasoning_tokens INTEGER,
  total_tokens INTEGER,
  cost NUMERIC(20,10),
  reasoning_trace_available BOOLEAN NOT NULL DEFAULT false,
  reasoning_trace TEXT,
  final_guess JSONB,
  supplied_hints JSONB,
  image_quality_score INTEGER CHECK (image_quality_score IS NULL OR (image_quality_score >= 1 AND image_quality_score <= 10)),
  image_quality_notes TEXT,
  critique_error TEXT,
  raw_llm_response JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_eval_facts_player_set_exactly_one CHECK (
    (ai_player_id IS NOT NULL AND human_player_id IS NULL) OR
    (ai_player_id IS NULL AND human_player_id IS NOT NULL)
  )
);

CREATE INDEX idx_eval_facts_event_id ON public.eval_facts (event_id);
CREATE INDEX idx_eval_facts_ai_player_id ON public.eval_facts (ai_player_id);
CREATE INDEX idx_eval_facts_human_player_id ON public.eval_facts (human_player_id);
CREATE INDEX idx_eval_facts_manifest_id ON public.eval_facts (manifest_id);
CREATE INDEX idx_eval_facts_ground_truth_version_id ON public.eval_facts (ground_truth_version_id);
CREATE INDEX idx_eval_facts_stimulus_id ON public.eval_facts (stimulus_id);

-- Schema-only placeholders for later phases; not populated by this task's write path.
CREATE TABLE public.eval_derived_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.eval_facts(evaluation_id) ON DELETE CASCADE,
  derived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_derived_results_evaluation_id
  ON public.eval_derived_results (evaluation_id);

CREATE TABLE public.eval_raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.eval_facts(evaluation_id) ON DELETE CASCADE,
  event_type TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_raw_events_evaluation_id
  ON public.eval_raw_events (evaluation_id);

-- Additive link from ai_answer_bank to the latest eval_fact for the (event, ai_player) pair.
ALTER TABLE public.ai_answer_bank
  ADD COLUMN evaluation_id UUID NULL REFERENCES public.eval_facts(evaluation_id);

-- Avatar display for AI players.
ALTER TABLE public.ai_players
  ADD COLUMN avatar_url TEXT NULL;

-- Service-role-only RLS on all new tables, matching the ai_answer_bank/ai_players pattern.
ALTER TABLE public.ai_model_execution_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ground_truth_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_stimuli ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_derived_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_raw_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ai_model_execution_manifests_service_role"
  ON public.ai_model_execution_manifests FOR SELECT TO service_role USING (true);

CREATE POLICY "select_ground_truth_versions_service_role"
  ON public.ground_truth_versions FOR SELECT TO service_role USING (true);

CREATE POLICY "select_eval_stimuli_service_role"
  ON public.eval_stimuli FOR SELECT TO service_role USING (true);

CREATE POLICY "select_eval_facts_service_role"
  ON public.eval_facts FOR SELECT TO service_role USING (true);

CREATE POLICY "select_eval_derived_results_service_role"
  ON public.eval_derived_results FOR SELECT TO service_role USING (true);

CREATE POLICY "select_eval_raw_events_service_role"
  ON public.eval_raw_events FOR SELECT TO service_role USING (true);

-- Append-only enforcement triggers for ai_model_execution_manifests and eval_facts.
-- ground_truth_versions and eval_stimuli are append-only by UNIQUE constraint:
--   - ground_truth_versions: UNIQUE(event_id, version) forces a new version on content change.
--   - eval_stimuli: UNIQUE(stimulus_hash) forces a new row when the source bytes/delivery params change.
CREATE OR REPLACE FUNCTION public.enforce_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Table % is append-only; updates are not allowed', TG_TABLE_NAME;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Table % is append-only; deletes are not allowed', TG_TABLE_NAME;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ai_model_execution_manifests_append_only
  BEFORE UPDATE OR DELETE ON public.ai_model_execution_manifests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();

CREATE TRIGGER trg_eval_facts_append_only
  BEFORE UPDATE OR DELETE ON public.eval_facts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();
