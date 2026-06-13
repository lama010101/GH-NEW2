import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_CONNECTION });
pool.query("SELECT COUNT(*) FROM sessions")
  .then(res => console.log("Total sessions:", res.rows[0].count))
  .catch(console.error)
  .finally(() => pool.end());
