import dotenv from "dotenv";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== AUDIT: Event Content Completeness ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    // STEP 1: Total event count
    console.log("--- STEP 1: Total validated events ---");
    const step1Result = await dbPool.query<{ count: string }>(
      "SELECT COUNT(*) FROM events WHERE status = 'validated'"
    );
    const step1Count = parseInt(step1Result.rows[0].count, 10);
    console.log(`Result: ${step1Count}\n`);

    // STEP 2: Events missing an image entirely
    console.log("--- STEP 2: Events missing images entirely ---");
    const step2Result = await dbPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM events e
       WHERE e.status = 'validated'
       AND NOT EXISTS (SELECT 1 FROM images i WHERE i.event_id = e.id)`
    );
    const step2Count = parseInt(step2Result.rows[0].count, 10);
    console.log(`Result: ${step2Count}\n`);

    // STEP 3: Events with images row but url IS NULL or empty string
    console.log("--- STEP 3: Events with images row but null/empty url ---");
    const step3Result = await dbPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM events e
       WHERE e.status = 'validated'
       AND EXISTS (SELECT 1 FROM images i WHERE i.event_id = e.id AND (i.url IS NULL OR i.url = ''))`
    );
    const step3Count = parseInt(step3Result.rows[0].count, 10);
    console.log(`Result: ${step3Count}\n`);

    // STEP 4: Events missing a location entirely
    console.log("--- STEP 4: Events missing location entirely ---");
    const step4Result = await dbPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM events e
       WHERE e.status = 'validated'
       AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.event_id = e.id)`
    );
    const step4Count = parseInt(step4Result.rows[0].count, 10);
    console.log(`Result: ${step4Count}\n`);

    // STEP 5: Events with location row but latitude OR longitude IS NULL
    console.log("--- STEP 5: Events with location row but null lat/lng ---");
    const step5Result = await dbPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM events e
       WHERE e.status = 'validated'
       AND EXISTS (SELECT 1 FROM locations l WHERE l.event_id = e.id AND (l.latitude IS NULL OR l.longitude IS NULL))`
    );
    const step5Count = parseInt(step5Result.rows[0].count, 10);
    console.log(`Result: ${step5Count}\n`);

    // STEP 6: Events missing hints entirely
    console.log("--- STEP 6: Events missing hints entirely ---");
    const step6Result = await dbPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM events e
       WHERE e.status = 'validated'
       AND NOT EXISTS (SELECT 1 FROM hints h WHERE h.event_id = e.id)`
    );
    const step6Count = parseInt(step6Result.rows[0].count, 10);
    console.log(`Result: ${step6Count}\n`);

    // STEP 7: Events with ALL three gaps simultaneously
    console.log("--- STEP 7: Events with all three gaps (image, location, hints) ---");
    const step7Result = await dbPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM events e
       WHERE e.status = 'validated'
       AND NOT EXISTS (SELECT 1 FROM images i WHERE i.event_id = e.id AND i.url IS NOT NULL AND i.url != '')
       AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.event_id = e.id AND l.latitude IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM hints h WHERE h.event_id = e.id)`
    );
    const step7Count = parseInt(step7Result.rows[0].count, 10);
    console.log(`Result: ${step7Count}\n`);

    // STEP 8: Sample of 5 event IDs with missing image url
    console.log("--- STEP 8: Sample 5 event IDs with missing image url ---");
    const step8Result = await dbPool.query<{ id: string; title: string; event_year: number }>(
      `SELECT e.id, e.title, e.event_year
       FROM events e
       WHERE e.status = 'validated'
       AND NOT EXISTS (SELECT 1 FROM images i WHERE i.event_id = e.id AND i.url IS NOT NULL AND i.url != '')
       LIMIT 5`
    );
    console.log("Result:", JSON.stringify(step8Result.rows, null, 2));
    console.log();

    // STEP 9: Check all non-validated event statuses
    console.log("--- STEP 9: All event statuses ---");
    const step9Result = await dbPool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) FROM events GROUP BY status ORDER BY COUNT(*) DESC`
    );
    console.log("Result:", JSON.stringify(step9Result.rows, null, 2));
    console.log();

    // FINAL SUMMARY
    console.log("=== SUMMARY ===");
    console.log(`STEP 1 - Total validated events: ${step1Count}`);
    console.log(`STEP 2 - Missing images entirely: ${step2Count}`);
    console.log(`STEP 3 - Images row but null/empty url: ${step3Count}`);
    console.log(`STEP 4 - Missing location entirely: ${step4Count}`);
    console.log(`STEP 5 - Location row but null lat/lng: ${step5Count}`);
    console.log(`STEP 6 - Missing hints entirely: ${step6Count}`);
    console.log(`STEP 7 - All three gaps (image, location, hints): ${step7Count}`);
    console.log(`STEP 8 - Sample 5 events with missing image url: ${step8Result.rows.length} rows`);
    console.log(`STEP 9 - Event status distribution: ${step9Result.rows.length} statuses`);

  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error(error);
    if (error instanceof Error) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
