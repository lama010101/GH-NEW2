import { summarizeRounds } from "./rules";
import { buildGamePath } from "./sessionApi";
import { MAX_ROUNDS } from "./types";
import type { EventRecord, GameState, RoundResult, SessionSummary } from "./types";

export function selectHasPassedPreflight(state: GameState): boolean {
  return state.phase !== "INIT" && state.phase !== "PREFLIGHT_CHECK";
}

export function selectCurrentEvent(state: GameState): EventRecord | null {
  return state.events[state.currentRoundIndex] ?? null;
}

export function selectLatestRoundResult(state: GameState): RoundResult | null {
  return state.roundResults[state.roundResults.length - 1] ?? null;
}

export function selectSessionSummary(state: GameState): SessionSummary | null {
  return state.roundResults.length === 0 ? null : summarizeRounds(state.roundResults);
}

export function selectIsSessionComplete(state: GameState): boolean {
  return state.phase === "SESSION_COMPLETE";
}

export function selectCanProceed(state: GameState): boolean {
  return state.phase === "ROUND_COMPLETE";
}

export function selectIsLastRoundResult(state: GameState): boolean {
  return state.phase === "ROUND_COMPLETE" && state.roundResults.length >= MAX_ROUNDS;
}

export function selectRoundProgress(state: GameState): number {
  if (state.phase === "SESSION_COMPLETE") {
    return 100;
  }

  const completedRounds = state.roundResults.length;
  const inFlightRound =
    state.phase === "ROUND_START" ||
    state.phase === "ROUND_ACTIVE" ||
    state.phase === "ROUND_LOCK"
      ? 1
      : 0;

  return Math.min(100, ((completedRounds + inFlightRound) / MAX_ROUNDS) * 100);
}

export function selectSharePath(state: Pick<GameState, "gameId">): string {
  return buildGamePath(state.gameId);
}
