-- MP-BUILD-RELAXPUSH-NUDGE-001
-- Add a persisted dismissal flag for the Relax session-start push nudge.
-- Default FALSE means every user (existing + new) starts as "not dismissed"
-- and will see the nudge once when they start a Relax session. Once they
-- dismiss or enable, the flag is set to TRUE and the nudge never appears again.
-- This is a SEPARATE flag from push_soft_ask_dismissed (first-login soft-ask).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS relax_push_nudge_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
