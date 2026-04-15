import { evaluateRound } from "./rules";
import { MAX_ROUNDS } from "./types";
import { assertGameStateInvariant, logSubmissionEvent } from "./gameInvariant";
import { assertStateIntegrity, sealStateIntegrity } from "./stateIntegrity";
import type {
  EventRecord,
  GameState,
  GuessState,
  LatLng,
  PreflightResult
} from "./types";

const DEFAULT_ROUND_TIME_LIMIT_SEC = 30;

function createGameId(): string {
  return globalThis.crypto.randomUUID();
}

function emptyGuess(): GuessState {
  return { year: null, location: null };
}

function emptyState(events: EventRecord[], gameId: string = createGameId()): GameState {
  return {
    gameId,
    phase: "INIT",
    preflightIssues: [],
    currentRoundIndex: 0,
    timeRemaining: null,
    events,
    currentGuess: emptyGuess(),
    roundResults: [],
    penalty: { accuracy: 0, xp: 0 }
  };
}

export function createInitialGameState(events: EventRecord[], gameId?: string): GameState {
  return emptyState(events, gameId);
}

export type GameAction =
  | { type: "HYDRATE"; state: GameState }
  | { type: "BEGIN_START" }
  | { type: "COMPLETE_PREFLIGHT"; preflight: PreflightResult }
  | { type: "START_ROUND" }
  | { type: "END_CINEMATIC" }
  | { type: "SET_YEAR"; year: number | null }
  | { type: "SET_LOCATION"; location: LatLng | null }
  | { type: "SUBMIT_AND_EVALUATE"; didTimeout: boolean }
  | { type: "EVALUATE_ROUND" }
  | { type: "TICK" }
  | { type: "NEXT_ROUND" }
  | { type: "RESTART" };

export function canSubmit(state: GameState): boolean {
  return (
    (state.phase === "ROUND_START" || state.phase === "ROUND_ACTIVE") &&
    state.currentGuess.year !== null &&
    state.currentGuess.location !== null
  );
}

export function currentEvent(state: GameState): EventRecord | null {
  return state.events[state.currentRoundIndex] ?? null;
}

function beginRound(state: GameState, roundIndex: number): GameState {
  return {
    ...state,
    phase: "ROUND_ACTIVE",
    currentRoundIndex: roundIndex,
    timeRemaining: DEFAULT_ROUND_TIME_LIMIT_SEC,
    currentGuess: emptyGuess(),
    roundResults: state.roundResults
  };
}

function normalizeHydratedState(state: GameState): GameState {
  // Validate state integrity before normalizing
  // Throws if corrupted unless _allowCorruptedState is set (dev override)
  assertStateIntegrity(state, "HYDRATE");

  if (state.phase === "READY") {
    return beginRound(state, 0);
  }

  if (state.phase === "ROUND_START") {
    return {
      ...state,
      phase: "ROUND_ACTIVE"
    };
  }

  return state;
}

function completeRound(state: GameState, didTimeout: boolean): GameState {
  const event = currentEvent(state);
  if (!event) {
    return state;
  }

  const frozenGuess: GuessState = didTimeout
    ? { year: null, location: null }
    : {
        year: state.currentGuess.year,
        location: state.currentGuess.location
      };

  if (!didTimeout && (frozenGuess.year === null || frozenGuess.location === null)) {
    return state;
  }

  logSubmissionEvent(didTimeout ? "TIMEOUT" : "CREATED", state, {
    didTimeout
  });

  const result = evaluateRound(
    event,
    frozenGuess,
    state.currentRoundIndex,
    didTimeout,
    state.penalty
  );

  return {
    ...state,
    phase: "ROUND_COMPLETE",
    timeRemaining: null,
    roundResults: [...state.roundResults, result],
    currentGuess: emptyGuess(),
    roundLockMeta: undefined
  };
}

function reduceGameState(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "HYDRATE":
      return normalizeHydratedState(action.state);
    case "BEGIN_START": {
      return {
        ...state,
        phase: "PREFLIGHT_CHECK" as const,
        preflightIssues: [],
        currentRoundIndex: 0,
        timeRemaining: null,
        currentGuess: emptyGuess(),
        roundResults: [],
        penalty: { accuracy: 0, xp: 0 }
      };
    }
    case "COMPLETE_PREFLIGHT":
      if (state.phase !== "PREFLIGHT_CHECK") {
        return state;
      }

      if (!action.preflight.passed) {
        return {
          ...state,
          phase: "INIT" as const,
          preflightIssues: action.preflight.issues,
          currentRoundIndex: 0,
          timeRemaining: null,
          currentGuess: emptyGuess(),
          roundResults: [],
          penalty: { accuracy: 0, xp: 0 }
        };
      }

      return beginRound(
        {
          ...state,
          preflightIssues: action.preflight.issues,
          currentRoundIndex: 0,
          timeRemaining: null,
          currentGuess: emptyGuess(),
          roundResults: [],
          penalty: { accuracy: 0, xp: 0 }
        },
        0
      );
    case "START_ROUND":
      if (state.phase !== "READY") {
        return state;
      }
      return beginRound(state, 0);
    case "END_CINEMATIC":
      if (state.phase !== "ROUND_START") {
        return state;
      }
      return {
        ...state,
        phase: "ROUND_ACTIVE" as const
      };
    case "SET_YEAR":
      // I7: Input mutation only allowed in ROUND_ACTIVE
      if (state.phase !== "ROUND_ACTIVE") {
        return state;
      }
      return {
        ...state,
        currentGuess: {
          ...state.currentGuess,
          year: action.year
        }
      };
    case "SET_LOCATION":
      // I7: Input mutation only allowed in ROUND_ACTIVE
      if (state.phase !== "ROUND_ACTIVE") {
        return state;
      }
      return {
        ...state,
        currentGuess: {
          ...state.currentGuess,
          location: action.location
        }
      };
    case "SUBMIT_AND_EVALUATE": {
      // I4: No Double Submission - ignore if already complete or beyond
      if (state.phase === "ROUND_LOCK" || state.phase === "ROUND_COMPLETE" || state.phase === "SESSION_COMPLETE") {
        logSubmissionEvent("IGNORED_DUPLICATE", state, {
          reason: `phase is ${state.phase}`,
          action: "SUBMIT_AND_EVALUATE"
        });
        return state;
      }

      if (state.phase !== "ROUND_START" && state.phase !== "ROUND_ACTIVE") {
        return state;
      }

      // Guard: manual submit requires complete guess
      if (!action.didTimeout && (state.currentGuess.year === null || state.currentGuess.location === null)) {
        return state;
      }

      logSubmissionEvent(action.didTimeout ? "TIMEOUT" : "CREATED", state, {
        didTimeout: action.didTimeout
      });

      // Freeze input at state level - transition to ROUND_LOCK with explicit causality
      return {
        ...state,
        phase: "ROUND_LOCK" as const,
        timeRemaining: null,
        roundLockMeta: { didTimeout: action.didTimeout }
      };
    }
    case "EVALUATE_ROUND": {
      if (state.phase !== "ROUND_LOCK") {
        return state;
      }

      // I8: ROUND_LOCK must include causality metadata
      if (!state.roundLockMeta) {
        throw new Error("[EVALUATE_GUARD] ROUND_LOCK requires roundLockMeta");
      }

      // I7: Evaluation uses frozen state with explicit causality
      const didTimeout = state.roundLockMeta.didTimeout;
      return completeRound(state, didTimeout);
    }
    case "TICK":
      if ((state.phase !== "ROUND_START" && state.phase !== "ROUND_ACTIVE") || state.timeRemaining === null) {
        return state;
      }

      if (state.timeRemaining <= 1) {
        // Freeze input at state level - transition to ROUND_LOCK for timeout with explicit causality
        logSubmissionEvent("TIMEOUT", state, { didTimeout: true });
        return {
          ...state,
          phase: "ROUND_LOCK" as const,
          timeRemaining: null,
          roundLockMeta: { didTimeout: true }
        };
      }

      return {
        ...state,
        timeRemaining: Math.max(0, state.timeRemaining - 1)
      };
    case "NEXT_ROUND": {
      if (state.phase !== "ROUND_COMPLETE" || state.roundResults.length === 0) {
        return state;
      }

      const nextRoundIndex = state.currentRoundIndex + 1;
      if (nextRoundIndex >= MAX_ROUNDS) {
        return {
          ...state,
          phase: "SESSION_COMPLETE",
          timeRemaining: null
        };
      }

      return beginRound(state, nextRoundIndex);
    }
    case "RESTART":
      return emptyState(state.events);
    default:
      return state;
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  const nextState = reduceGameState(state, action);
  assertGameStateInvariant(nextState);
  // Seal integrity hash for next validation/persistence
  return sealStateIntegrity(nextState);
}
