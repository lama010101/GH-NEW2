import dotenv from "dotenv";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== QUERY: round_events and round_results for game b0d7327c-92ab-4d97-88a9-635659e63dd4 ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    const gameId = "b0d7327c-92ab-4d97-88a9-635659e63dd4";

    // Query 1: Check round_events
    console.log("--- QUERY 1: round_events ---");
    const eventsResult = await dbPool.query(
      `SELECT event_type, round_index, payload, created_at
       FROM round_events
       WHERE game_id = $1
       ORDER BY id ASC`,
      [gameId]
    );
    console.log("Result:", JSON.stringify(eventsResult.rows, null, 2));
    console.log(`Total events: ${eventsResult.rows.length}\n`);

    // Query 2: Check round_results
    console.log("--- QUERY 2: round_results ---");
    const resultsResult = await dbPool.query(
      `SELECT round_index, player_id, score, location_score, time_score,
              distance_km, year_diff
       FROM round_results
       WHERE game_id = $1
       ORDER BY round_index, player_id`,
      [gameId]
    );
    console.log("Result:", JSON.stringify(resultsResult.rows, null, 2));
    console.log(`Total results: ${resultsResult.rows.length}`);

  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error(error);
    if (error instanceof Error) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
