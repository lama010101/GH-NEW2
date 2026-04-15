// testGameFlow.ts — Golden Path Test (In-Memory, Zero Dependency)
// TASK: CORE-VALID-001
//
// Run: node scripts/testGameFlow.ts
// or: npm run test:golden
//
// This script proves the game loop works independently of infrastructure.
// No database. No Supabase. No network. Pure deterministic logic.

import { appendEventInMemory, getState, resetStore } from "../src/server/inMemoryEventStore";
import { deriveFullStateFromEventStream } from "../src/server/eventStream";

const gameId = "test-game";

function logStep(name: string): void {
  console.log(`[STEP] ${name}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERT FAILED] ${message}`);
  }
}

function run(): void {
  console.log("=== GOLDEN PATH TEST START ===\n");

  // Clean slate for determinism
  resetStore();

  // ═══════════════════════════════════════════════════════════════════════════
  // GOLDEN PATH: Full game lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  logStep("SESSION_CREATED");
  appendEventInMemory(gameId, "SESSION_CREATED", null);

  logStep("ROUND_STARTED (round 0)");
  appendEventInMemory(gameId, "ROUND_STARTED", 0, { target: 42 });

  logStep("GUESS_SUBMITTED (round 0)");
  appendEventInMemory(gameId, "GUESS_SUBMITTED", 0, { guess: 10 });

  logStep("ROUND_COMPLETE (round 0)");
  appendEventInMemory(gameId, "ROUND_COMPLETE", 0);

  logStep("SESSION_COMPLETE");
  appendEventInMemory(gameId, "SESSION_COMPLETE", null);

  console.log("\n--- Deriving State from Event Stream ---");
  const state = getState(gameId);

  console.log("[STATE]", JSON.stringify(state, null, 2));

  // Log full state with rounds (CORE-VALID-002)
  console.log("\n--- Deriving Full State with Rounds ---");
  const events = require("../src/server/inMemoryEventStore").getEvents(gameId);
  const fullState = deriveFullStateFromEventStream(events);
  console.log("[FULL_STATE.rounds[0]]", JSON.stringify(fullState.rounds[0], null, 2));

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSERTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n--- Running Assertions ---");

  assert(state.currentRound === 0, `Final round should be 0, got ${state.currentRound}`);
  console.log("✓ currentRound === 0");

  assert(state.currentPhase === "SESSION_COMPLETE", `Game must be complete, got ${state.currentPhase}`);
  console.log("✓ currentPhase === 'SESSION_COMPLETE'");

  console.log("\n=== ALL ASSERTIONS PASSED ===");
}

// ═════════════════════════════════════════════════════════════════════════════
// FAILURE MODE TESTS (must throw)
// ═════════════════════════════════════════════════════════════════════════════

function runFailureTests(): void {
  console.log("\n=== FAILURE MODE TESTS ===\n");

  // Test 1: Skip SESSION_CREATED
  console.log("[TEST] Skip SESSION_CREATED (must throw)");
  resetStore();
  try {
    appendEventInMemory(gameId, "ROUND_STARTED", 0);
    throw new Error("SHOULD_HAVE_THROWN: Skip SESSION_CREATED");
  } catch (e: any) {
    if (e.message.includes("FIRST_EVENT_MUST_BE_SESSION_CREATED")) {
      console.log("✓ Correctly rejected: FIRST_EVENT_MUST_BE_SESSION_CREATED\n");
    } else {
      throw e;
    }
  }

  // Test 2: Invalid transition (ROUND_STARTED → SESSION_COMPLETE)
  console.log("[TEST] Invalid transition ROUND_STARTED → SESSION_COMPLETE (must throw)");
  resetStore();
  appendEventInMemory(gameId, "SESSION_CREATED", null);
  appendEventInMemory(gameId, "ROUND_STARTED", 0);
  try {
    appendEventInMemory(gameId, "SESSION_COMPLETE", null);
    throw new Error("SHOULD_HAVE_THROWN: Invalid transition");
  } catch (e: any) {
    if (e.message.includes("INVALID_TRANSITION")) {
      console.log("✓ Correctly rejected: INVALID_TRANSITION\n");
    } else {
      throw e;
    }
  }

  // Test 3: Wrong round index (skip round 0, start at round 1)
  console.log("[TEST] Wrong round index (skip round 0, start at round 1) (must throw)");
  resetStore();
  appendEventInMemory(gameId, "SESSION_CREATED", null);
  try {
    appendEventInMemory(gameId, "ROUND_STARTED", 1);
    throw new Error("SHOULD_HAVE_THROWN: Wrong round index");
  } catch (e: any) {
    if (e.message.includes("INVALID_ROUND_INCREMENT")) {
      console.log("✓ Correctly rejected: INVALID_ROUND_INCREMENT\n");
    } else {
      throw e;
    }
  }

  // Test 4: Double ROUND_STARTED without completion
  console.log("[TEST] Double ROUND_STARTED without completion (must throw)");
  resetStore();
  appendEventInMemory(gameId, "SESSION_CREATED", null);
  appendEventInMemory(gameId, "ROUND_STARTED", 0);
  try {
    appendEventInMemory(gameId, "ROUND_STARTED", 1);
    throw new Error("SHOULD_HAVE_THROWN: Double ROUND_STARTED");
  } catch (e: any) {
    if (e.message.includes("INVALID_TRANSITION")) {
      console.log("✓ Correctly rejected: INVALID_TRANSITION (double ROUND_STARTED)\n");
    } else {
      throw e;
    }
  }

  console.log("=== ALL FAILURE TESTS PASSED ===");
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

try {
  run();
  runFailureTests();
  console.log("\n🎉 GOLDEN PATH COMPLETE — Architecture validated!");
  process.exit(0);
} catch (err: any) {
  console.error("\n💥 TEST FAILED:", err.message);
  process.exit(1);
}
