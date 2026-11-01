-- ADMIN-BUILD-FLEETTRUTH-1101-031
-- Read-only fleet-truth views for the GH Ops admin (Overview + Models).
--
--   (1) public.admin_fleet_model_stats  one row per live ai_player
--       (deleted_at IS NULL): flags, catalog fields, play-level stats.
--   (2) public.admin_fleet_coverage     single row: eligible events, coverage,
--       depth buckets, covered-by-track.
--
-- Definitions (single source — mirrored in TS at
-- src/app/admin/dashboard/fleetMetrics.ts):
--   Eligible event : events.status='validated' AND EXISTS (images row).
--   Play           : ai_answer_bank row; OK = error IS NULL.
--   Failure cause  : auth (contains '401'), gone ('404'), rate_limit ('429'),
--                    bad_output (starts 'Failed to parse' or contains
--                    'missing finalguess'), other — evaluated in this order.
--   distinct_events_ok counts only ELIGIBLE events (coverage denominator).
--
-- Additive only: CREATE OR REPLACE VIEW, no ALTER/DROP, no table touched.
-- Access model: views are owned by the migration role and bypass the
-- underlying tables' RLS for whoever can SELECT them, so SELECT is granted
-- to service_role ONLY (same posture as the service_role-only RLS tables).
-- Anon/authenticated hold no grant and cannot read them through PostgREST.
--
-- Applied to PROD by the CTO via the Supabase connector before merge;
-- the file may be renamed to PROD's recorded version at merge.
--
-- Rollback:
--   DROP VIEW IF EXISTS public.admin_fleet_model_stats;
--   DROP VIEW IF EXISTS public.admin_fleet_coverage;

CREATE OR REPLACE VIEW public.admin_fleet_model_stats AS
SELECT
  p.id AS ai_player_id,
  p.name,
  p.model_id,
  p.is_active,
  p.is_active_practice,
  p.is_active_daily,
  p.daily_cost_cap_usd,
  om.model_id IS NOT NULL AS has_catalog_row,
  om.is_vision,
  om.is_free,
  om.availability_status,
  COUNT(ab.id) FILTER (WHERE ab.error IS NULL)::int AS ok_plays,
  COUNT(ab.id) FILTER (WHERE ab.error IS NOT NULL)::int AS failed_plays,
  COUNT(ab.id) FILTER (WHERE ab.error ILIKE '%401%')::int AS failed_auth,
  COUNT(ab.id) FILTER (
    WHERE ab.error NOT ILIKE '%401%' AND ab.error ILIKE '%404%'
  )::int AS failed_gone,
  COUNT(ab.id) FILTER (
    WHERE ab.error NOT ILIKE '%401%' AND ab.error NOT ILIKE '%404%'
      AND ab.error ILIKE '%429%'
  )::int AS failed_rate_limit,
  COUNT(ab.id) FILTER (
    WHERE ab.error NOT ILIKE '%401%' AND ab.error NOT ILIKE '%404%'
      AND ab.error NOT ILIKE '%429%'
      AND (ab.error LIKE 'Failed to parse%' OR ab.error ILIKE '%missing finalguess%')
  )::int AS failed_bad_output,
  COUNT(ab.id) FILTER (
    WHERE ab.error IS NOT NULL
      AND ab.error NOT ILIKE '%401%' AND ab.error NOT ILIKE '%404%'
      AND ab.error NOT ILIKE '%429%'
      AND ab.error NOT LIKE 'Failed to parse%'
      AND ab.error NOT ILIKE '%missing finalguess%'
  )::int AS failed_other,
  COUNT(DISTINCT ab.event_id) FILTER (
    WHERE ab.error IS NULL
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = ab.event_id
          AND e.status = 'validated'
          AND EXISTS (
            SELECT 1 FROM public.images i WHERE i.event_id = e.id
          )
      )
  )::int AS distinct_events_ok,
  COALESCE(
    ARRAY_AGG(DISTINCT ab.event_id) FILTER (
      WHERE ab.error IS NULL
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = ab.event_id
            AND e.status = 'validated'
            AND EXISTS (
              SELECT 1 FROM public.images i WHERE i.event_id = e.id
            )
        )
    ),
    '{}'
  ) AS ok_event_ids,
  AVG(ab.year_diff) FILTER (WHERE ab.error IS NULL) AS avg_year_diff,
  AVG(ab.distance_km) FILTER (WHERE ab.error IS NULL) AS avg_distance_km,
  MAX(ab.created_at) FILTER (WHERE ab.error IS NULL) AS last_ok_at,
  MAX(ab.created_at) AS last_play_at,
  COUNT(ab.id) FILTER (
    WHERE ab.created_at >= now() - interval '7 days'
  )::int AS plays_7d,
  COUNT(ab.id) FILTER (
    WHERE ab.created_at >= now() - interval '7 days' AND ab.error IS NULL
  )::int AS ok_7d,
  COUNT(ab.id) FILTER (
    WHERE ab.created_at >= now() - interval '7 days'
      AND ab.error ILIKE '%401%'
  )::int AS auth_7d
FROM public.ai_players p
LEFT JOIN public.ai_answer_bank ab ON ab.ai_player_id = p.id
LEFT JOIN public.openrouter_models om ON om.model_id = p.model_id
WHERE p.deleted_at IS NULL
GROUP BY
  p.id, p.name, p.model_id,
  p.is_active, p.is_active_practice, p.is_active_daily,
  p.daily_cost_cap_usd,
  om.is_vision, om.is_free, om.availability_status, om.model_id;

REVOKE ALL ON public.admin_fleet_model_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_fleet_model_stats TO service_role;

CREATE OR REPLACE VIEW public.admin_fleet_coverage AS
WITH eligible AS (
  SELECT e.id
  FROM public.events e
  WHERE e.status = 'validated'
    AND EXISTS (SELECT 1 FROM public.images i WHERE i.event_id = e.id)
),
ok_pairs AS (
  SELECT DISTINCT ab.event_id, ab.ai_player_id
  FROM public.ai_answer_bank ab
  JOIN eligible el ON el.id = ab.event_id
  WHERE ab.error IS NULL
),
depth AS (
  SELECT el.id AS event_id, COUNT(op.ai_player_id) AS models_ok
  FROM eligible el
  LEFT JOIN ok_pairs op ON op.event_id = el.id
  GROUP BY el.id
)
SELECT
  (SELECT COUNT(*) FROM eligible)::int AS eligible_total,
  (SELECT COUNT(*) FROM depth WHERE models_ok > 0)::int AS covered_total,
  (SELECT COUNT(*) FROM depth WHERE models_ok = 0)::int AS depth_0,
  (SELECT COUNT(*) FROM depth WHERE models_ok = 1)::int AS depth_1,
  (SELECT COUNT(*) FROM depth WHERE models_ok = 2)::int AS depth_2,
  (SELECT COUNT(*) FROM depth WHERE models_ok >= 3)::int AS depth_3plus,
  (SELECT COUNT(DISTINCT op.event_id)
     FROM ok_pairs op
     JOIN public.ai_players ap ON ap.id = op.ai_player_id
     JOIN public.openrouter_models om ON om.model_id = ap.model_id
    WHERE om.is_vision IS TRUE)::int AS covered_vision,
  (SELECT COUNT(DISTINCT op.event_id)
     FROM ok_pairs op
     JOIN public.ai_players ap ON ap.id = op.ai_player_id
     JOIN public.openrouter_models om ON om.model_id = ap.model_id
    WHERE om.is_vision IS FALSE)::int AS covered_text,
  (SELECT COUNT(DISTINCT op.event_id)
     FROM ok_pairs op
     JOIN public.ai_players ap ON ap.id = op.ai_player_id
     LEFT JOIN public.openrouter_models om ON om.model_id = ap.model_id
    WHERE om.model_id IS NULL)::int AS covered_unknown;

REVOKE ALL ON public.admin_fleet_coverage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_fleet_coverage TO service_role;
