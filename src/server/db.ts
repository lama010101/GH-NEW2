import { Pool } from "pg";

declare global {
  var __guessHistoryDbPool__: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.SUPABASE_DB_CONNECTION;

  if (!connectionString) {
    throw new Error("SUPABASE_DB_CONNECTION is required");
  }

  return new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

export const dbPool = globalThis.__guessHistoryDbPool__ ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.__guessHistoryDbPool__ = dbPool;
}
