#!/usr/bin/env node
/**
 * Analyze legacy images and migration gaps
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';
const NEW_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const NEW_KEY = 'sb_secret_a7QoSuZPONRqR9NsO2ooTw_htrfbDPC';

const legacy = createClient(LEGACY_URL, LEGACY_KEY);
const db = createClient(NEW_URL, NEW_KEY);

async function analyze() {
  console.log('=== Analyzing Image Migration ===\n');
  
  // Count legacy images
  const { count: legacyCount, error: lErr } = await legacy
    .from('images')
    .select('*', { count: 'exact', head: true });
  console.log('Legacy images total:', legacyCount || 0, lErr ? `(error: ${lErr.message})` : '');
  
  // Count new event_images
  const { count: newCount, error: nErr } = await db
    .from('event_images')
    .select('*', { count: 'exact', head: true });
  console.log('New event_images:', newCount || 0, nErr ? `(error: ${nErr.message})` : '');
  
  // Get legacy images with prompt_id info
  const { data: legacyImages, error: liErr } = await legacy
    .from('images')
    .select('id, prompt_id, firebase_desktop');
  
  if (liErr) {
    console.error('Error fetching legacy images:', liErr.message);
    return;
  }
  
  console.log('\nLegacy images breakdown:');
  const withPrompt = legacyImages.filter(img => img.prompt_id);
  const withoutPrompt = legacyImages.filter(img => !img.prompt_id);
  const withUrl = legacyImages.filter(img => img.firebase_desktop || img.image_url);
  console.log(`  - Total: ${legacyImages.length}`);
  console.log(`  - With prompt_id: ${withPrompt.length}`);
  console.log(`  - Without prompt_id: ${withoutPrompt.length}`);
  console.log(`  - With image URL: ${withUrl.length}`);
  
  // Check migrated events and their legacy_prompt_id
  const { data: events, error: eErr } = await db
    .from('events')
    .select('id, legacy_prompt_id');
  
  if (eErr) {
    console.error('Error fetching events:', eErr.message);
    return;
  }
  
  const migratedPromptIds = new Set(events.map(e => e.legacy_prompt_id).filter(Boolean));
  console.log(`\nMigrated events: ${events.length}`);
  console.log(`Unique legacy_prompt_ids: ${migratedPromptIds.size}`);
  
  // Find images whose prompt_id was NOT migrated
  const unmatchedImages = withPrompt.filter(img => !migratedPromptIds.has(img.prompt_id));
  console.log(`\nImages with prompt_id NOT in migrated events: ${unmatchedImages.length}`);
  
  if (unmatchedImages.length > 0) {
    // Show sample of unmatched prompt_ids
    const unmatchedPromptIds = [...new Set(unmatchedImages.map(img => img.prompt_id))].slice(0, 5);
    console.log('Sample unmatched prompt_ids:', unmatchedPromptIds);
    
    // Check if these prompts exist in legacy
    const { data: checkPrompts } = await legacy
      .from('prompts')
      .select('id, year, latitude, longitude')
      .in('id', unmatchedPromptIds);
    
    console.log('Matching prompts in legacy (should be missing year/coords):');
    checkPrompts?.forEach(p => {
      console.log(`  ${p.id}: year=${p.year}, lat=${p.latitude}, lng=${p.longitude}`);
    });
  }
  
  // Check images that SHOULD have been imported but weren't
  const expectedMatches = withPrompt.filter(img => 
    migratedPromptIds.has(img.prompt_id) && (img.firebase_desktop || img.image_url)
  );
  console.log(`\nImages that should be imported: ${expectedMatches.length}`);
  console.log(`Actually imported: ${newCount}`);
  console.log(`Missing: ${expectedMatches.length - (newCount || 0)}`);
}

analyze().catch(console.error);
