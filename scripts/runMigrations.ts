import { config } from "dotenv";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";

config({ path: ".env.local" });

const conn = process.env.SUPABASE_DB_POOLER || process.env.SUPABASE_DB_CONNECTION || "";
if (!conn || conn.startsWith("${")) {
  console.error("❌ No valid database connection string found");
  process.exit(1);
}
process.env.SUPABASE_DB_CONNECTION = conn;

const MIGRATIONS_DIR = resolve(process.cwd(), "scripts", "migrations");

async function applyMigration(
  dbPool: { connect(): Promise<{ query: (...args: unknown[]) => Promise<unknown>; release(): void }> },
  name: string,
  sql: string
): Promise<boolean> {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`✅ Applied: ${name}`);
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    const msg = error instanceof Error ? error.message : "";
    // Already applied / exists errors are OK
    if (msg.includes("already exists") || msg.includes("duplicate key") || msg.includes("relation") && msg.includes("already")) {
      console.log(`⏭️  Skipped (already exists): ${name}`);
      return false;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations(): Promise<void> {
  const { dbPool } = await import("@/server/db");
  console.log("🔍 Checking for pending migrations...\n");

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let appliedCount = 0;

  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
    const applied = await applyMigration(dbPool as unknown as { connect(): Promise<{ query: (...args: unknown[]) => Promise<unknown>; release(): void }> }, file, sql);
    if (applied) appliedCount++;
  }

  console.log(appliedCount === 0 ? "\n✨ All migrations already up to date." : `\n✨ Applied ${appliedCount} new migration(s).`);
  await dbPool.end();
}

runMigrations().catch((error) => {
  console.error("❌ Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
