#!/usr/bin/env node
/**
 * Quick fix: Import missing images by processing in very small batches
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';
const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const legacy = createClient(LEGACY_URL, LEGACY_KEY);
const db = createClient(NEW_URL, NEW_KEY);

async function main() {
  console.log('Fetching images from legacy (100 at a time)...');
  
  // Get all images in small chunks
  const allImages = [];
  const chunkSize = 100;
  
  for (let start = 0; start < 1400; start += chunkSize) {
    const { data, error } = await legacy
      .from('images')
      .select('id, prompt_id, firebase_desktop, firebase_url, firebase_mobile, thumbnail_image_url, width, height, created_at')
      .range(start, start + chunkSize - 1);
    
    if (error) {
      console.log(`Error at ${start}:`, error.message);
      continue;
    }
    
    if (!data || data.length === 0) break;
    allImages.push(...data);
    process.stdout.write('.');
    
    if (data.length < chunkSize) break;
  }
  
  console.log(`\n\nTotal legacy images: ${allImages.length}`);
  
  // Get existing events
  const { data: events } = await db.from('events').select('id, legacy_prompt_id');
  const eventMap = new Map((events || []).map(e => [e.legacy_prompt_id, e.id]));
  console.log(`Existing events: ${eventMap.size}`);
  
  // Find images with missing events
  const orphanImages = allImages.filter(img => img.prompt_id && !eventMap.has(img.prompt_id));
  const orphanPromptIds = [...new Set(orphanImages.map(img => img.prompt_id))];
  console.log(`Orphan images (no matching event): ${orphanImages.length}`);
  console.log(`Missing prompt IDs: ${orphanPromptIds.length}`);
  
  if (orphanPromptIds.length === 0) {
    console.log('All prompts already have events! Just need to import images.');
  } else {
    // Fetch missing prompts one at a time to avoid timeout
    console.log('\nFetching missing prompts...');
    const missingPrompts = [];
    
    for (let i = 0; i < orphanPromptIds.length; i++) {
      const { data } = await legacy
        .from('prompts')
        .select('id, title, description, year, latitude, longitude, location, country, theme, created_at')
        .eq('id', orphanPromptIds[i])
        .single();
      
      if (data) missingPrompts.push(data);
      
      if ((i + 1) % 50 === 0) process.stdout.write('.');
    }
    
    console.log(`\nFound ${missingPrompts.length} missing prompts`);
    
    // Create events for missing prompts
    console.log('Creating events for missing prompts...');
    for (const p of missingPrompts) {
      if (!p.year || !p.latitude || !p.longitude) continue;
      
      const { data: event, error } = await db.from('events').insert({
        legacy_prompt_id: p.id,
        title: p.title || 'Untitled Event',
        description: p.description || null,
        year: parseInt(p.year),
        location_lat: parseFloat(p.latitude),
        location_lng: parseFloat(p.longitude),
        location_name: p.location || p.country || 'Unknown',
        region: p.country || null,
        category: p.theme || null,
        difficulty: 3,
        created_at: p.created_at
      }).select('id, legacy_prompt_id').single();
      
      if (!error && event) {
        eventMap.set(p.id, event.id);
      }
    }
    
    console.log(`Total events now: ${eventMap.size}`);
  }
  
  // Now import ALL images
  console.log('\nImporting images...');
  let imported = 0;
  let skipped = 0;
  
  for (let i = 0; i < allImages.length; i++) {
    const img = allImages[i];
    const eventId = eventMap.get(img.prompt_id);
    
    if (!eventId) {
      skipped++;
      continue;
    }
    
    const imageUrl = img.firebase_desktop || img.firebase_url;
    if (!imageUrl) {
      skipped++;
      continue;
    }
    
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
    
    if (error) {
      if (!error.message.includes('duplicate')) {
        console.warn(`Image ${img.id} failed:`, error.message);
      }
    } else {
      imported++;
    }
    
    if ((i + 1) % 200 === 0) {
      console.log(`  ${i + 1}/${allImages.length} - imported ${imported}, skipped ${skipped}`);
    }
  }
  
  console.log(`\n=== Done ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  
  const { count } = await db.from('event_images').select('*', { count: 'exact', head: true });
  console.log(`Total event_images: ${count || 0}`);
}

main().catch(console.error);
