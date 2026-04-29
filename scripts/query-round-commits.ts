import dotenv from "dotenv";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== QUERY: round_commits for game b0d7327c-92ab-4d97-88a9-635659e63dd4 ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    const gameId = "b0d7327c-92ab-4d97-88a9-635659e63dd4";

    const result = await dbPool.query(
      `SELECT player_id, round_index, score, year_guess, location_lat, location_lng
       FROM round_commits
       WHERE game_id = $1
       ORDER BY round_index, player_id`,
      [gameId]
    );

    console.log("Query result:");
    console.log(JSON.stringify(result.rows, null, 2));
    console.log(`\nTotal rows: ${result.rows.length}`);

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
