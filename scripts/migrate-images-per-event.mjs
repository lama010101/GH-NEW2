#!/usr/bin/env node
/**
 * Migrate images by fetching per-event from legacy
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';
const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const legacy = createClient(LEGACY_URL, LEGACY_KEY);
const db = createClient(NEW_URL, NEW_KEY);

async function getEventsNeedingImages() {
  const { data, error } = await db
    .from('events')
    .select('id, legacy_prompt_id')
    .not('legacy_prompt_id', 'is', null);
  
  if (error) throw error;
  return data;
}

async function fetchImagesForPrompt(promptId) {
  const { data, error } = await legacy
    .from('images')
    .select('firebase_desktop, firebase_url, image_url, thumbnail_image_url, firebase_mobile, width, height, created_at')
    .eq('prompt_id', promptId)
    .limit(5);
  
  if (error) {
    console.warn(`Error fetching images for ${promptId}:`, error.message);
    return [];
  }
  return data || [];
}

async function migrate() {
  console.log('Migrating images per-event...');
  
  const events = await getEventsNeedingImages();
  console.log(`Found ${events.length} events`);
  
  let migrated = 0;
  let skipped = 0;
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    
    const images = await fetchImagesForPrompt(event.legacy_prompt_id);
    if (images.length === 0) {
      skipped++;
      continue;
    }
    
    const imagesToInsert = images.map((img, idx) => ({
      event_id: event.id,
      image_url: img.firebase_desktop || img.firebase_url || img.image_url,
      thumb_url: img.thumbnail_image_url || img.firebase_mobile,
      source: 'legacy',
      width: img.width,
      height: img.height,
      is_primary: idx === 0,
      created_at: img.created_at
    })).filter(img => img.image_url);
    
    if (imagesToInsert.length > 0) {
      const { error } = await db.from('event_images').insert(imagesToInsert);
      if (error) {
        console.warn(`Failed for ${event.id}:`, error.message);
      } else {
        migrated += imagesToInsert.length;
      }
    }
    
    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${events.length} - migrated ${migrated} images`);
    }
  }
  
  console.log(`\nDone! Migrated: ${migrated}, Skipped: ${skipped}`);
  
  const { count } = await db.from('event_images').select('*', { count: 'exact', head: true });
  console.log(`Total event_images: ${count || 0}`);
}

migrate().catch(console.error);
