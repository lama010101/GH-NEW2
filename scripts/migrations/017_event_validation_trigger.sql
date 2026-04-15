-- Migration 017: Event Validation Trigger
-- TASK: CORE-FIX-002 — Zero-Corruption Event Pipeline
--
-- This trigger enforces FSM transitions at the database level.
-- Even if application logic has bugs, invalid transitions are rejected.

-- Drop existing trigger and function if they exist (for idempotency)
DROP TRIGGER IF EXISTS trg_validate_event ON round_events;
DROP FUNCTION IF EXISTS validate_event_transition();

-- Create validation function
CREATE OR REPLACE FUNCTION validate_event_transition()
RETURNS trigger AS $$
DECLARE
  prev_event RECORD;
BEGIN
  -- Load the previous event for this game
  SELECT event_type, round_index
  INTO prev_event
  FROM round_events
  WHERE game_id = NEW.game_id
  ORDER BY id DESC
  LIMIT 1;

  -- First event must be SESSION_CREATED
  IF prev_event IS NULL THEN
    IF NEW.event_type <> 'SESSION_CREATED' THEN
      RAISE EXCEPTION 'FIRST_EVENT_MUST_BE_SESSION_CREATED: Got "%"', NEW.event_type;
    END IF;
    RETURN NEW;
  END IF;

  -- FSM Validation: Define valid transitions
  -- SESSION_CREATED -> ROUND_STARTED, SESSION_COMPLETE
  -- ROUND_STARTED -> GUESS_SUBMITTED, ROUND_COMPLETE
  -- GUESS_SUBMITTED -> GUESS_SUBMITTED, ROUND_COMPLETE
  -- ROUND_COMPLETE -> ROUND_STARTED, SESSION_COMPLETE
  -- SESSION_COMPLETE -> (terminal, no outgoing)

  IF prev_event.event_type = 'SESSION_CREATED' THEN
    IF NEW.event_type NOT IN ('ROUND_STARTED', 'SESSION_COMPLETE') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: SESSION_CREATED -> % (allowed: ROUND_STARTED, SESSION_COMPLETE)', NEW.event_type;
    END IF;

  ELSIF prev_event.event_type = 'ROUND_STARTED' THEN
    IF NEW.event_type NOT IN ('GUESS_SUBMITTED', 'ROUND_COMPLETE') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: ROUND_STARTED -> % (allowed: GUESS_SUBMITTED, ROUND_COMPLETE)', NEW.event_type;
    END IF;

  ELSIF prev_event.event_type = 'GUESS_SUBMITTED' THEN
    IF NEW.event_type NOT IN ('GUESS_SUBMITTED', 'ROUND_COMPLETE') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: GUESS_SUBMITTED -> % (allowed: GUESS_SUBMITTED, ROUND_COMPLETE)', NEW.event_type;
    END IF;

  ELSIF prev_event.event_type = 'ROUND_COMPLETE' THEN
    IF NEW.event_type NOT IN ('ROUND_STARTED', 'SESSION_COMPLETE') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: ROUND_COMPLETE -> % (allowed: ROUND_STARTED, SESSION_COMPLETE)', NEW.event_type;
    END IF;

  ELSIF prev_event.event_type = 'SESSION_COMPLETE' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: SESSION_COMPLETE -> % (SESSION_COMPLETE is terminal)', NEW.event_type;

  ELSE
    -- Unknown previous event type - reject for safety
    RAISE EXCEPTION 'UNKNOWN_PREVIOUS_EVENT_TYPE: %', prev_event.event_type;
  END IF;

  -- Round consistency validation
  IF NEW.event_type = 'ROUND_STARTED' THEN
    -- ROUND_STARTED must increment round by exactly 1
    IF NEW.round_index IS NULL THEN
      RAISE EXCEPTION 'ROUND_INDEX_REQUIRED: ROUND_STARTED requires a round index';
    END IF;
    IF NEW.round_index <> COALESCE(prev_event.round_index, -1) + 1 THEN
      RAISE EXCEPTION 'INVALID_ROUND_INCREMENT: ROUND_STARTED requires round %, got %',
        COALESCE(prev_event.round_index, -1) + 1, NEW.round_index;
    END IF;

  ELSIF NEW.event_type IN ('GUESS_SUBMITTED', 'ROUND_COMPLETE', 'PRESSURE_APPLIED') THEN
    -- These events must stay in the same round
    IF NEW.round_index IS NULL THEN
      RAISE EXCEPTION 'ROUND_INDEX_REQUIRED: % requires a round index', NEW.event_type;
    END IF;
    IF NEW.round_index <> prev_event.round_index THEN
      RAISE EXCEPTION 'ROUND_MISMATCH: % must be in round %, got %',
        NEW.event_type, prev_event.round_index, NEW.round_index;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trg_validate_event
BEFORE INSERT ON round_events
FOR EACH ROW
EXECUTE FUNCTION validate_event_transition();

-- Add comment for documentation
COMMENT ON FUNCTION validate_event_transition() IS 'Enforces FSM transitions and round consistency for round_events. Mirrors app logic from eventStore.ts.';
