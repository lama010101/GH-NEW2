-- EVT-BUILD-REPORTAPI-1112-108
-- Player-submitted problem reports for events (wrong year, wrong location,
-- not a real event, misleading image, other). Reports NEVER auto-retire an
-- event; they queue for human triage. Service-role only: RLS enabled with
-- zero policies and all client grants revoked — same posture as
-- event_wikidata_verification (KC-013: posture changes only via migrations).

CREATE TABLE IF NOT EXISTS public.event_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  reporter_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- nullable on purpose: reports survive account deletion
  reporter_is_anonymous boolean NOT NULL DEFAULT false,                  -- true for guests; the trust score will weight these less
  reason                text NOT NULL CHECK (reason IN ('wrong_year','wrong_location','not_real_event','misleading_image','other')),
  details               text CHECK (details IS NULL OR char_length(details) <= 1000),
  event_snapshot        jsonb NOT NULL,                                  -- {title, event_year, status, retired_at} captured at insert
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','upheld','dismissed')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  resolved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note       text
);

-- One open report per (event, reporter, reason). Rows with NULL reporter_id
-- (post-account-deletion) are never indexed, so they never dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS event_reports_dedupe
  ON public.event_reports (event_id, reporter_id, reason)
  WHERE status = 'open' AND reporter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_reports_status_created
  ON public.event_reports (status, created_at);

ALTER TABLE public.event_reports ENABLE ROW LEVEL SECURITY;

-- Service-role only: revoke the default client grants. No policies are
-- created — RLS with zero policies denies every client-role access; the
-- service role bypasses RLS and is granted explicitly.
REVOKE ALL ON public.event_reports FROM anon;
REVOKE ALL ON public.event_reports FROM authenticated;
REVOKE ALL ON public.event_reports FROM PUBLIC;
GRANT ALL ON public.event_reports TO service_role;
