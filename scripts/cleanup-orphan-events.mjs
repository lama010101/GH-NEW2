#!/usr/bin/env node
/**
 * Remove events without corresponding images
 * Ensures every event has at least one image
 */

import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';
const db = createClient(NEW_URL, NEW_KEY);

async function cleanup() {
  console.log('=== Cleaning up orphan events ===\n');
  
  // Get all events
  const { data: events, error: eErr } = await db.from('events').select('id, legacy_prompt_id, title');
  if (eErr) throw eErr;
  console.log(`Total events: ${events.length}`);
  
  // Get all event_ids that have images
  const { data: images, error: iErr } = await db.from('event_images').select('event_id');
  if (iErr) throw iErr;
  
  const eventIdsWithImages = new Set(images.map(img => img.event_id));
  console.log(`Events with images: ${eventIdsWithImages.size}`);
  
  // Find orphan events (events without images)
  const orphanEvents = events.filter(e => !eventIdsWithImages.has(e.id));
  console.log(`Orphan events (no images): ${orphanEvents.length}`);
  
  if (orphanEvents.length === 0) {
    console.log('\n✅ All events have images - nothing to clean up');
    return;
  }
  
  // Show sample of orphans
  console.log('\nSample orphan events:');
  orphanEvents.slice(0, 5).forEach(e => {
    console.log(`  - ${e.id}: ${e.title?.substring(0, 50) || 'Untitled'}`);
  });
  
  // Delete orphan events in batches (hints will cascade delete)
  console.log('\nDeleting orphan events...');
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
      process.stdout.write('.');
    }
  }
  
  console.log(`\n\nDeleted ${deleted} orphan events`);
  
  // Verify final counts
  const { count: finalEvents } = await db.from('events').select('*', { count: 'exact', head: true });
  const { count: finalImages } = await db.from('event_images').select('*', { count: 'exact', head: true });
  const { count: finalHints } = await db.from('hints').select('*', { count: 'exact', head: true });
  
  console.log('\n=== Final counts ===');
  console.log(`Events:       ${finalEvents || 0}`);
  console.log(`Event images: ${finalImages || 0}`);
  console.log(`Hints:        ${finalHints || 0}`);
  
  if ((finalEvents || 0) === (finalImages || 0)) {
    console.log('\n✅ All events now have at least one image');
  } else {
    console.log(`\n⚠️  Difference: ${(finalEvents || 0) - (finalImages || 0)} events still lack images`);
  }
}

cleanup().catch(console.error);
