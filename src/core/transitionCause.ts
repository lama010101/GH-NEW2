// ═════════════════════════════════════════════════════════════════════════════
// TRANSITION CAUSE — Domain-only semantic contract
// ═════════════════════════════════════════════════════════════════════════════
// OWNER:     Event system (round_events.payload.cause)
// SCOPE:     Domain layer ONLY — not API, not UI, not transport
// AUDIENCE:  Imported by Next.js (src/**) AND PartyKit (partykit/**)
//
// OWNERSHIP RULES:
//   - This contract is tied to round_events.payload — the replay log
//   - Values MUST be deterministic from DB replay (no ambiguity)
//   - Adding a value requires: (1) deterministic semantics, (2) replay test
//   - UI/transport concerns are FORBIDDEN here (no UI_CLICK, no ADMIN_FORCE)
//   - Only causes that produce deterministic replay are allowed
//
// Why shared across bundler boundaries:
//   - Next.js and PartyKit run in separate bundler contexts
//   - Without a shared module, each side maintains its own string literals
//   - Shared module = single source of truth, compile-time enforcement
//
// This module MUST have ZERO dependencies (no server imports, no client imports).
// It defines only the transition cause contract.
//
// Semantics (each value is replay-deterministic):
//   PLAYER   — a specific player initiated the transition (playerId required)
//              Replay: playerId in payload → deterministic
//   TIMEOUT  — round timer expired, DO auto-advanced (no playerId)
//              Replay: phaseEndsAt in payload → deterministic
//   INTERNAL — DO-restart or recovery initiated (no playerId, no admin)
//              Replay: only emitted by DO on cold-start recovery, never by human
//              Scope: STRICTLY limited to DO lifecycle events
//              NOT for: admin actions, manual overrides, UI triggers
// ═════════════════════════════════════════════════════════════════════════════

export const TransitionCause = {
  PLAYER: "player",
  TIMEOUT: "timeout",
  INTERNAL: "internal"
} as const;

export type TransitionCause =
  typeof TransitionCause[keyof typeof TransitionCause];

/**
 * Runtime type guard — validates unknown input is a TransitionCause value.
 * Used by API routes and appendEvent to validate at write boundary.
 */
export function isTransitionCause(value: unknown): value is TransitionCause {
  return (
    value === TransitionCause.PLAYER ||
    value === TransitionCause.TIMEOUT ||
    value === TransitionCause.INTERNAL
  );
}

/** All valid cause values — use for error messages and validation */
export const ALL_TRANSITION_CAUSES: readonly TransitionCause[] = [
  TransitionCause.PLAYER,
  TransitionCause.TIMEOUT,
  TransitionCause.INTERNAL
];

/**
 * Events that MUST carry a `cause` field in their payload.
 * Used by appendEvent to enforce write-time invariant:
 *   if eventType ∈ CAUSE_CARRYING_EVENTS → payload.cause must be valid TransitionCause
 *
 * This is the DB-level integrity enforcement point.
 * No event with an invalid cause can be written to round_events.
 */
export const CAUSE_CARRYING_EVENTS: readonly string[] = [
  "ROUND_STARTED",
  "SESSION_COMPLETE"
];
