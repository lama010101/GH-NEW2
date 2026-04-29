import dotenv from "dotenv";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== QUERY: Event data for game b0d7327c-92ab-4d97-88a9-635659e63dd4 ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    const gameId = "b0d7327c-92ab-4d97-88a9-635659e63dd4";

    // Query 1: Get event IDs from SESSION_CREATED
    console.log("--- QUERY 1: Event IDs from SESSION_CREATED ---");
    const eventIdsResult = await dbPool.query(
      `SELECT payload->'eventIds' AS event_ids
       FROM round_events
       WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
       LIMIT 1`,
      [gameId]
    );
    console.log("Result:", JSON.stringify(eventIdsResult.rows, null, 2));

    if (eventIdsResult.rows.length === 0) {
      console.log("No SESSION_CREATED event found");
      return;
    }

    const eventIds = eventIdsResult.rows[0].event_ids;
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      console.log("No event IDs found in payload");
      return;
    }

    console.log(`Found ${eventIds.length} event IDs\n`);

    // Query 2: Fetch actual event rows
    console.log("--- QUERY 2: Event rows for those IDs ---");
    const placeholders = eventIds.map((_, i) => `$${i + 1}`).join(', ');
    const eventsResult = await dbPool.query(
      `SELECT id, event_year, title FROM events WHERE id IN (${placeholders})`,
      eventIds
    );
    console.log("Result:", JSON.stringify(eventsResult.rows, null, 2));
    console.log(`\nTotal events: ${eventsResult.rows.length}`);

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
