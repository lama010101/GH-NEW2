#!/usr/bin/env node
/**
 * Migration Script: V1 Extras (avatars, quotes, fun_facts) to V2
 * Task ref: MP-CONTENT-SCHEMA-009
 *
 * Migrates three additional content tables from V1 to V2:
 * - avatars (where ready=true or image_url is non-null)
 * - quotes (where is_valid=true)
 * - fun_facts (all rows)
 *
 * Usage:
 *   node scripts/migrate-v1-extras.mjs --dry-run      # Count only
 *   node scripts/migrate-v1-extras.mjs               # Full migration
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const V1_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const V1_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';

const V2_URL = process.env.SUPABASE_URL || 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const V2_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const BATCH_SIZE = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const DRY_RUN = process.argv.includes('--dry-run');

const v1Supabase = createClient(V1_URL, V1_KEY);
const v2Supabase = createClient(V2_URL, V2_KEY);

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

// Convert integer ID to UUID format for quotes/fun_facts
function intToUuid(intId) {
  const padded = intId.toString().padStart(12, '0');
  return `00000000-0000-0000-0000-${padded}`;
}

// ============================================================================
// AVATARS
// ============================================================================

function buildAvatar(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    description: row.description,
    gender: row.gender,
    birth_city: row.birth_city,
    birth_country: row.birth_country,
    death_city: row.death_city,
    death_country: row.death_country,
    birth_day: row.birth_day,
    death_day: row.death_day,
    image_url: row.image_url,
    firebase_url: row.firebase_url,
    ready: row.ready ?? false
  };
}

async function migrateAvatars(dryRun) {
  console.log('\n--- Migrating avatars ---');
  
  // Filter: ready=true OR image_url is non-null
  const { data: allRows, error: fetchErr } = await v1Supabase
    .from('avatars')
    .select('*');
  
  if (fetchErr) {
    console.error('Failed to fetch avatars:', fetchErr.message);
    return { inserted: 0, errors: 1 };
  }
  
  const qualifyingRows = allRows.filter(row => 
    row.ready === true || (row.image_url && row.image_url.trim().length > 0)
  );
  
  console.log(`Total V1 avatars: ${allRows.length}`);
  console.log(`Qualifying rows (ready=true or image_url): ${qualifyingRows.length}`);
  
  if (dryRun) {
    return { inserted: qualifyingRows.length, errors: 0 };
  }
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < qualifyingRows.length; i += BATCH_SIZE) {
    const batch = qualifyingRows.slice(i, i + BATCH_SIZE);
    const avatars = batch.map(buildAvatar);
    
    try {
      const { data, error } = await retry(() =>
        v2Supabase.from('avatars').insert(avatars).select('id')
      );
      if (error) throw error;
      inserted += data?.length || avatars.length;
    } catch (err) {
      errors += avatars.length;
      console.error(`  Batch ${i}-${i + batch.length} failed: ${err.message}`);
    }
    
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= qualifyingRows.length) {
      console.log(`Progress: ${Math.min(i + BATCH_SIZE, qualifyingRows.length)}/${qualifyingRows.length}`);
    }
  }
  
  return { inserted, errors };
}

// ============================================================================
// QUOTES
// ============================================================================

function buildQuote(row) {
  return {
    id: intToUuid(row.id),
    quote_text: row.quote_text,
    author: row.author,
    year: row.year,
    location: row.location,
    is_valid: true
  };
}

async function migrateQuotes(dryRun) {
  console.log('\n--- Migrating quotes ---');
  
  // Filter: is_valid=true
  const { data: allRows, error: fetchErr } = await v1Supabase
    .from('quotes')
    .select('*');
  
  if (fetchErr) {
    console.error('Failed to fetch quotes:', fetchErr.message);
    return { inserted: 0, errors: 1 };
  }
  
  const qualifyingRows = allRows.filter(row => row.is_valid === true);
  
  console.log(`Total V1 quotes: ${allRows.length}`);
  console.log(`Qualifying rows (is_valid=true): ${qualifyingRows.length}`);
  
  if (dryRun) {
    return { inserted: qualifyingRows.length, errors: 0 };
  }
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < qualifyingRows.length; i += BATCH_SIZE) {
    const batch = qualifyingRows.slice(i, i + BATCH_SIZE);
    const quotes = batch.map(buildQuote);
    
    try {
      const { data, error } = await retry(() =>
        v2Supabase.from('quotes').insert(quotes).select('id')
      );
      if (error) throw error;
      inserted += data?.length || quotes.length;
    } catch (err) {
      errors += quotes.length;
      console.error(`  Batch ${i}-${i + batch.length} failed: ${err.message}`);
    }
    
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= qualifyingRows.length) {
      console.log(`Progress: ${Math.min(i + BATCH_SIZE, qualifyingRows.length)}/${qualifyingRows.length}`);
    }
  }
  
  return { inserted, errors };
}

// ============================================================================
// FUN_FACTS
// ============================================================================

function buildFunFact(row) {
  return {
    id: intToUuid(row.id),
    description: row.description,
    date: row.date,
    location: row.location
  };
}

async function migrateFunFacts(dryRun) {
  console.log('\n--- Migrating fun_facts ---');
  
  // All rows qualify
  const { data: allRows, error: fetchErr } = await v1Supabase
    .from('fun_facts')
    .select('*');
  
  if (fetchErr) {
    console.error('Failed to fetch fun_facts:', fetchErr.message);
    return { inserted: 0, errors: 1 };
  }
  
  console.log(`Total V1 fun_facts: ${allRows.length}`);
  
  if (dryRun) {
    return { inserted: allRows.length, errors: 0 };
  }
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const funFacts = batch.map(buildFunFact);
    
    try {
      const { data, error } = await retry(() =>
        v2Supabase.from('fun_facts').insert(funFacts).select('id')
      );
      if (error) throw error;
      inserted += data?.length || funFacts.length;
    } catch (err) {
      errors += funFacts.length;
      console.error(`  Batch ${i}-${i + batch.length} failed: ${err.message}`);
    }
    
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= allRows.length) {
      console.log(`Progress: ${Math.min(i + BATCH_SIZE, allRows.length)}/${allRows.length}`);
    }
  }
  
  return { inserted, errors };
}

// ============================================================================
// MAIN
// ============================================================================

async function run() {
  console.log('='.repeat(60));
  console.log('V1 Extras → V2 Migration');
  console.log('Mode:', DRY_RUN ? 'DRY-RUN' : 'LIVE');
  console.log('='.repeat(60));

  const startTime = Date.now();
  
  const avatarsResult = await migrateAvatars(DRY_RUN);
  const quotesResult = await migrateQuotes(DRY_RUN);
  const funFactsResult = await migrateFunFacts(DRY_RUN);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Final summary
  console.log();
  console.log('='.repeat(60));
  console.log('EXTRAS MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`avatars inserted:   ${avatarsResult.inserted}`);
  console.log(`quotes inserted:    ${quotesResult.inserted}`);
  console.log(`fun_facts inserted: ${funFactsResult.inserted}`);
  console.log(`errors:             ${avatarsResult.errors + quotesResult.errors + funFactsResult.errors}`);
  console.log(`duration:            ${duration}s`);
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No data written.');
  } else {
    const totalErrors = avatarsResult.errors + quotesResult.errors + funFactsResult.errors;
    if (totalErrors === 0) {
      console.log('\n✓ Zero errors');
    } else {
      console.log(`\n⚠ ${totalErrors} errors occurred`);
    }
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
