#!/usr/bin/env node
/**
 * Apply Migration 023: Prevent Duplicate ROUND_STARTED Events
 * TASK: BUG-FIX-005
 */

import { Pool } from "pg";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env.local file (same pattern as other migration scripts)
function parseEnvironmentFile(filePath) {
  const content = readFileSync(filePath, "utf8");
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

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const migrationSQL = readFileSync(
  join(__dirname, "../scripts/migrations/023_prevent_duplicate_round_started.sql"),
  "utf-8"
);

async function applyMigration() {
  const client = await pool.connect();
  try {
    console.log("[MIGRATION-023] Applying: Prevent Duplicate ROUND_STARTED Events");

    // Step 1: Find and report duplicate ROUND_STARTED events
    const dupes = await client.query(`
      SELECT game_id, round_index, COUNT(*) as count
      FROM round_events
      WHERE event_type = 'ROUND_STARTED'
      GROUP BY game_id, round_index
      HAVING COUNT(*) > 1
    `);

    if (dupes.rows.length > 0) {
      console.log(`[MIGRATION-023] Found ${dupes.rows.length} game/round combinations with duplicate ROUND_STARTED events`);
      for (const row of dupes.rows) {
        console.log(`  - Game ${row.game_id}, Round ${row.round_index}: ${row.count} duplicates`);
      }

      // Step 2: Clean up duplicates - keep only the earliest ROUND_STARTED per game/round
      console.log("[MIGRATION-023] Cleaning up duplicates (keeping earliest)...");
      const cleanupResult = await client.query(`
        DELETE FROM round_events
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (PARTITION BY game_id, round_index ORDER BY created_at ASC, id ASC) as rn
            FROM round_events
            WHERE event_type = 'ROUND_STARTED'
          ) sub
          WHERE rn > 1
        )
      `);
      console.log(`[MIGRATION-023] Deleted ${cleanupResult.rowCount} duplicate ROUND_STARTED events`);
    }

    // Step 3: Create the unique index
    await client.query(migrationSQL);
    console.log("[MIGRATION-023] SUCCESS: Partial unique index created");
  } catch (err) {
    if (err.message?.includes("already exists")) {
      console.log("[MIGRATION-023] SKIPPED: Index already exists (idempotent)");
    } else {
      console.error("[MIGRATION-023] FAILED:", err.message);
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();
