#!/usr/bin/env node
/**
 * Complete migration: ALL prompts with images → events, ALL images → event_images
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';
const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const legacy = createClient(LEGACY_URL, LEGACY_KEY);
const db = createClient(NEW_URL, NEW_KEY);

const BATCH_SIZE = 50;

async function getAllLegacyImages() {
  const all = [];
  let from = 0;
  const limit = 1000;
  
  while (true) {
    const { data, error } = await legacy
      .from('images')
      .select('id, prompt_id, firebase_desktop, firebase_url, firebase_mobile, thumbnail_image_url, width, height, created_at');
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    all.push(...data);
    if (data.length < limit) break;
    from += limit;
  }
  
  return all;
}

async function getPromptsForImages(imagePromptIds) {
  const uniqueIds = [...new Set(imagePromptIds)].filter(Boolean);
  
  const { data, error } = await legacy
    .from('prompts')
    .select('id, title, description, year, latitude, longitude, location, country, theme, created_at, 1_where_continent, 1_when_century, 2_where_landmark, 2_where_landmark_km, 2_when_event, 2_when_event_years, 3_where_region, 3_when_decade, 4_where_landmark, 4_where_landmark_km, 4_when_event, 4_when_event_years, 5_when_clues, 5_where_clues')
    .in('id', uniqueIds);
  
  if (error) throw error;
  return new Map((data || []).map(p => [p.id, p]));
}

function transformEvent(p) {
  const year = p.year ? parseInt(p.year) : null;
  const lat = p.latitude ? parseFloat(p.latitude) : null;
  const lng = p.longitude ? parseFloat(p.longitude) : null;
  
  if (!year || !lat || !lng) return null;
  
  return {
    legacy_prompt_id: p.id,
    title: p.title || 'Untitled Event',
    description: p.description || null,
    year,
    location_lat: lat,
    location_lng: lng,
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
  if (events.length === 0) return [];
  
  try {
    const { data, error } = await db.from('events').insert(events).select('id,legacy_prompt_id');
    if (error) throw error;
    
    const idMap = new Map(data.map(e => [e.legacy_prompt_id, e.id]));
    
    const hintsToInsert = hints.map(h => ({ ...h, event_id: idMap.get(h.event_id) })).filter(h => h.event_id);
    if (hintsToInsert.length > 0) {
      const { error: hErr } = await db.from('hints').insert(hintsToInsert);
      if (hErr) console.warn('Hint insert warning:', hErr.message);
    }
    
    return data;
  } catch (err) {
    console.error('Batch insert failed:', err.message);
    return [];
  }
}

async function migrate() {
  console.log('=== Complete Migration: Events + Images ===\n');
  
  // Step 1: Get ALL legacy images
  console.log('Fetching all legacy images...');
  const allImages = await getAllLegacyImages();
  console.log(`Found ${allImages.length} total images`);
  
  // Step 2: Get unique prompt_ids from images
  const imagePromptIds = allImages.map(img => img.prompt_id).filter(Boolean);
  const uniquePromptIds = [...new Set(imagePromptIds)];
  console.log(`Images linked to ${uniquePromptIds.length} unique prompts`);
  
  // Step 3: Get existing events
  const { data: existingEvents } = await db.from('events').select('legacy_prompt_id');
  const existingPromptIds = new Set((existingEvents || []).map(e => e.legacy_prompt_id));
  console.log(`Already have events for ${existingPromptIds.size} prompts`);
  
  // Step 4: Find prompts that need events created
  const missingPromptIds = uniquePromptIds.filter(id => !existingPromptIds.has(id));
  console.log(`Need to create events for ${missingPromptIds.length} prompts`);
  
  // Step 5: Fetch missing prompts and create events
  if (missingPromptIds.length > 0) {
    console.log('\nCreating missing events...');
    const promptMap = await getPromptsForImages(missingPromptIds);
    
    let batchEvents = [];
    let batchHints = [];
    let created = 0;
    let skipped = 0;
    
    for (const [promptId, prompt] of promptMap) {
      const event = transformEvent(prompt);
      if (!event) {
        skipped++;
        continue;
      }
      
      batchEvents.push(event);
      batchHints.push(...transformHints(prompt, prompt.id));
      
      if (batchEvents.length >= BATCH_SIZE) {
        const inserted = await insertBatch(batchEvents, batchHints);
        created += inserted.length;
        batchEvents = [];
        batchHints = [];
        process.stdout.write('.');
      }
    }
    
    // Final batch
    if (batchEvents.length > 0) {
      const inserted = await insertBatch(batchEvents, batchHints);
      created += inserted.length;
    }
    
    console.log(`\nCreated ${created} new events, skipped ${skipped}`);
  }
  
  // Step 6: Now get ALL events (existing + new)
  const { data: allEvents } = await db.from('events').select('id, legacy_prompt_id').not('legacy_prompt_id', 'is', null);
  const eventIdMap = new Map((allEvents || []).map(e => [e.legacy_prompt_id, e.id]));
  console.log(`\nTotal events available: ${eventIdMap.size}`);
  
  // Step 7: Import ALL images
  console.log('\nImporting all images...');
  let imageBatch = [];
  let imported = 0;
  let skipped = 0;
  
  for (let i = 0; i < allImages.length; i++) {
    const img = allImages[i];
    const eventId = eventIdMap.get(img.prompt_id);
    
    if (!eventId) {
      skipped++;
      continue;
    }
    
    const imageUrl = img.firebase_desktop || img.firebase_url;
    if (!imageUrl) {
      skipped++;
      continue;
    }
    
    imageBatch.push({
      event_id: eventId,
      image_url: imageUrl,
      thumb_url: img.thumbnail_image_url || img.firebase_mobile,
      source: 'legacy',
      width: img.width,
      height: img.height,
      is_primary: false,
      created_at: img.created_at
    });
    
    if (imageBatch.length >= BATCH_SIZE || i === allImages.length - 1) {
      const { error } = await db.from('event_images').insert(imageBatch);
      if (error) {
        console.warn('\nBatch error:', error.message);
      } else {
        imported += imageBatch.length;
      }
      imageBatch = [];
      
      if ((i + 1) % 500 === 0 || i === allImages.length - 1) {
        console.log(`  ${i + 1}/${allImages.length} - imported ${imported}`);
      }
    }
  }
  
  console.log(`\n=== Migration Complete ===`);
  console.log(`Images imported: ${imported}`);
  console.log(`Images skipped: ${skipped}`);
  
  // Final verification
  const { count: finalCount } = await db.from('event_images').select('*', { count: 'exact', head: true });
  console.log(`\nFinal event_images count: ${finalCount || 0}`);
  console.log(`Expected: ${allImages.length}`);
}

migrate().catch(console.error);
