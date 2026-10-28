-- GEN-BUILD-CANDIDATES-1028-001
-- Staging table for the generation pipeline: candidate events land here
-- (status 'new') and are promoted into public.events only after narration,
-- checks and publishing. Keeps generation-time metadata (prompts, hints,
-- dedupe fingerprint, citations, quotas) out of the live events table.
--
-- Access model: RLS enabled. Writes are service_role only (no INSERT /
-- UPDATE / DELETE policies for client roles). Authenticated SELECT is
-- limited to admin profiles (profiles.role = 'admin'), matching the
-- middleware gate on /admin.
--
-- Idempotent: IF NOT EXISTS on table/indexes, DROP POLICY IF EXISTS before
-- CREATE POLICY.

CREATE TABLE IF NOT EXISTS public.generation_candidates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status             text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','narrated','checked','published','rejected')),
  wikidata_qid       text, -- NULLABLE (fictional events have none)
  wd_label           text,
  event_year         int,
  event_date         text,
  date_precision     int,
  latitude           double precision,
  longitude          double precision,
  coord_source       text CHECK (coord_source IN ('P625','P276','geocoder')),
  location_name      text,
  country            text,
  continent          text,
  title              text,
  description        text,
  ai_prompt          text,
  negative_prompt    text,
  theme              text,
  category           text,
  real_event         boolean NOT NULL DEFAULT true,
  celebrity          boolean DEFAULT false,
  approx_people_count int,
  sitelinks          int,
  p31                jsonb,
  hints              jsonb,
  dedupe_fingerprint text,
  source_citations   jsonb,
  checks             jsonb,
  quota_bucket       jsonb,
  event_id           uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS generation_candidates_qid_uniq
  ON public.generation_candidates (wikidata_qid)
  WHERE wikidata_qid IS NOT NULL;
CREATE INDEX IF NOT EXISTS generation_candidates_fingerprint_idx
  ON public.generation_candidates (dedupe_fingerprint);
CREATE INDEX IF NOT EXISTS generation_candidates_status_idx
  ON public.generation_candidates (status);

ALTER TABLE public.generation_candidates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.generation_candidates FROM anon, authenticated;
GRANT ALL ON public.generation_candidates TO service_role;
GRANT SELECT ON public.generation_candidates TO authenticated;

DROP POLICY IF EXISTS "generation_candidates_admin_select"
  ON public.generation_candidates;
CREATE POLICY "generation_candidates_admin_select"
  ON public.generation_candidates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));
