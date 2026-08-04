-- Migration: ai_answer_bank v2 schema + ai_answer_bank_calls audit table
-- Task: AIP-BUILD-ANSWERBANK-V2-001

-- v2 additions to public.ai_answer_bank
ALTER TABLE public.ai_answer_bank
  ADD COLUMN reference_year INTEGER,
  ADD COLUMN reasoning TEXT,
  ADD COLUMN hints_requested JSONB,
  ADD COLUMN hint_penalty_applied JSONB,
  ADD COLUMN time_to_guess_ms INTEGER,
  ADD COLUMN image_quality_score INTEGER CHECK (image_quality_score IS NULL OR (image_quality_score >= 1 AND image_quality_score <= 10)),
  ADD COLUMN image_quality_notes TEXT,
  ADD COLUMN critique_error TEXT;

-- Full LLM call audit per ai_answer_bank row
CREATE TABLE public.ai_answer_bank_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_answer_bank_id UUID NOT NULL REFERENCES public.ai_answer_bank(id) ON DELETE CASCADE,
  turn_index SMALLINT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_answer_bank_calls_ai_answer_bank_id
  ON public.ai_answer_bank_calls (ai_answer_bank_id);

-- Service-role only; no authenticated policies (mirrors ai_answer_bank RLS pattern)
ALTER TABLE public.ai_answer_bank_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ai_answer_bank_calls_service_role"
  ON public.ai_answer_bank_calls FOR SELECT TO service_role USING (true);
