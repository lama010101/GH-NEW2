import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();

    // List all tables in public schema
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('=== All tables in public schema ===');
    for (const row of res.rows) {
      console.log(row.table_name);
    }

    // Check for any tables with 'session' or 'round' or 'game' in name
    console.log('\n=== Tables containing session/round/game/player ===');
    const res2 = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND (table_name LIKE '%session%' 
          OR table_name LIKE '%round%' 
          OR table_name LIKE '%game%'
          OR table_name LIKE '%player%'
          OR table_name LIKE '%multiplayer%'
          OR table_name LIKE '%commit%'
          OR table_name LIKE '%event%')
      ORDER BY table_schema, table_name
    `);
    for (const row of res2.rows) {
      console.log(`${row.table_schema}.${row.table_name}`);
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
