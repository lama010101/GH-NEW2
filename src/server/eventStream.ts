// eventStream.ts — Pure Event Stream Processing (Zero Dependencies)
//
// Contains pure functions for event stream processing.
// NO database imports. NO side effects. Fully deterministic.
//
// Used by: getGameState.ts (DB state reconstruction)

// ═════════════════════════════════════════════════════════════════════════════
// TYPES — Event Stream Processing
// ═════════════════════════════════════════════════════════════════════════════

/** Event from round_events — phase authority */
export type RoundEvent = {
  id: number;
  roundIndex: number | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

// ═════════════════════════════════════════════════════════════════════════════
// PHASE AUTHORITY — Deterministic Event Stream Processor
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Valid phase transitions map.
 * Each phase lists the phases it can transition TO.
 * EXPORTED: Used by eventStore.ts for write-time FSM validation.
 */
export const VALID_PHASE_TRANSITIONS: Record<string, Set<string>> = {
  "SESSION_CREATED": new Set(["ROUND_STARTED", "SESSION_COMPLETE"]),
  "ROUND_STARTED": new Set(["GUESS_SUBMITTED", "ROUND_COMPLETE"]),
  "GUESS_SUBMITTED": new Set(["GUESS_SUBMITTED", "PRESSURE_APPLIED", "ROUND_COMPLETE"]),
  "PRESSURE_APPLIED": new Set(["GUESS_SUBMITTED", "PRESSURE_APPLIED", "ROUND_COMPLETE"]),
  "ROUND_COMPLETE": new Set(["ROUND_STARTED", "SESSION_COMPLETE", "READY_NEXT"]),
  "READY_NEXT": new Set(["READY_NEXT", "ROUND_STARTED", "SESSION_COMPLETE"]),
  "SESSION_COMPLETE": new Set([])
};

/**
 * Derive current round and phase from FULL ordered event stream.
 *
 * RULE: This function consumes the COMPLETE event list (ALL rounds) and:
 * 1. Validates global ordering (created_at ASC, id ASC)
 * 2. Validates round continuity (no gaps, increments by +1)
 * 3. Validates phase sequence (strict allowed transitions)
 * 4. Derives currentRound and currentPhase from last event
 *
 * NO filtering — full stream validation is REQUIRED for deterministic replay.
 *
 * @param inputEvents — FULL ordered list of ALL events for the session
 * @returns { currentRound, currentPhase } — derived state
 * @throws Error with explicit code on ANY validation failure
 */
export function deriveStateFromEventStream(inputEvents: RoundEvent[]): {
  currentRound: number;
  currentPhase: string | null;
} {
  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 1: INPUT PROTECTION — Prevent mutation of source array
  // ═════════════════════════════════════════════════════════════════════════════
  const events = [...inputEvents];
  Object.freeze(events);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 2: Handle empty event stream
  // ───────────────────────────────────────────────────────────────────────────
  if (events.length === 0) {
    return { currentRound: 0, currentPhase: null };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 3: STRICT ORDERING VALIDATION — Monotonic chronology
  // ═════════════════════════════════════════════════════════════════════════════
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];

    const prevTime = new Date(prev.createdAt).getTime();
    const currTime = new Date(curr.createdAt).getTime();

    // Strict chronology: created_at must be non-decreasing
    if (currTime < prevTime) {
      throw new Error(
        `EVENT_ORDER_VIOLATION: Event ${curr.id} (created_at=${curr.createdAt}) ` +
        `comes before event ${prev.id} (created_at=${prev.createdAt})`
      );
    }

    // Tie-break: id must be increasing for same-timestamp events
    if (currTime === prevTime && curr.id < prev.id) {
      throw new Error(
        `EVENT_ORDER_VIOLATION: Event ${curr.id} has same timestamp as ${prev.id} ` +
        `but lower id (id tie-break violated)`
      );
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 4: STRICT ROUND VALIDATION — Per-event validation with continuity tracking
  // ═════════════════════════════════════════════════════════════════════════════
  let expectedRound = 0;
  let maxSeenRound = -1;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // ─────────────────────────────────────────────────────────────────────────
    // 4a: NULL / INVALID ROUND REJECTION — Immediate fail-fast
    // ─────────────────────────────────────────────────────────────────────────
    if (event.roundIndex === undefined) {
      throw new Error(
        `INVALID_ROUND_INDEX: Event ${event.id} (type=${event.eventType}) ` +
        `has undefined roundIndex. All round-based events require explicit roundIndex.`
      );
    }

    if (event.roundIndex === null) {
      // Session-level events (SESSION_CREATED, SESSION_COMPLETE) may have null roundIndex
      // Only gameplay events require round validation
      const gameplayEvents = [
        "ROUND_STARTED",
        "GUESS_SUBMITTED",
        "ROUND_COMPLETE",
        "PRESSURE_APPLIED",
        "READY_NEXT"
      ];
      if (gameplayEvents.includes(event.eventType)) {
        throw new Error(
          `INVALID_ROUND_INDEX: Event ${event.id} (type=${event.eventType}) ` +
          `has null roundIndex. Gameplay events require valid roundIndex >= 0.`
        );
      }
      // Skip round validation for session-level events with null roundIndex
      continue;
    }

    // Reject NaN
    if (Number.isNaN(event.roundIndex)) {
      throw new Error(
        `INVALID_ROUND_INDEX: Event ${event.id} (type=${event.eventType}) ` +
        `has NaN roundIndex.`
      );
    }

    // Reject negative
    if (event.roundIndex < 0) {
      throw new Error(
        `INVALID_ROUND_INDEX: Event ${event.id} (type=${event.eventType}) ` +
        `has negative roundIndex (${event.roundIndex}). Round indices must be >= 0.`
      );
    }

    // Reject non-integer
    if (!Number.isInteger(event.roundIndex)) {
      throw new Error(
        `INVALID_ROUND_INDEX: Event ${event.id} (type=${event.eventType}) ` +
        `has non-integer roundIndex (${event.roundIndex}).`
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4b: ROUND CONTINUITY VALIDATION — No skips, no regressions
    // ─────────────────────────────────────────────────────────────────────────
    const round = event.roundIndex;

    if (round < maxSeenRound) {
      // Round regression detected
      throw new Error(
        `ROUND_CONTINUITY_ERROR: Event ${event.id} (type=${event.eventType}) ` +
        `has roundIndex=${round} which is less than previously seen max=${maxSeenRound}. ` +
        `Round regression is not allowed.`
      );
    }

    if (round > expectedRound) {
      // Round skip detected (e.g., jump from 0 to 2)
      throw new Error(
        `ROUND_CONTINUITY_ERROR: Event ${event.id} (type=${event.eventType}) ` +
        `has roundIndex=${round} but expected round ${expectedRound}. ` +
        `Round skips are not allowed. Rounds must be continuous (0, 1, 2, ...).`
      );
    }

    // Event starts or continues within expected round
    if (round === expectedRound) {
      // Check if this event starts a new round
      if (event.eventType === "ROUND_STARTED" && maxSeenRound < expectedRound) {
        // New round started — increment expected for next round
        expectedRound++;
      }
    }

    maxSeenRound = Math.max(maxSeenRound, round);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 5: Validate global round continuity (no gaps across all rounds)
  // ───────────────────────────────────────────────────────────────────────────
  const roundIndices = new Set<number>();
  for (const event of events) {
    if (event.roundIndex !== null && event.roundIndex !== undefined) {
      roundIndices.add(event.roundIndex);
    }
  }

  if (roundIndices.size > 0) {
    const sortedRounds = Array.from(roundIndices).sort((a, b) => a - b);

    // Check for gaps: rounds must be 0, 1, 2, ... with no skips
    for (let i = 0; i < sortedRounds.length; i++) {
      if (sortedRounds[i] !== i) {
        throw new Error(
          `ROUND_CONTINUITY_ERROR: Expected round ${i} but found ${sortedRounds[i]}. ` +
          `Rounds must be continuous with no skips (0, 1, 2, ...).`
        );
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 6: FORMAL PHASE FSM VALIDATION — Strict transition enforcement
  // ═════════════════════════════════════════════════════════════════════════════
  // First event must be a valid initial phase
  const firstEvent = events[0];
  const validInitialPhases = new Set(["SESSION_CREATED"]);
  if (!validInitialPhases.has(firstEvent.eventType)) {
    throw new Error(
      `INVALID_PHASE_TRANSITION: First event (id=${firstEvent.id}) ` +
      `has phase "${firstEvent.eventType}" but must be one of: ${Array.from(validInitialPhases).join(", ")}. ` +
      `Event stream must start with SESSION_CREATED.`
    );
  }

  // Validate each transition
  for (let i = 1; i < events.length; i++) {
    const prevEvent = events[i - 1];
    const currEvent = events[i];

    const allowedNextPhases = VALID_PHASE_TRANSITIONS[prevEvent.eventType];

    // Unknown previous phase — not in FSM
    if (allowedNextPhases === undefined) {
      throw new Error(
        `INVALID_PHASE_TRANSITION: Event ${prevEvent.id} has unknown phase "${prevEvent.eventType}". ` +
        `Phase not defined in VALID_PHASE_TRANSITIONS FSM.`
      );
    }

    // Strict FSM transition check
    if (!allowedNextPhases.has(currEvent.eventType)) {
      throw new Error(
        `INVALID_PHASE_TRANSITION: Cannot transition from "${prevEvent.eventType}" ` +
        `(event ${prevEvent.id}) to "${currEvent.eventType}" (event ${currEvent.id}). ` +
        `Allowed transitions from "${prevEvent.eventType}": [${Array.from(allowedNextPhases).join(", ") || "(none — terminal state)"}]`
      );
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 7: Derive current round and phase from LAST event
  // ═════════════════════════════════════════════════════════════════════════════
  const lastEvent = events[events.length - 1];

  // Phase must be explicitly present — no inference allowed
  if (!lastEvent.eventType) {
    throw new Error(
      `MISSING_PHASE_EVENT: Last event (id=${lastEvent.id}) has no eventType. ` +
      `Phase must be explicitly derived from event stream.`
    );
  }

  const currentRound = lastEvent.roundIndex ?? 0;
  const currentPhase = lastEvent.eventType;

  return { currentRound, currentPhase };
}
