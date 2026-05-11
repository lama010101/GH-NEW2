-- Migration: Add BEFORE INSERT trigger on round_events to validate FSM transitions and cause field
-- Task: MP-PLAN-3.3
-- Date: 2026-05-10

-- ═════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: trg_validate_event
-- ═════════════════════════════════════════════════════════════════════════════
-- Validates:
-- 1. FSM transition validity (based on VALID_PHASE_TRANSITIONS from eventStream.ts)
-- 2. Cause field presence and valid values for ROUND_STARTED and SESSION_COMPLETE
-- 3. First event must be SESSION_CREATED
--
-- Side-effect events (skip FSM check):
--   TIMER_CLAMPED — always allowed
--
-- Cause-carrying events (must have valid cause):
--   ROUND_STARTED, SESSION_COMPLETE
--
-- Valid cause values: 'player', 'timeout', 'internal'
-- ═════════════════════════════════════════════════════════════════════════════

-- Drop existing trigger and function if they exist (idempotency)
DROP TRIGGER IF EXISTS trg_validate_event ON round_events;
DROP FUNCTION IF EXISTS trg_validate_event();

-- Create the trigger function
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
  -- RULE 1: TIMER_CLAMPED is always allowed (side-effect event, no FSM check)
  -- ═════════════════════════════════════════════════════════════════════════════
  IF new_event_type = 'TIMER_CLAMPED' THEN
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
  -- ═════════════════════════════════════════════════════════════════════════════
  -- FSM from src/server/eventStream.ts VALID_PHASE_TRANSITIONS:
  --   SESSION_CREATED  → ROUND_STARTED, SESSION_COMPLETE
  --   ROUND_STARTED    → GUESS_SUBMITTED, ROUND_COMPLETE
  --   GUESS_SUBMITTED  → GUESS_SUBMITTED, ROUND_COMPLETE
  --   ROUND_COMPLETE   → ROUND_STARTED, SESSION_COMPLETE
  --   SESSION_COMPLETE → (none)
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
