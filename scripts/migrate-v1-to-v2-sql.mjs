#!/usr/bin/env node
/**
 * Migration: V1 → V2 via Direct PostgreSQL
 * Task ref: MP-CONTENT-MIG-007
 * 
 * Uses direct SQL connection for 10x+ speed improvement
 * over REST API approach.
 */

import pg from 'pg';
const { Client } = pg;

// V1 (Legacy) - Direct connection
const V1_URL = 'postgresql://postgres:N7wmBdgHPGrEeiuT@db.jghesmrwhegaotbztrhr.supabase.co:5432/postgres';

// V2 (Target) - Connection pooler for faster writes
const V2_URL = process.env.SUPABASE_DB_CONNECTION || 
  'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

const DRY_RUN = process.argv.includes('--dry-run');

const v1Client = new Client({ connectionString: V1_URL, ssl: { rejectUnauthorized: false } });
const v2Client = new Client({ connectionString: V2_URL, ssl: { rejectUnauthorized: false } });

const HINT_MAP = [
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

async function run() {
  console.log('='.repeat(60));
  console.log('V1 → V2 Migration (Direct SQL)');
  console.log(DRY_RUN ? 'DRY RUN - No writes' : 'LIVE MIGRATION');
  console.log('='.repeat(60));

  await v1Client.connect();
  await v2Client.connect();
  console.log('Connected to both databases\n');

  // Count V1 rows
  const v1Count = await v1Client.query('SELECT COUNT(*) as cnt FROM prompts');
  const total = parseInt(v1Count.rows[0].cnt, 10);
  console.log(`V1 prompts: ${total} rows`);

  // Fetch all qualifying V1 rows
  console.log('Fetching qualifying rows from V1...');
  const v1Rows = await v1Client.query(`
    SELECT * FROM prompts 
    WHERE year IS NOT NULL 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL
      AND title IS NOT NULL
      AND title != ''
    ORDER BY id
  `);
  console.log(`Qualifying rows: ${v1Rows.rows.length}\n`);

  if (DRY_RUN) {
    console.log('[DRY RUN] Would migrate:');
    console.log(`  Events: ${v1Rows.rows.length}`);
    console.log(`  Locations: ${v1Rows.rows.length}`);
    
    const images = v1Rows.rows.filter(r => r.firebase_desktop || r.firebase_url || r.image_url).length;
    console.log(`  Images: ${images}`);
    
    let hints = 0;
    for (const row of v1Rows.rows) {
      for (const m of HINT_MAP) {
        if (row[m.col]) hints++;
      }
    }
    console.log(`  Hints: ${hints}`);
    
    await v1Client.end();
    await v2Client.end();
    console.log('\nDry run complete. Run without --dry-run to migrate.');
    return;
  }

  // Live migration
  const stats = { events: 0, locations: 0, images: 0, hints: 0, errors: 0 };
  const start = Date.now();

  console.log('Starting migration...\n');

  for (let i = 0; i < v1Rows.rows.length; i++) {
    const row = v1Rows.rows[i];
    
    try {
      await v2Client.query('BEGIN');

      // 1. Insert event
      const eventResult = await v2Client.query(`
        INSERT INTO events (id, title, description, event_year, category, theme, real_event, celebrity, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `, [
        row.id, row.title.trim(), row.description || null, parseInt(row.year, 10),
        row.theme || 'uncategorized', row.theme || null,
        row.real_event === 'true' || row.real_event === true,
        row.celebrity === true, 'validated'
      ]);

      if (eventResult.rowCount === 0) {
        await v2Client.query('ROLLBACK');
        continue; // Already exists
      }
      stats.events++;

      // 2. Insert location
      await v2Client.query(`
        INSERT INTO locations (event_id, latitude, longitude, display_name, country, continent)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (event_id) DO NOTHING
      `, [
        row.id, parseFloat(row.latitude), parseFloat(row.longitude),
        row.location || row.country || 'Unknown',
        row.country || null, row['1_where_continent'] || null
      ]);
      stats.locations++;

      // 3. Insert image if available
      const imgUrl = row.firebase_desktop || row.firebase_url || row.image_url;
      if (imgUrl) {
        await v2Client.query(`
          INSERT INTO images (event_id, url, ai_prompt, negative_prompt, ai_generated)
          VALUES ($1, $2, $3, $4, $5)
        `, [row.id, imgUrl, row.prompt || null, row.negative_prompt || null, row.ai_generated === true]);
        stats.images++;
      }

      // 4. Insert hints
      for (const m of HINT_MAP) {
        const content = row[m.col];
        if (!content || (typeof content === 'string' && !content.trim())) continue;

        const meta = {};
        if (m.meta && m.metaCol && row[m.metaCol] != null) {
          meta[m.meta] = row[m.metaCol];
        }

        await v2Client.query(`
          INSERT INTO hints (event_id, tier, type, content, metadata)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          row.id, m.tier, m.type,
          typeof content === 'string' ? content.trim() : String(content),
          Object.keys(meta).length > 0 ? JSON.stringify(meta) : null
        ]);
        stats.hints++;
      }

      await v2Client.query('COMMIT');

    } catch (err) {
      await v2Client.query('ROLLBACK');
      stats.errors++;
      console.error(`Error migrating ${row.id}: ${err.message}`);
    }

    // Progress every 200 rows
    if ((i + 1) % 200 === 0 || i === v1Rows.rows.length - 1) {
      console.log(`Progress: ${i + 1}/${v1Rows.rows.length} rows (${stats.events} events, ${stats.images} images, ${stats.hints} hints)`);
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Events:    ${stats.events}`);
  console.log(`Locations: ${stats.locations}`);
  console.log(`Images:    ${stats.images}`);
  console.log(`Hints:     ${stats.hints}`);
  console.log(`Errors:    ${stats.errors}`);
  console.log(`Duration:  ${duration}s`);
  console.log('='.repeat(60));

  await v1Client.end();
  await v2Client.end();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
