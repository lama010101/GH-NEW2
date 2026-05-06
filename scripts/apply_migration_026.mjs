import pg from 'pg';
import fs from 'fs';
import { resolve, dirname, join } from 'path';
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
    console.log('[MIGRATION 026] Connected to database\n');

    const migrationSQL = fs.readFileSync(
      resolve(process.cwd(), 'supabase/migrations/026_add_acc_penalty_to_round_commits.sql'),
      'utf8'
    );

    console.log('[MIGRATION 026] Executing migration...');
    await client.query(migrationSQL);
    console.log('[MIGRATION 026] ✅ Migration completed successfully!\n');

    // Verify column was added
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'round_commits'
        AND column_name = 'acc_penalty'
    `);

    console.log('=== VERIFICATION ===');
    if (verifyResult.rows.length > 0) {
      const row = verifyResult.rows[0];
      console.log(`✓ acc_penalty column added:`);
      console.log(`  - data_type: ${row.data_type}`);
      console.log(`  - column_default: ${row.column_default}`);
    } else {
      console.error('❌ acc_penalty column not found in round_commits');
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
