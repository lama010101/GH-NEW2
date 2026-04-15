import type { GameState } from "./types";

/**
 * State Integrity Validation System
 *
 * Purpose: Detect corrupted, tampered, or invalid state before it causes silent failures.
 *
 * Design Principles:
 * - Fail fast: Throw on integrity violations to surface bugs immediately
 * - Explicit override: Require _allowCorruptedState flag to bypass (dev-only)
 * - Audit trail: Log all violations with context for debugging
 * - Non-blocking in prod: Log but don't crash user sessions
 */

export class StateIntegrityViolation extends Error {
  constructor(
    public readonly code: string,
    public readonly violations: string[],
    message: string
  ) {
    super(`[STATE_INTEGRITY_${code}] ${message}`);
    this.name = "StateIntegrityViolation";
  }
}

/**
 * Explicit error types for state integrity failures
 */
export type IntegrityError =
  | { type: "I1_ROUND_CURSOR_MISMATCH"; phase: string; expected: number; actual: number }
  | { type: "I2_RESULT_MISMATCH"; expected: number; actual: number }
  | { type: "I3_STALE_CURRENT_GUESS"; phase: string }
  | { type: "I8_MISSING_LOCK_META" }
  | { type: "SESSION_VIOLATION"; expectedRounds: number; actualRounds: number }
  | { type: "HASH_MISMATCH" }
  | { type: "I3_COMPLETE_TIME_REMAINING"; phase: string; timeRemaining: number };

/**
 * Functional Result type for explicit error handling
 * Discriminated union: { ok: true, value: T } | { ok: false, error: E }
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Result type alias for integrity validation
 */
export type IntegrityResult = Result<true, IntegrityError[]>;

/**
 * Computes a simple integrity hash from critical state fields.
 * This detects tampering with roundResults length, phase mismatches, etc.
 */
export function computeStateIntegrityHash(state: GameState): string {
  // Combine critical fields into a checksum
  const criticalData = {
    phase: state.phase,
    roundIndex: state.currentRoundIndex,
    roundResultsLength: state.roundResults.length,
    roundLockMeta: state.roundLockMeta,
    timeRemaining: state.timeRemaining,
    currentGuess: state.currentGuess
  };

  // Simple hash: base64 of JSON (not cryptographic, just for detecting accidental corruption)
  try {
    return btoa(JSON.stringify(criticalData));
  } catch {
    return "invalid";
  }
}

/**
 * Validates state integrity before hydration.
 * Returns array of violation messages, empty if valid.
 */
export function validateStateIntegrity(state: GameState): string[] {
  const violations: string[] = [];

  // Check 1: roundResults length matches currentRoundIndex for active phases
  if (
    state.phase === "ROUND_START" ||
    state.phase === "ROUND_ACTIVE" ||
    state.phase === "ROUND_LOCK"
  ) {
    if (state.roundResults.length !== state.currentRoundIndex) {
      violations.push(
        `I1_VIOLATION: phase=${state.phase} expects roundResults.length=${state.currentRoundIndex}, got ${state.roundResults.length}`
      );
    }
  }

  // Check 2: ROUND_COMPLETE must have correct roundResults count
  if (state.phase === "ROUND_COMPLETE") {
    const expected = state.currentRoundIndex + 1;
    if (state.roundResults.length !== expected) {
      violations.push(
        `I2_VIOLATION: ROUND_COMPLETE expects roundResults.length=${expected}, got ${state.roundResults.length}`
      );
    }
  }

  // Check 3: ROUND_LOCK must have roundLockMeta (I8)
  if (state.phase === "ROUND_LOCK" && !state.roundLockMeta) {
    violations.push("I8_VIOLATION: ROUND_LOCK missing roundLockMeta");
  }

  // Check 4: SESSION_COMPLETE must have exactly MAX_ROUNDS results
  if (state.phase === "SESSION_COMPLETE") {
    const maxRounds = 5; // MAX_ROOUNDS from types
    if (state.roundResults.length !== maxRounds) {
      violations.push(
        `SESSION_VIOLATION: SESSION_COMPLETE expects ${maxRounds} rounds, got ${state.roundResults.length}`
      );
    }
  }

  // Check 5: Integrity hash mismatch (if hash exists)
  if (state.stateIntegrityHash) {
    const computedHash = computeStateIntegrityHash(state);
    if (computedHash !== state.stateIntegrityHash) {
      violations.push(
        `HASH_MISMATCH: stored hash differs from computed (state may be tampered)`
      );
    }
  }

  // Check 6: Detect impossible phase transitions (simplified)
  // e.g., ROUND_COMPLETE with uncleared currentGuess
  if (
    (state.phase === "ROUND_COMPLETE" || state.phase === "SESSION_COMPLETE") &&
    (state.currentGuess.year !== null || state.currentGuess.location !== null)
  ) {
    violations.push(
      `I3_VIOLATION: ${state.phase} with uncleared currentGuess`
    );
  }

  return violations;
}

/**
 * Validates state integrity and returns Result instead of throwing.
 * Pure function: no side effects, returns explicit error types.
 */
export function validateStateIntegrityPure(state: GameState): IntegrityResult {
  const errors: IntegrityError[] = [];

  // I1: Check roundResults length matches currentRoundIndex for active phases
  if (
    state.phase === "ROUND_START" ||
    state.phase === "ROUND_ACTIVE" ||
    state.phase === "ROUND_LOCK"
  ) {
    if (state.roundResults.length !== state.currentRoundIndex) {
      errors.push({
        type: "I1_ROUND_CURSOR_MISMATCH",
        phase: state.phase,
        expected: state.currentRoundIndex,
        actual: state.roundResults.length
      });
    }
  }

  // I2: ROUND_COMPLETE must have correct roundResults count
  if (state.phase === "ROUND_COMPLETE") {
    const expected = state.currentRoundIndex + 1;
    if (state.roundResults.length !== expected) {
      errors.push({
        type: "I2_RESULT_MISMATCH",
        expected,
        actual: state.roundResults.length
      });
    }
  }

  // I3: Complete phases must not have timeRemaining
  if ((state.phase === "ROUND_COMPLETE" || state.phase === "SESSION_COMPLETE") && state.timeRemaining !== null) {
    errors.push({
      type: "I3_COMPLETE_TIME_REMAINING",
      phase: state.phase,
      timeRemaining: state.timeRemaining
    });
  }

  // I8: ROUND_LOCK must have roundLockMeta
  if (state.phase === "ROUND_LOCK" && !state.roundLockMeta) {
    errors.push({ type: "I8_MISSING_LOCK_META" });
  }

  // SESSION_COMPLETE must have exactly MAX_ROUNDS results
  if (state.phase === "SESSION_COMPLETE") {
    const maxRounds = 5;
    if (state.roundResults.length !== maxRounds) {
      errors.push({
        type: "SESSION_VIOLATION",
        expectedRounds: maxRounds,
        actualRounds: state.roundResults.length
      });
    }
  }

  // Hash mismatch check
  if (state.stateIntegrityHash) {
    const computedHash = computeStateIntegrityHash(state);
    if (computedHash !== state.stateIntegrityHash) {
      errors.push({ type: "HASH_MISMATCH" });
    }
  }

  // I3: Complete phases must clear currentGuess
  if (
    (state.phase === "ROUND_COMPLETE" || state.phase === "SESSION_COMPLETE") &&
    (state.currentGuess.year !== null || state.currentGuess.location !== null)
  ) {
    errors.push({
      type: "I3_STALE_CURRENT_GUESS",
      phase: state.phase
    });
  }

  if (errors.length > 0) {
    return { ok: false, error: errors };
  }

  return { ok: true, value: true };
}

/**
 * Formats integrity errors into human-readable audit log entry
 */
export function formatIntegrityAuditLog(
  gameId: string,
  phase: string,
  errors: IntegrityError[],
  context: string
): string {
  const errorDescriptions = errors.map(e => {
    switch (e.type) {
      case "I1_ROUND_CURSOR_MISMATCH":
        return `I1: ${e.phase} phase expects roundResults.length=${e.expected}, got ${e.actual}`;
      case "I2_RESULT_MISMATCH":
        return `I2: ROUND_COMPLETE expects roundResults.length=${e.expected}, got ${e.actual}`;
      case "I3_STALE_CURRENT_GUESS":
        return `I3: ${e.phase} with uncleared currentGuess`;
      case "I3_COMPLETE_TIME_REMAINING":
        return `I3: ${e.phase} with non-null timeRemaining=${e.timeRemaining}`;
      case "I8_MISSING_LOCK_META":
        return `I8: ROUND_LOCK missing roundLockMeta`;
      case "SESSION_VIOLATION":
        return `SESSION: Expected ${e.expectedRounds} rounds, got ${e.actualRounds}`;
      case "HASH_MISMATCH":
        return `HASH: Stored integrity hash differs from computed`;
    }
  });

  return `[${context}] Game ${gameId} (${phase}): ${errorDescriptions.join("; ")}`;
}

/**
 * Asserts state integrity with explicit override support.
 * @throws StateIntegrityViolation if violations found and no override
 */
export function assertStateIntegrity(
  state: GameState,
  context: string
): void {
  const result = validateStateIntegrityPure(state);

  if (result.ok) {
    return;
  }

  const violations = result.error;

  // Log violation details
  console.error("[STATE_INTEGRITY_VIOLATION]", {
    context,
    gameId: state.gameId,
    phase: state.phase,
    violations: violations.map(e => e.type),
    hasOverride: state._allowCorruptedState ?? false,
    timestamp: Date.now()
  });

  // If explicit override is set, allow but warn (dev-only escape hatch)
  if (state._allowCorruptedState) {
    console.warn(`[STATE_INTEGRITY_OVERRIDE] ${context}: Proceeding with corrupted state (DEV ONLY)`);
    return;
  }

  const violationMessages = violations.map(e =>
    e.type === "I1_ROUND_CURSOR_MISMATCH"
      ? `${e.type}: phase=${e.phase} expected=${e.expected} actual=${e.actual}`
      : e.type === "I2_RESULT_MISMATCH"
        ? `${e.type}: expected=${e.expected} actual=${e.actual}`
        : e.type === "I3_STALE_CURRENT_GUESS"
          ? `${e.type}: phase=${e.phase}`
          : e.type === "SESSION_VIOLATION"
            ? `${e.type}: expected=${e.expectedRounds} actual=${e.actualRounds}`
            : e.type === "I3_COMPLETE_TIME_REMAINING"
              ? `${e.type}: phase=${e.phase} timeRemaining=${e.timeRemaining}`
              : e.type === "I8_MISSING_LOCK_META"
                ? `${e.type}: ROUND_LOCK missing roundLockMeta`
                : `${e.type}: HASH mismatch detected`
  );

  throw new StateIntegrityViolation(
    "VIOLATION",
    violationMessages,
    `${context}: State integrity check failed with ${violations.length} violation(s). ` +
    `To override (DEV ONLY), set _allowCorruptedState: true`
  );
}

/**
 * Checks state integrity and returns Result for functional error handling.
 * Does not throw - returns explicit success/failure.
 * No side effects (logging must be done by caller if needed).
 */
export function checkStateIntegrity(
  state: GameState
): Result<true, { errors: IntegrityError[]; auditLog: string }> {
  const result = validateStateIntegrityPure(state);

  if (result.ok) {
    return { ok: true, value: true };
  }

  const auditLog = formatIntegrityAuditLog(state.gameId, state.phase, result.error, "BOOT_CHECK");

  return {
    ok: false,
    error: {
      errors: result.error,
      auditLog
    }
  };
}

/**
 * Generates fresh integrity hash for a state.
 * Call this before persisting state.
 */
export function sealStateIntegrity(state: GameState): GameState {
  return {
    ...state,
    stateIntegrityHash: computeStateIntegrityHash(state)
  };
}

/**
 * Checks if state has valid integrity hash.
 * Returns true if no hash exists (backward compatible) or hash matches.
 */
export function isStateIntegrityValid(state: GameState): boolean {
  if (!state.stateIntegrityHash) {
    return true; // No hash = no validation (backward compatible)
  }
  return computeStateIntegrityHash(state) === state.stateIntegrityHash;
}
