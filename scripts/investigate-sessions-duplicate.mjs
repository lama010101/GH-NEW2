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
      SELECT relname, relkind, relrowsecurity 
      FROM pg_class 
      WHERE relname = 'sessions';
    `);
    console.log('=== sessions pg_class entries ===');
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
