// Use Supabase REST API to inspect schema
const SUPABASE_URL = 'https://jghesmrwhegaotbztrhr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaGVzbXJ3aGVnYW90Ynp0cmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDQzMDAwMSwiZXhwIjoyMDYwMDA2MDAxfQ.EWllmNS-LOK-wLdrFgPqGzRvWi1JLAENRHU1dDg_PbM';

async function queryPostgres(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'X-Client-Info': 'supabase-js/2.x',
      'Prefer': 'tx=read-only'
    },
    body: JSON.stringify({ query })
  });
  return res.json();
}

async function getTables() {
  // Use RPC to execute SQL
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_schema_info`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'X-Client-Info': 'supabase-js/2.x'
    },
    body: JSON.stringify({})
  });
  
  if (!res.ok) {
    // Try direct SQL via the pg-meta endpoint
    const tablesRes = await fetch(`${SUPABASE_URL}/pg-meta/default/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        query: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `
      })
    });
    return tablesRes.json();
  }
  return res.json();
}

async function main() {
  try {
    console.log('Attempting to connect to Supabase REST API...\n');
    
    // Try the pg-meta endpoint
    const res = await fetch(`${SUPABASE_URL}/pg-meta/default/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        query: `
          SELECT 
            t.table_name,
            json_agg(
              json_build_object(
                'name', c.column_name,
                'type', c.data_type,
                'nullable', c.is_nullable,
                'default', c.column_default
              ) ORDER BY c.ordinal_position
            ) as columns
          FROM information_schema.tables t
          JOIN information_schema.columns c 
            ON t.table_name = c.table_name AND t.table_schema = c.table_schema
          WHERE t.table_schema = 'public' 
            AND t.table_type = 'BASE TABLE'
          GROUP BY t.table_name
          ORDER BY t.table_name
        `
      })
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.log('pg-meta failed, trying alternative...');
      console.log('Error:', err);
      return;
    }
    
    const data = await res.json();
    
    console.log('=== LEGACY DATABASE SCHEMA ===\n');
    
    for (const table of data) {
      console.log(`📋 ${table.table_name}`);
      console.log('   Columns:');
      for (const col of table.columns) {
        const nullable = col.nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const def = col.default ? ` DEFAULT ${col.default}` : '';
        console.log(`   • ${col.name}: ${col.type} ${nullable}${def}`);
      }
      console.log('');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
