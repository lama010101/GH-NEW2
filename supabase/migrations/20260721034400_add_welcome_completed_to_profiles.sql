-- MP-FIX-WELCOME-MODAL-RETRIGGER-001
-- Add a persisted signal that the welcome/onboarding flow has been completed.
-- Backfill existing users who already have an assigned avatar as completed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_completed BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.profiles
  SET welcome_completed = TRUE
  WHERE avatar_url IS NOT NULL;
