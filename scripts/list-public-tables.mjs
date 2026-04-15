import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();

    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('=== Query 1: Tables in public schema ===');
    console.log(JSON.stringify(res.rows, null, 2));

    const res2 = await client.query(`
      SELECT * FROM supabase_migrations.schema_migrations ORDER BY version ASC;
    `);
    console.log('\n=== Query 3: Schema migrations ===');
    console.log(JSON.stringify(res2.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
