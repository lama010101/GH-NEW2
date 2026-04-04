#!/usr/bin/env node
/**
 * Migration Script: Import legacy data via Supabase REST API
 * 
 * This script migrates events metadata from legacy to new DB using REST API.
 * Only imports: prompts -> events, images -> event_images, hints -> hints
 * Does NOT import: users, gameplay history, scores
 * 
 * Usage:
 *   node scripts/migrate-legacy-rest.mjs
 */

import { createClient } from '@supabase/supabase-js';

// Legacy Supabase (source)
const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = process.env.LEGACY_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';

// New Supabase (target)  
const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_KEY || 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const legacySupabase = createClient(LEGACY_URL, LEGACY_KEY);
const newSupabase = createClient(NEW_URL, NEW_KEY);

/**
 * Parse geolocation from various formats
 */
function parseGeolocation(geo) {
  if (!geo) return null;
  
  try {
    if (typeof geo === 'object' && geo.lat !== undefined && geo.lng !== undefined) {
      return { lat: parseFloat(geo.lat), lng: parseFloat(geo.lng) };
    }
    
    if (typeof geo === 'string') {
      try {
        const parsed = JSON.parse(geo);
        if (parsed.lat !== undefined && parsed.lng !== undefined) {
          return { lat: parseFloat(parsed.lat), lng: parseFloat(parsed.lng) };
        }
        if (Array.isArray(parsed) && parsed.length >= 2) {
          return { lat: parseFloat(parsed[0]), lng: parseFloat(parsed[1]) };
        }
      } catch {
        const parts = geo.split(',').map(s => s.trim());
        if (parts.length === 2) {
          return { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
        }
      }
    }
    
    if (Array.isArray(geo) && geo.length >= 2) {
      return { lat: parseFloat(geo[0]), lng: parseFloat(geo[1]) };
    }
  } catch (error) {
    console.warn('Failed to parse geolocation:', geo);
  }
  
  return null;
}

/**
 * Extract year from various formats
 */
function extractYear(dateValue, yearValue) {
  if (yearValue && !isNaN(parseInt(yearValue))) {
    return parseInt(yearValue);
  }
  
  if (dateValue) {
    const dateStr = dateValue.toString();
    const yearMatch = dateStr.match(/\b(1[8-9]\d{2}|20\d{2})\b/);
    if (yearMatch) {
      return parseInt(yearMatch[1]);
    }
  }
  
  return null;
}

/**
 * Build location name from components
 */
function buildLocationName(locationName, city, country, region) {
  const parts = [];
  if (city) parts.push(city);
  if (locationName && !parts.includes(locationName)) parts.push(locationName);
  if (country) parts.push(country);
  if (region && parts.length === 0) parts.push(region);
  
  return parts.join(', ') || 'Unknown';
}

/**
 * Fetch prompts from legacy database via REST API
 */
async function fetchLegacyPrompts() {
  console.log('Fetching prompts from legacy database via REST API...');
  
  const { data, error } = await legacySupabase
    .from('prompts')
    .select('*')
    .not('year', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch prompts: ${error.message}`);
  }
  
  console.log(`Found ${data?.length || 0} prompts to migrate`);
  return data || [];
}

/**
 * Fetch images for a prompt from legacy database
 */
async function fetchLegacyImages(promptId) {
  const { data, error } = await legacySupabase
    .from('images')
    .select('*')
    .or(`prompt_id.eq.${promptId},identifier.eq.${promptId}`)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.warn(`Failed to fetch images for ${promptId}:`, error.message);
    return [];
  }
  
  return data || [];
}

/**
 * Migrate a single prompt to events
 */
async function migratePromptToEvent(prompt) {
  // Use latitude/longitude directly
  if (prompt.latitude == null || prompt.longitude == null) {
    console.warn(`Skipping prompt ${prompt.id}: missing coordinates`);
    return null;
  }
  
  const year = extractYear(prompt.date, prompt.year);
  if (!year) {
    console.warn(`Skipping prompt ${prompt.id}: could not extract year`);
    return null;
  }
  
  const locationName = prompt.location || 
    buildLocationName(prompt.location_name, null, prompt.country, prompt.region);
  
  try {
    // Check if event already exists
    const { data: existing } = await newSupabase
      .from('events')
      .select('id')
      .eq('legacy_prompt_id', prompt.id)
      .single();
    
    if (existing) {
      console.log(`  ⚠ Event already exists for ${prompt.id}`);
      return existing.id;
    }
    
    // Insert event
    const { data: event, error: eventError } = await newSupabase
      .from('events')
      .insert({
        legacy_prompt_id: prompt.id,
        title: prompt.title || 'Untitled Event',
        description: prompt.description || null,
        year: year,
        location_lat: prompt.latitude,
        location_lng: prompt.longitude,
        location_name: locationName,
        region: prompt.region || prompt.country || null,
        category: prompt.theme || null,
        difficulty: 3, // Default difficulty
        created_at: prompt.created_at
      })
      .select()
      .single();
    
    if (eventError) {
      throw new Error(`Failed to insert event: ${eventError.message}`);
    }
    
    const eventId = event.id;
    
    // Insert event image
    const imageUrl = prompt.firebase_image_url || prompt.image_url;
    if (imageUrl) {
      await newSupabase
        .from('event_images')
        .insert({
          event_id: eventId,
          image_url: imageUrl,
          source: 'legacy',
          is_primary: true,
          created_at: prompt.created_at
        });
    }
    
    // Migrate legacy images
    const legacyImages = await fetchLegacyImages(prompt.id);
    for (const img of legacyImages) {
      const imgUrl = img.firebase_url || img.image_url;
      if (imgUrl) {
        await newSupabase
          .from('event_images')
          .insert({
            event_id: eventId,
            image_url: imgUrl,
            source: img.source || 'legacy',
            is_primary: false,
            content_hash: img.identifier || null,
            created_at: img.created_at
          });
      }
    }
    
    // Migrate hints from new-style prompt columns
    const hints = [];
    
    // Level 1 hints (broadest)
    if (prompt['1_where_continent']) hints.push({ level: 1, type: 'where', text: prompt['1_where_continent'] });
    if (prompt['1_when_century']) hints.push({ level: 1, type: 'when', text: prompt['1_when_century'] });
    
    // Level 2 hints (narrower)
    if (prompt['2_where_landmark']) hints.push({ level: 2, type: 'where', text: `${prompt['2_where_landmark']} (${prompt['2_where_landmark_km'] || '?'} km away)` });
    if (prompt['2_when_event']) hints.push({ level: 2, type: 'when', text: `${prompt['2_when_event']} (${prompt['2_when_event_years'] || '?'} years away)` });
    
    // Level 3 hints (specific)
    if (prompt['3_where_region']) hints.push({ level: 3, type: 'where', text: prompt['3_where_region'] });
    if (prompt['3_when_decade']) hints.push({ level: 3, type: 'when', text: prompt['3_when_decade'] });
    if (prompt['4_where_landmark']) hints.push({ level: 3, type: 'where', text: `${prompt['4_where_landmark']} (${prompt['4_where_landmark_km'] || '0'} km away)` });
    if (prompt['4_when_event']) hints.push({ level: 3, type: 'when', text: `${prompt['4_when_event']} (${prompt['4_when_event_years'] || '0'} years away)` });
    
    // Level 4-5 hints (most specific clues)
    if (prompt['5_when_clues']) hints.push({ level: 3, type: 'what', text: prompt['5_when_clues'] });
    if (prompt['5_where_clues']) hints.push({ level: 3, type: 'where', text: prompt['5_where_clues'] });
    
    for (const hint of hints) {
      await newSupabase
        .from('hints')
        .insert({
          event_id: eventId,
          level: hint.level,
          type: hint.type,
          text: hint.text,
          penalty_bp: hint.level * 500, // Basis points: 500 = 5%
          created_at: prompt.created_at
        });
    }
    
    return eventId;
    
  } catch (error) {
    console.error(`Failed to migrate prompt ${prompt.id}:`, error.message);
    return null;
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('='.repeat(60));
  console.log('Legacy Data Migration via REST API');
  console.log('Importing: events, event_images, hints');
  console.log('NOT importing: users, gameplay history');
  console.log('='.repeat(60));
  
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  
  try {
    const prompts = await fetchLegacyPrompts();
    
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      process.stdout.write(`[${i + 1}/${prompts.length}] ${prompt.id}... `);
      
      const eventId = await migratePromptToEvent(prompt);
      
      if (eventId) {
        console.log(`✓`);
        migrated++;
      } else {
        // Check if already existed
        const { data: existing } = await newSupabase
          .from('events')
          .select('id')
          .eq('legacy_prompt_id', prompt.id)
          .single();
        
        if (existing) {
          console.log('⚠ (already exists)');
          skipped++;
        } else {
          console.log('✗ (failed)');
          failed++;
        }
      }
    }
    
    console.log('='.repeat(60));
    console.log('Migration complete!');
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Failed:   ${failed}`);
    console.log('='.repeat(60));
    
    // Final counts
    const { data: eventsCount } = await newSupabase.from('events').select('*', { count: 'exact', head: true });
    const { data: imagesCount } = await newSupabase.from('event_images').select('*', { count: 'exact', head: true });
    const { data: hintsCount } = await newSupabase.from('hints').select('*', { count: 'exact', head: true });
    
    console.log('\nFinal new DB counts:');
    console.log(`  events:       ${eventsCount?.length || 0}`);
    console.log(`  event_images: ${imagesCount?.length || 0}`);
    console.log(`  hints:        ${hintsCount?.length || 0}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
runMigration();
