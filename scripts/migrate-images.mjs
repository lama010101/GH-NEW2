#!/usr/bin/env node
/**
 * Migrate images from legacy to event_images
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';
const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const legacy = createClient(LEGACY_URL, LEGACY_KEY);
const db = createClient(NEW_URL, NEW_KEY);

const BATCH_SIZE = 100;

async function fetchEventsWithLegacyIds() {
  const { data, error } = await db
    .from('events')
    .select('id, legacy_prompt_id')
    .not('legacy_prompt_id', 'is', null);
  
  if (error) throw error;
  return new Map(data.map(e => [e.legacy_prompt_id, e.id]));
}

async function fetchLegacyImages() {
  console.log('Fetching images from legacy...');
  const allImages = [];
  let from = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await legacy
      .from('images')
      .select('id, prompt_id, image_url, firebase_url, firebase_desktop, firebase_mobile, thumbnail_image_url, width, height, created_at')
      .range(from, from + batchSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allImages.push(...data);
    from += batchSize;
    
    if (data.length < batchSize) break;
    process.stdout.write('.');
  }
  
  console.log(`\nFetched ${allImages.length} images`);
  return allImages;
}

async function migrate() {
  console.log('Migrating images...');
  
  const eventMap = await fetchEventsWithLegacyIds();
  console.log(`Found ${eventMap.size} events with legacy IDs`);
  
  const images = await fetchLegacyImages();
  console.log(`Found ${images.length} legacy images`);
  
  let batch = [];
  let migrated = 0;
  let skipped = 0;
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const eventId = eventMap.get(img.prompt_id);
    
    if (!eventId) {
      skipped++;
      continue;
    }
    
    const imageUrl = img.firebase_desktop || img.firebase_url || img.image_url;
    const thumbUrl = img.thumbnail_image_url || img.firebase_mobile;
    
    if (!imageUrl) {
      skipped++;
      continue;
    }
    
    batch.push({
      event_id: eventId,
      image_url: imageUrl,
      thumb_url: thumbUrl,
      source: 'legacy',
      width: img.width,
      height: img.height,
      is_primary: false,
      created_at: img.created_at
    });
    
    if (batch.length >= BATCH_SIZE || i === images.length - 1) {
      const { error } = await db.from('event_images').insert(batch);
      if (error) {
        console.warn('Batch error:', error.message);
      } else {
        migrated += batch.length;
        process.stdout.write('.');
      }
      batch = [];
    }
  }
  
  console.log(`\nDone! Migrated: ${migrated}, Skipped: ${skipped}`);
  
  const { count } = await db.from('event_images').select('*', { count: 'exact', head: true });
  console.log(`Total event_images: ${count || 0}`);
}

migrate().catch(console.error);
