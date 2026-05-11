import { verifyFullReplay, dbPool } from "../src/server/db";
import { fetchEventById } from "../src/server/events";

// 5 richest production sessions by event count
const GAME_IDS = [
  "700581f0-11dd-4c6f-b528-fd3bd9641890", // 27 events
  "fd7957a8-48bb-4cdc-937c-5ff84d1a7318", // 26 events
  "fc8e9a12-3963-47a6-9e79-f3c415c213d1", // 26 events
  "fbae5e40-355f-43ee-9375-edf43038dc77", // 23 events
  "8848dd1e-c35a-434c-a4cb-74cefa7ccefd", // 22 events
];

async function verifyGame(gameId: string): Promise<boolean> {
  try {
    console.log(`\n[VERIFY] Game: ${gameId}`);

    // Load all round_commits for this game
    const commitsResult = await dbPool.query<{
      round_index: number;
    }>(
      `SELECT DISTINCT round_index
       FROM round_commits
       WHERE game_id = $1
       ORDER BY round_index ASC`,
      [gameId]
    );

    if (commitsResult.rows.length === 0) {
      console.log(`  [SKIP] No round_commits found`);
      return true;
    }

    console.log(`  [INFO] Found ${commitsResult.rows.length} rounds`);

    // For each round, load the event and verify
    for (const row of commitsResult.rows) {
      const roundIndex = row.round_index;

      // Load ROUND_STARTED event to get eventId
      const roundStartedResult = await dbPool.query<{
        payload: Record<string, unknown>;
      }>(
        `SELECT payload
         FROM round_events
         WHERE game_id = $1 AND round_index = $2 AND event_type = 'ROUND_STARTED'
         ORDER BY id ASC
         LIMIT 1`,
        [gameId, roundIndex]
      );

      if (roundStartedResult.rows.length === 0) {
        console.log(`  [SKIP] Round ${roundIndex}: No ROUND_STARTED event found`);
        continue;
      }

      const eventId = roundStartedResult.rows[0].payload.eventId as string;
      if (!eventId) {
        console.log(`  [SKIP] Round ${roundIndex}: No eventId in ROUND_STARTED payload`);
        continue;
      }

      // Load EventRecord
      const event = await fetchEventById(eventId);
      if (!event) {
        console.log(`  [SKIP] Round ${roundIndex}: Event ${eventId} not found`);
        continue;
      }

      // Verify full replay
      const result = await verifyFullReplay(gameId, roundIndex, event);

      if (result.success) {
        console.log(`  [PASS] Round ${roundIndex}: ${result.playerResults.length} players verified`);
      } else {
        console.log(`  [FAIL] Round ${roundIndex}: ${result.error}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.log(`  [FAIL] Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log("=== Production Replay Verification ===");
  console.log(`Verifying ${GAME_IDS.length} richest production sessions\n`);

  let passCount = 0;
  let failCount = 0;

  for (const gameId of GAME_IDS) {
    const passed = await verifyGame(gameId);
    if (passed) {
      passCount++;
      console.log(`[GAME] ${gameId}: PASS`);
    } else {
      failCount++;
      console.log(`[GAME] ${gameId}: FAIL`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);

  await dbPool.end();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
