import dotenv from "dotenv";
import { getRoundResults } from "../src/server/sessionCore";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== DIAGNOSTIC SCRIPT: round_results table and getRoundResults ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    const gameId = "b0d7327c-92ab-4d97-88a9-635659e63dd4";

    // Step c: Query round_results table
    console.log("--- STEP C: round_results table ---");
    const roundResultsResult = await dbPool.query(
      `SELECT * FROM round_results WHERE game_id = $1 ORDER BY round_index ASC, player_id ASC`,
      [gameId]
    );
    console.log("Round results rows:", JSON.stringify(roundResultsResult.rows, null, 2));
    console.log(`Total rows: ${roundResultsResult.rows.length}\n`);

    // Step d: Call getRoundResults for roundIndex 0
    console.log("--- STEP D: getRoundResults(roundIndex=0) ---");
    const results0 = await getRoundResults(gameId, 0);
    console.log("Return value:", JSON.stringify(results0, null, 2));
    console.log(`Array length: ${results0.length}\n`);

    // Step e: Call getRoundResults for roundIndex 1
    console.log("--- STEP E: getRoundResults(roundIndex=1) ---");
    const results1 = await getRoundResults(gameId, 1);
    console.log("Return value:", JSON.stringify(results1, null, 2));
    console.log(`Array length: ${results1.length}\n`);

    // Step f: Log the SQL query from getRoundResults source
    console.log("--- STEP F: SQL query from getRoundResults source ---");
    console.log("Query string from src/server/sessionCore.ts:");
    console.log(`
      SELECT
        rr.player_id,
        rr.score,
        rr.rank,
        rr.accuracy
      FROM round_results rr
      WHERE rr.game_id = $1 AND rr.round_index = $2
      ORDER BY rr.rank ASC
    `);

    console.log("\n=== DIAGNOSTIC COMPLETE ===");

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
