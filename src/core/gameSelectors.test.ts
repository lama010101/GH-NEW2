import { describe, expect, it } from "vitest";
import { createInitialGameState, gameReducer } from "./gameEngine";
import {
  selectCanProceed,
  selectCurrentEvent,
  selectHasPassedPreflight,
  selectIsLastRoundResult,
  selectIsSessionComplete,
  selectLatestRoundResult,
  selectRoundProgress,
  selectSessionSummary,
  selectSharePath
} from "./gameSelectors";
import { PRACTICE_EVENTS } from "./mockEvents";
import { runPreflightCheck } from "./preflight";

function eventCoordinates(event: (typeof PRACTICE_EVENTS)[number]) {
  return {
    lat: event.location.lat,
    lng: event.location.lng
  };
}

function createReadyState() {
  let state = createInitialGameState(PRACTICE_EVENTS, "game-selectors");
  state = gameReducer(state, { type: "BEGIN_START" });
  state = gameReducer(state, { type: "COMPLETE_PREFLIGHT", preflight: runPreflightCheck(PRACTICE_EVENTS) });
  return state;
}

function completeRound(state = createReadyState()) {
  const event = PRACTICE_EVENTS[state.currentRoundIndex];

  state = gameReducer(state, { type: "SET_YEAR", year: event.year });
  state = gameReducer(state, { type: "SET_LOCATION", location: eventCoordinates(event) });
  // Two-step: freeze then evaluate
  state = gameReducer(state, { type: "SUBMIT_AND_EVALUATE", didTimeout: false });
  expect(state.phase).toBe("ROUND_LOCK");
  state = gameReducer(state, { type: "EVALUATE_ROUND" });
  expect(state.phase).toBe("ROUND_COMPLETE");

  return state;
}

describe("game selectors", () => {
  it("derives preflight, current event, progress, and share path", () => {
    const init = createInitialGameState(PRACTICE_EVENTS, "share-game");
    const ready = createReadyState();
    const active = ready;

    expect(selectHasPassedPreflight(init)).toBe(false);
    expect(selectHasPassedPreflight(ready)).toBe(true);
    expect(selectCurrentEvent(ready)).toEqual(PRACTICE_EVENTS[0]);
    expect(selectRoundProgress(active)).toBe(20);
    expect(selectSharePath(init)).toBe("/game/share-game");
  });

  it("derives the latest completed round and round-complete flags", () => {
    const state = completeRound();
    const latest = selectLatestRoundResult(state);

    expect(latest).toEqual(state.roundResults[0]);
    expect(selectCanProceed(state)).toBe(true);
    expect(selectIsLastRoundResult(state)).toBe(false);
    expect(selectSessionSummary(state)).toEqual({
      totalRounds: 1,
      totalAccuracy: state.roundResults[0].roundAccuracy,
      totalXp: state.roundResults[0].roundXp,
      averageAccuracy: state.roundResults[0].roundAccuracy
    });
  });

  it("derives completion and summary from round results after five rounds", () => {
    let state = createReadyState();

    for (let round = 0; round < 5; round += 1) {
      const event = PRACTICE_EVENTS[round];
      if (round > 0) {
        state = gameReducer(state, { type: "NEXT_ROUND" });
      }
      state = gameReducer(state, { type: "SET_YEAR", year: event.year });
      state = gameReducer(state, { type: "SET_LOCATION", location: eventCoordinates(event) });
      // Two-step: freeze then evaluate
      state = gameReducer(state, { type: "SUBMIT_AND_EVALUATE", didTimeout: false });
      state = gameReducer(state, { type: "EVALUATE_ROUND" });
    }

    expect(selectIsLastRoundResult(state)).toBe(true);
    state = gameReducer(state, { type: "NEXT_ROUND" });

    const summary = selectSessionSummary(state);

    expect(selectIsSessionComplete(state)).toBe(true);
    expect(selectRoundProgress(state)).toBe(100);
    expect(summary).not.toBeNull();
    expect(summary?.totalRounds).toBe(5);
  });
});
