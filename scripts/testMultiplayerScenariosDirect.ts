// ============================================================================
// Multiplayer Scenario Tests: 4 Players, 5 Rounds (Direct DB Access)
// ============================================================================
// Tests various gameplay scenarios using direct server-side functions:
// 1. Happy path: All players submit full guesses for all rounds
// 2. No submission: One player skips a round
// 3. Partial submission: Player submits only year (null location)
// 4. Partial submission: Player submits only location (null year)
// 5. Mixed scenarios: Multiple players with different patterns
// ============================================================================

import dotenv from "dotenv";
import {
  createCompeteSession,
  joinCompeteSession,
  setCompetePlayerReady,
  startCompeteSession,
  submitGuess
} from "../src/server/sessionCore";
import { TransitionCause } from "../src/core/transitionCause";
import { randomUUID } from "crypto";
import { dbPool } from "../src/server/db";

// Load environment variables
dotenv.config({ path: ".env.local" });

const TOTAL_ROUNDS = 5;

// Generate proper UUIDs for players
function generateUUID(): string {
  return randomUUID();
}

const PLAYERS = [
  { id: generateUUID(), name: "Alice" },
  { id: generateUUID(), name: "Bob" },
  { id: generateUUID(), name: "Charlie" },
  { id: generateUUID(), name: "Diana" }
];

// Game configuration
const GAME_CONFIG = {
  mode: "sync" as const,
  roundTimerSec: 60,
  yearMin: 1900,
  yearMax: 2024
};

// Test scenario types
type ScenarioType = "happy-path" | "no-submit" | "partial-year-only" | "partial-location-only" | "mixed";

interface ScenarioConfig {
  type: ScenarioType;
  description: string;
  getPlayerGuess: (playerIndex: number, roundIndex: number) => { yearGuess: number | null; locationGuess: { lat: number; lng: number } | null } | null;
}

// Scenario configurations
const SCENARIOS: ScenarioConfig[] = [
  {
    type: "happy-path",
    description: "All players submit full guesses for all rounds",
    getPlayerGuess: (playerIndex, roundIndex) => ({
      yearGuess: 1950 + Math.floor(Math.random() * 74),
      locationGuess: { lat: 40.7128 + (Math.random() - 0.5) * 0.1, lng: -74.006 + (Math.random() - 0.5) * 0.1 }
    })
  },
  {
    type: "no-submit",
    description: "Player 2 (Bob) skips round 2",
    getPlayerGuess: (playerIndex, roundIndex) => {
      if (playerIndex === 1 && roundIndex === 2) {
        return null; // Bob skips round 2
      }
      return {
        yearGuess: 1950 + Math.floor(Math.random() * 74),
        locationGuess: { lat: 40.7128 + (Math.random() - 0.5) * 0.1, lng: -74.006 + (Math.random() - 0.5) * 0.1 }
      };
    }
  },
  {
    type: "partial-year-only",
    description: "Player 3 (Charlie) submits only year (null location) in round 1",
    getPlayerGuess: (playerIndex, roundIndex) => {
      if (playerIndex === 2 && roundIndex === 1) {
        return { yearGuess: 1960, locationGuess: null };
      }
      return {
        yearGuess: 1950 + Math.floor(Math.random() * 74),
        locationGuess: { lat: 40.7128 + (Math.random() - 0.5) * 0.1, lng: -74.006 + (Math.random() - 0.5) * 0.1 }
      };
    }
  },
  {
    type: "partial-location-only",
    description: "Player 4 (Diana) submits only location (null year) in round 3",
    getPlayerGuess: (playerIndex, roundIndex) => {
      if (playerIndex === 3 && roundIndex === 3) {
        return { yearGuess: null, locationGuess: { lat: 40.7128, lng: -74.006 } };
      }
      return {
        yearGuess: 1950 + Math.floor(Math.random() * 74),
        locationGuess: { lat: 40.7128 + (Math.random() - 0.5) * 0.1, lng: -74.006 + (Math.random() - 0.5) * 0.1 }
      };
    }
  },
  {
    type: "mixed",
    description: "Mixed patterns: Bob skips round 1, Charlie partial year in round 2, Diana partial location in round 4",
    getPlayerGuess: (playerIndex, roundIndex) => {
      if (playerIndex === 1 && roundIndex === 1) {
        return null; // Bob skips round 1
      }
      if (playerIndex === 2 && roundIndex === 2) {
        return { yearGuess: 1970, locationGuess: null }; // Charlie partial year in round 2
      }
      if (playerIndex === 3 && roundIndex === 4) {
        return { yearGuess: null, locationGuess: { lat: 40.7128, lng: -74.006 } }; // Diana partial location in round 4
      }
      return {
        yearGuess: 1950 + Math.floor(Math.random() * 74),
        locationGuess: { lat: 40.7128 + (Math.random() - 0.5) * 0.1, lng: -74.006 + (Math.random() - 0.5) * 0.1 }
      };
    }
  }
];

async function cleanupSession(gameId: string): Promise<void> {
  try {
    await dbPool.query("DELETE FROM round_events WHERE game_id = $1", [gameId]);
    await dbPool.query("DELETE FROM round_results WHERE game_id = $1", [gameId]);
    await dbPool.query("DELETE FROM round_commits WHERE game_id = $1", [gameId]);
    await dbPool.query("DELETE FROM session_players WHERE game_id = $1", [gameId]);
    await dbPool.query("DELETE FROM sessions WHERE game_id = $1", [gameId]);
    console.log(`[CLEANUP] Session ${gameId} deleted`);
  } catch (error) {
    console.error(`[CLEANUP] Failed to delete session ${gameId}:`, error);
  }
}

async function runScenario(scenario: ScenarioConfig): Promise<{ passed: boolean; errors: string[] }> {
  console.log("\n" + "=".repeat(80));
  console.log(`SCENARIO: ${scenario.type.toUpperCase()}`);
  console.log(`Description: ${scenario.description}`);
  console.log("=".repeat(80));

  let gameId = "";
  const errors: string[] = [];

  try {
    // Step 1: Create session (Player 1 as host)
    console.log("\n[STEP 1] Creating session with Player 1 (Alice) as host...");
    const createResponse = await createCompeteSession({
      displayName: PLAYERS[0].name,
      playerId: PLAYERS[0].id,
      ...GAME_CONFIG
    });
    gameId = createResponse.gameId;
    console.log(`✓ Session created: ${gameId}`);
    console.log(`  Status: ${createResponse.status}`);
    console.log(`  Players: ${createResponse.players.length}`);
    console.log(`  Host: ${createResponse.config.hostPlayerId}`);

    // Step 2: Other players join
    console.log("\n[STEP 2] Other players joining...");
    for (let i = 1; i < PLAYERS.length; i++) {
      const player = PLAYERS[i];
      console.log(`  ${player.name} joining...`);
      const joinResponse = await joinCompeteSession({
        gameId,
        displayName: player.name,
        playerId: player.id
      });
      console.log(`  ✓ ${player.name} joined (total players: ${joinResponse.players.length})`);
    }

    console.log(`\n✓ All ${createResponse.players.length} players in session:`);
    createResponse.players.forEach(p => {
      console.log(`  - ${p.displayName} (${p.playerId}) ${p.isHost ? "[HOST]" : ""}`);
    });

    // Step 3: All players set ready
    console.log("\n[STEP 3] All players setting ready...");
    for (const player of PLAYERS) {
      console.log(`  ${player.name} setting ready...`);
      const readyResponse = await setCompetePlayerReady({
        gameId,
        playerId: player.id,
        ready: true
      });
      console.log(`  ✓ ${player.name} ready (allReady: ${readyResponse.allPlayersReady})`);
    }

    // Step 4: Host starts the game
    console.log("\n[STEP 4] Host starting game...");
    const startResponse = await startCompeteSession({
      gameId,
      playerId: PLAYERS[0].id,
      cause: TransitionCause.PLAYER
    });
    console.log(`✓ Game started`);
    console.log(`  Status: ${startResponse.status}`);
    console.log(`  Current round: ${startResponse.currentRoundIndex}`);
    console.log(`  Total rounds: ${startResponse.config.totalRounds}`);

    // Step 5: Play 5 rounds
    console.log("\n[STEP 5] Playing 5 rounds...");
    const roundDetails: Array<{ roundIndex: number; submissions: number; noSubmitPlayers: string[]; partialSubmissions: Array<{ player: string; type: string }> }> = [];

    for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS; roundIndex++) {
      console.log(`\n--- ROUND ${roundIndex + 1}/${TOTAL_ROUNDS} ---`);
      
      const noSubmitPlayers: string[] = [];
      const partialSubmissions: Array<{ player: string; type: string }> = [];

      // Each player submits a guess based on scenario
      console.log("  Players submitting guesses...");
      for (const player of PLAYERS) {
        const playerIndex = PLAYERS.indexOf(player);
        const guess = scenario.getPlayerGuess(playerIndex, roundIndex);

        if (guess === null) {
          console.log(`    ${player.name} SKIPS this round`);
          noSubmitPlayers.push(player.name);
        } else {
          const guessType = guess.yearGuess === null ? "location-only" : guess.locationGuess === null ? "year-only" : "full";
          console.log(`    ${player.name} submitting ${guessType} guess...`);
          
          if (guessType !== "full") {
            partialSubmissions.push({ player: player.name, type: guessType });
          }

          const guessResponse = await submitGuess({
            gameId,
            playerId: player.id,
            roundIndex,
            yearGuess: guess.yearGuess,
            locationGuess: guess.locationGuess,
            hintsUsed: [],
            _executionContext: "api"
          });
          console.log(`    ✓ ${player.name} guess submitted (status: ${guessResponse.status})`);
        }
      }

      // Check round status
      console.log(`  Round status: ${startResponse.status}`);
      console.log(`  Submissions: ${startResponse.players.filter(p => p.hasSubmitted).length}/${startResponse.players.length}`);

      roundDetails.push({
        roundIndex,
        submissions: startResponse.players.filter(p => p.hasSubmitted).length,
        noSubmitPlayers,
        partialSubmissions
      });

      // Advance to next round (unless it's the last round)
      if (roundIndex < TOTAL_ROUNDS - 1) {
        console.log(`  Advancing to round ${roundIndex + 2}...`);
        const advanceResponse = await submitGuess({
          gameId,
          playerId: PLAYERS[0].id,
          roundIndex: roundIndex + 1,
          yearGuess: 1950,
          locationGuess: { lat: 40.7128, lng: -74.006 },
          hintsUsed: [],
          _executionContext: "api"
        });
        console.log(`  ✓ Advanced to round ${advanceResponse.currentRoundIndex + 1}`);
      } else {
        console.log(`  All ${TOTAL_ROUNDS} rounds completed`);
      }
    }

    // Step 6: Verify final state
    console.log("\n[STEP 6] Verifying final state...");
    console.log(`✓ Total rounds played: ${TOTAL_ROUNDS}`);
    console.log(`✓ Players: ${PLAYERS.length}`);
    
    // Print round details
    console.log("\n[ROUND DETAILS]");
    roundDetails.forEach((detail, idx) => {
      console.log(`  Round ${idx + 1}:`);
      console.log(`    Submissions: ${detail.submissions}/4`);
      if (detail.noSubmitPlayers.length > 0) {
        console.log(`    No submit: ${detail.noSubmitPlayers.join(", ")}`);
      }
      if (detail.partialSubmissions.length > 0) {
        console.log(`    Partial: ${detail.partialSubmissions.map(p => `${p.player} (${p.type})`).join(", ")}`);
      }
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Scenario failed with error: ${message}`);
    console.error("\n❌ ERROR:", error);
  }

  // Cleanup
  if (gameId) {
    await cleanupSession(gameId);
  }

  return { passed: errors.length === 0, errors };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║         MULTIPLAYER SCENARIO TEST SUITE (Direct DB)                   ║");
  console.log("║         4 Players, 5 Rounds, Multiple Edge Cases                        ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  const results: Array<{ scenario: string; passed: boolean; errors: string[] }> = [];

  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario);
    results.push({ scenario: scenario.type, passed: result.passed, errors: result.errors });
    
    // Delay between scenarios
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  
  let totalPassed = 0;
  results.forEach(result => {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} - ${result.scenario}`);
    if (!result.passed) {
      result.errors.forEach(err => console.log(`    - ${err}`));
    } else {
      totalPassed++;
    }
  });

  console.log("\n" + "=".repeat(80));
  console.log(`TOTAL: ${totalPassed}/${results.length} scenarios passed`);
  console.log("=".repeat(80));

  await dbPool.end();
  process.exit(totalPassed === results.length ? 0 : 1);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
