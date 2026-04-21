import { Pool } from "pg";

const connectionString = process.env.SUPABASE_DB_CONNECTION;
if (!connectionString) {
  console.error("SUPABASE_DB_CONNECTION environment variable is required");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const result = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('session_players', 'sessions')
    ORDER BY table_name, ordinal_position
  `);

  console.log("=== LIVE DB SCHEMA ===");
  console.table(result.rows);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
