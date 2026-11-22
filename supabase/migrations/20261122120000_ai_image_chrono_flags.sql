-- EDQ-BUILD-IMGCHRONO-1122-810 — image chrono-anachronism audit schema.
-- Sorts after 20261114120000_ai_benchmark.sql.
--
--   * ai_image_chrono_flags — per-(event,image,player,anachronism) audit rows
--     written by scripts/ai-players/image-chrono-audit.ts. flagged=false rows
--     record a clean audit (anachronism_key ''), flagged=true rows carry one
--     finding each.
--   * ai_image_chrono_holds  — corroboration view: a (event,image,category)
--     hold requires >= 2 DISTINCT players flagging the same element_category
--     on the event's CURRENT primary image only, so replacing the image
--     clears the hold automatically.
--   * ai_fleet_runs kind CHECK extended with 'image_chrono'.
--
-- Fully idempotent: CREATE TABLE/INDEX IF NOT EXISTS, DROP CONSTRAINT IF
-- EXISTS + ADD, CREATE OR REPLACE VIEW. RLS enabled with ZERO policies,
-- REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT to service_role only —
-- same posture as ai_fleet_runs / ai_event_audits / ai_answer_bank.

CREATE TABLE IF NOT EXISTS public.ai_image_chrono_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  ai_player_id uuid NOT NULL REFERENCES public.ai_players(id) ON DELETE CASCADE,
  flagged boolean NOT NULL,
  anachronism_text text,
  anachronism_key text NOT NULL,
  element_category text,
  confidence numeric(4,3),
  model_id text NOT NULL,
  cost_usd numeric,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_image_chrono_flags
  DROP CONSTRAINT IF EXISTS ai_image_chrono_flags_confidence_chk;
ALTER TABLE public.ai_image_chrono_flags
  ADD CONSTRAINT ai_image_chrono_flags_confidence_chk
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

-- flagged=false rows are clean-audit markers: no finding text, no category.
ALTER TABLE public.ai_image_chrono_flags
  DROP CONSTRAINT IF EXISTS ai_image_chrono_flags_flagged_clean_chk;
ALTER TABLE public.ai_image_chrono_flags
  ADD CONSTRAINT ai_image_chrono_flags_flagged_clean_chk
  CHECK (flagged OR (anachronism_text IS NULL AND element_category IS NULL));

ALTER TABLE public.ai_image_chrono_flags
  DROP CONSTRAINT IF EXISTS ai_image_chrono_flags_category_chk;
ALTER TABLE public.ai_image_chrono_flags
  ADD CONSTRAINT ai_image_chrono_flags_category_chk
  CHECK (
    element_category IS NULL
    OR element_category IN (
      'attire',
      'technology',
      'vehicles',
      'architecture',
      'weapons_military',
      'signage_text',
      'lighting_photo',
      'food_objects',
      'other'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS ai_image_chrono_flags_uniq
  ON public.ai_image_chrono_flags (event_id, image_id, ai_player_id, anachronism_key);

CREATE INDEX IF NOT EXISTS ai_image_chrono_flags_event_idx
  ON public.ai_image_chrono_flags (event_id);

CREATE INDEX IF NOT EXISTS ai_image_chrono_flags_image_idx
  ON public.ai_image_chrono_flags (image_id);

CREATE INDEX IF NOT EXISTS ai_image_chrono_flags_flagged_idx
  ON public.ai_image_chrono_flags (event_id, image_id, element_category)
  WHERE flagged;

-- ai_fleet_runs kind CHECK: add 'image_chrono' (same DROP CONSTRAINT / ADD
-- CONSTRAINT pattern as ai_answer_bank_play_mode_chk).
ALTER TABLE public.ai_fleet_runs
  DROP CONSTRAINT IF EXISTS ai_fleet_runs_kind_check;
ALTER TABLE public.ai_fleet_runs
  ADD CONSTRAINT ai_fleet_runs_kind_check
  CHECK (kind IN ('daily', 'practice', 'manual', 'image_chrono'));

ALTER TABLE public.ai_image_chrono_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_image_chrono_flags FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.ai_image_chrono_flags TO service_role;

-- Corroboration holds: >= 2 DISTINCT players flagging the same
-- element_category on the event's CURRENT primary image — the first images
-- row by (display_order ASC NULLS LAST, created_at, id), the same ordering
-- generate-answers-v3.ts uses to pick the playable image. Restricted to the
-- primary image so a replaced image clears the hold automatically.
CREATE OR REPLACE VIEW public.ai_image_chrono_holds WITH (security_invoker = true) AS
WITH primary_images AS (
  SELECT DISTINCT ON (i.event_id)
    i.event_id,
    i.id AS image_id
  FROM public.images i
  ORDER BY i.event_id, i.display_order ASC NULLS LAST, i.created_at ASC, i.id ASC
)
SELECT
  f.event_id,
  f.image_id,
  f.element_category,
  COUNT(DISTINCT f.ai_player_id)::int AS flagger_count,
  (COUNT(DISTINCT f.ai_player_id) >= 2) AS held
FROM public.ai_image_chrono_flags f
JOIN primary_images p
  ON p.event_id = f.event_id
 AND p.image_id = f.image_id
WHERE f.flagged
  AND f.element_category IS NOT NULL
GROUP BY f.event_id, f.image_id, f.element_category;

REVOKE ALL ON public.ai_image_chrono_holds FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.ai_image_chrono_holds TO service_role;
