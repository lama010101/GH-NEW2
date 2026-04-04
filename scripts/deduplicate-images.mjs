#!/usr/bin/env node
/**
 * Check for and remove duplicate images
 */

import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';
const db = createClient(NEW_URL, NEW_KEY);

async function deduplicate() {
  console.log('=== Checking for duplicate images ===\n');
  
  // Get all images
  const { data: images, error } = await db.from('event_images').select('id, event_id, image_url');
  if (error) throw error;
  
  console.log(`Total images: ${images.length}`);
  
  // Find duplicates (same event_id + image_url)
  const seen = new Map();
  const duplicates = [];
  
  for (const img of images) {
    const key = `${img.event_id}|${img.image_url}`;
    if (seen.has(key)) {
      duplicates.push(img.id);
    } else {
      seen.set(key, img.id);
    }
  }
  
  console.log(`Unique combinations: ${seen.size}`);
  console.log(`Duplicates found: ${duplicates.length}`);
  
  if (duplicates.length === 0) {
    console.log('\n✅ No duplicates found');
    return;
  }
  
  // Show sample duplicates
  console.log('\nSample duplicate IDs:', duplicates.slice(0, 5));
  
  // Delete duplicates in batches
  console.log('\nDeleting duplicates...');
  const BATCH_SIZE = 100;
  let deleted = 0;
  
  for (let i = 0; i < duplicates.length; i += BATCH_SIZE) {
    const batch = duplicates.slice(i, i + BATCH_SIZE);
    const { error: delErr } = await db.from('event_images').delete().in('id', batch);
    
    if (delErr) {
      console.warn(`Batch ${i / BATCH_SIZE + 1} failed:`, delErr.message);
    } else {
      deleted += batch.length;
      process.stdout.write('.');
    }
  }
  
  console.log(`\n\nDeleted ${deleted} duplicate images`);
  
  // Verify
  const { count: finalCount } = await db.from('event_images').select('*', { count: 'exact', head: true });
  console.log(`\nFinal image count: ${finalCount || 0} (target: 1369)`);
  console.log(`Difference: ${(finalCount || 0) - 1369}`);
}

deduplicate().catch(console.error);
