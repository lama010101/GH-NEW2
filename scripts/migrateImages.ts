import dotenv from "dotenv";

dotenv.config({ path: '.env.local' });

// DB1 credentials from .env.local
const DB1_URL = process.env.LEGACY_DB1_URL;
const DB1_SERVICE_ROLE_KEY = process.env.LEGACY_DB1_SERVICE_ROLE_KEY;

if (!DB1_URL || !DB1_SERVICE_ROLE_KEY) {
  console.error("❌ LEGACY_DB1_URL or LEGACY_DB1_SERVICE_ROLE_KEY not set in .env.local");
  process.exit(1);
}

// DB2 credentials from .env.local
const DB2_URL = "https://gzvixlvkwjsrtmtybtkf.supabase.co";
const DB2_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DB2_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is not set in .env.local");
  process.exit(1);
}

interface Db1ImageRow {
  prompt_id: string;
  firebase_url: string;
}

// STEP 1: Fetch firebase_url rows from DB1 via REST
async function fetchDb1FirebaseUrls(): Promise<Db1ImageRow[]> {
  console.log("--- STEP 1: Fetching firebase_url rows from DB1 ---");

  const batchSize = 1000;
  let offset = 0;
  const allRows: Db1ImageRow[] = [];

  while (true) {
    const url = new URL(`${DB1_URL}/rest/v1/images`);
    url.searchParams.append("select", "prompt_id,firebase_url");
    url.searchParams.append("firebase_url", "not.is.null");
    url.searchParams.append("prompt_id", "not.is.null");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: DB1_SERVICE_ROLE_KEY as string,
        Authorization: `Bearer ${DB1_SERVICE_ROLE_KEY}`,
        Range: `${offset}-${offset + batchSize - 1}`,
        "Range-Unit": "items"
      }
    });

    if (!response.ok) {
      throw new Error(`DB1 fetch failed: ${response.status} ${response.statusText} - ${await response.text()}`);
    }

    const rows: Db1ImageRow[] = await response.json();

    if (rows.length === 0) break;

    allRows.push(...rows);
    console.log(`Fetched batch offset=${offset}: ${rows.length} rows, total=${allRows.length}`);
    offset += batchSize;

    if (rows.length < batchSize) break;
  }

  console.log(`Total DB1 firebase rows fetched: ${allRows.length}\n`);
  return allRows;
}

// STEP 2: Update DB2 images.url where event_id matches DB1 prompt_id
async function updateDb2ImageUrls(db1Rows: Db1ImageRow[]): Promise<{ updated: number; errors: number }> {
  console.log("--- STEP 2: Updating DB2 image URLs ---");

  const batchSize = 50;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < db1Rows.length; i += batchSize) {
    const batch = db1Rows.slice(i, i + batchSize);

    const updatePromises = batch.map(async (row) => {
      const url = new URL(`${DB2_URL}/rest/v1/images`);
      url.searchParams.append("event_id", `eq.${row.prompt_id}`);

      try {
        const response = await fetch(url.toString(), {
          method: "PATCH",
          headers: {
            apikey: DB2_SERVICE_ROLE_KEY!,
            Authorization: `Bearer ${DB2_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ url: row.firebase_url })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`PATCH failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return { success: true };
      } catch (error) {
        console.error(`❌ Error updating event_id=${row.prompt_id}:`, error);
        return { success: false };
      }
    });

    const results = await Promise.all(updatePromises);
    const batchUpdated = results.filter(r => r.success).length;
    const batchErrors = results.filter(r => !r.success).length;

    updated += batchUpdated;
    errors += batchErrors;

    console.log(`✅ Batch ${i}-${i + batch.length - 1}: ${batchUpdated} updated, ${batchErrors} errors`);
  }

  console.log(`\nTotal DB2 rows updated: ${updated}`);
  console.log(`Total errors: ${errors}\n`);
  return { updated, errors };
}

async function main() {
  console.log("=== IMAGE MIGRATION: UPDATE DB2 URLs FROM DB1 FIREBASE ===\n");

  try {
    // STEP 1: Fetch firebase_url rows from DB1
    const db1Rows = await fetchDb1FirebaseUrls();

    // STEP 2: Update DB2 images.url
    const { updated, errors } = await updateDb2ImageUrls(db1Rows);

    // FINAL SUMMARY
    console.log("=== SUMMARY ===");
    console.log(`Total DB1 firebase rows fetched: ${db1Rows.length}`);
    console.log(`Total DB2 rows updated: ${updated}`);
    console.log(`Total errors: ${errors}`);

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
