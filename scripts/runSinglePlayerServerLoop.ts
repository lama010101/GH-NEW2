// scripts/runSinglePlayerServerLoop.ts — Server-Authoritative Single Player Test
// IMPLEMENTATION DIRECTIVE: SERVER-AUTHORITATIVE MINIMAL GAME LOOP
//
// Required Flow:
// 1. Initialize game
// 2. Join one player
// 3. Start game
// 4. For each round: Submit answer → Ensure evaluation occurs
// 5. Reach GAME_OVER
//
// Mandatory Assertions:
// - Every round has: result !== undefined, diff !== undefined, completed === true
// - No undefined fields in final state
// - Game phase ends at "GAME_OVER"

import {
  initGame,
  resetGame,
  dispatch,
  getGameState,
  getCurrentRound,
  getEventLog,
  validateGameState,
  validateFinalState,
  setBroadcastCallback,
  GameState
} from "../src/server/minimalGameLoop";

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

const PLAYER_ID = "player-001";
const TOTAL_ROUNDS = 3;
const ANSWERS = [42, 73, 99]; // Deterministic answers for each round

// ═════════════════════════════════════════════════════════════════════════════
// LOGGING UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

function logSeparator(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function logState(label: string, state: GameState): void {
  console.log(`\n📊 STATE: ${label}`);
  console.log("-".repeat(40));
  console.log(`  Phase:       ${state.phase}`);
  console.log(`  Round Index: ${state.roundIndex}`);
  console.log(`  Players:     ${Object.keys(state.players).length}`);
  console.log(`  Rounds:      ${state.rounds.length}`);

  for (let i = 0; i < state.rounds.length; i++) {
    const r = state.rounds[i];
    const answers = Object.entries(r.answers).map(([id, val]) => `${id.slice(0, 8)}=${val}`).join(", ");
    console.log(`    Round ${i}: q=${r.questionId}, answers={${answers}}, completed=${r.completed}, result=${r.result ?? "?"}, diff=${r.diff ?? "?"}`);
  }

  for (const [id, player] of Object.entries(state.players)) {
    console.log(`    Player ${id.slice(0, 8)}: score=${player.score}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BROADCAST TRACKER
// ═════════════════════════════════════════════════════════════════════════════

let broadcastCount = 0;
const broadcastedStates: GameState[] = [];

setBroadcastCallback((state) => {
  broadcastCount++;
  broadcastedStates.push(JSON.parse(JSON.stringify(state)));
});

// ═════════════════════════════════════════════════════════════════════════════
// ASSERTION HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertRoundComplete(roundIndex: number): void {
  const state = getGameState();
  const round = state.rounds[roundIndex];

  assert(round !== undefined, `Round ${roundIndex} does not exist`);
  assert(round.completed === true, `Round ${roundIndex}: completed !== true`);
  assert(round.result !== undefined, `Round ${roundIndex}: result is undefined`);
  assert(round.diff !== undefined, `Round ${roundIndex}: diff is undefined`);
  assert(typeof round.result === "number", `Round ${roundIndex}: result is not a number`);
  assert(typeof round.diff === "number", `Round ${roundIndex}: diff is not a number`);

  console.log(`  ✅ Round ${roundIndex} complete: result=${round.result}, diff=${round.diff}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN TEST FLOW
// ═════════════════════════════════════════════════════════════════════════════

function runTest(): void {
  logSeparator("SERVER-AUTHORITATIVE SINGLE PLAYER TEST");
  console.log(`\n  Player ID: ${PLAYER_ID}`);
  console.log(`  Total Rounds: ${TOTAL_ROUNDS}`);
  console.log(`  Answers: [${ANSWERS.join(", ")}]`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Initialize game
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 1: INITIALIZE GAME");

  resetGame();
  initGame();

  const initialState = getGameState();
  assert(initialState.phase === "LOBBY", "Initial phase must be LOBBY");
  assert(Object.keys(initialState.players).length === 0, "Initial players must be empty");
  assert(initialState.rounds.length === 0, "Initial rounds must be empty");
  assert(initialState.roundIndex === 0, "Initial roundIndex must be 0");

  logState("After Init", initialState);
  console.log("  ✅ Game initialized");

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Join one player
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 2: JOIN PLAYER");

  dispatch({ type: "JOIN", playerId: PLAYER_ID });

  const joinState = getGameState();
  assert(joinState.players[PLAYER_ID] !== undefined, "Player must exist after JOIN");
  assert(joinState.players[PLAYER_ID].score === 0, "Player initial score must be 0");
  assert(joinState.players[PLAYER_ID].id === PLAYER_ID, "Player ID must match");

  logState("After Join", joinState);
  console.log("  ✅ Player joined");

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Start game
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 3: START GAME");

  dispatch({ type: "START_GAME" });

  const startState = getGameState();
  assert(startState.phase === "QUESTION", "Phase must be QUESTION after START_GAME");
  assert(startState.rounds.length === 1, "First round must be created");
  assert(startState.roundIndex === 0, "Round index must be 0");

  const firstRound = getCurrentRound();
  assert(firstRound.questionId === "question-1", "First question ID must be question-1");
  assert(firstRound.completed === false, "First round must not be completed");
  assert(Object.keys(firstRound.answers).length === 0, "First round must have no answers");

  logState("After Start", startState);
  console.log("  ✅ Game started");

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Play all rounds
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 4: PLAY ROUNDS");

  for (let roundIdx = 0; roundIdx < TOTAL_ROUNDS; roundIdx++) {
    console.log(`\n  --- Round ${roundIdx + 1}/${TOTAL_ROUNDS} ---`);

    const stateBefore = getGameState();
    assert(stateBefore.phase === "QUESTION", `Round ${roundIdx}: Phase must be QUESTION`);
    assert(stateBefore.roundIndex === roundIdx, `Round ${roundIdx}: roundIndex mismatch`);

    // Submit answer
    const answer = ANSWERS[roundIdx];
    console.log(`  📝 Submitting answer: ${answer}`);

    dispatch({ type: "SUBMIT_ANSWER", playerId: PLAYER_ID, value: answer });

    // Since single player, round evaluates immediately
    assertRoundComplete(roundIdx);

    // Check phase progression
    const stateAfter = getGameState();
    if (roundIdx < TOTAL_ROUNDS - 1) {
      assert(stateAfter.phase === "QUESTION", `After round ${roundIdx}: Phase must be QUESTION (next round)`);
      assert(stateAfter.roundIndex === roundIdx + 1, `After round ${roundIdx}: roundIndex must increment`);
    } else {
      assert(stateAfter.phase === "GAME_OVER", `After final round: Phase must be GAME_OVER`);
    }

    logState(`After Round ${roundIdx}`, stateAfter);
  }

  console.log("\n  ✅ All rounds completed");

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Validate final state
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 5: FINAL VALIDATION");

  const finalState = getGameState();

  // Phase check
  assert(finalState.phase === "GAME_OVER", "Final phase must be GAME_OVER");
  console.log("  ✅ Phase is GAME_OVER");

  // All rounds complete check
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    assertRoundComplete(i);
  }
  console.log("  ✅ All rounds have result, diff, and completed=true");

  // No undefined fields check
  for (let i = 0; i < finalState.rounds.length; i++) {
    const round = finalState.rounds[i];
    assert(round.result !== undefined && round.result !== null, `Round ${i}: result must be defined`);
    assert(round.diff !== undefined && round.diff !== null, `Round ${i}: diff must be defined`);
    assert(round.completed !== undefined, `Round ${i}: completed must be defined`);
  }
  console.log("  ✅ No undefined fields in state");

  // Player score check (should have received points)
  const player = finalState.players[PLAYER_ID];
  assert(player.score > 0, "Player should have positive score");
  console.log(`  ✅ Player score: ${player.score}`);

  // Validation helper check
  const validation = validateFinalState();
  assert(validation.valid, `validateFinalState failed: ${validation.errors.join(", ")}`);
  console.log("  ✅ validateFinalState() passed");

  // General validation
  const generalValidation = validateGameState();
  assert(generalValidation.valid, `validateGameState failed: ${generalValidation.errors.join(", ")}`);
  console.log("  ✅ validateGameState() passed");

  // Event log check (non-authoritative but should exist)
  const events = getEventLog();
  assert(events.length > 0, "Event log should have entries");
  console.log(`  ✅ Event log has ${events.length} entries`);

  // Broadcast check
  assert(broadcastCount > 0, "State should have been broadcast");
  console.log(`  ✅ State broadcast ${broadcastCount} times`);

  logState("FINAL", finalState);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Replay verification (states are snapshots, not reconstructed)
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 6: SNAPSHOT CONSISTENCY");

  // Verify each broadcasted state was valid at that point
  for (let i = 0; i < broadcastedStates.length; i++) {
    const snapshot = broadcastedStates[i];
    assert(snapshot.phase !== undefined, `Broadcast ${i}: phase undefined`);
    assert(snapshot.rounds !== undefined, `Broadcast ${i}: rounds undefined`);
    assert(snapshot.players !== undefined, `Broadcast ${i}: players undefined`);

    // Verify rounds in snapshot have valid structure
    for (let r = 0; r < snapshot.rounds.length; r++) {
      const round = snapshot.rounds[r];
      if (round.completed) {
        assert(typeof round.result === "number", `Broadcast ${i} Round ${r}: result must be number when completed`);
        assert(typeof round.diff === "number", `Broadcast ${i} Round ${r}: diff must be number when completed`);
      }
    }
  }
  console.log(`  ✅ All ${broadcastedStates.length} broadcasted states are valid snapshots`);

  // ═════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═════════════════════════════════════════════════════════════════════════
  logSeparator("TEST SUMMARY");

  console.log(`\n  ✅ Total Events Logged: ${events.length}`);
  console.log(`  ✅ Total Rounds: ${finalState.rounds.length}`);
  console.log(`  ✅ Final Phase: ${finalState.phase}`);
  console.log(`  ✅ Player Score: ${finalState.players[PLAYER_ID].score}`);
  console.log(`  ✅ State Broadcasts: ${broadcastCount}`);

  console.log(`\n  📋 Event Log (non-authoritative):`);
  for (const event of events) {
    console.log(`     [${event.timestamp}] ${event.type}: ${JSON.stringify(event.payload)}`);
  }

  console.log(`\n  📊 Round Results:`);
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const round = finalState.rounds[i];
    console.log(`     Round ${i}: q=${round.questionId}, answers=${JSON.stringify(round.answers)}, result=${round.result}, diff=${round.diff}, completed=${round.completed}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  ✅ ALL ASSERTIONS PASSED");
  console.log("=".repeat(60));
}

// ═════════════════════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═════════════════════════════════════════════════════════════════════════════

try {
  runTest();
  process.exit(0);
} catch (error) {
  console.error("\n" + "=".repeat(60));
  console.error("  ❌ TEST FAILED");
  console.error("=".repeat(60));
  console.error("\n  Error:", error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error("\n  Stack:", error.stack.split("\n").slice(1, 4).join("\n"));
  }
  process.exit(1);
}
