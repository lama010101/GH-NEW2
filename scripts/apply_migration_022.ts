import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";
const { Pool } = pg;
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationPath = path.join(__dirname, "migrations", "022_add_session_players_ready_host.sql");
const sql = fs.readFileSync(migrationPath, "utf-8");

const connectionString = process.env.SUPABASE_DB_POOLER || process.env.SUPABASE_DB_CONNECTION;
if (!connectionString || connectionString.startsWith("${")) {
  console.error("[FATAL] SUPABASE_DB_POOLER environment variable is required");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("[MIGRATION 022] Applying...");
  console.log(sql);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("[MIGRATION 022] ✓ Applied successfully");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  console.log("\n[VERIFY] Checking information_schema.columns...");
  const colResult = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'session_players'
      AND column_name IN ('ready', 'is_host')
    ORDER BY column_name
  `);
  console.table(colResult.rows);

  console.log("\n[VERIFY] Checking unique partial index...");
  const idxResult = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'session_players'
      AND indexname = 'uq_session_players_one_host_per_game'
  `);
  console.table(idxResult.rows);

  for (const row of colResult.rows) {
    if (row.is_nullable === "YES") {
      console.error(`[ERROR] ${row.column_name} is nullable (should be NO)`);
    }
    if (row.column_default === null) {
      console.error(`[ERROR] ${row.column_name} has no default`);
    }
  }

  if (idxResult.rows.length === 0) {
    console.error("[ERROR] uq_session_players_one_host_per_game missing");
  }

  await pool.end();
  console.log("\n[COMPLETE] Migration 022 finished");
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
