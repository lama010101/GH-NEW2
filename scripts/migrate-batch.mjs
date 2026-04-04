#!/usr/bin/env node
/**
 * Optimized Batch Migration Script
 * Imports events, event_images, hints from legacy DB in batches
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';
const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const legacy = createClient(LEGACY_URL, LEGACY_KEY);
const db = createClient(NEW_URL, NEW_KEY);

const BATCH_SIZE = 50;

async function fetchPrompts() {
  console.log('Fetching prompts from legacy...');
  const { data, error } = await legacy
    .from('prompts')
    .select('id, title, description, year, latitude, longitude, location, country, theme, created_at, 1_where_continent, 1_when_century, 2_where_landmark, 2_where_landmark_km, 2_when_event, 2_when_event_years, 3_where_region, 3_when_decade, 4_where_landmark, 4_where_landmark_km, 4_when_event, 4_when_event_years, 5_when_clues, 5_where_clues')
    .not('year', 'is', null)
    .not('latitude', 'is', null)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

function transformEvent(p) {
  const year = p.year;
  if (!year || !p.latitude || !p.longitude) return null;
  
  return {
    legacy_prompt_id: p.id,
    title: p.title || 'Untitled Event',
    description: p.description || null,
    year: parseInt(year),
    location_lat: parseFloat(p.latitude),
    location_lng: parseFloat(p.longitude),
    location_name: p.location || p.country || 'Unknown',
    region: p.country || null,
    category: p.theme || null,
    difficulty: 3,
    created_at: p.created_at
  };
}

function transformHints(p, eventId) {
  const hints = [];
  
  if (p['1_where_continent']) hints.push({ event_id: eventId, level: 1, type: 'where', text: p['1_where_continent'], penalty_bp: 500 });
  if (p['1_when_century']) hints.push({ event_id: eventId, level: 1, type: 'when', text: p['1_when_century'], penalty_bp: 500 });
  if (p['2_where_landmark']) hints.push({ event_id: eventId, level: 2, type: 'where', text: `${p['2_where_landmark']} (${p['2_where_landmark_km'] || '?'} km)`, penalty_bp: 1000 });
  if (p['2_when_event']) hints.push({ event_id: eventId, level: 2, type: 'when', text: `${p['2_when_event']} (${p['2_when_event_years'] || '?'} years)`, penalty_bp: 1000 });
  if (p['3_where_region']) hints.push({ event_id: eventId, level: 3, type: 'where', text: p['3_where_region'], penalty_bp: 1500 });
  if (p['3_when_decade']) hints.push({ event_id: eventId, level: 3, type: 'when', text: p['3_when_decade'], penalty_bp: 1500 });
  if (p['5_when_clues']) hints.push({ event_id: eventId, level: 3, type: 'what', text: p['5_when_clues'], penalty_bp: 1500 });
  if (p['5_where_clues']) hints.push({ event_id: eventId, level: 3, type: 'where', text: p['5_where_clues'], penalty_bp: 1500 });
  
  return hints;
}

async function insertBatch(events, hints) {
  if (events.length === 0) return 0;
  
  try {
    // Insert events
    const { data, error } = await db.from('events').insert(events).select('id,legacy_prompt_id');
    if (error) throw error;
    
    // Map legacy IDs to new IDs for hints
    const idMap = new Map(data.map(e => [e.legacy_prompt_id, e.id]));
    
    // Re-assign hint event_ids and insert
    const hintsToInsert = hints.map(h => ({ ...h, event_id: idMap.get(h.event_id) })).filter(h => h.event_id);
    if (hintsToInsert.length > 0) {
      const { error: hErr } = await db.from('hints').insert(hintsToInsert);
      if (hErr) console.warn('Hint insert warning:', hErr.message);
    }
    
    return events.length;
  } catch (err) {
    console.error('Batch insert failed:', err.message);
    return 0;
  }
}

async function migrate() {
  console.log('='.repeat(50));
  console.log('Batch Migration: events + hints');
  console.log('='.repeat(50));
  
  const prompts = await fetchPrompts();
  console.log(`Found ${prompts.length} prompts to migrate`);
  
  let batchEvents = [];
  let batchHints = [];
  let migrated = 0;
  let skipped = 0;
  
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const event = transformEvent(p);
    
    if (!event) {
      skipped++;
      continue;
    }
    
    batchEvents.push(event);
    batchHints.push(...transformHints(p, p.id));
    
    // Batch insert when full
    if (batchEvents.length >= BATCH_SIZE || i === prompts.length - 1) {
      process.stdout.write(`Inserting batch ${Math.floor(i / BATCH_SIZE) + 1}... `);
      const count = await insertBatch(batchEvents, batchHints);
      console.log(`✓ ${count}`);
      migrated += count;
      batchEvents = [];
      batchHints = [];
    }
  }
  
  console.log('='.repeat(50));
  console.log('Done!');
  console.log(`Migrated: ${migrated}, Skipped: ${skipped}`);
  
  // Final counts
  const { count: ec } = await db.from('events').select('*', { count: 'exact', head: true });
  const { count: hc } = await db.from('hints').select('*', { count: 'exact', head: true });
  
  console.log(`\nFinal counts:`);
  console.log(`  events: ${ec || 0}`);
  console.log(`  hints: ${hc || 0}`);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
