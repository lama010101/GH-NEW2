import pg from 'pg';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env.local file (same pattern as other migration scripts)
function parseEnvironmentFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const entries = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    entries.set(key, value);
  }
  return entries;
}

function resolveEnvironmentValue(key, entries, seen = new Set()) {
  if (seen.has(key)) throw new Error(`Circular environment reference for ${key}`);
  const rawValue = entries.get(key);
  if (!rawValue) throw new Error(`Missing environment value for ${key}`);
  seen.add(key);
  const resolved = rawValue.replace(/\$\{([^}]+)\}/g, (_match, refKey) => resolveEnvironmentValue(refKey, entries, seen));
  seen.delete(key);
  return resolved;
}

const envEntries = parseEnvironmentFile(join(__dirname, "../.env.local"));
const connectionString = resolveEnvironmentValue("SUPABASE_DB_CONNECTION", envEntries);

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('[QUERY 1 — Most recent round_commits with acc_penalty]\n');

    const query1 = await client.query(`
      SELECT game_id, player_id, round_index, hints_used, score,
             acc_penalty, submitted_at
      FROM round_commits
      ORDER BY submitted_at DESC
      LIMIT 4
    `);
    console.log('Results:');
    console.table(query1.rows);

    console.log('\n[QUERY 2 — Most recent round_results with location_score and time_score]\n');

    const query2 = await client.query(`
      SELECT rr.game_id, rr.player_id, rr.round_index, rr.score,
             rr.location_score, rr.time_score, rr.rank
      FROM round_results rr
      ORDER BY rr.game_id, rr.round_index, rr.rank
      LIMIT 10
    `);
    console.log('Results:');
    console.table(query2.rows);

    console.log('\n[QUERY 3 — Verify acc_penalty column default on live DB]\n');

    const query3 = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'round_commits'
      ORDER BY ordinal_position
    `);
    console.log('Results:');
    console.table(query3.rows);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
