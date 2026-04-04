#!/usr/bin/env node
/**
 * Import ALL 1369 legacy images - fill in the missing 369
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';
const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const legacy = createClient(LEGACY_URL, LEGACY_KEY);
const db = createClient(NEW_URL, NEW_KEY);

async function getAllLegacyImages() {
  const all = [];
  let from = 0;
  const limit = 1000;
  
  while (true) {
    const { data, error } = await legacy
      .from('images')
      .select('id, prompt_id, firebase_desktop, firebase_url, firebase_mobile, thumbnail_image_url, width, height, created_at')
      .range(from, from + limit - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    all.push(...data);
    from += limit;
    if (data.length < limit) break;
  }
  
  return all;
}

async function getExistingImages() {
  const { data, error } = await db.from('event_images').select('image_url');
  if (error) throw error;
  return new Set((data || []).map(img => img.image_url));
}

async function getAllEvents() {
  const { data, error } = await db.from('events').select('id, legacy_prompt_id');
  if (error) throw error;
  return new Map((data || []).map(e => [e.legacy_prompt_id, e.id]));
}

async function getPrompt(promptId) {
  const { data, error } = await legacy
    .from('prompts')
    .select('id, title, description, year, latitude, longitude, location, country, theme, created_at, 1_where_continent, 1_when_century, 2_where_landmark, 2_where_landmark_km, 2_when_event, 2_when_event_years, 3_where_region, 3_when_decade, 4_where_landmark, 4_where_landmark_km, 4_when_event, 4_when_event_years, 5_when_clues, 5_where_clues')
    .eq('id', promptId)
    .single();
  
  return error ? null : data;
}

async function createEventAndHints(prompt) {
  if (!prompt.year || !prompt.latitude || !prompt.longitude) return null;
  
  const { data: event, error: eErr } = await db.from('events').insert({
    legacy_prompt_id: prompt.id,
    title: prompt.title || 'Untitled Event',
    description: prompt.description || null,
    year: parseInt(prompt.year),
    location_lat: parseFloat(prompt.latitude),
    location_lng: parseFloat(prompt.longitude),
    location_name: prompt.location || prompt.country || 'Unknown',
    region: prompt.country || null,
    category: prompt.theme || null,
    difficulty: 3,
    created_at: prompt.created_at
  }).select('id').single();
  
  if (eErr || !event) return null;
  
  // Create hints
  const hints = [];
  if (prompt['1_where_continent']) hints.push({ event_id: event.id, level: 1, type: 'where', text: prompt['1_where_continent'], penalty_bp: 500 });
  if (prompt['1_when_century']) hints.push({ event_id: event.id, level: 1, type: 'when', text: prompt['1_when_century'], penalty_bp: 500 });
  if (prompt['2_where_landmark']) hints.push({ event_id: event.id, level: 2, type: 'where', text: `${prompt['2_where_landmark']} (${prompt['2_where_landmark_km'] || '?'} km)`, penalty_bp: 1000 });
  if (prompt['2_when_event']) hints.push({ event_id: event.id, level: 2, type: 'when', text: `${prompt['2_when_event']} (${prompt['2_when_event_years'] || '?'} years)`, penalty_bp: 1000 });
  if (prompt['3_where_region']) hints.push({ event_id: event.id, level: 3, type: 'where', text: prompt['3_where_region'], penalty_bp: 1500 });
  if (prompt['3_when_decade']) hints.push({ event_id: event.id, level: 3, type: 'when', text: prompt['3_when_decade'], penalty_bp: 1500 });
  if (prompt['5_when_clues']) hints.push({ event_id: event.id, level: 3, type: 'what', text: prompt['5_when_clues'], penalty_bp: 1500 });
  if (prompt['5_where_clues']) hints.push({ event_id: event.id, level: 3, type: 'where', text: prompt['5_where_clues'], penalty_bp: 1500 });
  
  if (hints.length > 0) {
    await db.from('hints').insert(hints);
  }
  
  return event.id;
}

async function migrate() {
  console.log('=== Importing ALL 1369 Legacy Images ===\n');
  
  // Get all legacy images
  const legacyImages = await getAllLegacyImages();
  console.log(`Legacy images: ${legacyImages.length}`);
  
  // Get existing images
  const existingUrls = await getExistingImages();
  console.log(`Already imported: ${existingUrls.size}`);
  
  // Find missing images
  const missingImages = legacyImages.filter(img => {
    const url = img.firebase_desktop || img.firebase_url;
    return url && !existingUrls.has(url);
  });
  console.log(`Missing images: ${missingImages.length}`);
  
  // Get current events
  let eventMap = await getAllEvents();
  console.log(`Current events: ${eventMap.size}`);
  
  // Import missing images
  let imported = 0;
  let createdEvents = 0;
  
  for (let i = 0; i < missingImages.length; i++) {
    const img = missingImages[i];
    let eventId = eventMap.get(img.prompt_id);
    
    // Create event if needed
    if (!eventId && img.prompt_id) {
      const prompt = await getPrompt(img.prompt_id);
      if (prompt) {
        eventId = await createEventAndHints(prompt);
        if (eventId) {
          eventMap.set(img.prompt_id, eventId);
          createdEvents++;
        }
      }
    }
    
    if (!eventId) {
      continue;
    }
    
    const imageUrl = img.firebase_desktop || img.firebase_url;
    const { error } = await db.from('event_images').insert({
      event_id: eventId,
      image_url: imageUrl,
      thumb_url: img.thumbnail_image_url || img.firebase_mobile,
      source: 'legacy',
      width: img.width,
      height: img.height,
      is_primary: false,
      created_at: img.created_at
    });
    
    if (!error) {
      imported++;
    }
    
    if ((i + 1) % 50 === 0 || i === missingImages.length - 1) {
      console.log(`  ${i + 1}/${missingImages.length} - imported ${imported}, created ${createdEvents} events`);
    }
  }
  
  console.log(`\n=== Done ===`);
  console.log(`Imported: ${imported} images`);
  console.log(`Created: ${createdEvents} new events`);
  
  // Final counts
  const { count: ec } = await db.from('events').select('*', { count: 'exact', head: true });
  const { count: ic } = await db.from('event_images').select('*', { count: 'exact', head: true });
  console.log(`\nFinal: ${ec} events, ${ic} images (target: 1369)`);
}

migrate().catch(console.error);
