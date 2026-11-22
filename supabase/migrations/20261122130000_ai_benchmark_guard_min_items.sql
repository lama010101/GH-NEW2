-- EDQ-BUILD-BENCHWIRE-1122-816 — relax the benchmark-set freeze guard.
--
-- 20261114120000_ai_benchmark.sql froze sets with EXACTLY 120 items
-- (`= 120`). The bench-v2 truth set targets 150+ events, so the guard now
-- requires AT LEAST 120 items for the draft -> frozen transition. Every
-- other clause (id/version/name/prompt_version unchanged, frozen_at set,
-- draft-only DELETE, frozen-set item immutability) is unchanged — the
-- function body is identical except the count predicate.
--
-- Idempotent: CREATE OR REPLACE FUNCTION only.

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
            WHERE set_id = OLD.id) >= 120
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'ai_benchmark_sets is immutable';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.ai_benchmark_sets_guard() FROM PUBLIC, anon, authenticated;
