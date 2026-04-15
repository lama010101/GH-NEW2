import { describe, expect, it } from "vitest";
import { PRACTICE_EVENTS } from "./mockEvents";
import { calculateBadges, evaluateRound } from "./rules";
import { canSubmit, createInitialGameState, gameReducer } from "./gameEngine";
import { selectHasPassedPreflight, selectLatestRoundResult, selectSessionSummary } from "./gameSelectors";
import { runPreflightCheck } from "./preflight";
import { sanitizeForPersistence } from "./sessionApi";

function eventCoordinates(event: (typeof PRACTICE_EVENTS)[number]) {
  return {
    lat: event.location.lat,
    lng: event.location.lng
  };
}

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
    const perfect = evaluateRound(event, { year: event.year, location: eventCoordinates(event) }, 0);
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
    expect(gameReducer(withYear, { type: "SUBMIT_AND_EVALUATE", didTimeout: false }).phase).toBe("ROUND_ACTIVE");
  });

  it("freezes submission at state level - ROUND_LOCK prevents input mutation", () => {
    const state = createReadyState();

    // Set up guess
    let ready = gameReducer(state, { type: "SET_YEAR", year: 1900 });
    ready = gameReducer(ready, { type: "SET_LOCATION", location: { lat: 0, lng: 0 } });

    // Submit transitions to ROUND_LOCK (input frozen at state level)
    const locked = gameReducer(ready, {
      type: "SUBMIT_AND_EVALUATE",
      didTimeout: false
    });

    expect(locked.phase).toBe("ROUND_LOCK");
    expect(locked.currentGuess.year).toBe(1900); // Input preserved but frozen
    expect(locked.currentGuess.location).toEqual({ lat: 0, lng: 0 });

    // Attempt to mutate in ROUND_LOCK - should be ignored (I7: Input Immutability)
    const attemptedMutate = gameReducer(locked, { type: "SET_YEAR", year: 9999 });
    expect(attemptedMutate.currentGuess.year).toBe(1900); // Unchanged

    // Evaluate to complete
    const completed = gameReducer(locked, { type: "EVALUATE_ROUND" });
    expect(completed.phase).toBe("ROUND_COMPLETE");
    expect(completed.roundResults).toHaveLength(1);

    // Verify frozen submission was used
    const result = completed.roundResults[0]!;
    expect(result.guess.year).toBe(1900);

    // currentGuess should be reset after evaluation
    expect(completed.currentGuess.year).toBeNull();
    expect(completed.currentGuess.location).toBeNull();
  });

  it("moves through round results and completes after five rounds", () => {
    let state = createReadyState();

    expect(state.phase).toBe("ROUND_ACTIVE");

    for (let round = 0; round < 5; round += 1) {
      const event = PRACTICE_EVENTS[round];
      state = gameReducer(state, { type: "SET_YEAR", year: event.year });
      state = gameReducer(state, { type: "SET_LOCATION", location: eventCoordinates(event) });
      // Two-step submission: freeze then evaluate
      state = gameReducer(state, { type: "SUBMIT_AND_EVALUATE", didTimeout: false });
      expect(state.phase).toBe("ROUND_LOCK");
      state = gameReducer(state, { type: "EVALUATE_ROUND" });
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

  it("auto-submits on timeout even without a full guess - two-step freeze then evaluate", () => {
    let state = createReadyState();

    expect(state.phase).toBe("ROUND_ACTIVE");

    for (let i = 0; i < 29; i += 1) {
      state = gameReducer(state, { type: "TICK" });
    }

    // Timeout triggers ROUND_LOCK (freeze at state level)
    state = gameReducer(state, { type: "TICK" });
    expect(state.phase).toBe("ROUND_LOCK");
    expect(state.timeRemaining).toBeNull();

    // Must evaluate to complete
    state = gameReducer(state, { type: "EVALUATE_ROUND" });
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

  it("ignores double submit - idempotent submission with freeze boundary", () => {
    let state = createReadyState();
    const event = PRACTICE_EVENTS[0];

    // Set up and freeze
    state = gameReducer(state, { type: "SET_YEAR", year: event.year });
    state = gameReducer(state, { type: "SET_LOCATION", location: eventCoordinates(event) });
    state = gameReducer(state, { type: "SUBMIT_AND_EVALUATE", didTimeout: false });

    expect(state.phase).toBe("ROUND_LOCK");

    // Evaluate to complete
    state = gameReducer(state, { type: "EVALUATE_ROUND" });
    expect(state.phase).toBe("ROUND_COMPLETE");
    expect(state.roundResults).toHaveLength(1);

    // Double submit - should be ignored (already in ROUND_COMPLETE)
    const secondSubmit = gameReducer(state, { type: "SUBMIT_AND_EVALUATE", didTimeout: false });

    // State should be unchanged
    expect(secondSubmit.phase).toBe("ROUND_COMPLETE");
    expect(secondSubmit.roundResults).toHaveLength(1);
    // Original result preserved
    expect(secondSubmit.roundResults[0]?.guess.year).toBe(event.year);
  });

  it("handles timeout race - manual submit after timeout freeze is ignored", () => {
    let state = createReadyState();

    // Run down the timer to ROUND_LOCK
    for (let i = 0; i < 30; i += 1) {
      state = gameReducer(state, { type: "TICK" });
    }

    expect(state.phase).toBe("ROUND_LOCK");

    // Manual submit during ROUND_LOCK - should be ignored
    const manualSubmit = gameReducer(state, {
      type: "SUBMIT_AND_EVALUATE",
      didTimeout: false
    });

    expect(manualSubmit.phase).toBe("ROUND_LOCK"); // Still locked

    // Complete evaluation
    state = gameReducer(state, { type: "EVALUATE_ROUND" });
    expect(state.phase).toBe("ROUND_COMPLETE");
    expect(state.roundResults).toHaveLength(1);
    expect(state.roundResults[0]?.didTimeout).toBe(true);
  });

  it("throws on invariant violation - ROUND_LOCK with mismatched roundResults", () => {
    let state = createReadyState();
    const event = PRACTICE_EVENTS[0];

    state = gameReducer(state, { type: "SET_YEAR", year: event.year });
    state = gameReducer(state, { type: "SET_LOCATION", location: eventCoordinates(event) });
    state = gameReducer(state, { type: "SUBMIT_AND_EVALUATE", didTimeout: false });
    expect(state.phase).toBe("ROUND_LOCK");

    // Corrupt state: manually add a roundResult while in ROUND_LOCK
    const corruptedState = {
      ...state,
      roundResults: [{ /* mock result */ } as any]
    };

    expect(() => gameReducer(corruptedState, { type: "EVALUATE_ROUND" })).toThrow();
  });

  it("clears currentGuess and timeRemaining after evaluation", () => {
    let state = createReadyState();
    const event = PRACTICE_EVENTS[0];

    state = gameReducer(state, { type: "SET_YEAR", year: event.year });
    state = gameReducer(state, { type: "SET_LOCATION", location: eventCoordinates(event) });
    // Two-step: freeze then evaluate
    state = gameReducer(state, { type: "SUBMIT_AND_EVALUATE", didTimeout: false });
    expect(state.phase).toBe("ROUND_LOCK");
    state = gameReducer(state, { type: "EVALUATE_ROUND" });

    expect(state.phase).toBe("ROUND_COMPLETE");
    expect(state.currentGuess.year).toBeNull();
    expect(state.currentGuess.location).toBeNull();
    expect(state.timeRemaining).toBeNull();
  });

  it("sanitizes state for persistence without changing canonical state", () => {
    let state = createReadyState();
    const event = PRACTICE_EVENTS[0];

    // Submit to create a completed state (two-step)
    state = gameReducer(state, { type: "SET_YEAR", year: event.year });
    state = gameReducer(state, { type: "SET_LOCATION", location: eventCoordinates(event) });
    state = gameReducer(state, { type: "SUBMIT_AND_EVALUATE", didTimeout: false });
    state = gameReducer(state, { type: "EVALUATE_ROUND" });
    expect(state.phase).toBe("ROUND_COMPLETE");

    const sanitized = sanitizeForPersistence(state);
    expect(sanitized).toEqual(state);
    expect(sanitized.gameId).toBe(state.gameId);
    expect(sanitized.roundResults).toHaveLength(1);
  });
});
