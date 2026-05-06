import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to NEW database (gzvixlvkwjsrtmtybtkf)\n');
    
    const query = `
      SELECT id, event_id, tier, type, content, metadata, display_order
      FROM hints
      WHERE event_id = '41c5d363-ac89-4c06-a610-ce520800abd5'
      ORDER BY type, tier, display_order;
    `;
    
    const res = await client.query(query);
    
    console.log('=== HINTS FOR EVENT 41c5d363-ac89-4c06-a610-ce520800abd5 ===\n');
    console.log('Rows:', res.rows.length);
    console.log();
    
    for (const row of res.rows) {
      console.log('---');
      console.log('id:', row.id);
      console.log('event_id:', row.event_id);
      console.log('tier:', row.tier);
      console.log('type:', row.type);
      console.log('content:', row.content);
      console.log('metadata:', row.metadata);
      console.log('display_order:', row.display_order);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
