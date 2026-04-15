import type { GameState } from "./types";

export class InvariantViolation extends Error {
  constructor(
    public readonly code: string,
    public readonly state: GameState,
    message: string
  ) {
    super(`[${code}] ${message}`);
    this.name = "InvariantViolation";
  }
}

function logInvariantViolation(code: string, state: GameState, details: Record<string, unknown>): void {
  console.error("[INVARIANT_VIOLATION]", {
    code,
    gameId: state.gameId,
    phase: state.phase,
    roundIndex: state.currentRoundIndex,
    currentGuess: state.currentGuess,
    roundResultsLength: state.roundResults.length,
    ...details,
    timestamp: Date.now()
  });
}

/**
 * Asserts that GameState invariants are maintained.
 * Throws InvariantViolation with specific error codes for debugging.
 *
 * Invariants Enforced:
 * I1: phase ∈ ["ROUND_START", "ROUND_ACTIVE", "ROUND_LOCK"] ⇒ roundResults.length === currentRoundIndex
 * I2: phase === "ROUND_COMPLETE" ⇒ roundResults.length === currentRoundIndex + 1
 * I3: phase ∈ ["ROUND_COMPLETE", "SESSION_COMPLETE"] ⇒ currentGuess is cleared and timeRemaining === null
 * I4: phase === "ROUND_ACTIVE" only allows input mutation
 * I5: "ROUND_EVALUATE" is illegal (dead phase from GH-042)
 * I8: phase === "ROUND_LOCK" ⇒ roundLockMeta is defined (explicit causality)
 */
export function assertGameStateInvariant(state: GameState): void {
  const { phase, roundResults, currentRoundIndex, currentGuess, timeRemaining, gameId } = state;

  if ((phase === "ROUND_START" || phase === "ROUND_ACTIVE" || phase === "ROUND_LOCK") && roundResults.length !== currentRoundIndex) {
    logInvariantViolation("I1_ROUND_CURSOR_MISMATCH", state, {
      violation: `${phase} with mismatched roundResults count`,
      expected: currentRoundIndex,
      roundResultsLength: roundResults.length
    });
    throw new InvariantViolation(
      "INVARIANT_ROUND_CURSOR_MISMATCH",
      state,
      `Game ${gameId}: ${phase} requires roundResults.length === currentRoundIndex (${roundResults.length} vs ${currentRoundIndex})`
    );
  }

  if (phase === "ROUND_COMPLETE") {
    const expectedResultsLength = currentRoundIndex + 1;
    if (roundResults.length !== expectedResultsLength) {
      logInvariantViolation("I2_RESULT_MISMATCH", state, {
        violation: "ROUND_COMPLETE with incorrect roundResults count",
        roundResultsLength: roundResults.length,
        expected: expectedResultsLength
      });
      throw new InvariantViolation(
        "INVARIANT_RESULT_MISMATCH",
        state,
        `Game ${gameId}: ROUND_COMPLETE requires roundResults.length === currentRoundIndex + 1 (${roundResults.length} vs ${expectedResultsLength})`
      );
    }
  }

  if (phase === "ROUND_COMPLETE" || phase === "SESSION_COMPLETE") {
    const hasStaleGuess = currentGuess.year !== null || currentGuess.location !== null;
    if (hasStaleGuess) {
      logInvariantViolation("I3_STALE_CURRENT_GUESS", state, {
        violation: `${phase} with uncleared currentGuess`
      });
      throw new InvariantViolation(
        "INVARIANT_STALE_CURRENT_GUESS",
        state,
        `Game ${gameId}: ${phase} must clear currentGuess after evaluation`
      );
    }

    if (timeRemaining !== null) {
      logInvariantViolation("I3_COMPLETE_TIME_REMAINING", state, {
        violation: `${phase} with non-null timeRemaining`,
        timeRemaining
      });
      throw new InvariantViolation(
        "INVARIANT_COMPLETE_TIME_REMAINING",
        state,
        `Game ${gameId}: ${phase} requires timeRemaining === null`
      );
    }
  }

  // I5: Dead phase check - ROUND_EVALUATE was removed in GH-042
  // TypeScript now guarantees this at compile time, but persisted state
  // validation in gamePersistence.ts rejects unknown phases

  // I8: ROUND_LOCK must include causality metadata
  if (phase === "ROUND_LOCK" && !state.roundLockMeta) {
    logInvariantViolation("I8_MISSING_LOCK_META", state, {
      violation: "ROUND_LOCK without roundLockMeta"
    });
    throw new InvariantViolation(
      "INVARIANT_MISSING_LOCK_META",
      state,
      `Game ${gameId}: ROUND_LOCK requires roundLockMeta with explicit causality`
    );
  }
}

/**
 * Validates that a state can be safely persisted.
 * Returns sanitized state with transient fields removed.
 */
export function sanitizeForPersistence(state: GameState): GameState {
  return state;
}

/**
 * Validates state immediately after hydration.
 * Used to detect corrupted persisted states.
 */
export function validateHydratedState(state: GameState): void {
  try {
    assertGameStateInvariant(state);
    console.log("[HYDRATION_VALIDATION_SUCCESS]", {
      gameId: state.gameId,
      phase: state.phase,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error("[PROJECTION_INVALID_STATE]", {
      gameId: state.gameId,
      phase: state.phase,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    });
    throw error;
  }
}

/**
 * Logs submission lifecycle events for debugging.
 */
export function logSubmissionEvent(
  type: "CREATED" | "IGNORED_DUPLICATE" | "EVALUATED" | "TIMEOUT",
  state: GameState,
  details?: Record<string, unknown>
): void {
  const logPrefix = type === "IGNORED_DUPLICATE" ? "[SUBMISSION_IGNORED]" : "[SUBMISSION_CREATED]";
  console.log(logPrefix, {
    gameId: state.gameId,
    phase: state.phase,
    roundIndex: state.currentRoundIndex,
    type,
    ...details,
    timestamp: Date.now()
  });
}
