#!/usr/bin/env node
/**
 * Verify all events have at least one image
 */

import { createClient } from '@supabase/supabase-js';

const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';
const db = createClient(NEW_URL, NEW_KEY);

async function verify() {
  console.log('=== Verifying all events have images ===\n');
  
  // Get events that don't have any images
  const { data: eventsWithoutImages, error } = await db.rpc('get_events_without_images');
  
  if (error) {
    // Fallback: manual check
    const { data: allEvents } = await db.from('events').select('id');
    const { data: allImages } = await db.from('event_images').select('event_id');
    
    const eventIds = new Set(allEvents.map(e => e.id));
    const imageEventIds = new Set(allImages.map(img => img.event_id));
    
    const eventsWithImages = [...eventIds].filter(id => imageEventIds.has(id));
    const eventsWithout = [...eventIds].filter(id => !imageEventIds.has(id));
    
    console.log(`Total events: ${eventIds.size}`);
    console.log(`Events with images: ${eventsWithImages.length}`);
    console.log(`Events WITHOUT images: ${eventsWithout.length}`);
    
    if (eventsWithout.length === 0) {
      console.log('\n✅ SUCCESS: All events have at least one image');
    } else {
      console.log('\n❌ FAIL: Some events still lack images');
      console.log('Events without images:', eventsWithout.slice(0, 5));
    }
    
    return;
  }
  
  if (!eventsWithoutImages || eventsWithoutImages.length === 0) {
    console.log('✅ All events have at least one image');
  } else {
    console.log(`❌ ${eventsWithoutImages.length} events lack images`);
  }
}

verify().catch(console.error);
