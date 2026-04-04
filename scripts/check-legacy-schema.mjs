#!/usr/bin/env node
/**
 * Check legacy prompts table schema
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';

const legacySupabase = createClient(LEGACY_URL, LEGACY_KEY);

async function checkSchema() {
  // Get a sample prompt to see what columns exist
  const { data, error } = await legacySupabase
    .from('prompts')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  if (data && data.length > 0) {
    console.log('Available columns in prompts table:');
    console.log(Object.keys(data[0]).join('\n'));
    console.log('\nSample record:');
    console.log(JSON.stringify(data[0], null, 2));
  } else {
    console.log('No prompts found');
  }
}

checkSchema();
