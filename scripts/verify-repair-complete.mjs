import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();

    // Step 1: Delete ghost migration records
    console.log('=== Step 1: Delete ghost migration records ===');
    const delRes = await client.query(`
      DELETE FROM supabase_migrations.schema_migrations 
      WHERE version IN ('20260407070105', '20260407070141', '20260407072410');
    `);
    console.log(`Deleted ${delRes.rowCount} rows`);

    console.log('\n=== Step 1 Verification: All migrations ===');
    const migRes = await client.query(`
      SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC;
    `);
    console.log(JSON.stringify(migRes.rows, null, 2));

    // Step 2: Final state verification
    console.log('\n=== Step 2: Final state verification (table columns) ===');
    const colsRes = await client.query(`
      SELECT 
        t.table_name,
        string_agg(c.column_name || ' (' || c.data_type || ')', ', ' ORDER BY c.ordinal_position) AS columns
      FROM information_schema.tables t
      JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = 'public'
      WHERE t.table_schema = 'public'
        AND t.table_name IN ('sessions','session_players','round_commits','round_results','round_events')
      GROUP BY t.table_name
      ORDER BY t.table_name;
    `);
    console.log(JSON.stringify(colsRes.rows, null, 2));

    // Step 3: RLS verification
    console.log('\n=== Step 3: RLS verification ===');
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname IN ('sessions','session_players','round_commits','round_results','round_events')
      ORDER BY relname;
    `);
    console.log(JSON.stringify(rlsRes.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
