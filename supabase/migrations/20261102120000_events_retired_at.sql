-- EDQ-BUILD-RETIREDAT-1102-038
-- Separate "retired from play" from "readable in history".
--
-- events.status keeps meaning "passed review". retired_at is the play-
-- eligibility tombstone: non-NULL = excluded from every NEW draw, while the
-- row stays fully readable for past and in-flight sessions (a retired event
-- keeps status 'validated', so existing read-by-id predicates still return
-- it). Withdraw = UPDATE events SET retired_at = now(); reinstate = NULL.
--
-- Scope: additive nullable column only. No index, no backfill, no grants —
-- events is service-role-only (20260730045626).

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS retired_at timestamptz;

COMMENT ON COLUMN public.events.retired_at IS 'Withdrawn from play: non-NULL = excluded from all new event draws; row remains readable for past/in-flight sessions. status is unchanged.';
