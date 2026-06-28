-- Add session_deadline_days to sessions table
-- Stores the host-configured Relax (async) session deadline as a duration (1-14 days).
-- The absolute session_deadline TIMESTAMP is computed at START_GAME:
--   session_deadline = startedAt + session_deadline_days * 86400 seconds
-- NULL for Rush (sync) sessions (no deadline). See GAME_MODES_SPEC.md v1.4 §5.3.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_deadline_days INT NULL;

-- Constraint: when set, must be in the Relax deadline slider range (1-14 days)
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_session_deadline_days_range
  CHECK (session_deadline_days IS NULL OR (session_deadline_days >= 1 AND session_deadline_days <= 14));
