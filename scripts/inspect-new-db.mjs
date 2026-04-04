// Inspect NEW database tables
const SUPABASE_URL = 'https://gzvixlvkwjsrtmtybtkf.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6dml4bHZrd2pzcnRtdHlidGtmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTk5NjAwMCwiZXhwIjoyMDYxNTcyMDAwfQ.fake_key_for_demo';

async function main() {
  console.log('Inspecting NEW database (gzvixlvkwjsrtmtybtkf)...\n');
  
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SERVICE_KEY}`, {
      headers: { 'Accept': 'application/openapi+json' }
    });
    
    if (!res.ok) {
      console.log('Failed to fetch OpenAPI spec:', res.status);
      const text = await res.text();
      console.log('Response:', text.substring(0, 200));
      return;
    }
    
    const data = await res.json();
    
    console.log('=== TABLES IN NEW DATABASE ===\n');
    
    const paths = Object.keys(data.paths || {});
    const definitions = Object.keys(data.definitions || {});
    
    console.log(`Found ${definitions.length} tables/schemas:\n`);
    
    for (const def of definitions.sort()) {
      console.log(`📋 ${def}`);
      const props = data.definitions[def].properties || {};
      for (const [prop, info] of Object.entries(props)) {
        const fmt = info.format ? ` (${info.format})` : '';
        console.log(`   • ${prop}: ${info.type}${fmt}`);
      }
      console.log('');
    }
    
    // Also list raw paths
    console.log('=== REST API PATHS ===');
    for (const path of paths.sort()) {
      console.log(`  ${path}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
