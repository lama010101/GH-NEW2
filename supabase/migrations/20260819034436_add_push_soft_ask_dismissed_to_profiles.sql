-- AIP-BUILD-PUSHDEFAULT-SOFTASK-002
-- Add a persisted dismissal flag for the first-login push soft-ask prompt.
-- Default TRUE means every existing row is marked as dismissed at migration time,
-- so existing users are never re-prompted. New-user rows are inserted with FALSE
-- by the updated handle_new_user trigger.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_soft_ask_dismissed BOOLEAN NOT NULL DEFAULT TRUE;
