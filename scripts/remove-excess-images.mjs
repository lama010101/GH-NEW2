#!/usr/bin/env node
/**
 * Find and remove excess images to reach exactly 1369
 */

import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';
const db = createClient(NEW_URL, NEW_KEY);

async function removeExcess() {
  console.log('=== Removing excess images to reach 1369 ===\n');
  
  // Get all images ordered by created_at (keep oldest, remove newest)
  const { data: images, error } = await db
    .from('event_images')
    .select('id, event_id, image_url, created_at')
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  
  console.log(`Current images: ${images.length}`);
  console.log(`Target: 1369`);
  console.log(`Excess: ${images.length - 1369}`);
  
  if (images.length <= 1369) {
    console.log('Already at or below target, no action needed');
    return;
  }
  
  // Keep first 1369, delete the rest
  const toDelete = images.slice(1369).map(img => img.id);
  console.log(`\nImages to delete: ${toDelete.length}`);
  
  // Delete in batches
  const BATCH_SIZE = 100;
  let deleted = 0;
  
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = toDelete.slice(i, i + BATCH_SIZE);
    const { error: delErr } = await db.from('event_images').delete().in('id', batch);
    
    if (delErr) {
      console.warn(`Batch ${i / BATCH_SIZE + 1} failed:`, delErr.message);
    } else {
      deleted += batch.length;
      process.stdout.write('.');
    }
  }
  
  console.log(`\n\nDeleted ${deleted} excess images`);
  
  // Verify
  const { count: finalCount } = await db.from('event_images').select('*', { count: 'exact', head: true });
  console.log(`\nFinal image count: ${finalCount || 0}`);
  console.log(`✅ Target reached: ${finalCount === 1369 ? 'YES' : 'NO'}`);
}

removeExcess().catch(console.error);
