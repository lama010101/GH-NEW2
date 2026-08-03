-- Migration: create_ai_players_and_answer_bank
-- Task: AIP-BUILD-SCHEMA-001

-- LLM player definitions.
CREATE TABLE public.ai_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stored AI guesses for every validated event.
CREATE TABLE public.ai_answer_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ai_player_id UUID NOT NULL REFERENCES public.ai_players(id) ON DELETE CASCADE,
  guess_lat DOUBLE PRECISION,
  guess_lng DOUBLE PRECISION,
  guess_year INTEGER,
  distance_km DOUBLE PRECISION,
  year_diff INTEGER,
  location_accuracy INTEGER,
  year_accuracy INTEGER,
  round_accuracy INTEGER,
  round_xp INTEGER,
  raw_llm_response JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, ai_player_id)
);

CREATE INDEX idx_ai_answer_bank_event_id ON public.ai_answer_bank (event_id);
CREATE INDEX idx_ai_answer_bank_ai_player_id ON public.ai_answer_bank (ai_player_id);

-- Service-role only; no authenticated policies.
ALTER TABLE public.ai_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_answer_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ai_players_service_role"
  ON public.ai_players FOR SELECT TO service_role USING (true);

CREATE POLICY "select_ai_answer_bank_service_role"
  ON public.ai_answer_bank FOR SELECT TO service_role USING (true);
