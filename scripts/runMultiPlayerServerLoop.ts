// scripts/runMultiPlayerServerLoop.ts — Server-Authoritative Multi Player Test
// IMPLEMENTATION DIRECTIVE: SERVER-AUTHORITATIVE MINIMAL GAME LOOP
//
// Required Flow:
// 1. Initialize game
// 2. Join multiple players
// 3. Start game
// 4. For each round: All players submit answers → Round evaluates when all answered
// 5. Reach GAME_OVER
//
// Mandatory Assertions:
// - Every round has: result !== undefined, diff !== undefined, completed === true
// - All players have scores
// - Round evaluates only after ALL players submit
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
  setBroadcastCallback
} from "../src/server/minimalGameLoop";

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

const PLAYERS = ["player-001", "player-002", "player-003"];
const TOTAL_ROUNDS = 3;
// Each player submits different answers per round
const ANSWERS: Record<string, number[]> = {
  "player-001": [40, 70, 95],
  "player-002": [44, 76, 103],
  "player-003": [42, 73, 100]
};
// Expected results (average of answers per round)
// Round 0: (40+44+42)/3 = 42
// Round 1: (70+76+73)/3 = 73
// Round 2: (95+103+100)/3 = 99.33 -> 99

// ═════════════════════════════════════════════════════════════════════════════
// LOGGING UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

function logSeparator(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

// ═════════════════════════════════════════════════════════════════════════════
// ASSERTION HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN TEST FLOW
// ═════════════════════════════════════════════════════════════════════════════

function runTest(): void {
  logSeparator("SERVER-AUTHORITATIVE MULTI PLAYER TEST");
  console.log(`\n  Players: ${PLAYERS.length} [${PLAYERS.join(", ")}]`);
  console.log(`  Total Rounds: ${TOTAL_ROUNDS}`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Initialize game
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 1: INITIALIZE GAME");

  resetGame();
  initGame();
  console.log("  ✅ Game initialized");

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Join all players
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 2: JOIN PLAYERS");

  for (const playerId of PLAYERS) {
    dispatch({ type: "JOIN", playerId });
    console.log(`  ✅ ${playerId} joined`);
  }

  const joinState = getGameState();
  assert(Object.keys(joinState.players).length === PLAYERS.length, "All players must be in game");
  for (const playerId of PLAYERS) {
    assert(joinState.players[playerId].score === 0, `${playerId} initial score must be 0`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Start game
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 3: START GAME");

  dispatch({ type: "START_GAME" });

  const startState = getGameState();
  assert(startState.phase === "QUESTION", "Phase must be QUESTION after START_GAME");
  assert(startState.rounds.length === 1, "First round must be created");
  console.log("  ✅ Game started, first round active");

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Play all rounds (all players must submit)
  // ─────────────────────────────────────────────────────────────────────────
  logSeparator("STEP 4: PLAY ROUNDS");

  for (let roundIdx = 0; roundIdx < TOTAL_ROUNDS; roundIdx++) {
    console.log(`\n  --- Round ${roundIdx + 1}/${TOTAL_ROUNDS} ---`);

    const stateBefore = getGameState();
    assert(stateBefore.phase === "QUESTION", `Round ${roundIdx}: Phase must be QUESTION`);
    assert(stateBefore.roundIndex === roundIdx, `Round ${roundIdx}: roundIndex mismatch`);

    const roundBefore = getCurrentRound();
    assert(roundBefore.completed === false, `Round ${roundIdx}: Must not be completed initially`);
    assert(Object.keys(roundBefore.answers).length === 0, `Round ${roundIdx}: Must have no answers initially`);

    // Submit answers one by one - round should NOT complete until all players submit
    for (let i = 0; i < PLAYERS.length; i++) {
      const playerId = PLAYERS[i];
      const answer = ANSWERS[playerId][roundIdx];

      console.log(`  📝 ${playerId} submits: ${answer}`);
      dispatch({ type: "SUBMIT_ANSWER", playerId, value: answer });

      // Check round state by looking at the specific round (not getCurrentRound since phase advances)
      const roundState = getGameState().rounds[roundIdx];

      if (i < PLAYERS.length - 1) {
        // Not all players submitted yet - round should NOT be complete
        assert(roundState.completed === false, `Round ${roundIdx}: Must not complete after ${i + 1} of ${PLAYERS.length} submissions`);
        assert(roundState.result === undefined, `Round ${roundIdx}: result must be undefined before all submissions`);
        console.log(`     Waiting for ${PLAYERS.length - i - 1} more player(s)...`);
      } else {
        // Last player submitted - round should be complete
        assert(roundState.completed === true, `Round ${roundIdx}: Must complete after all submissions`);
        assert(roundState.result !== undefined, `Round ${roundIdx}: result must be defined after completion`);
        assert(roundState.diff !== undefined, `Round ${roundIdx}: diff must be defined after completion`);
        console.log(`     ✅ Round complete! result=${roundState.result}, diff=${roundState.diff}`);
      }
    }

    // Validate the completed round
    const round = getGameState().rounds[roundIdx];
    assert(round.completed === true, `Round ${roundIdx}: completed !== true`);
    assert(round.result !== undefined, `Round ${roundIdx}: result is undefined`);
    assert(round.diff !== undefined, `Round ${roundIdx}: diff is undefined`);

    // Verify all player answers are recorded
    for (const playerId of PLAYERS) {
      assert(round.answers[playerId] === ANSWERS[playerId][roundIdx], `Round ${roundIdx}: ${playerId} answer mismatch`);
    }

    // Check phase progression
    const stateAfter = getGameState();
    if (roundIdx < TOTAL_ROUNDS - 1) {
      assert(stateAfter.phase === "QUESTION", `After round ${roundIdx}: Phase must be QUESTION (next round)`);
      assert(stateAfter.roundIndex === roundIdx + 1, `After round ${roundIdx}: roundIndex must increment`);
      assert(stateAfter.rounds.length === roundIdx + 2, `After round ${roundIdx}: rounds array must have next round`);
    } else {
      assert(stateAfter.phase === "GAME_OVER", `After final round: Phase must be GAME_OVER`);
    }
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
    const round = finalState.rounds[i];
    assert(round.completed === true, `Round ${i}: completed !== true`);
    assert(round.result !== undefined, `Round ${i}: result is undefined`);
    assert(round.diff !== undefined, `Round ${i}: diff is undefined`);
  }
  console.log("  ✅ All rounds have result, diff, and completed=true");

  // All players have scores
  for (const playerId of PLAYERS) {
    const player = finalState.players[playerId];
    assert(player !== undefined, `Player ${playerId} must exist`);
    assert(typeof player.score === "number", `Player ${playerId} score must be a number`);
    assert(player.score > 0, `Player ${playerId} should have positive score`);
    console.log(`  ✅ ${playerId} score: ${player.score}`);
  }

  // Validation helper check
  const validation = validateFinalState();
  assert(validation.valid, `validateFinalState failed: ${validation.errors.join(", ")}`);
  console.log("  ✅ validateFinalState() passed");

  // General validation
  const generalValidation = validateGameState();
  assert(generalValidation.valid, `validateGameState failed: ${generalValidation.errors.join(", ")}`);
  console.log("  ✅ validateGameState() passed");

  // Event log check
  const events = getEventLog();
  assert(events.length > 0, "Event log should have entries");
  console.log(`  ✅ Event log has ${events.length} entries`);

  // ═════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═════════════════════════════════════════════════════════════════════════
  logSeparator("TEST SUMMARY");

  console.log(`\n  ✅ Total Events Logged: ${events.length}`);
  console.log(`  ✅ Total Rounds: ${finalState.rounds.length}`);
  console.log(`  ✅ Final Phase: ${finalState.phase}`);
  console.log(`  ✅ Total Players: ${Object.keys(finalState.players).length}`);

  console.log(`\n  📊 Player Scores:`);
  for (const playerId of PLAYERS) {
    console.log(`     ${playerId}: ${finalState.players[playerId].score} points`);
  }

  console.log(`\n  📊 Round Results:`);
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const round = finalState.rounds[i];
    const answers = Object.entries(round.answers).map(([id, val]) => `${id}=${val}`).join(", ");
    console.log(`     Round ${i}: q=${round.questionId}`);
    console.log(`             answers: {${answers}}`);
    console.log(`             result=${round.result}, diff=${round.diff}, completed=${round.completed}`);
  }

  console.log(`\n  📋 Event Log (non-authoritative):`);
  for (const event of events) {
    console.log(`     [${event.timestamp}] ${event.type}: ${JSON.stringify(event.payload)}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  ✅ ALL MULTI-PLAYER ASSERTIONS PASSED");
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
  console.error("  ❌ MULTI-PLAYER TEST FAILED");
  console.error("=".repeat(60));
  console.error("\n  Error:", error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error("\n  Stack:", error.stack.split("\n").slice(1, 4).join("\n"));
  }
  process.exit(1);
}
