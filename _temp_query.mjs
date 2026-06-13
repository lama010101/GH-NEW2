import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_CONNECTION });
pool.query("SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'sessions'::regclass;")
  .then(res => console.log(res.rows))
  .catch(console.error)
  .finally(() => pool.end());
