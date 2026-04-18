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
        t.table_name,
        string_agg(c.column_name || ' ' || c.data_type, ', ' ORDER BY c.ordinal_position) AS columns,
        r.relrowsecurity AS rls_enabled
      FROM information_schema.tables t
      JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
      JOIN pg_class r ON r.relname = t.table_name
      JOIN pg_namespace n ON n.oid = r.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema = 'public'
        AND t.table_name IN ('sessions','session_players','round_commits','round_results','round_events')
      GROUP BY n.nspname, t.table_name, r.relrowsecurity
      ORDER BY t.table_name;
    `);
    console.log('=== Verified Baseline ===');
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
