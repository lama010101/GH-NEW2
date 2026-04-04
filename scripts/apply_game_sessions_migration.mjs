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
  const sql = fs.readFileSync("scripts/migrations/001_create_game_sessions.sql", "utf8");
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    await client.query(sql);
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_sessions'"
    );

    if (result.rows.length !== 1) {
      throw new Error("game_sessions table was not created");
    }

    console.log("game_sessions ready");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
