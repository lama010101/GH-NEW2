#!/usr/bin/env node
/**
 * Migration Script: V1 (Legacy) to V2 (New Content Schema) - PostgreSQL Direct
 * Task ref: MP-CONTENT-MIG-007
 *
 * Uses direct PostgreSQL connections for speed.
 * Supports resume via migration_progress.json
 * Batch inserts for performance
 *
 * Usage:
 *   node scripts/migrate-v1-to-v2-pg.mjs --dry-run
 *   node scripts/migrate-v1-to-v2-pg.mjs              # Live migration
 *   node scripts/migrate-v1-to-v2-pg.mjs --resume     # Resume from last checkpoint
 */

import pg from 'pg';
import fs from 'fs';
const { Pool } = pg;

// ============================================================================
// CONFIGURATION
// ============================================================================

const V1_URL = 'postgresql://postgres:N7wmBdgHPGrEeiuT@db.jghesmrwhegaotbztrhr.supabase.co:5432/postgres';
const V2_URL = process.env.SUPABASE_DB_CONNECTION || 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

const BATCH_SIZE = 500;
const INSERT_BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes('--dry-run');
const RESUME = process.argv.includes('--resume');
const PROGRESS_FILE = 'migration_progress.json';
const ERRORS_FILE = 'migration_errors.json';

// V1 columns that contain image URLs (in priority order)
const IMAGE_COLUMNS = ['firebase_desktop', 'firebase_url', 'firebase_image_url', 'image_url'];

// ============================================================================
// DATABASE POOLS
// ============================================================================

const v1Pool = new Pool({
  connectionString: V1_URL,
  ssl: { rejectUnauthorized: false }
});

const v2Pool = new Pool({
  connectionString: V2_URL,
  ssl: { rejectUnauthorized: false }
});

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { lastProcessedId: null, count: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadErrors() {
  try {
    if (fs.existsSync(ERRORS_FILE)) {
      return JSON.parse(fs.readFileSync(ERRORS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveErrors(errors) {
  fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
}

// ============================================================================
// V1 FETCH
// ============================================================================

async function* fetchV1Batches(startFromId = null) {
  let lastId = startFromId;
  let hasMore = true;

  while (hasMore) {
    const query = lastId
      ? `SELECT * FROM prompts WHERE id > $1 ORDER BY id LIMIT $2`
      : `SELECT * FROM prompts ORDER BY id LIMIT $1`;
    const params = lastId ? [lastId, BATCH_SIZE] : [BATCH_SIZE];

    const result = await v1Pool.query(query, params);

    if (result.rows.length === 0) {
      hasMore = false;
      break;
    }

    yield result.rows;
    lastId = result.rows[result.rows.length - 1].id;
  }
}

async function countV1Total() {
  const result = await v1Pool.query('SELECT COUNT(*) as cnt FROM prompts');
  return parseInt(result.rows[0].cnt, 10);
}

// ============================================================================
// VALIDATION
// ============================================================================

function isValidNumber(val) {
  if (val === null || val === undefined) return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num);
}

function isValidString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

function isQualifyingRow(row) {
  return (
    isValidNumber(row.latitude) &&
    isValidNumber(row.longitude) &&
    isValidNumber(row.year) &&
    isValidString(row.title)
  );
}

// ============================================================================
// V2 INSERT OPERATIONS (Batch)
// ============================================================================

function buildEventsInsert(rows) {
  const values = [];
  const params = [];
  let paramIdx = 1;

  for (const row of rows) {
    values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8})`);
    params.push(
      row.id,
      row.title.trim(),
      row.description || null,
      parseInt(row.year, 10),
      row.theme || 'uncategorized',
      row.theme || null,
      row.real_event === 'true' || row.real_event === true,
      row.celebrity === true,
      'validated'
    );
    paramIdx += 9;
  }

  return {
    sql: `INSERT INTO events (id, title, description, event_year, category, theme, real_event, celebrity, status)
          VALUES ${values.join(', ')}
          ON CONFLICT (id) DO NOTHING`,
    params
  };
}

function buildLocationsInsert(rows) {
  const values = [];
  const params = [];
  let paramIdx = 1;

  for (const row of rows) {
    values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
    params.push(
      row.id,
      parseFloat(row.latitude),
      parseFloat(row.longitude),
      row.location || row.country || 'Unknown',
      row.country || null,
      row['1_where_continent'] || null
    );
    paramIdx += 6;
  }

  return {
    sql: `INSERT INTO locations (event_id, latitude, longitude, display_name, country, continent)
          VALUES ${values.join(', ')}
          ON CONFLICT (event_id) DO NOTHING`,
    params
  };
}

function buildImagesInsert(rows) {
  const imagesToInsert = [];

  for (const row of rows) {
    // Find first available image URL
    let imageUrl = null;
    for (const col of IMAGE_COLUMNS) {
      if (row[col]) {
        imageUrl = row[col];
        break;
      }
    }

    if (!imageUrl) continue;

    imagesToInsert.push({
      event_id: row.id,
      url: imageUrl,
      ai_prompt: row.prompt || null,
      negative_prompt: row.negative_prompt || null,
      ai_generated: row.ai_generated === true
    });
  }

  if (imagesToInsert.length === 0) return null;

  const values = [];
  const params = [];
  let paramIdx = 1;

  for (const img of imagesToInsert) {
    values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`);
    params.push(img.event_id, img.url, img.ai_prompt, img.negative_prompt, img.ai_generated);
    paramIdx += 5;
  }

  return {
    sql: `INSERT INTO images (event_id, url, ai_prompt, negative_prompt, ai_generated)
          VALUES ${values.join(', ')}
          ON CONFLICT DO NOTHING`,
    params,
    count: imagesToInsert.length
  };
}

function buildHintsInsert(rows) {
  const hintsToInsert = [];
  const HINT_MAPPINGS = [
    { column: '1_where_continent', tier: 1, type: 'where' },
    { column: '1_when_century', tier: 1, type: 'when' },
    { column: '2_where_landmark', tier: 2, type: 'where', metaKey: 'km', metaSource: '2_where_landmark_km' },
    { column: '2_when_event', tier: 2, type: 'when', metaKey: 'years', metaSource: '2_when_event_years' },
    { column: '3_where_region', tier: 3, type: 'where' },
    { column: '3_when_decade', tier: 3, type: 'when' },
    { column: '4_where_landmark', tier: 4, type: 'where', metaKey: 'km', metaSource: '4_where_landmark_km' },
    { column: '4_when_event', tier: 4, type: 'when', metaKey: 'years', metaSource: '4_when_event_years' },
    { column: '5_where_clues', tier: 5, type: 'where' },
    { column: '5_when_clues', tier: 5, type: 'when' },
  ];

  for (const row of rows) {
    for (const mapping of HINT_MAPPINGS) {
      const content = row[mapping.column];
      if (!content || (typeof content === 'string' && content.trim().length === 0)) {
        continue;
      }

      const metadata = {};
      if (mapping.metaKey && mapping.metaSource) {
        const metaValue = row[mapping.metaSource];
        if (metaValue !== null && metaValue !== undefined) {
          metadata[mapping.metaKey] = metaValue;
        }
      }

      hintsToInsert.push({
        event_id: row.id,
        tier: mapping.tier,
        type: mapping.type,
        content: typeof content === 'string' ? content.trim() : String(content),
        metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
      });
    }
  }

  if (hintsToInsert.length === 0) return null;

  const values = [];
  const params = [];
  let paramIdx = 1;

  for (const hint of hintsToInsert) {
    values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`);
    params.push(hint.event_id, hint.tier, hint.type, hint.content, hint.metadata);
    paramIdx += 5;
  }

  return {
    sql: `INSERT INTO hints (event_id, tier, type, content, metadata)
          VALUES ${values.join(', ')}
          ON CONFLICT DO NOTHING`,
    params,
    count: hintsToInsert.length
  };
}

// ============================================================================
// MAIN MIGRATION
// ============================================================================

async function runMigration() {
  console.log('='.repeat(70));
  console.log('V1 to V2 Content Migration - PostgreSQL Direct');
  console.log('Mode:', DRY_RUN ? 'DRY-RUN (no writes)' : RESUME ? 'RESUME' : 'LIVE MIGRATION');
  console.log('='.repeat(70));
  console.log();

  const progress = RESUME ? loadProgress() : { lastProcessedId: null, count: 0 };
  let errors = loadErrors();

  console.log('Connecting to databases...');

  // Test connections
  await v1Pool.query('SELECT 1');
  await v2Pool.query('SELECT 1');
  console.log('Connections established.');

  const totalCount = await countV1Total();
  console.log(`V1 total rows: ${totalCount}`);
  if (progress.count > 0) {
    console.log(`Resuming from: ${progress.count} rows already processed`);
  }
  console.log();

  let processed = progress.count;
  let qualifying = 0;
  let eventsInserted = 0;
  let locationsInserted = 0;
  let imagesInserted = 0;
  let hintsInserted = 0;
  let skipped = 0;
  let errorCount = 0;

  const startTime = Date.now();

  // Process in batches
  const qualifyingRows = [];

  for await (const batch of fetchV1Batches(progress.lastProcessedId)) {
    for (const row of batch) {
      processed++;

      if (!isQualifyingRow(row)) {
        continue;
      }

      qualifying++;
      qualifyingRows.push(row);

      // Batch insert when we reach threshold
      if (qualifyingRows.length >= INSERT_BATCH_SIZE) {
        const result = await processBatch(qualifyingRows, DRY_RUN);
        eventsInserted += result.events;
        locationsInserted += result.locations;
        imagesInserted += result.images;
        hintsInserted += result.hints;
        skipped += result.skipped;
        errorCount += result.errors;

        if (result.errors > 0 && result.errorDetails) {
          errors.push(...result.errorDetails);
        }

        qualifyingRows.length = 0; // Clear array

        // Save progress
        saveProgress({ lastProcessedId: row.id, count: processed });
      }

      // Progress log every 500 rows
      if (processed % 500 === 0) {
        console.log(`Processing ${processed}/${totalCount}... (${qualifying} qualifying)`);
      }
    }
  }

  // Process remaining rows
  if (qualifyingRows.length > 0) {
    const result = await processBatch(qualifyingRows, DRY_RUN);
    eventsInserted += result.events;
    locationsInserted += result.locations;
    imagesInserted += result.images;
    hintsInserted += result.hints;
    skipped += result.skipped;
    errorCount += result.errors;

    if (result.errors > 0 && result.errorDetails) {
      errors.push(...result.errorDetails);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Final progress save
  saveProgress({ lastProcessedId: null, count: processed, complete: true });
  if (errors.length > 0) {
    saveErrors(errors);
  }

  // ==========================================================================
  // FINAL SUMMARY
  // ==========================================================================

  console.log();
  console.log('='.repeat(70));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(70));
  console.log(`V1 rows fetched:        ${processed}`);
  console.log(`Qualifying rows:        ${qualifying}`);
  console.log(`events inserted:        ${eventsInserted}`);
  console.log(`locations inserted:     ${locationsInserted}`);
  console.log(`images inserted:        ${imagesInserted}`);
  console.log(`hints inserted:         ${hintsInserted}`);
  console.log(`skipped (conflict):     ${skipped}`);
  console.log(`errors:                 ${errorCount}`);
  console.log(`duration:               ${duration}s`);
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No data was written.');
  } else if (errorCount > 0) {
    console.log(`\nErrors logged to: ${ERRORS_FILE} (${errorCount} errors)`);
  } else {
    console.log('\n✓ Migration completed with zero errors');
    // Clean up progress file on success
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
  }

  await v1Pool.end();
  await v2Pool.end();
}

async function processBatch(rows, dryRun) {
  const result = { events: 0, locations: 0, images: 0, hints: 0, skipped: 0, errors: 0, errorDetails: [] };

  if (dryRun) {
    return {
      events: rows.length,
      locations: rows.length,
      images: rows.filter(r => IMAGE_COLUMNS.some(c => r[c])).length,
      hints: rows.length * 2, // Approximate
      skipped: 0,
      errors: 0,
      errorDetails: []
    };
  }

  const client = await v2Pool.connect();

  try {
    await client.query('BEGIN');

    // Insert events
    const eventsInsert = buildEventsInsert(rows);
    const eventsResult = await client.query(eventsInsert.sql, eventsInsert.params);
    result.events = eventsResult.rowCount || 0;

    // Insert locations
    const locationsInsert = buildLocationsInsert(rows);
    const locationsResult = await client.query(locationsInsert.sql, locationsInsert.params);
    result.locations = locationsResult.rowCount || 0;

    // Insert images (if any)
    const imagesInsert = buildImagesInsert(rows);
    if (imagesInsert) {
      const imagesResult = await client.query(imagesInsert.sql, imagesInsert.params);
      result.images = imagesResult.rowCount || 0;
    }

    // Insert hints (if any)
    const hintsInsert = buildHintsInsert(rows);
    if (hintsInsert) {
      const hintsResult = await client.query(hintsInsert.sql, hintsInsert.params);
      result.hints = hintsResult.rowCount || 0;
    }

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    result.errors = rows.length;
    result.errorDetails = rows.map(r => ({
      v1Id: r.id,
      title: r.title,
      error: error.message
    }));
  } finally {
    client.release();
  }

  return result;
}

// Run
runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
