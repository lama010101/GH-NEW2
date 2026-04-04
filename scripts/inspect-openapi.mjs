// Use Supabase Management API to get schema info
const SUPABASE_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';

async function main() {
  console.log('Trying various Supabase API endpoints...\n');
  
  // Try the REST API directly - get a list of tables by querying information_schema
  const endpoints = [
    // Try to query via REST (PostgREST)
    { url: `${SUPABASE_URL}/rest/v1/`, method: 'GET', desc: 'PostgREST root' },
  ];
  
  for (const ep of endpoints) {
    try {
      console.log(`Trying: ${ep.desc}`);
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      const body = await res.text();
      console.log(`Status: ${res.status}`);
      console.log(`Response: ${body.substring(0, 500)}\n`);
    } catch (err) {
      console.log(`Error: ${err.message}\n`);
    }
  }
  
  // Try direct query using PostgREST OpenAPI spec
  try {
    console.log('\n--- Trying OpenAPI spec ---');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SERVICE_KEY}`, {
      headers: { 'Accept': 'application/openapi+json' }
    });
    const data = await res.json();
    
    console.log('Tables found in OpenAPI spec:');
    const paths = Object.keys(data.paths || {});
    for (const path of paths) {
      console.log(`  - ${path}`);
    }
    
    // Also show definitions/schemas
    const definitions = Object.keys(data.definitions || {});
    console.log('\nDefinitions:');
    for (const def of definitions) {
      console.log(`  - ${def}`);
      const props = data.definitions[def].properties || {};
      for (const [prop, info] of Object.entries(props)) {
        console.log(`      ${prop}: ${info.type}${info.format ? ` (${info.format})` : ''}`);
      }
    }
    
  } catch (err) {
    console.log(`OpenAPI error: ${err.message}`);
  }
}

main();
