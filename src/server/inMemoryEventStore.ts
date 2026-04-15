// inMemoryEventStore.ts — In-Memory Event Store for Golden Path Testing
// TASK: CORE-VALID-001
//
// CRITICAL: Zero external dependencies — no DB, no Supabase, no network.
// This proves the game loop works independently of infrastructure.

import { VALID_PHASE_TRANSITIONS, deriveStateFromEventStream, type RoundEvent } from "./eventStream";

// ═════════════════════════════════════════════════════════════════════════════
// IN-MEMORY STORAGE
// ═════════════════════════════════════════════════════════════════════════════

const store: Record<string, RoundEvent[]> = {};

// Simple counter for synthetic IDs (deterministic per process)
let idCounter = 1;

// ═════════════════════════════════════════════════════════════════════════════
// FSM VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

function assertValidTransition(prev: string | null, next: string): void {
  if (!prev) {
    if (next !== "SESSION_CREATED") {
      throw new Error("FIRST_EVENT_MUST_BE_SESSION_CREATED");
    }
    return;
  }

  const allowed = VALID_PHASE_TRANSITIONS[prev];
  if (!allowed || !allowed.has(next)) {
    throw new Error(`INVALID_TRANSITION ${prev} → ${next}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUND VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

function assertRoundConsistency(
  prevRound: number | null,
  nextRound: number | null,
  eventType: string
): void {
  switch (eventType) {
    case "ROUND_STARTED":
      if (nextRound !== (prevRound ?? -1) + 1) {
        throw new Error("INVALID_ROUND_INCREMENT");
      }
      break;

    case "GUESS_SUBMITTED":
    case "ROUND_COMPLETE":
      if (nextRound !== prevRound) {
        throw new Error("ROUND_MISMATCH");
      }
      break;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Append an event to the in-memory store.
 *
 * Validates:
 * - FSM transitions (must follow VALID_PHASE_TRANSITIONS)
 * - Round consistency (increment rules, no mismatches)
 *
 * Generates synthetic `id` and `createdAt` for compatibility with
 * deriveStateFromEventStream (deterministic replay requires ordering fields).
 */
export function appendEventInMemory(
  gameId: string,
  eventType: string,
  roundIndex: number | null,
  payload?: Record<string, unknown>
): void {
  const events = store[gameId] ?? [];
  const last = events[events.length - 1] ?? null;

  // Validate FSM transition
  assertValidTransition(last?.eventType ?? null, eventType);

  // Validate round consistency
  assertRoundConsistency(last?.roundIndex ?? null, roundIndex, eventType);

  // Create synthetic event with deterministic ID and timestamp
  const newEvent: RoundEvent = {
    id: idCounter++,
    eventType,
    roundIndex,
    payload: payload ?? {},
    createdAt: new Date().toISOString()
  };

  events.push(newEvent);
  store[gameId] = events;
}

/**
 * Get reconstructed state from the in-memory event stream.
 *
 * Returns: { currentRound, currentPhase } derived deterministically
 * from the full event history.
 */
export function getState(gameId: string): { currentRound: number; currentPhase: string | null } {
  const events = store[gameId] ?? [];
  return deriveStateFromEventStream(events);
}

/**
 * Get raw events for a game (useful for debugging).
 */
export function getEvents(gameId: string): RoundEvent[] {
  return [...(store[gameId] ?? [])];
}

/**
 * Clear all events for a game (useful for testing cleanup).
 */
export function clearGame(gameId: string): void {
  delete store[gameId];
}

/**
 * Reset the entire store and ID counter (useful for test isolation).
 */
export function resetStore(): void {
  for (const key of Object.keys(store)) {
    delete store[key];
  }
  idCounter = 1;
}
