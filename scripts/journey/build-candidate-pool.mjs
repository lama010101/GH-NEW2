// HJ-EXEC-CANDIDATEPOOL-PROD-001 — Candidate event pool builder for Historian's Journey
//
// READ-ONLY against public.events; INSERT-ONLY into public.journey_stage_events.
// No DDL. No auto-approval: inserted rows keep approved_by = NULL / approved_at = NULL,
// which is the schema's "not yet approved" state (journey_stage_events has no status column).
//
// Selection adaptation (actual prod schema, inspected via information_schema):
//   - journey_stages has NO year/region/difficulty criteria columns populated
//     (title, theme, learning_objective, difficulty_rating are all NULL on prod).
//     Populated columns: stage_number, min_accuracy_pct (gate threshold), pool_size.
//   - Therefore the content rule comes from the locked spec
//     (docs/HISTORIANS_JOURNEY_SPEC.md): v1 era = Modern World (1900-present), and
//     difficulty ramp = iconicity/fame (spec section 5). The only fame signal on
//     public.events is the `celebrity` boolean.
//   - Base filter: status = 'validated', real_event = true, event_year 1900..present.
//   - Stages 1-5 prefer celebrity events first; stages 6-10 prefer non-celebrity first.
//   - Candidate pool = pool_size * 3 per stage (oversized 3x per spec section 3),
//     deterministic ordering (preference match DESC, event_year ASC, id ASC),
//     distinct per-stage slice via OFFSET (stage_number - 1) * poolLimit.
//   - Idempotent: ON CONFLICT (stage_id, event_id) DO NOTHING.
//
// Reuses the exact .env.local parsing + pg connection pattern of
// scripts/apply_migration_026.mjs (SUPABASE_DB_CONNECTION). No new credentials,
// no new .env entry.

import pg from 'pg';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Same parseEnvironmentFile helper as scripts/apply_migration_026.mjs
function parseEnvironmentFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const entries = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    entries.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }
  return entries;
}

const envEntries = parseEnvironmentFile(join(__dirname, '../../.env.local'));
const connectionString = envEntries.get('SUPABASE_DB_CONNECTION');
if (!connectionString) {
  throw new Error('SUPABASE_DB_CONNECTION missing from .env.local');
}

// Candidate pool = 3x the stage's draw size (spec section 3: oversized 3-5x).
const POOL_MULTIPLIER = 3;

// preferCelebrity is a boolean derived from stage_number, never user input.
// The match expression is one of two constant fragments; everything else is parameterized.
function poolSelectSql(preferCelebrity) {
  const matchExpr = preferCelebrity ? 'e.celebrity' : 'NOT e.celebrity';
  return `
    SELECT e.id
    FROM public.events e
    WHERE e.status = 'validated'
      AND e.real_event = true
      AND e.event_year >= 1900
      AND e.event_year <= EXTRACT(YEAR FROM now())::int
    ORDER BY ${matchExpr} DESC, e.event_year ASC, e.id ASC
    OFFSET $1
    LIMIT $2
  `;
}

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('[build-candidate-pool] connected');

    const stagesResult = await client.query(
      `SELECT id, stage_number, pool_size
       FROM public.journey_stages
       ORDER BY stage_number ASC`
    );
    const stages = stagesResult.rows;
    console.log(`[build-candidate-pool] journey_stages rows: ${stages.length}\n`);

    for (const stage of stages) {
      const poolLimit = stage.pool_size * POOL_MULTIPLIER;
      const preferCelebrity = stage.stage_number <= 5;
      const offset = (stage.stage_number - 1) * poolLimit;

      const poolResult = await client.query(poolSelectSql(preferCelebrity), [offset, poolLimit]);
      const candidatesFound = poolResult.rows.length;
      const eventIds = poolResult.rows.map((row) => row.id);

      const insertResult = await client.query(
        `INSERT INTO public.journey_stage_events (stage_id, event_id)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT (stage_id, event_id) DO NOTHING`,
        [stage.id, eventIds]
      );

      console.log(
        `[stage ${stage.stage_number}] pool_limit=${poolLimit} ` +
          `prefer_celebrity=${preferCelebrity} offset=${offset} ` +
          `candidates_found=${candidatesFound} candidates_inserted=${insertResult.rowCount}`
      );
    }

    console.log('\n=== VERIFICATION: journey_stage_events count per stage ===');
    const verifyResult = await client.query(
      `SELECT s.stage_number, count(jse.id) AS candidate_count
       FROM public.journey_stage_events jse
       JOIN public.journey_stages s ON s.id = jse.stage_id
       GROUP BY s.stage_number
       ORDER BY s.stage_number ASC`
    );
    for (const row of verifyResult.rows) {
      console.log(`stage ${row.stage_number}: ${row.candidate_count}`);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
