-- ============================================================
-- MIGRATION 023: Prevent Duplicate ROUND_STARTED Events
-- TASK: BUG-FIX-005
-- Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 8
--
-- Problem: Concurrent /advance requests can both pass validation
-- and insert ROUND_STARTED for the same round, causing:
--   INVALID_PHASE_TRANSITION: ROUND_STARTED → ROUND_STARTED
--
-- Solution: Partial unique index ensures at most ONE ROUND_STARTED
-- per (game_id, round_index). Second request gets unique violation,
-- which API treats as idempotent "already advanced" success.
--
-- Note: This is a guardrail. The API also has idempotency checks.
-- ============================================================

-- Partial unique index: only enforces uniqueness for ROUND_STARTED events
CREATE UNIQUE INDEX idx_round_events_unique_round_started
  ON round_events (game_id, round_index)
  WHERE event_type = 'ROUND_STARTED';

-- Add comment documenting the constraint
COMMENT ON INDEX idx_round_events_unique_round_started IS
  'Prevents duplicate ROUND_STARTED events per game/round. Second concurrent advance request fails with unique violation, which API treats as idempotent success.';
