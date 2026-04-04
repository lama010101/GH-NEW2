import { evaluateRound } from "./rules";
import { MAX_ROUNDS } from "./types";
import type {
  EventRecord,
  GameState,
  GuessState,
  LatLng,
  PendingSubmission,
  PreflightResult,
  RoundResult
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
    penalty: { accuracy: 0, xp: 0 },
    pendingSubmission: null,
    pendingRoundResult: null
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
  | { type: "SUBMIT"; didTimeout: boolean }
  | { type: "EVALUATE_ROUND" }
  | { type: "COMPLETE_EVALUATION" }
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

function buildPendingSubmission(didTimeout: boolean): PendingSubmission {
  return { didTimeout };
}

function beginRound(state: GameState, roundIndex: number): GameState {
  return {
    ...state,
    phase: "ROUND_ACTIVE",
    currentRoundIndex: roundIndex,
    timeRemaining: DEFAULT_ROUND_TIME_LIMIT_SEC,
    currentGuess: emptyGuess(),
    pendingSubmission: null,
    pendingRoundResult: null
  };
}

function normalizeHydratedState(state: GameState): GameState {
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

function lockRound(state: GameState, pendingSubmission: PendingSubmission): GameState {
  return {
    ...state,
    phase: "ROUND_LOCK",
    timeRemaining: pendingSubmission.didTimeout ? 0 : state.timeRemaining,
    pendingSubmission,
    pendingRoundResult: null
  };
}

function evaluatePendingRound(state: GameState): GameState {
  const event = currentEvent(state);
  if (!event || !state.pendingSubmission) {
    return state;
  }

  const result = evaluateRound(
    event,
    state.currentGuess,
    state.currentRoundIndex,
    state.pendingSubmission.didTimeout,
    state.penalty
  );

  return {
    ...state,
    phase: "ROUND_EVALUATE",
    timeRemaining: null,
    pendingSubmission: null,
    pendingRoundResult: result
  };
}

function finishRound(state: GameState, result: RoundResult): GameState {
  const roundResults = [...state.roundResults, result];

  return {
    ...state,
    phase: "ROUND_COMPLETE",
    currentRoundIndex: state.currentRoundIndex,
    timeRemaining: null,
    roundResults,
    currentGuess: state.currentGuess,
    pendingSubmission: null,
    pendingRoundResult: null
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "HYDRATE":
      return normalizeHydratedState(action.state);
    case "BEGIN_START":
      return {
        ...state,
        phase: "PREFLIGHT_CHECK",
        preflightIssues: [],
        currentRoundIndex: 0,
        timeRemaining: null,
        currentGuess: emptyGuess(),
        roundResults: [],
        penalty: { accuracy: 0, xp: 0 },
        pendingSubmission: null,
        pendingRoundResult: null
      };
    case "COMPLETE_PREFLIGHT":
      if (state.phase !== "PREFLIGHT_CHECK") {
        return state;
      }

      if (!action.preflight.passed) {
        return {
          ...state,
          phase: "INIT",
          preflightIssues: action.preflight.issues,
          currentRoundIndex: 0,
          timeRemaining: null,
          currentGuess: emptyGuess(),
          roundResults: [],
          penalty: { accuracy: 0, xp: 0 },
          pendingSubmission: null,
          pendingRoundResult: null
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
          penalty: { accuracy: 0, xp: 0 },
          pendingSubmission: null,
          pendingRoundResult: null
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
        phase: "ROUND_ACTIVE"
      };
    case "SET_YEAR":
      if (state.phase !== "ROUND_START" && state.phase !== "ROUND_ACTIVE") {
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
      if (state.phase !== "ROUND_START" && state.phase !== "ROUND_ACTIVE") {
        return state;
      }
      return {
        ...state,
        currentGuess: {
          ...state.currentGuess,
          location: action.location
        }
      };
    case "SUBMIT":
      if (action.didTimeout) {
        if (state.phase !== "ROUND_START" && state.phase !== "ROUND_ACTIVE") {
          return state;
        }

        return lockRound(state, buildPendingSubmission(true));
      }

      if (!canSubmit(state)) {
        return state;
      }

      return lockRound(state, buildPendingSubmission(false));
    case "EVALUATE_ROUND":
      if (state.phase !== "ROUND_LOCK") {
        return state;
      }
      return evaluatePendingRound(state);
    case "COMPLETE_EVALUATION":
      if (state.phase !== "ROUND_EVALUATE" || !state.pendingRoundResult) {
        return state;
      }
      return finishRound(state, state.pendingRoundResult);
    case "TICK":
      if ((state.phase !== "ROUND_START" && state.phase !== "ROUND_ACTIVE") || state.timeRemaining === null) {
        return state;
      }

      if (state.timeRemaining <= 1) {
        return lockRound(
          {
            ...state,
            timeRemaining: 0
          },
          buildPendingSubmission(true)
        );
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
