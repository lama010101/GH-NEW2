#!/usr/bin/env node
/**
 * Complete cleanup: Delete ALL events without images until none remain
 */

import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';
const db = createClient(NEW_URL, NEW_KEY);

async function cleanupAllOrphans() {
  console.log('=== Complete Orphan Event Cleanup ===\n');
  
  let iteration = 0;
  let totalDeleted = 0;
  
  while (true) {
    iteration++;
    console.log(`\n--- Iteration ${iteration} ---`);
    
    // Get all events
    const { data: events, error: eErr } = await db.from('events').select('id');
    if (eErr) throw eErr;
    
    // Get all event_ids that have images
    const { data: images, error: iErr } = await db.from('event_images').select('event_id');
    if (iErr) throw iErr;
    
    const eventIdsWithImages = new Set(images.map(img => img.event_id));
    const orphanEvents = events.filter(e => !eventIdsWithImages.has(e.id));
    
    console.log(`Total events: ${events.length}`);
    console.log(`Events with images: ${eventIdsWithImages.size}`);
    console.log(`Orphan events: ${orphanEvents.length}`);
    
    if (orphanEvents.length === 0) {
      console.log('\n✅ No more orphan events!');
      break;
    }
    
    // Delete orphan events in batches
    const orphanIds = orphanEvents.map(e => e.id);
    const BATCH_SIZE = 100;
    let deleted = 0;
    
    for (let i = 0; i < orphanIds.length; i += BATCH_SIZE) {
      const batch = orphanIds.slice(i, i + BATCH_SIZE);
      const { error } = await db.from('events').delete().in('id', batch);
      
      if (error) {
        console.warn(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      } else {
        deleted += batch.length;
      }
    }
    
    console.log(`Deleted: ${deleted}`);
    totalDeleted += deleted;
    
    if (iteration > 5) {
      console.log('⚠️ Too many iterations, stopping');
      break;
    }
  }
  
  console.log(`\n=== Total deleted: ${totalDeleted} orphan events ===`);
  
  // Final verification
  const { count: finalEvents } = await db.from('events').select('*', { count: 'exact', head: true });
  const { count: finalImages } = await db.from('event_images').select('*', { count: 'exact', head: true });
  const { count: finalHints } = await db.from('hints').select('*', { count: 'exact', head: true });
  
  console.log('\n=== Final counts ===');
  console.log(`Events:       ${finalEvents || 0}`);
  console.log(`Event images: ${finalImages || 0}`);
  console.log(`Hints:        ${finalHints || 0}`);
  
  if ((finalEvents || 0) > 0 && (finalEvents || 0) <= (finalImages || 0)) {
    console.log('\n✅ All events have at least one image');
  }
}

cleanupAllOrphans().catch(console.error);
