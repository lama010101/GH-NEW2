-- Migration: create_daily_challenges
-- Per DAILY_MODE_SPEC.md §4.2 — pins the 5 event IDs for a given UTC date.
-- RLS: service_role ONLY (no authenticated policy). Event IDs + authenticated-
-- readable events/locations/hints = full answer leak, so this table must not
-- be SELECT-able by authenticated users (DAILY_MODE_SPEC.md §14, CTO ruling R4).

CREATE TABLE daily_challenges (
  date        DATE PRIMARY KEY,
  seed        BIGINT NOT NULL,
  event_ids   UUID[] NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_challenges_five_events CHECK (array_length(event_ids, 1) = 5)
);

ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for authenticated: service_role bypasses RLS, authenticated
-- users get zero rows. This prevents event-id leakage before round reveal.
