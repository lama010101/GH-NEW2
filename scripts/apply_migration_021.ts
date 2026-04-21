import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";
const { Pool } = pg;
import * as fs from "fs";
import * as path from "path";

// Load SQL from migration file
const migrationPath = path.join(__dirname, "migrations", "021_add_missing_columns.sql");
const sql = fs.readFileSync(migrationPath, "utf-8");

// Get connection string from environment
// Note: SUPABASE_DB_CONNECTION contains ${SUPABASE_DB_POOLER} which dotenv doesn't expand
// So we use SUPABASE_DB_POOLER directly
const connectionString = process.env.SUPABASE_DB_POOLER || process.env.SUPABASE_DB_CONNECTION;
if (!connectionString || connectionString.startsWith("${")) {
  console.error("[FATAL] SUPABASE_DB_POOLER environment variable is required");
  console.error("[DEBUG] SUPABASE_DB_POOLER:", process.env.SUPABASE_DB_POOLER);
  console.error("[DEBUG] SUPABASE_DB_CONNECTION:", process.env.SUPABASE_DB_CONNECTION);
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("[MIGRATION 021] Applying...");
  console.log("[MIGRATION 021] SQL to execute:");
  console.log(sql);
  console.log("");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("[MIGRATION 021] ✓ Applied successfully");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // Verify columns exist
  console.log("\n[VERIFY] Checking information_schema.columns...");
  const result = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('session_players', 'sessions')
      AND column_name IN ('display_name', 'seed')
    ORDER BY table_name, ordinal_position
  `);

  console.log("\n[VERIFY] Query results:");
  console.table(result.rows);

  // Check for any issues
  for (const row of result.rows) {
    if (row.is_nullable === 'YES') {
      console.error(`[ERROR] ${row.table_name}.${row.column_name} is nullable (should be NO)`);
    }
    if (row.column_default === null) {
      console.error(`[ERROR] ${row.table_name}.${row.column_name} has no default (should have one)`);
    }
  }

  await pool.end();
  console.log("\n[COMPLETE] Migration 021 finished");
}

main().catch(err => {
  console.error("[FATAL]", err);
  process.exit(1);
});
