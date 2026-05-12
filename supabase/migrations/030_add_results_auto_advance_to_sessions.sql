-- Add results_auto_advance_sec to sessions table
-- Default 10 seconds (matches UI default)

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS results_auto_advance_sec INT NOT NULL DEFAULT 10;
