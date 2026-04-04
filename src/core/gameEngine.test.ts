import { describe, expect, it } from "vitest";
import { PRACTICE_EVENTS } from "./mockEvents";
import { calculateBadges, evaluateRound } from "./rules";
import { canSubmit, createInitialGameState, gameReducer } from "./gameEngine";
import { selectHasPassedPreflight, selectLatestRoundResult, selectSessionSummary } from "./gameSelectors";
import { runPreflightCheck } from "./preflight";

function createReadyState() {
  let state = createInitialGameState(PRACTICE_EVENTS);
  state = gameReducer(state, { type: "BEGIN_START" });
  state = gameReducer(state, { type: "COMPLETE_PREFLIGHT", preflight: runPreflightCheck(PRACTICE_EVENTS) });
  return state;
}

function createActiveRoundState() {
  return createReadyState();
}

describe("game rules", () => {
  it("evaluates closer guesses as better scores", () => {
    const event = PRACTICE_EVENTS[0];
    const perfect = evaluateRound(event, { year: event.year, location: event.location }, 0);
    const far = evaluateRound(event, { year: event.year - 100, location: { lat: -90, lng: 0 } }, 0);

    expect(perfect.roundAccuracy).toBeGreaterThan(far.roundAccuracy);
    expect(perfect.roundXp).toBeGreaterThan(far.roundXp);
  });

  it("creates badges in the expected order", () => {
    const badges = calculateBadges({ yearAccuracy: 98, locationAccuracy: 100, comboAccuracy: 99 });

    expect(badges.map((badge) => badge.dimension)).toEqual(["location", "year", "combo"]);
  });

  it("prevents submission until both inputs exist", () => {
    const active = createActiveRoundState();
    const withYear = gameReducer(active, { type: "SET_YEAR", year: 1969 });

    expect(canSubmit(active)).toBe(false);
    expect(canSubmit(withYear)).toBe(false);
    expect(gameReducer(withYear, { type: "SUBMIT", didTimeout: false }).phase).toBe("ROUND_ACTIVE");
  });

  it("moves through round results and completes after five rounds", () => {
    let state = createReadyState();

    expect(state.phase).toBe("ROUND_ACTIVE");

    for (let round = 0; round < 5; round += 1) {
      const event = PRACTICE_EVENTS[round];
      state = gameReducer(state, { type: "SET_YEAR", year: event.year });
      state = gameReducer(state, { type: "SET_LOCATION", location: event.location });
      state = gameReducer(state, { type: "SUBMIT", didTimeout: false });
      expect(state.phase).toBe("ROUND_LOCK");
      state = gameReducer(state, { type: "EVALUATE_ROUND" });
      expect(state.phase).toBe("ROUND_EVALUATE");
      state = gameReducer(state, { type: "COMPLETE_EVALUATION" });

      expect(state.phase).toBe("ROUND_COMPLETE");

      if (round < 4) {
        state = gameReducer(state, { type: "NEXT_ROUND" });
        expect(state.phase).toBe("ROUND_ACTIVE");
      }
    }

    state = gameReducer(state, { type: "NEXT_ROUND" });
    expect(state.phase).toBe("SESSION_COMPLETE");
    expect(state.roundResults).toHaveLength(5);
    expect(selectSessionSummary(state)?.totalRounds).toBe(5);
  });

  it("auto-submits on timeout even without a full guess", () => {
    let state = createReadyState();

    expect(state.phase).toBe("ROUND_ACTIVE");

    for (let i = 0; i < 29; i += 1) {
      state = gameReducer(state, { type: "TICK" });
    }

    state = gameReducer(state, { type: "TICK" });
    expect(state.phase).toBe("ROUND_LOCK");
    state = gameReducer(state, { type: "EVALUATE_ROUND" });
    expect(state.phase).toBe("ROUND_EVALUATE");
    state = gameReducer(state, { type: "COMPLETE_EVALUATION" });

    expect(state.phase).toBe("ROUND_COMPLETE");
    expect(selectLatestRoundResult(state)?.didTimeout).toBe(true);
    expect(state.timeRemaining).toBeNull();
  });

  it("blocks start when preflight fails", () => {
    const state = createInitialGameState(PRACTICE_EVENTS.slice(0, 2));
    const checking = gameReducer(state, { type: "BEGIN_START" });
    const next = gameReducer(checking, {
      type: "COMPLETE_PREFLIGHT",
      preflight: runPreflightCheck(PRACTICE_EVENTS.slice(0, 2))
    });

    expect(checking.phase).toBe("PREFLIGHT_CHECK");
    expect(next.phase).toBe("INIT");
    expect(selectHasPassedPreflight(next)).toBe(false);
    expect(next.preflightIssues.length).toBeGreaterThan(0);
  });
});
