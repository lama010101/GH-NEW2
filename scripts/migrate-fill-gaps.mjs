#!/usr/bin/env node
/**
 * Gap-Fill Migration Script: Fill missing events from V1 to V2
 * Task ref: MP-CONTENT-FIX-012
 *
 * This script fills the gap of 1,004 missing events that failed to migrate
 * due to Supabase JS client bug with .insert() conflict handling.
 *
 * Uses .upsert() with { ignoreDuplicates: true } to correctly handle
 * duplicate key errors without counting them as failures.
 *
 * Usage:
 *   node scripts/migrate-fill-gaps.mjs --dry-run      # Count only
 *   node scripts/migrate-fill-gaps.mjs               # Full migration
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const V1_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const V1_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';

const V2_URL = process.env.SUPABASE_URL || 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const V2_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

console.log('V2 URL:', V2_URL);

const BATCH_SIZE = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const ERRORS_FILE = 'gap_fill_errors.json';

const DRY_RUN = process.argv.includes('--dry-run');

const v1Supabase = createClient(V1_URL, V1_KEY);
const v2Supabase = createClient(V2_URL, V2_KEY);

const HINT_MAPPINGS = [
  { col: '1_where_continent', tier: 1, type: 'where' },
  { col: '1_when_century', tier: 1, type: 'when' },
  { col: '2_where_landmark', tier: 2, type: 'where', meta: 'km', metaCol: '2_where_landmark_km' },
  { col: '2_when_event', tier: 2, type: 'when', meta: 'years', metaCol: '2_when_event_years' },
  { col: '3_where_region', tier: 3, type: 'where' },
  { col: '3_when_decade', tier: 3, type: 'when' },
  { col: '4_where_landmark', tier: 4, type: 'where', meta: 'km', metaCol: '4_where_landmark_km' },
  { col: '4_when_event', tier: 4, type: 'when', meta: 'years', metaCol: '4_when_event_years' },
  { col: '5_where_clues', tier: 5, type: 'where' },
  { col: '5_when_clues', tier: 5, type: 'when' },
];

// ============================================================================
// UTILS
// ============================================================================

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function retry(fn, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  Retry ${i + 1}/${retries} after error: ${err.message}`);
      await sleep(RETRY_DELAY * (i + 1));
    }
  }
}

// ============================================================================
// MAPPINGS (same as migrate-v1-to-v2.mjs)
// ============================================================================

function buildEvent(row) {
  return {
    id: row.id,
    title: row.title.trim(),
    description: row.description || null,
    event_year: parseInt(row.year, 10),
    category: row.theme || 'uncategorized',
    theme: row.theme || null,
    real_event: row.real_event === 'true' || row.real_event === true,
    celebrity: row.celebrity === true,
    status: 'validated'
  };
}

function buildLocation(row) {
  return {
    event_id: row.id,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    display_name: row.location || row.country || 'Unknown',
    country: row.country || null,
    continent: row['1_where_continent'] || null
  };
}

function buildHints(row) {
  const hints = [];
  for (const m of HINT_MAPPINGS) {
    const content = row[m.col];
    if (!content || (typeof content === 'string' && !content.trim())) continue;

    const meta = {};
    if (m.meta && m.metaCol && row[m.metaCol] != null) {
      meta[m.meta] = row[m.metaCol];
    }

    hints.push({
      event_id: row.id,
      tier: m.tier,
      type: m.type,
      content: typeof content === 'string' ? content.trim() : String(content),
      metadata: Object.keys(meta).length > 0 ? meta : null
    });
  }
  return hints;
}

// ============================================================================
// MAIN
// ============================================================================

async function run() {
  console.log('='.repeat(60));
  console.log('Gap-Fill Migration: V1 → V2');
  console.log('Mode:', DRY_RUN ? 'DRY-RUN' : 'LIVE');
  console.log('='.repeat(60));

  // Step 1: Fetch all V2 event IDs (paginated, 1000 at a time)
  console.log('\nFetching V2 event IDs...');
  const v2EventIds = new Set();
  let v2Offset = 0;
  const V2_BATCH_SIZE = 1000;

  while (true) {
    const { data: v2Batch, error: v2Error } = await v2Supabase
      .from('events')
      .select('id')
      .range(v2Offset, v2Offset + V2_BATCH_SIZE - 1);

    if (v2Error) {
      console.error('Failed to fetch V2 event IDs:', v2Error.message);
      process.exit(1);
    }

    if (!v2Batch || v2Batch.length === 0) break;

    v2Batch.forEach(e => v2EventIds.add(e.id));
    v2Offset += v2Batch.length;

    // Stop if we got fewer than batch size (last page)
    if (v2Batch.length < V2_BATCH_SIZE) break;
  }

  console.log(`V2 events before: ${v2EventIds.size}`);

  // Step 2: Fetch all V1 rows in batches
  console.log('\nFetching V1 rows...');
  const { count: totalCount, error: countErr } = await v1Supabase
    .from('prompts')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error('Failed to get V1 count:', countErr.message);
    process.exit(1);
  }

  console.log(`V1 total rows: ${totalCount}`);

  // Step 3: Process batches and find/insert missing rows
  let processed = 0;
  let missingCount = 0;
  let eventsInserted = 0;
  let locationsInserted = 0;
  let hintsInserted = 0;
  let errors = [];
  let errorCount = 0;

  const startTime = Date.now();

  while (processed < totalCount) {
    const { data: batch, error: fetchErr } = await v1Supabase
      .from('prompts')
      .select('*')
      .range(processed, processed + BATCH_SIZE - 1);

    if (fetchErr) {
      console.error('Fetch error:', fetchErr.message);
      break;
    }

    if (!batch || batch.length === 0) break;

    // Filter rows missing from V2
    const missingRows = batch.filter(row => !v2EventIds.has(row.id));
    missingCount += missingRows.length;

    if (missingRows.length > 0) {
      if (DRY_RUN) {
        // Just count in dry-run mode
        eventsInserted += missingRows.length;
        locationsInserted += missingRows.length;
        hintsInserted += missingRows.length * 10; // Estimate
      } else {
        // Insert in live mode
        for (const row of missingRows) {
          try {
            // Insert event with upsert (ignore duplicates)
            const event = buildEvent(row);
            const { error: eventError } = await retry(() =>
              v2Supabase.from('events').upsert(event, { ignoreDuplicates: true })
            );
            if (eventError) throw eventError;
            eventsInserted++;

            // Insert location with upsert (ignore duplicates)
            const location = buildLocation(row);
            const { error: locError } = await retry(() =>
              v2Supabase.from('locations').upsert(location, { ignoreDuplicates: true })
            );
            if (locError) throw locError;
            locationsInserted++;

            // Insert hints with upsert (ignore duplicates)
            const hints = buildHints(row);
            if (hints.length > 0) {
              const { error: hintError } = await retry(() =>
                v2Supabase.from('hints').upsert(hints, { ignoreDuplicates: true })
              );
              if (hintError) throw hintError;
              hintsInserted += hints.length;
            }
          } catch (err) {
            errorCount++;
            errors.push({ id: row.id, error: err.message });
          }
        }
      }
    }

    processed += batch.length;

    // Progress log every 100 rows
    if (processed % 100 === 0 || processed === totalCount) {
      console.log(`Progress: ${processed}/${totalCount} rows (missing so far: ${missingCount})`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Final summary
  console.log();
  console.log('='.repeat(60));
  console.log('GAP FILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`V2 events before:   ${v2EventIds.size}`);
  console.log(`Missing IDs found:  ${missingCount}`);
  console.log(`events inserted:    ${eventsInserted}`);
  console.log(`locations inserted: ${locationsInserted}`);
  console.log(`hints inserted:     ${hintsInserted}`);
  console.log(`errors:             ${errorCount}`);
  console.log(`duration:           ${duration}s`);
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No data written.');
  } else {
    if (errors.length > 0) {
      fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
      console.log(`\nErrors logged to: ${ERRORS_FILE}`);
    } else if (errorCount === 0) {
      console.log('\n✓ Zero errors');
    }
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
