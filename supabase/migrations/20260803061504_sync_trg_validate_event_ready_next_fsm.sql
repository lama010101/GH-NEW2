-- Migration: Sync trg_validate_event FSM with eventStream.ts VALID_PHASE_TRANSITIONS
-- Task: MP-FIX-DBTRIGGER-READYNEXT-FSM-001
-- Date: 2026-08-03
--
-- BACKGROUND:
--   src/server/eventStream.ts VALID_PHASE_TRANSITIONS was updated to include
--   READY_NEXT, but the live DB trigger trg_validate_event still uses the
--   old FSM that lacks the READY_NEXT state. This causes valid live
--   ROUND_COMPLETE → READY_NEXT inserts to be rejected with HTTP 500.
--
--   This migration:
--     1. Re-creates trg_validate_event() with READY_NEXT added to the FSM:
--        - ROUND_COMPLETE → ROUND_STARTED, SESSION_COMPLETE, READY_NEXT
--        - READY_NEXT   → READY_NEXT, ROUND_STARTED, SESSION_COMPLETE
--     2. Leaves all other transition branches unchanged.
--
--   Idempotent: DROP IF EXISTS / CREATE OR REPLACE throughout.
-- ═════════════════════════════════════════════════════════════════════════════

-- Drop existing trigger and function if they exist (idempotency)
DROP TRIGGER IF EXISTS trg_validate_event ON round_events;
DROP FUNCTION IF EXISTS trg_validate_event();

-- Create the trigger function with the updated FSM
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
  --     ROUND_COMPLETE   → ROUND_STARTED, SESSION_COMPLETE, READY_NEXT
  --     READY_NEXT       → READY_NEXT, ROUND_STARTED, SESSION_COMPLETE
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
    IF new_event_type NOT IN ('ROUND_STARTED', 'SESSION_COMPLETE', 'READY_NEXT') THEN
      RAISE EXCEPTION 'Invalid FSM transition: % → % is not allowed. Allowed: ROUND_STARTED, SESSION_COMPLETE, READY_NEXT', prev_event_type, new_event_type;
    END IF;
  ELSIF prev_event_type = 'READY_NEXT' THEN
    IF new_event_type NOT IN ('READY_NEXT', 'ROUND_STARTED', 'SESSION_COMPLETE') THEN
      RAISE EXCEPTION 'Invalid FSM transition: % → % is not allowed. Allowed: READY_NEXT, ROUND_STARTED, SESSION_COMPLETE', prev_event_type, new_event_type;
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
