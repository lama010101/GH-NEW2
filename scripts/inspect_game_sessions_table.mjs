import fs from "node:fs";
import pg from "pg";

const { Client } = pg;

function parseEnvironmentFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const entries = new Map();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    entries.set(key, value);
  }

  return entries;
}

function resolveEnvironmentValue(key, entries, seen = new Set()) {
  if (seen.has(key)) {
    throw new Error(`Circular environment reference for ${key}`);
  }

  const rawValue = entries.get(key);
  if (!rawValue) {
    throw new Error(`Missing environment value for ${key}`);
  }

  seen.add(key);
  const resolved = rawValue.replace(/\$\{([^}]+)\}/g, (_match, referencedKey) => resolveEnvironmentValue(referencedKey, entries, seen));
  seen.delete(key);
  return resolved;
}

async function main() {
  const envEntries = parseEnvironmentFile(".env.local");
  const connectionString = resolveEnvironmentValue("SUPABASE_DB_CONNECTION", envEntries);
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    const tableResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_sessions'"
    );
    console.log(JSON.stringify(tableResult.rows, null, 2));

    const columnResult = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'game_sessions'
       ORDER BY ordinal_position`
    );
    console.log(JSON.stringify(columnResult.rows, null, 2));

    const indexResult = await client.query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'game_sessions'
       ORDER BY indexname`
    );
    console.log(JSON.stringify(indexResult.rows, null, 2));

    const countResult = await client.query("SELECT COUNT(*)::text AS count FROM game_sessions");
    console.log(JSON.stringify(countResult.rows, null, 2));

    const foreignKeyResult = await client.query(
      `SELECT tc.table_name, kcu.column_name, ccu.column_name AS referenced_column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND ccu.table_schema = 'public'
         AND ccu.table_name = 'game_sessions'
       ORDER BY tc.table_name, kcu.column_name`
    );
    console.log(JSON.stringify(foreignKeyResult.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
