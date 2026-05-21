-- Add results_auto_advance_sec to sessions table
-- Default 90 seconds (matches UI default)

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS results_auto_advance_sec INT NOT NULL DEFAULT 90;

-- Ensure existing columns get the correct default (ADD COLUMN IF NOT EXISTS is a no-op when column exists)
ALTER TABLE public.sessions ALTER COLUMN results_auto_advance_sec SET DEFAULT 90;

-- Backfill existing rows with old default
UPDATE sessions SET results_auto_advance_sec = 90 WHERE results_auto_advance_sec = 10;
