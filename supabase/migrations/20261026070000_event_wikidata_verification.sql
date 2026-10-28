-- EDQ-BUILD-WIKIDATA-VERIFY-1026-001-A
-- Per-event Wikidata verification results. One row per checked event.
-- Written ONLY by the service-role runner (scripts/event-quality/wikidata-verify.ts
-- --write). Never read or written by client roles. Wikidata results never
-- overwrite events/locations — this table is an audit side-store.

CREATE TABLE IF NOT EXISTS public.event_wikidata_verification (
  event_id          UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  run_id            TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('verified','review','mismatch','ambiguous','no_match','no_wd_date')),
  wikidata_qid      TEXT,
  wd_label          TEXT,
  wd_year_start     INT,
  wd_year_end       INT,
  wd_date_precision INT,
  wd_lat            DOUBLE PRECISION,
  wd_lon            DOUBLE PRECISION,
  wd_coord_source   TEXT CHECK (wd_coord_source IN ('P625','P276')),
  year_delta        INT,
  distance_km       NUMERIC,
  match_score       NUMERIC,
  runner_up_qid     TEXT,
  runner_up_score   NUMERIC,
  details           JSONB,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_wikidata_verification ENABLE ROW LEVEL SECURITY;

-- Service-role only: revoke the default client grants. No policies are
-- created — RLS with zero policies denies every client-role access; the
-- service role bypasses RLS and is granted explicitly.
REVOKE ALL ON public.event_wikidata_verification FROM anon;
REVOKE ALL ON public.event_wikidata_verification FROM authenticated;
GRANT ALL ON public.event_wikidata_verification TO service_role;
