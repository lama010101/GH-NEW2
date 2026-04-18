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
      SELECT 
        n.nspname AS schema,
        c.relname AS table_name,
        c.relkind,
        c.relrowsecurity,
        c.oid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'sessions'
      ORDER BY n.nspname;
    `);
    console.log('=== sessions tables across schemas ===');
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
