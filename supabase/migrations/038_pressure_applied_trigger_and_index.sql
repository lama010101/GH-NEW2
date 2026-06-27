-- Migration: Fix FSM validation trigger to whitelist PRESSURE_APPLIED (not TIMER_CLAMPED)
--            and add idempotency unique partial index for PRESSURE_APPLIED.
-- Task: MP-EXEC-COMPETE-CONSOLIDATED-001 (A1)
-- Date: 2026-06-27
--
-- BACKGROUND:
--   Migration 027 whitelisted `TIMER_CLAMPED` as the side-effect event that
--   bypasses the FSM transition check. The live code writes `PRESSURE_APPLIED`
--   (src/server/sessionCore.ts recordPressureApplied / appendPressureAppliedIfNotExists).
--   No code writes `TIMER_CLAMPED` to round_events (grep confirms only the WS
--   ClientMessage type named TIMER_CLAMPED exists — a different concept).
--   A0 confirmation query showed 0 PRESSURE_APPLIED rows in the live DB while
--   1707 ROUND_COMPLETE rows exist — every PRESSURE_APPLIED INSERT was rejected
--   by the trigger, which is the root cause of the pressure-clamp race symptom.
--
--   This migration:
--     1. Re-creates trg_validate_event() with PRESSURE_APPLIED as the
--        whitelisted side-effect event (replacing TIMER_CLAMPED).
--     2. Adds a unique partial index on (game_id, round_index) WHERE
--        event_type = 'PRESSURE_APPLIED' so concurrent first-submission clamp
--        attempts resolve to exactly one row (mirrors the existing
--        uq_round_events_round_complete pattern).
--
--   Idempotent: DROP IF EXISTS / CREATE OR REPLACE / IF NOT EXISTS throughout.
-- ═════════════════════════════════════════════════════════════════════════════

-- Drop existing trigger and function if they exist (idempotency)
DROP TRIGGER IF EXISTS trg_validate_event ON round_events;
DROP FUNCTION IF EXISTS trg_validate_event();

-- Create the trigger function (identical to 027 except RULE 1 whitelists
-- PRESSURE_APPLIED instead of TIMER_CLAMPED).
CREATE OR REPLACE FUNCTION trg_validate_event()
RETURNS TRIGGER AS $$
DECLARE
  prev_event_type TEXT;
  prev_round_index INTEGER;
  new_event_type TEXT;
  new_round_index INTEGER;
  new_cause TEXT;
BEGIN
  new_event_type := NEW.event_type;
  new_round_index := NEW.round_index;

  -- ═════════════════════════════════════════════════════════════════════════════
  -- RULE 1: PRESSURE_APPLIED is always allowed (side-effect event, no FSM check)
  --   (was TIMER_CLAMPED in migration 027; renamed to match live code event type)
  -- ═════════════════════════════════════════════════════════════════════════════
  IF new_event_type = 'PRESSURE_APPLIED' THEN
    RETURN NEW;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════════
  -- RULE 2: Find previous event for this game
  -- ═════════════════════════════════════════════════════════════════════════════
  SELECT event_type, round_index
  INTO prev_event_type, prev_round_index
  FROM round_events
  WHERE game_id = NEW.game_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  -- ═════════════════════════════════════════════════════════════════════════════
  -- RULE 3: First event must be SESSION_CREATED
  -- ═════════════════════════════════════════════════════════════════════════════
  IF prev_event_type IS NULL THEN
    IF new_event_type != 'SESSION_CREATED' THEN
      RAISE EXCEPTION 'Invalid first event: expected SESSION_CREATED, got %', new_event_type;
    END IF;
    RETURN NEW;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════════
  -- RULE 4: Validate FSM transition
  --   FSM from src/server/eventStream.ts VALID_PHASE_TRANSITIONS:
  --     SESSION_CREATED  → ROUND_STARTED, SESSION_COMPLETE
  --     ROUND_STARTED    → GUESS_SUBMITTED, ROUND_COMPLETE
  --     GUESS_SUBMITTED  → GUESS_SUBMITTED, ROUND_COMPLETE
  --     ROUND_COMPLETE   → ROUND_STARTED, SESSION_COMPLETE
  --     SESSION_COMPLETE → (none)
  -- ═════════════════════════════════════════════════════════════════════════════

  IF prev_event_type = 'SESSION_CREATED' THEN
    IF new_event_type NOT IN ('ROUND_STARTED', 'SESSION_COMPLETE') THEN
      RAISE EXCEPTION 'Invalid FSM transition: % → % is not allowed. Allowed: ROUND_STARTED, SESSION_COMPLETE', prev_event_type, new_event_type;
    END IF;
  ELSIF prev_event_type = 'ROUND_STARTED' THEN
    IF new_event_type NOT IN ('GUESS_SUBMITTED', 'ROUND_COMPLETE') THEN
      RAISE EXCEPTION 'Invalid FSM transition: % → % is not allowed. Allowed: GUESS_SUBMITTED, ROUND_COMPLETE', prev_event_type, new_event_type;
    END IF;
  ELSIF prev_event_type = 'GUESS_SUBMITTED' THEN
    IF new_event_type NOT IN ('GUESS_SUBMITTED', 'ROUND_COMPLETE') THEN
      RAISE EXCEPTION 'Invalid FSM transition: % → % is not allowed. Allowed: GUESS_SUBMITTED, ROUND_COMPLETE', prev_event_type, new_event_type;
    END IF;
  ELSIF prev_event_type = 'PRESSURE_APPLIED' THEN
    -- PRESSURE_APPLIED is a side-effect event during ROUND_ACTIVE (after a
    -- GUESS_SUBMITTED). It does not change the phase, so transitions FROM it
    -- are the same as FROM GUESS_SUBMITTED (→ GUESS_SUBMITTED, ROUND_COMPLETE).
    -- Also allow another PRESSURE_APPLIED (idempotent no-op via unique index).
    IF new_event_type NOT IN ('GUESS_SUBMITTED', 'ROUND_COMPLETE', 'PRESSURE_APPLIED') THEN
      RAISE EXCEPTION 'Invalid FSM transition: % → % is not allowed. Allowed: GUESS_SUBMITTED, ROUND_COMPLETE, PRESSURE_APPLIED', prev_event_type, new_event_type;
    END IF;
  ELSIF prev_event_type = 'ROUND_COMPLETE' THEN
    IF new_event_type NOT IN ('ROUND_STARTED', 'SESSION_COMPLETE') THEN
      RAISE EXCEPTION 'Invalid FSM transition: % → % is not allowed. Allowed: ROUND_STARTED, SESSION_COMPLETE', prev_event_type, new_event_type;
    END IF;
  ELSIF prev_event_type = 'SESSION_COMPLETE' THEN
    RAISE EXCEPTION 'Invalid FSM transition: % → % is not allowed. SESSION_COMPLETE is terminal', prev_event_type, new_event_type;
  ELSE
    -- Unknown previous event type
    RAISE EXCEPTION 'Invalid FSM transition: previous event type % is not recognized', prev_event_type;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════════
  -- RULE 5: Validate cause field for cause-carrying events
  -- ═════════════════════════════════════════════════════════════════════════════
  IF new_event_type IN ('ROUND_STARTED', 'SESSION_COMPLETE') THEN
    new_cause := NEW.payload->>'cause';

    -- Check cause is present and non-empty
    IF new_cause IS NULL OR new_cause = '' THEN
      RAISE EXCEPTION 'INVALID_CAUSE: % requires payload.cause to be present and non-empty', new_event_type;
    END IF;

    -- Check cause is valid
    IF new_cause NOT IN ('player', 'timeout', 'internal') THEN
      RAISE EXCEPTION 'INVALID_CAUSE: % requires valid cause (player, timeout, internal), got: %', new_event_type, new_cause;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trg_validate_event
BEFORE INSERT ON round_events
FOR EACH ROW
EXECUTE FUNCTION trg_validate_event();

-- ═════════════════════════════════════════════════════════════════════════════
-- Idempotency: unique partial index for PRESSURE_APPLIED (one clamp per round)
--   Mirrors uq_round_events_round_complete. Allows appendPressureAppliedIfNotExists
--   to use ON CONFLICT (game_id, round_index) WHERE event_type = 'PRESSURE_APPLIED'
--   DO NOTHING, so concurrent first-submission clamp attempts resolve to exactly
--   one row.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_round_events_unique_pressure
ON round_events (game_id, round_index)
WHERE event_type = 'PRESSURE_APPLIED';
