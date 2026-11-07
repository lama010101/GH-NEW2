-- AIP-BUILD-FLEETFINAL-1103-060 — AI fleet final schema (design file
-- fleet-design-060.md, Schema section). Sorts after
-- 20261103100000_pgs_max_rank_tier.sql.
--
--   * ai_answer_bank: play_mode/hints_off columns + per-play cost/latency
--     telemetry columns; hints-off CHECK enforcing D2 (practice = hints OFF).
--   * ai_hint_reviews    — per-hint verdicts from the structured review (D5).
--   * ai_event_audits    — text-only auditor verdicts (D8).
--   * ai_play_deferrals  — rate-limit deferral bookkeeping (D3).
--   * Views (security_invoker): ai_event_hint_trust, ai_event_audit_agreement,
--     ai_events_needing_review, ai_model_reliability, ai_event_ai_difficulty.
--   * ai_fleet_settings D3 defaults.
--
-- Fully idempotent: CREATE TABLE IF NOT EXISTS, ALTER ADD COLUMN IF NOT
-- EXISTS, DROP CONSTRAINT IF EXISTS + ADD, CREATE UNIQUE INDEX IF NOT
-- EXISTS, CREATE OR REPLACE VIEW, INSERT ... ON CONFLICT (key) DO NOTHING.
-- RLS enabled with ZERO policies (deny-by-default for non-service_role),
-- REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT to service_role only —
-- same posture as ai_fleet_runs / ai_fleet_settings / ai_answer_bank.

-- ---------------------------------------------------------------------------
-- ai_answer_bank — D2 practice columns + D6 cost/telemetry columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_answer_bank
  ADD COLUMN IF NOT EXISTS play_mode text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS hints_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS total_tokens int,
  ADD COLUMN IF NOT EXISTS reasoning_tokens int,
  ADD COLUMN IF NOT EXISTS latency_ms int,
  ADD COLUMN IF NOT EXISTS error_class text,
  ADD COLUMN IF NOT EXISTS confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS timer_ms int,
  ADD COLUMN IF NOT EXISTS model_slug text;

ALTER TABLE public.ai_answer_bank
  DROP CONSTRAINT IF EXISTS ai_answer_bank_play_mode_chk;
ALTER TABLE public.ai_answer_bank
  ADD CONSTRAINT ai_answer_bank_play_mode_chk
  CHECK (play_mode IN ('daily', 'practice'));

-- D2: when hints_off is set the row must carry no hints and no penalties
-- (practice plays never request hints). null/[] tolerated on both sides.
ALTER TABLE public.ai_answer_bank
  DROP CONSTRAINT IF EXISTS ai_answer_bank_hints_off_chk;
ALTER TABLE public.ai_answer_bank
  ADD CONSTRAINT ai_answer_bank_hints_off_chk
  CHECK (
    hints_off IS NOT TRUE
    OR (
      (hints_requested IS NULL OR hints_requested = '[]'::jsonb)
      AND COALESCE((hint_penalty_applied ->> 'whenPenaltyRate')::numeric, 0) = 0
      AND COALESCE((hint_penalty_applied ->> 'wherePenaltyRate')::numeric, 0) = 0
    )
  );

-- ---------------------------------------------------------------------------
-- ai_hint_reviews — D5 per-hint verdict rows (written AFTER the bank row
-- exists; evaluation_id links back to eval_facts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_hint_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ai_player_id uuid NOT NULL REFERENCES public.ai_players(id) ON DELETE CASCADE,
  evaluation_id uuid NOT NULL REFERENCES public.eval_facts(evaluation_id),
  hint_kind text,
  hint_text_hash text,
  verdict text,
  confidence numeric(4,3),
  explanation text,
  suggested_correction text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_hint_reviews
  DROP CONSTRAINT IF EXISTS ai_hint_reviews_verdict_chk;
ALTER TABLE public.ai_hint_reviews
  ADD CONSTRAINT ai_hint_reviews_verdict_chk
  CHECK (verdict IN ('correct', 'incorrect', 'unverifiable', 'partially_correct'));

ALTER TABLE public.ai_hint_reviews
  DROP CONSTRAINT IF EXISTS ai_hint_reviews_confidence_chk;
ALTER TABLE public.ai_hint_reviews
  ADD CONSTRAINT ai_hint_reviews_confidence_chk
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

CREATE UNIQUE INDEX IF NOT EXISTS ai_hint_reviews_eval_kind_hash_uniq
  ON public.ai_hint_reviews (evaluation_id, hint_kind, hint_text_hash);

CREATE INDEX IF NOT EXISTS ai_hint_reviews_event_idx
  ON public.ai_hint_reviews (event_id);

-- ---------------------------------------------------------------------------
-- ai_event_audits — D8 text-only auditor output (never writes events)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_event_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ai_player_id uuid NOT NULL REFERENCES public.ai_players(id) ON DELETE CASCADE,
  is_real_event text,
  year_check text,
  proposed_year int,
  location_check text,
  proposed_location text,
  proposed_lat double precision,
  proposed_lng double precision,
  description_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  hint_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  difficulty_estimate_year smallint,
  difficulty_estimate_location smallint,
  improvement_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(4,3),
  reasoning text,
  raw_response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_event_audits
  DROP CONSTRAINT IF EXISTS ai_event_audits_is_real_event_chk;
ALTER TABLE public.ai_event_audits
  ADD CONSTRAINT ai_event_audits_is_real_event_chk
  CHECK (is_real_event IS NULL OR is_real_event IN ('real', 'likely_real', 'doubtful', 'fabricated', 'unknown'));

ALTER TABLE public.ai_event_audits
  DROP CONSTRAINT IF EXISTS ai_event_audits_year_check_chk;
ALTER TABLE public.ai_event_audits
  ADD CONSTRAINT ai_event_audits_year_check_chk
  CHECK (year_check IS NULL OR year_check IN ('ok', 'off_by_n', 'unknown'));

ALTER TABLE public.ai_event_audits
  DROP CONSTRAINT IF EXISTS ai_event_audits_location_check_chk;
ALTER TABLE public.ai_event_audits
  ADD CONSTRAINT ai_event_audits_location_check_chk
  CHECK (location_check IS NULL OR location_check IN ('ok', 'off', 'unknown'));

ALTER TABLE public.ai_event_audits
  DROP CONSTRAINT IF EXISTS ai_event_audits_diff_year_chk;
ALTER TABLE public.ai_event_audits
  ADD CONSTRAINT ai_event_audits_diff_year_chk
  CHECK (difficulty_estimate_year IS NULL OR (difficulty_estimate_year >= 1 AND difficulty_estimate_year <= 5));

ALTER TABLE public.ai_event_audits
  DROP CONSTRAINT IF EXISTS ai_event_audits_diff_loc_chk;
ALTER TABLE public.ai_event_audits
  ADD CONSTRAINT ai_event_audits_diff_loc_chk
  CHECK (difficulty_estimate_location IS NULL OR (difficulty_estimate_location >= 1 AND difficulty_estimate_location <= 5));

ALTER TABLE public.ai_event_audits
  DROP CONSTRAINT IF EXISTS ai_event_audits_confidence_chk;
ALTER TABLE public.ai_event_audits
  ADD CONSTRAINT ai_event_audits_confidence_chk
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

CREATE UNIQUE INDEX IF NOT EXISTS ai_event_audits_event_player_uniq
  ON public.ai_event_audits (event_id, ai_player_id);

-- ---------------------------------------------------------------------------
-- ai_play_deferrals — D3 429 deferral bookkeeping (unresolved row = due work
-- once retry_after_at has passed; resolved_at set on completion)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_play_deferrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_player_id uuid NOT NULL REFERENCES public.ai_players(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- NOT NULL: it keys the UNIQUE (ai_player_id, event_id, mode) dedupe.
  mode text NOT NULL,
  reason text,
  n429 int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 1,
  first_deferred_at timestamptz NOT NULL DEFAULT now(),
  last_deferred_at timestamptz NOT NULL DEFAULT now(),
  retry_after_at timestamptz,
  resolved_at timestamptz
);

ALTER TABLE public.ai_play_deferrals
  DROP CONSTRAINT IF EXISTS ai_play_deferrals_mode_chk;
ALTER TABLE public.ai_play_deferrals
  ADD CONSTRAINT ai_play_deferrals_mode_chk
  CHECK (mode IN ('daily', 'practice', 'audit'));

CREATE UNIQUE INDEX IF NOT EXISTS ai_play_deferrals_player_event_mode_uniq
  ON public.ai_play_deferrals (ai_player_id, event_id, mode);

CREATE INDEX IF NOT EXISTS ai_play_deferrals_unresolved_due_idx
  ON public.ai_play_deferrals (retry_after_at)
  WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default for every principal except service_role (zero
-- policies), mirroring ai_fleet_runs / ai_fleet_settings.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_hint_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_event_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_play_deferrals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_hint_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_event_audits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_play_deferrals FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ai_hint_reviews TO service_role;
GRANT ALL ON public.ai_event_audits TO service_role;
GRANT ALL ON public.ai_play_deferrals TO service_role;

-- ---------------------------------------------------------------------------
-- Views (security_invoker=true; REVOKE from anon/authenticated, SELECT to
-- service_role — same posture as admin_fleet_model_stats).
-- ---------------------------------------------------------------------------

-- Per-(event,hint) verdict rollup: trust = share of 'correct' verdicts ONLY
-- (partially_correct does not count), flagged at >= 2 'incorrect'.
CREATE OR REPLACE VIEW public.ai_event_hint_trust WITH (security_invoker = true) AS
SELECT
  event_id,
  hint_kind,
  hint_text_hash,
  COUNT(*)::int AS reviews,
  COUNT(*) FILTER (WHERE verdict = 'correct')::int AS correct,
  COUNT(*) FILTER (WHERE verdict = 'incorrect')::int AS incorrect,
  COUNT(*) FILTER (WHERE verdict = 'correct')::numeric / COUNT(*) AS hint_trust,
  (COUNT(*) FILTER (WHERE verdict = 'incorrect') >= 2) AS flagged
FROM public.ai_hint_reviews
GROUP BY event_id, hint_kind, hint_text_hash;

REVOKE ALL ON public.ai_event_hint_trust FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_event_hint_trust TO service_role;

-- Per-event auditor agreement: plurality is_real_event vote share +
-- disagreement flags on proposed year/location.
CREATE OR REPLACE VIEW public.ai_event_audit_agreement WITH (security_invoker = true) AS
WITH votes AS (
  SELECT event_id, is_real_event, COUNT(*) AS n
  FROM public.ai_event_audits
  WHERE is_real_event IS NOT NULL
  GROUP BY event_id, is_real_event
),
plurality AS (
  SELECT DISTINCT ON (event_id) event_id, is_real_event AS top_value, n AS top_votes
  FROM votes
  ORDER BY event_id, n DESC, is_real_event
)
SELECT
  a.event_id,
  COUNT(*)::int AS auditors,
  COUNT(*) FILTER (WHERE a.is_real_event IN ('real', 'likely_real'))::int AS real_votes,
  COUNT(*) FILTER (WHERE a.is_real_event IN ('doubtful', 'fabricated'))::int AS doubtful_or_fabricated_votes,
  MAX(p.top_votes)::numeric / COUNT(*) AS audit_agreement,
  (COUNT(DISTINCT a.proposed_year) > 1) AS year_disagreement,
  (COUNT(DISTINCT a.proposed_location) > 1) AS location_disagreement,
  (
    COUNT(*) FILTER (WHERE a.is_real_event IN ('doubtful', 'fabricated')) > 0
    OR COUNT(DISTINCT a.proposed_year) > 1
    OR COUNT(DISTINCT a.proposed_location) > 1
  ) AS flagged
FROM public.ai_event_audits a
JOIN plurality p ON p.event_id = a.event_id
GROUP BY a.event_id;

REVOKE ALL ON public.ai_event_audit_agreement FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_event_audit_agreement TO service_role;

-- Events needing human review: a flagged hint, or doubtful/fabricated audit
-- votes, or auditor year/location disagreement. review_score sorts worst
-- first (incorrect verdicts weigh double).
CREATE OR REPLACE VIEW public.ai_events_needing_review WITH (security_invoker = true) AS
SELECT
  e.id AS event_id,
  e.title,
  e.event_year,
  COALESCE(ht.incorrect_hint_reviews, 0)::int AS incorrect_hint_reviews,
  COALESCE(ag.doubtful_or_fabricated_votes, 0)::int AS doubtful_or_fabricated_votes,
  COALESCE(ag.year_disagreement, false) AS year_disagreement,
  COALESCE(ag.location_disagreement, false) AS location_disagreement,
  (
    COALESCE(ht.incorrect_hint_reviews, 0) * 2
    + COALESCE(ag.doubtful_or_fabricated_votes, 0)
    + CASE WHEN COALESCE(ag.year_disagreement, false) THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(ag.location_disagreement, false) THEN 1 ELSE 0 END
  )::numeric AS review_score
FROM public.events e
LEFT JOIN (
  SELECT event_id,
         SUM(incorrect)::bigint AS incorrect_hint_reviews,
         BOOL_OR(flagged) AS any_flagged
  FROM public.ai_event_hint_trust
  GROUP BY event_id
) ht ON ht.event_id = e.id
LEFT JOIN public.ai_event_audit_agreement ag ON ag.event_id = e.id
WHERE COALESCE(ht.any_flagged, false)
   OR COALESCE(ag.doubtful_or_fabricated_votes, 0) > 0
   OR COALESCE(ag.year_disagreement, false)
   OR COALESCE(ag.location_disagreement, false);

REVOKE ALL ON public.ai_events_needing_review FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_events_needing_review TO service_role;

-- Per-player reliability: play outcomes, parse-failure rate (same bad_output
-- rule as aiFailureCauses), 429 pressure (calls errors + deferral counts),
-- call latency percentiles, coverage vs the playable set, cost.
-- Playable event = validated, not retired, image row, coords (1233 at design
-- time — computed live so the view stays correct as the catalog changes).
CREATE OR REPLACE VIEW public.ai_model_reliability WITH (security_invoker = true) AS
WITH eligible AS (
  SELECT e.id
  FROM public.events e
  WHERE e.status = 'validated'
    AND e.retired_at IS NULL
    AND EXISTS (SELECT 1 FROM public.images i WHERE i.event_id = e.id)
    AND EXISTS (
      SELECT 1 FROM public.locations l
      WHERE l.event_id = e.id AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
    )
),
call_stats AS (
  SELECT
    ab.ai_player_id,
    COUNT(*) FILTER (WHERE c.error ILIKE '%429%')::int AS calls_429,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY c.duration_ms) AS p50_duration_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY c.duration_ms) AS p95_duration_ms
  FROM public.ai_answer_bank_calls c
  JOIN public.ai_answer_bank ab ON ab.id = c.ai_answer_bank_id
  GROUP BY ab.ai_player_id
),
deferral_stats AS (
  SELECT ai_player_id, SUM(n429)::int AS n429
  FROM public.ai_play_deferrals
  GROUP BY ai_player_id
)
SELECT
  p.id AS ai_player_id,
  p.name,
  p.model_id,
  COUNT(ab.id) FILTER (WHERE ab.error IS NULL)::int AS plays_ok,
  COUNT(ab.id) FILTER (WHERE ab.error IS NOT NULL)::int AS plays_error,
  (
    COUNT(*) FILTER (
      WHERE ab.error LIKE 'Failed to parse%' OR ab.error ILIKE '%missing finalguess%'
    )::numeric / NULLIF(COUNT(ab.id), 0)
  ) AS parse_failure_rate,
  (COALESCE(cs.calls_429, 0) + COALESCE(ds.n429, 0))::int AS n429,
  cs.p50_duration_ms,
  cs.p95_duration_ms,
  COUNT(DISTINCT ab.event_id) FILTER (
    WHERE ab.error IS NULL AND ab.event_id IN (SELECT id FROM eligible)
  )::int AS events_played,
  ROUND(
    100.0 * COUNT(DISTINCT ab.event_id) FILTER (
      WHERE ab.error IS NULL AND ab.event_id IN (SELECT id FROM eligible)
    ) / NULLIF((SELECT COUNT(*) FROM eligible), 0),
    2
  ) AS coverage_pct,
  MAX(ab.created_at) FILTER (WHERE ab.error IS NULL) AS last_success_at,
  AVG(ab.total_cost_usd) FILTER (WHERE ab.error IS NULL) AS avg_cost_usd
FROM public.ai_players p
LEFT JOIN public.ai_answer_bank ab ON ab.ai_player_id = p.id
LEFT JOIN call_stats cs ON cs.ai_player_id = p.id
LEFT JOIN deferral_stats ds ON ds.ai_player_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.model_id, cs.calls_429, cs.p50_duration_ms, cs.p95_duration_ms, ds.n429;

REVOKE ALL ON public.ai_model_reliability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_model_reliability TO service_role;

-- Per-event difficulty as experienced by the fleet: model count, distance
-- spread, year error, plus the models' own difficulty/authenticity scores
-- from eval_facts.
CREATE OR REPLACE VIEW public.ai_event_ai_difficulty WITH (security_invoker = true) AS
SELECT
  e.id AS event_id,
  COUNT(DISTINCT ab.ai_player_id) FILTER (WHERE ab.error IS NULL)::int AS n_models,
  AVG(ab.distance_km) FILTER (WHERE ab.error IS NULL) AS avg_distance_km,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY ab.distance_km)
    FILTER (WHERE ab.error IS NULL) AS p50_distance_km,
  AVG(ABS(ab.year_diff)) FILTER (WHERE ab.error IS NULL) AS avg_abs_year_diff,
  ef.avg_difficulty AS avg_difficulty_score,
  ef.avg_authenticity AS avg_authenticity_score
FROM public.events e
JOIN public.ai_answer_bank ab ON ab.event_id = e.id
LEFT JOIN (
  SELECT event_id,
         AVG(difficulty_score) AS avg_difficulty,
         AVG(authenticity_score) AS avg_authenticity
  FROM public.eval_facts
  GROUP BY event_id
) ef ON ef.event_id = e.id
GROUP BY e.id, ef.avg_difficulty, ef.avg_authenticity;

REVOKE ALL ON public.ai_event_ai_difficulty FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_event_ai_difficulty TO service_role;

-- ---------------------------------------------------------------------------
-- ai_fleet_settings — D3 rate-budget defaults (never overwrite operator
-- tuning: ON CONFLICT (key) DO NOTHING)
-- ---------------------------------------------------------------------------

INSERT INTO public.ai_fleet_settings (key, value) VALUES
  ('ai_rpm_free', '15'::jsonb),
  ('ai_rpm_paid', '20'::jsonb),
  ('ai_rpm_overrides', '{"qwen/qwen3-vl-8b-instruct":6,"google/gemini-2.5-flash-lite":10}'::jsonb),
  ('ai_free_rpd_fleet', '900'::jsonb),
  ('ai_rpd_paid_model', '1500'::jsonb),
  ('ai_global_rpd', '3000'::jsonb),
  ('ai_run_max_plays', '150'::jsonb),
  ('ai_run_max_audits', '120'::jsonb),
  ('ai_calls_per_play', '3'::jsonb),
  ('ai_backoff_base_ms', '30000'::jsonb),
  ('ai_backoff_max_ms', '600000'::jsonb),
  ('ai_max_cooldowns_per_model', '3'::jsonb),
  ('ai_practice_per_player_per_run', '20'::jsonb),
  ('ai_benchmark_subset_size', '50'::jsonb)
ON CONFLICT (key) DO NOTHING;
