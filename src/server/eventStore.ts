// eventStore.ts — Zero-Corruption Event Pipeline
// TASK: CORE-FIX-002
// Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3 + EVENT_STREAM_SPEC.md
//
// CRITICAL INVARIANTS:
// - This is the ONLY way to write to round_events
// - All events MUST pass FSM transition validation
// - All events MUST pass round consistency validation
// - Validation occurs at WRITE TIME, not read time
// - Must be called inside an open transaction (FOR UPDATE lock)

import { VALID_PHASE_TRANSITIONS } from "./getGameState";
import type { DbTransactionClient } from "./sessionCore";
import { isTransitionCause, CAUSE_CARRYING_EVENTS } from "@/core/transitionCause";

// ═════════════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type EventType =
  | "SESSION_CREATED"
  | "ROUND_STARTED"
  | "GUESS_SUBMITTED"
  | "ROUND_COMPLETE"
  | "SESSION_COMPLETE"
  | "PRESSURE_APPLIED";

// NOTE: TransitionCause domain contract lives in @/core/transitionCause
// (shared module for Next.js + PartyKit). Import directly from there.

export type LastEventInfo = {
  id: number;
  eventType: string;
  roundIndex: number | null;
} | null;

// ═════════════════════════════════════════════════════════════════════════════
// STEP 3 — LOCK AND LOAD LAST EVENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Load the last event for a game with FOR UPDATE lock.
 * MUST be called inside an open transaction.
 */
export async function loadLastEventWithLock(
  client: DbTransactionClient,
  gameId: string
): Promise<LastEventInfo> {
  const res = await client.query<{
    id: number;
    event_type: string;
    round_index: number | null;
  }>(
    `
    SELECT id, event_type, round_index
    FROM round_events
    WHERE game_id = $1
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
    `,
    [gameId]
  );

  if (res.rows.length === 0) {
    return null;
  }

  return {
    id: res.rows[0].id,
    eventType: res.rows[0].event_type,
    roundIndex: res.rows[0].round_index
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 4 — FSM VALIDATION (WRITE-TIME)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Assert that a phase transition is valid according to the FSM.
 * Throws on invalid transition.
 */
function assertValidTransition(prev: string | null, next: string): void {
  if (!prev) {
    if (next !== "SESSION_CREATED") {
      throw new Error(`FIRST_EVENT_MUST_BE_SESSION_CREATED: Got "${next}"`);
    }
    return;
  }

  const allowed = VALID_PHASE_TRANSITIONS[prev];
  if (!allowed || !allowed.has(next)) {
    const allowedList = allowed ? Array.from(allowed).join(", ") : "(none — terminal state)";
    throw new Error(`INVALID_TRANSITION: ${prev} → ${next}. Allowed: [${allowedList}]`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 5 — ROUND CONSISTENCY VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Assert that round index progression is valid for the event type.
 * Throws on invalid round progression.
 */
function assertRoundConsistency(
  prevRound: number | null,
  nextRound: number | null,
  eventType: string
): void {
  switch (eventType) {
    case "ROUND_STARTED":
      // ROUND_STARTED must increment round by exactly 1
      if (nextRound !== (prevRound ?? -1) + 1) {
        throw new Error(
          `INVALID_ROUND_INCREMENT: ${eventType} requires round ${(prevRound ?? -1) + 1}, got ${nextRound}`
        );
      }
      break;

    case "GUESS_SUBMITTED":
    case "ROUND_COMPLETE":
    case "PRESSURE_APPLIED":
      // These events must stay in the same round
      if (nextRound !== prevRound) {
        throw new Error(
          `ROUND_MISMATCH: ${eventType} must be in round ${prevRound}, got ${nextRound}`
        );
      }
      break;

    case "SESSION_CREATED":
    case "SESSION_COMPLETE":
      // Session-level events can have null roundIndex
      break;

    default:
      // Unknown event type - reject to maintain safety
      throw new Error(`UNKNOWN_EVENT_TYPE: ${eventType}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 6 — INSERT EVENT (SAFE PATH ONLY)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Insert validated event into round_events.
 */
async function insertEvent(
  client: DbTransactionClient,
  gameId: string,
  roundIndex: number | null,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  await client.query(
    `
    INSERT INTO round_events (game_id, round_index, event_type, payload)
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT DO NOTHING
    `,
    [gameId, roundIndex, eventType, JSON.stringify(payload)]
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API — appendEvent (THE ONLY WRITE PATH)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Append an event to round_events with full validation.
 *
 * RULE: This is the ONLY way to write to round_events.
 * RULE: Must be called inside an open transaction.
 * RULE: FSM validation happens at write time.
 * RULE: Round consistency is enforced at write time.
 * RULE: Concurrent writes are serialized via FOR UPDATE lock.
 *
 * @param client — DbTransactionClient inside an open transaction
 * @param gameId — Session/game identifier
 * @param eventType — Type of event to append
 * @param payload — Event payload (will be JSON serialized)
 * @param roundIndex — Round index (null for session-level events)
 * @throws Error on validation failure (transaction must be rolled back by caller)
 */
export async function appendEvent(
  client: DbTransactionClient,
  gameId: string,
  eventType: EventType,
  payload: Record<string, unknown>,
  roundIndex: number | null
): Promise<void> {
  // STEP 1: Lock and load last event (ensures serialization)
  console.time(`[LOCK_WAIT] ${gameId}`);
  const lastEvent = await loadLastEventWithLock(client, gameId);
  console.timeEnd(`[LOCK_WAIT] ${gameId}`);

  // STEP 2: FSM validation at write time
  assertValidTransition(lastEvent?.eventType ?? null, eventType);

  // STEP 3: Round consistency validation
  assertRoundConsistency(lastEvent?.roundIndex ?? null, roundIndex, eventType);

  // STEP 4: Cause validation — write-time invariant
  // If this event type requires a cause, payload.cause MUST be a valid TransitionCause.
  // This is the DB-level integrity enforcement: no event with an invalid cause
  // can be written to round_events, regardless of entry path.
  if (CAUSE_CARRYING_EVENTS.includes(eventType)) {
    if (!isTransitionCause(payload.cause)) {
      throw new Error(
        `INVALID_CAUSE: ${eventType} requires payload.cause to be a valid TransitionCause, ` +
        `got: ${JSON.stringify(payload.cause)}. ` +
        `Valid values: player, timeout, internal`
      );
    }
  }

  // STEP 5: Insert the validated event
  console.time(`[EVENT_INSERT] ${gameId}`);
  await insertEvent(client, gameId, roundIndex, eventType, payload);
  console.timeEnd(`[EVENT_INSERT] ${gameId}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY — REMOVE AFTER MIGRATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use appendEvent() instead. This function exists only for backward
 * compatibility during migration and will be removed.
 */
export async function logRoundEvent(
  gameId: string,
  roundIndex: number | null,
  eventType: string,
  payload: Record<string, unknown>,
  client: DbTransactionClient
): Promise<void> {
  // eslint-disable-next-line no-console
  console.warn("[DEPRECATED] logRoundEvent() called - migrate to appendEvent()");
  await appendEvent(client, gameId, eventType as EventType, payload, roundIndex);
}
