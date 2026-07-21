-- Add absent flag to round_commits for Compete Relax (Option A) per GAME_MODES_SPEC.md v1.5 §5.
-- Distinguishes "submitted a real guess scoring 0" (absent=FALSE, score=0)
-- from "never submitted / absent for the round" (absent=TRUE, score=0).
-- Respects the append-only composite-PK design: no new table, no second writer.
-- round_results stays derived from round_commits; absent rows are inserted by
-- the round-completion path (sessionCore.ts) for active players who did not
-- submit before round-timer or session-deadline expiry.
-- See docs/archive/plans/MP-PLAN-COMPETE-AUDIT-FIX-001.md and docs/GAME_MODES_SPEC.md v1.5 §5.

ALTER TABLE public.round_commits
  ADD COLUMN IF NOT EXISTS absent BOOLEAN NOT NULL DEFAULT FALSE;
