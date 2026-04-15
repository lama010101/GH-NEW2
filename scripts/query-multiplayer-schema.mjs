import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();

    // Query 1: sessions
    console.log('=== Query 1: sessions ===');
    const q1 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sessions'
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(q1.rows, null, 2));

    // Query 2: session_players
    console.log('\n=== Query 2: session_players ===');
    const q2 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'session_players'
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(q2.rows, null, 2));

    // Query 3: round_commits
    console.log('\n=== Query 3: round_commits ===');
    const q3 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'round_commits'
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(q3.rows, null, 2));

    // Query 4: round_results
    console.log('\n=== Query 4: round_results ===');
    const q4 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'round_results'
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(q4.rows, null, 2));

    // Query 5: round_events
    console.log('\n=== Query 5: round_events ===');
    const q5 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'round_events'
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(q5.rows, null, 2));

    // Query 6: migrations
    console.log('\n=== Query 6: schema_migrations ===');
    const q6 = await client.query(`
      SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC
    `);
    console.log(JSON.stringify(q6.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
