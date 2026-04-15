-- Migration 008: Add seed column to sessions table for deterministic PRNG
-- Required per FULL_CORE_GAME_MASTER_SPEC.md Section 0.3 Determinism

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name = 'seed'
  ) THEN
    ALTER TABLE public.sessions ADD COLUMN seed TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- Validate: seed must be non-empty for compete/sync modes
ALTER TABLE public.sessions 
  ADD CONSTRAINT sessions_seed_not_empty CHECK (
    mode = 'practice' OR (seed IS NOT NULL AND length(trim(seed)) > 0)
  );

COMMENT ON COLUMN public.sessions.seed IS 'Deterministic PRNG seed for event selection. Required for compete modes.';
