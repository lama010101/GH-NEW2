import dotenv from "dotenv";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== Distance Statistics Query ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    const query = `
      SELECT 
        ROUND(AVG(distance_km)::numeric, 1) as avg_distance_km,
        ROUND(MIN(distance_km)::numeric, 1) as min_distance_km,
        ROUND(MAX(distance_km)::numeric, 1) as max_distance_km,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY distance_km) as median_km,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY distance_km) as p25_km,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY distance_km) as p75_km
      FROM round_results
      WHERE distance_km IS NOT NULL
    `;

    console.log("Executing query:");
    console.log(query);
    console.log();

    const result = await dbPool.query(query);

    if (result.rows.length === 0) {
      console.log("No results found (round_results table is empty or all distance_km are NULL)");
    } else {
      console.log("Results:");
      console.log(JSON.stringify(result.rows[0], null, 2));
      console.log();

      const row = result.rows[0];
      console.log("Summary:");
      console.log(`  Average distance: ${row.avg_distance_km} km`);
      console.log(`  Minimum distance: ${row.min_distance_km} km`);
      console.log(`  Maximum distance: ${row.max_distance_km} km`);
      console.log(`  Median distance: ${row.median_km} km`);
      console.log(`  25th percentile: ${row.p25_km} km`);
      console.log(`  75th percentile: ${row.p75_km} km`);
    }

    console.log("\n=== COMPLETE ===");

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
