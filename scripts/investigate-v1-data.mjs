#!/usr/bin/env node
/**
 * Investigation Script: Analyze V1 prompts table
 * Task ref: MP-CONTENT-SCHEMA-009
 * 
 * Answers:
 * 1. Why 1,004 rows were excluded (filter vs insert errors)
 * 2. Why images is empty (do V1 rows have image URLs?)
 */

import { createClient } from '@supabase/supabase-js';

const V1_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const V1_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';

const v1Supabase = createClient(V1_URL, V1_KEY);

// Qualifying filter from migrate-v1-to-v2.mjs
function isQualifying(row) {
  return row &&
    typeof row.latitude === 'number' && !isNaN(row.latitude) &&
    typeof row.longitude === 'number' && !isNaN(row.longitude) &&
    typeof row.year === 'number' && !isNaN(row.year) &&
    typeof row.title === 'string' && row.title.trim().length > 0;
}

// Image URL check from migrate-v1-to-v2.mjs
function hasImageUrl(row) {
  const url = row.firebase_desktop || row.firebase_url || row.image_url;
  return url && url.trim().length > 0;
}

async function analyze() {
  console.log('='.repeat(60));
  console.log('V1 Data Analysis');
  console.log('='.repeat(60));
  
  // Get total count
  const { count: totalCount, error: countErr } = await v1Supabase
    .from('prompts')
    .select('*', { count: 'exact', head: true });
  
  if (countErr) {
    console.error('Failed to get count:', countErr.message);
    process.exit(1);
  }
  
  console.log(`Total V1 rows: ${totalCount}`);
  
  // Fetch all rows in batches
  const BATCH_SIZE = 1000;
  let allRows = [];
  let offset = 0;
  
  while (offset < totalCount) {
    const { data, error } = await v1Supabase
      .from('prompts')
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1);
    
    if (error) {
      console.error('Fetch error:', error.message);
      break;
    }
    
    allRows.push(...data);
    offset += BATCH_SIZE;
    console.log(`Fetched ${Math.min(offset, totalCount)}/${totalCount} rows`);
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log('QUALIFYING FILTER ANALYSIS');
  console.log('='.repeat(60));
  
  const qualifying = allRows.filter(isQualifying);
  const nonQualifying = allRows.filter(row => !isQualifying(row));
  
  console.log(`Qualifying rows (has lat/lng/year/title): ${qualifying.length}`);
  console.log(`Non-qualifying rows: ${nonQualifying.length}`);
  
  if (nonQualifying.length > 0) {
    console.log();
    console.log('Non-qualifying rows breakdown:');
    const missingLat = nonQualifying.filter(r => typeof r.latitude !== 'number' || isNaN(r.latitude));
    const missingLng = nonQualifying.filter(r => typeof r.longitude !== 'number' || isNaN(r.longitude));
    const missingYear = nonQualifying.filter(r => typeof r.year !== 'number' || isNaN(r.year));
    const missingTitle = nonQualifying.filter(r => !r.title || r.title.trim().length === 0);
    
    console.log(`  Missing latitude: ${missingLat.length}`);
    console.log(`  Missing longitude: ${missingLng.length}`);
    console.log(`  Missing year: ${missingYear.length}`);
    console.log(`  Missing title: ${missingTitle.length}`);
    
    console.log();
    console.log('Sample non-qualifying rows (first 5):');
    nonQualifying.slice(0, 5).forEach(row => {
      console.log(`  id: ${row.id}, lat: ${row.latitude}, lng: ${row.longitude}, year: ${row.year}, title: "${row.title}"`);
    });
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log('IMAGE URL ANALYSIS');
  console.log('='.repeat(60));
  
  const withImage = allRows.filter(hasImageUrl);
  const withoutImage = allRows.filter(row => !hasImageUrl(row));
  
  console.log(`Rows with image URL (firebase_desktop/firebase_url/image_url): ${withImage.length}`);
  console.log(`Rows without image URL: ${withoutImage.length}`);
  
  if (withImage.length > 0) {
    console.log();
    console.log('Image URL breakdown:');
    const withFirebaseDesktop = allRows.filter(r => r.firebase_desktop && r.firebase_desktop.trim().length > 0);
    const withFirebaseUrl = allRows.filter(r => r.firebase_url && r.firebase_url.trim().length > 0);
    const withImageUrl = allRows.filter(r => r.image_url && r.image_url.trim().length > 0);
    
    console.log(`  firebase_desktop: ${withFirebaseDesktop.length}`);
    console.log(`  firebase_url: ${withFirebaseUrl.length}`);
    console.log(`  image_url: ${withImageUrl.length}`);
    
    console.log();
    console.log('Sample rows with image URLs (first 5):');
    withImage.slice(0, 5).forEach(row => {
      console.log(`  id: ${row.id}, firebase_desktop: ${row.firebase_desktop?.substring(0, 50)}..., firebase_url: ${row.firebase_url?.substring(0, 50)}..., image_url: ${row.image_url?.substring(0, 50)}...`);
    });
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log('CONCLUSION');
  console.log('='.repeat(60));
  console.log(`V1 total: ${totalCount}`);
  console.log(`V2 events: 1179`);
  console.log(`Difference: ${totalCount - 1179}`);
  
  if (nonQualifying.length === totalCount - 1179) {
    console.log();
    console.log('✓ The 1,004 missing rows are due to the QUALIFYING FILTER (missing lat/lng/year/title)');
  } else {
    console.log();
    console.log('✗ The 1,004 missing rows are NOT due to the qualifying filter');
    console.log(`  Non-qualifying rows: ${nonQualifying.length}`);
    console.log(`  Expected if filter-only: ${totalCount - 1179}`);
    console.log('  The difference must be due to INSERT ERRORS (duplicate keys)');
  }
  
  console.log();
  if (withImage.length === 0) {
    console.log('✓ V2 has 0 images because V1 has 0 rows with image URLs');
  } else {
    console.log(`✗ V2 should have ${withImage.length} images but has 0`);
    console.log('  This suggests an INSERT ERROR issue');
  }
  console.log('='.repeat(60));
}

analyze().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
