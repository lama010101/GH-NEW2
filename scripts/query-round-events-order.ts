import dotenv from "dotenv";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== QUERY: round_events by insertion order for game b0d7327c-92ab-4d97-88a9-635659e63dd4 ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    const gameId = "b0d7327c-92ab-4d97-88a9-635659e63dd4";

    const result = await dbPool.query(
      `SELECT id, event_type, round_index, created_at, payload
       FROM round_events
       WHERE game_id = $1
       ORDER BY id ASC`,
      [gameId]
    );

    console.log("Result:", JSON.stringify(result.rows, null, 2));
    console.log(`\nTotal events: ${result.rows.length}`);

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
