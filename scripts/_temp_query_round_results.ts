import dotenv from "dotenv";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== QUERY: round_results for most recent session ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    const result = await dbPool.query(`
      SELECT 
        player_id,
        score,
        rank,
        location_score,
        time_score,
        distance_km,
        year_diff
      FROM round_results
      WHERE game_id = (
        SELECT game_id FROM sessions ORDER BY created_at DESC LIMIT 1
      )
      ORDER BY round_index, rank
    `);
    
    console.table(result.rows);
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
