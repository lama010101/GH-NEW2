-- AIP-BUILD-BENCHMARKSCHEMA-1114-305 — AI benchmark schema.
--
--   * ai_benchmark_sets / ai_benchmark_set_items / ai_benchmark_runs /
--     ai_benchmark_attempts — frozen benchmark sets, their event items,
--     per-player runs, and per-attempt outcome rows.
--   * ai_answer_bank: prompt_version, benchmark_run_id, structured_payload,
--     ai_image_depiction_score, fame_score.
--   * ai_players: benchmark_probe_passed, benchmark_probe_stats.
--   * Immutability triggers: sets allow only draft -> frozen (exactly 120
--     items required); items of a frozen set are immutable.
--
-- Fully idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP CONSTRAINT IF EXISTS + ADD, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- RLS enabled with ZERO policies (deny-by-default for non-service_role),
-- REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT ALL to service_role —
-- same posture as ai_fleet_runs / ai_answer_bank / event_reports.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_benchmark_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'frozen')),
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  frozen_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_benchmark_set_items (
  set_id uuid NOT NULL REFERENCES public.ai_benchmark_sets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id),
  stratum text NOT NULL,
  era text,
  region text,
  difficulty numeric,
  seq int NOT NULL,
  PRIMARY KEY (set_id, event_id),
  UNIQUE (set_id, seq)
);

CREATE TABLE IF NOT EXISTS public.ai_benchmark_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.ai_benchmark_sets(id),
  ai_player_id uuid NOT NULL REFERENCES public.ai_players(id),
  prompt_version text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'aborted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (set_id, ai_player_id)
);

CREATE TABLE IF NOT EXISTS public.ai_benchmark_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ai_benchmark_runs(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  ai_answer_bank_id uuid REFERENCES public.ai_answer_bank(id),
  attempt_no int NOT NULL DEFAULT 1,
  outcome text NOT NULL CHECK (outcome IN ('success', 'no_reasoning', 'missing_fields', 'provider_error', 'rate_limit_deferred', 'timeout')),
  reasoning_present boolean NOT NULL,
  error_text text,
  cost_usd numeric,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, event_id, attempt_no)
);

-- ---------------------------------------------------------------------------
-- ai_answer_bank / ai_players columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_answer_bank
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS benchmark_run_id uuid,
  ADD COLUMN IF NOT EXISTS structured_payload jsonb,
  ADD COLUMN IF NOT EXISTS ai_image_depiction_score smallint,
  ADD COLUMN IF NOT EXISTS fame_score smallint;

ALTER TABLE public.ai_answer_bank
  DROP CONSTRAINT IF EXISTS ai_answer_bank_benchmark_run_id_fkey;
ALTER TABLE public.ai_answer_bank
  ADD CONSTRAINT ai_answer_bank_benchmark_run_id_fkey
  FOREIGN KEY (benchmark_run_id) REFERENCES public.ai_benchmark_runs(id);

ALTER TABLE public.ai_answer_bank
  DROP CONSTRAINT IF EXISTS ai_answer_bank_ai_image_depiction_score_chk;
ALTER TABLE public.ai_answer_bank
  ADD CONSTRAINT ai_answer_bank_ai_image_depiction_score_chk
  CHECK (ai_image_depiction_score BETWEEN 0 AND 100);

ALTER TABLE public.ai_answer_bank
  DROP CONSTRAINT IF EXISTS ai_answer_bank_fame_score_chk;
ALTER TABLE public.ai_answer_bank
  ADD CONSTRAINT ai_answer_bank_fame_score_chk
  CHECK (fame_score BETWEEN 0 AND 100);

COMMENT ON COLUMN public.ai_answer_bank.ai_image_depiction_score IS
  'AI-judged depiction quality 0-100. NEVER aggregate or compare with the user-facing round-results image rating (different table, different purpose).';

ALTER TABLE public.ai_players
  ADD COLUMN IF NOT EXISTS benchmark_probe_passed boolean,
  ADD COLUMN IF NOT EXISTS benchmark_probe_stats jsonb;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ai_answer_bank_prompt_version_idx
  ON public.ai_answer_bank (prompt_version)
  WHERE prompt_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_answer_bank_benchmark_run_id_idx
  ON public.ai_answer_bank (benchmark_run_id)
  WHERE benchmark_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_benchmark_attempts_run_id_idx
  ON public.ai_benchmark_attempts (run_id);

CREATE INDEX IF NOT EXISTS ai_benchmark_attempts_event_id_idx
  ON public.ai_benchmark_attempts (event_id);

-- ---------------------------------------------------------------------------
-- Immutability triggers (SECURITY INVOKER; EXECUTE revoked below)
-- ---------------------------------------------------------------------------

-- Sets: DELETE allowed only while status='draft'. UPDATE allowed only for the
-- single transition draft -> frozen with id/version/name/prompt_version
-- unchanged and NEW.frozen_at set; that transition additionally requires
-- exactly 120 rows in ai_benchmark_set_items. Everything else raises.
CREATE OR REPLACE FUNCTION public.ai_benchmark_sets_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'ai_benchmark_sets is immutable';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'draft'
       AND NEW.status = 'frozen'
       AND NEW.id = OLD.id
       AND NEW.version = OLD.version
       AND NEW.name = OLD.name
       AND NEW.prompt_version = OLD.prompt_version
       AND NEW.frozen_at IS NOT NULL
       AND (SELECT count(*) FROM public.ai_benchmark_set_items
            WHERE set_id = OLD.id) = 120
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'ai_benchmark_sets is immutable';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Items: look up parent set status via COALESCE(NEW.set_id, OLD.set_id).
-- status='frozen' -> raise. Parent row missing (cascade delete of a draft
-- set) -> allow.
CREATE OR REPLACE FUNCTION public.ai_benchmark_set_items_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_status text;
BEGIN
  SELECT s.status INTO v_status
  FROM public.ai_benchmark_sets s
  WHERE s.id = COALESCE(NEW.set_id, OLD.set_id);

  IF v_status = 'frozen' THEN
    RAISE EXCEPTION 'frozen benchmark set items are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.ai_benchmark_sets_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_benchmark_set_items_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ai_benchmark_sets_guard ON public.ai_benchmark_sets;
CREATE TRIGGER trg_ai_benchmark_sets_guard
  BEFORE UPDATE OR DELETE ON public.ai_benchmark_sets
  FOR EACH ROW EXECUTE FUNCTION public.ai_benchmark_sets_guard();

DROP TRIGGER IF EXISTS trg_ai_benchmark_set_items_guard ON public.ai_benchmark_set_items;
CREATE TRIGGER trg_ai_benchmark_set_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ai_benchmark_set_items
  FOR EACH ROW EXECUTE FUNCTION public.ai_benchmark_set_items_guard();

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default for every principal except service_role (zero
-- policies), mirroring ai_fleet_runs / ai_answer_bank / event_reports.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_benchmark_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_benchmark_set_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_benchmark_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_benchmark_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_benchmark_sets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_benchmark_set_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_benchmark_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_benchmark_attempts FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ai_benchmark_sets TO service_role;
GRANT ALL ON public.ai_benchmark_set_items TO service_role;
GRANT ALL ON public.ai_benchmark_runs TO service_role;
GRANT ALL ON public.ai_benchmark_attempts TO service_role;
