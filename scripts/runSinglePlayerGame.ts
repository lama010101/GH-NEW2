// scripts/runSinglePlayerGame.ts — Deterministic 1-Player Full Game Simulation (CLI)
// TASK: CORE-GAMEPLAY-001
// Authority: docs/MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE.md
//
// This script proves the full game loop runs end-to-end using ONLY:
// - Event creation
// - Event append (via in-memory store for deterministic simulation)
// - State derivation via existing system (deriveFullStateFromEventStream)
//
// NO shortcuts. NO direct state mutation. NO randomness.

import {
  appendEventInMemory,
  getEvents,
  clearGame,
  resetStore
} from "../src/server/inMemoryEventStore";
import {
  deriveFullStateFromEventStream,
  type RoundEvent,
  type FullGameState
} from "../src/server/eventStream";

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION — Fixed seed for determinism
// ═════════════════════════════════════════════════════════════════════════════

const GAME_ID = "single-player-sim-001";
const PLAYER_ID = "player-001";
const TOTAL_ROUNDS = 3;

// Deterministic targets for each round (fixed seed — no randomness)
const ROUND_TARGETS = [1900, 1950, 2000];

// Deterministic guesses for each round
const ROUND_GUESSES = [1895, 1960, 1998];

// ═════════════════════════════════════════════════════════════════════════════
// LOGGING — Structured state snapshots
// ═════════════════════════════════════════════════════════════════════════════

function logSeparator(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function logStateSnapshot(label: string, state: FullGameState, events: RoundEvent[]): void {
  console.log(`\n📊 STATE SNAPSHOT: ${label}`);
  console.log("-".repeat(40));
  console.log(`  Current Round:  ${state.currentRound}`);
  console.log(`  Current Phase:  ${state.currentPhase ?? "null"}`);
  console.log(`  Total Events:   ${events.length}`);
  console.log(`  Rounds Data:`);
  
  const roundIndices = Object.keys(state.rounds).map(Number).sort((a, b) => a - b);
  if (roundIndices.length === 0) {
    console.log(`    (no rounds initialized)`);
  } else {
    for (const idx of roundIndices) {
      const round = state.rounds[idx];
      const guessStr = round.guess !== undefined ? `${round.guess}` : "(not submitted)";
      const resultStr = round.result ?? "(not evaluated)";
      const diffStr = round.diff !== undefined ? `${round.diff}` : "(not evaluated)";
      const completedStr = round.completed === true ? "true" : "false";
      console.log(`    Round ${idx}: target=${round.target}, guess=${guessStr}, result=${resultStr}, diff=${diffStr}, completed=${completedStr}`);
    }
  }
}

function logEvent(event: RoundEvent): void {
  const payloadStr = JSON.stringify(event.payload);
  console.log(`  📤 EVENT [id=${event.id}, round=${event.roundIndex ?? "null"}] ${event.eventType}: ${payloadStr}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// SIMULATION — Full 3-round game loop
// ═════════════════════════════════════════════════════════════════════════════

async function runSimulation(): Promise<void> {
  logSeparator("DETERMINISTIC 1-PLAYER GAME SIMULATION");
  console.log(`\n  Game ID:    ${GAME_ID}`);
  console.log(`  Player ID:  ${PLAYER_ID}`);
  console.log(`  Rounds:     ${TOTAL_ROUNDS}`);
  console.log(`  Targets:    [${ROUND_TARGETS.join(", ")}]`);
  console.log(`  Guesses:    [${ROUND_GUESSES.join(", ")}]`);

  // Reset store for clean state
  resetStore();
  clearGame(GAME_ID);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 1: INIT GAME — SESSION_CREATED
  // ───────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 1: INIT GAME");
  
  appendEventInMemory(GAME_ID, "SESSION_CREATED", null, {
    playerId: PLAYER_ID,
    totalRounds: TOTAL_ROUNDS,
    mode: "practice"
  });

  let events = getEvents(GAME_ID);
  let state = deriveFullStateFromEventStream(events);
  
  logEvent(events[events.length - 1]);
  logStateSnapshot("After SESSION_CREATED", state, events);

  // Validate initial state
  if (state.currentRound !== 0) {
    throw new Error(`INIT_ERROR: Expected currentRound=0, got ${state.currentRound}`);
  }
  if (state.currentPhase !== "SESSION_CREATED") {
    throw new Error(`INIT_ERROR: Expected phase=SESSION_CREATED, got ${state.currentPhase}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 2: RUN ROUNDS 1..3
  // ───────────────────────────────────────────────────────────────────────────
  for (let roundIdx = 0; roundIdx < TOTAL_ROUNDS; roundIdx++) {
    logSeparator(`ROUND ${roundIdx + 1} / ${TOTAL_ROUNDS}`);

    // ─────────────────────────────────────────────────────────────────────────
    // 2a: emit ROUND_STARTED (with deterministic target)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  ▶️  Emitting ROUND_STARTED for round ${roundIdx}...`);
    
    appendEventInMemory(GAME_ID, "ROUND_STARTED", roundIdx, {
      target: ROUND_TARGETS[roundIdx],
      roundIndex: roundIdx,
      startedAt: new Date().toISOString()
    });

    events = getEvents(GAME_ID);
    state = deriveFullStateFromEventStream(events);
    
    logEvent(events[events.length - 1]);
    logStateSnapshot(`After ROUND_STARTED (round ${roundIdx})`, state, events);

    // Validate round started
    if (state.currentRound !== roundIdx) {
      throw new Error(`ROUND_ERROR: Expected currentRound=${roundIdx}, got ${state.currentRound}`);
    }
    if (state.currentPhase !== "ROUND_STARTED") {
      throw new Error(`ROUND_ERROR: Expected phase=ROUND_STARTED, got ${state.currentPhase}`);
    }
    if (!state.rounds[roundIdx]) {
      throw new Error(`ROUND_ERROR: Round ${roundIdx} not initialized in state`);
    }
    if (state.rounds[roundIdx].target !== ROUND_TARGETS[roundIdx]) {
      throw new Error(`TARGET_ERROR: Expected target=${ROUND_TARGETS[roundIdx]}, got ${state.rounds[roundIdx].target}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2c: emit GUESS_SUBMITTED
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  ▶️  Emitting GUESS_SUBMITTED for round ${roundIdx}...`);
    
    appendEventInMemory(GAME_ID, "GUESS_SUBMITTED", roundIdx, {
      playerId: PLAYER_ID,
      guess: ROUND_GUESSES[roundIdx],
      submittedAt: new Date().toISOString()
    });

    events = getEvents(GAME_ID);
    state = deriveFullStateFromEventStream(events);
    
    logEvent(events[events.length - 1]);
    logStateSnapshot(`After GUESS_SUBMITTED (round ${roundIdx})`, state, events);

    // Validate guess stored
    if (state.rounds[roundIdx].guess !== ROUND_GUESSES[roundIdx]) {
      throw new Error(`GUESS_ERROR: Expected guess=${ROUND_GUESSES[roundIdx]}, got ${state.rounds[roundIdx].guess}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2e: emit ROUND_COMPLETED
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  ▶️  Emitting ROUND_COMPLETE for round ${roundIdx}...`);
    
    // Compute result (WIN if within 10 years)
    const target = ROUND_TARGETS[roundIdx];
    const guess = ROUND_GUESSES[roundIdx];
    const diff = Math.abs(guess - target);
    const result = diff <= 10 ? "WIN" : "LOSE";
    
    appendEventInMemory(GAME_ID, "ROUND_COMPLETE", roundIdx, {
      roundIndex: roundIdx,
      result,
      diff,
      computedAt: new Date().toISOString()
    });

    events = getEvents(GAME_ID);
    state = deriveFullStateFromEventStream(events);
    
    logEvent(events[events.length - 1]);
    logStateSnapshot(`After ROUND_COMPLETE (round ${roundIdx})`, state, events);

    // Validate round complete
    if (state.currentPhase !== "ROUND_COMPLETE") {
      throw new Error(`COMPLETE_ERROR: Expected phase=ROUND_COMPLETE, got ${state.currentPhase}`);
    }
    // ── Acceptance Criteria 1: result, diff, completed must be set ──
    const completedRound = state.rounds[roundIdx];
    if (completedRound.completed !== true) {
      throw new Error(`INVARIANT_VIOLATION: Round ${roundIdx} completed flag not set`);
    }
    if (completedRound.result === undefined) {
      throw new Error(`INVARIANT_VIOLATION: Round ${roundIdx} result is undefined after ROUND_COMPLETE`);
    }
    if (completedRound.diff === undefined) {
      throw new Error(`INVARIANT_VIOLATION: Round ${roundIdx} diff is undefined after ROUND_COMPLETE`);
    }
    if (completedRound.result !== result) {
      throw new Error(`RESULT_MISMATCH: Round ${roundIdx} expected result=${result}, got ${completedRound.result}`);
    }
    if (completedRound.diff !== diff) {
      throw new Error(`DIFF_MISMATCH: Round ${roundIdx} expected diff=${diff}, got ${completedRound.diff}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 3: END GAME — SESSION_COMPLETE
  // ───────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 3: END GAME");
  
  appendEventInMemory(GAME_ID, "SESSION_COMPLETE", TOTAL_ROUNDS - 1, {
    totalRounds: TOTAL_ROUNDS,
    completedAt: new Date().toISOString()
  });

  events = getEvents(GAME_ID);
  state = deriveFullStateFromEventStream(events);
  
  logEvent(events[events.length - 1]);
  logStateSnapshot("After SESSION_COMPLETE", state, events);

  // Validate final state
  if (state.currentPhase !== "SESSION_COMPLETE") {
    throw new Error(`END_ERROR: Expected phase=SESSION_COMPLETE, got ${state.currentPhase}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 & 5: REPLAY EQUALITY TEST — Acceptance Criteria 3
  // Rebuild S2 from the frozen event log E and deep-compare to live state S1
  // Timestamps are stripped before comparison (non-deterministic fields)
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("REPLAY EQUALITY TEST");

  // Capture S1 (live state) — freeze event list at this point
  const frozenEvents: RoundEvent[] = events.map(e => ({ ...e }));
  const liveState: FullGameState = state;

  // Replay S2 from the frozen event list only
  const replayState: FullGameState = deriveFullStateFromEventStream(frozenEvents);

  // Neutralise non-deterministic fields: strip createdAt before printing
  function stripTimestamps(s: FullGameState): Omit<FullGameState, never> {
    return {
      currentRound: s.currentRound,
      currentPhase: s.currentPhase,
      rounds: s.rounds
    };
  }

  const s1json = JSON.stringify(stripTimestamps(liveState));
  const s2json = JSON.stringify(stripTimestamps(replayState));

  console.log("\n=== EVENT LOG ===");
  for (const e of frozenEvents) {
    console.log(JSON.stringify({ id: e.id, round: e.roundIndex, type: e.eventType, payload: e.payload }));
  }

  console.log("\n=== STATE AFTER LIVE RUN ===");
  console.log(s1json);

  console.log("\n=== STATE AFTER REPLAY ===");
  console.log(s2json);

  console.log("\n=== EQUALITY CHECK ===");
  if (s1json !== s2json) {
    console.error("FAIL — states differ");
    console.error("S1:", s1json);
    console.error("S2:", s2json);
    throw new Error("REPLAY_EQUALITY_FAIL: Live state and replay state differ");
  }
  console.log("PASS");

  // ── INVARIANT CHECKS (all rounds) ──
  console.log("\n=== INVARIANT CHECKS ===");
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const r = liveState.rounds[i];
    if (r.completed !== true)  throw new Error(`INVARIANT: round ${i} completed !== true`);
    if (r.result === undefined) throw new Error(`INVARIANT: round ${i} result is undefined`);
    if (r.diff === undefined)   throw new Error(`INVARIANT: round ${i} diff is undefined`);
    console.log(`  Round ${i}: completed=true, result=${r.result}, diff=${r.diff} ✓`);
  }

  // ── Acceptance Criteria 4: removing any event changes state ──
  console.log("\n  Acceptance Criteria 4: single-event removal changes state...");
  for (let skip = 0; skip < frozenEvents.length; skip++) {
    const truncated = frozenEvents.filter((_, idx) => idx !== skip);
    try {
      const partial = deriveFullStateFromEventStream(truncated);
      const partialJson = JSON.stringify(stripTimestamps(partial));
      if (partialJson === s1json) {
        throw new Error(`AC4_FAIL: Removing event[${skip}] (${frozenEvents[skip].eventType}) did NOT change final state`);
      }
    } catch (e: unknown) {
      // Thrown = state construction failed, which also proves dependency
      if (e instanceof Error && e.message.startsWith("AC4_FAIL")) throw e;
    }
  }
  console.log("  All events proven necessary ✓");

  // ───────────────────────────────────────────────────────────────────────────
  // FINAL SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  logSeparator("SIMULATION COMPLETE — FINAL SUMMARY");
  
  console.log(`\n  ✅ Total Events: ${events.length}`);
  console.log(`  ✅ Total Rounds: ${Object.keys(state.rounds).length}`);
  console.log(`  ✅ Final Phase:  ${state.currentPhase}`);
  console.log(`  ✅ Final Round:  ${state.currentRound}`);
  
  console.log(`\n  📋 Event Log:`);
  for (const event of events) {
    const roundStr = event.roundIndex !== null ? `R${event.roundIndex}` : "RS";
    console.log(`     [${event.id.toString().padStart(2)}] ${roundStr} | ${event.eventType.padEnd(18)} | ${JSON.stringify(event.payload)}`);
  }

  console.log(`\n  📊 Round Results:`);
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const round = state.rounds[i];
    const status = round.result === "WIN" ? "✅ WIN" : "❌ LOSE";
    console.log(`     Round ${i}: target=${round.target}, guess=${round.guess}, diff=${round.diff}, result=${round.result}, completed=${round.completed} → ${status}`);
  }

  // Return deterministic output for verification
  return Promise.resolve();
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN — Execute with error handling
// ═════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  try {
    await runSimulation();
    
    logSeparator("SUCCESS");
    console.log("\n  ✅ Full 3-round game simulation completed successfully.");
    console.log("  ✅ All state transitions validated.");
    console.log("  ✅ Deterministic replay confirmed.");
    
    process.exit(0);
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("  ❌ SIMULATION FAILED");
    console.error("=".repeat(60));
    console.error("\n  Error:", error instanceof Error ? error.message : String(error));
    
    process.exit(1);
  }
}

// Run if executed directly
main();
