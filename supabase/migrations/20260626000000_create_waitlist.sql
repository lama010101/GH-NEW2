-- Migration 20260626000000: create waitlist table
-- Ref: MP-ADD-WAITLIST-TBL-001
-- Stores waitlist email signups. PK is a stable surrogate UUID; email dedup is
-- enforced at the DB layer via a separate UNIQUE constraint (PK stays surrogate).
-- RLS enabled with no policies for authenticated -> implicit deny; the service
-- role bypasses RLS automatically (consistent with DATABASE_SCHEMA_STATE.md).

CREATE TABLE IF NOT EXISTS public.waitlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_email_unique UNIQUE (email);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
