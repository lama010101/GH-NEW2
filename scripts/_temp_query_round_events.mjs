import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres'
});

async function runQueries() {
  try {
    console.log('=== QUERY A: Most recent sessions ===');
    const resultA = await pool.query(
      `SELECT game_id, mode, created_at FROM sessions ORDER BY created_at DESC LIMIT 5;`
    );
    console.table(resultA.rows);

    if (resultA.rows.length === 0) {
      console.log('No sessions found');
      return;
    }

    const mostRecentGameId = resultA.rows[0].game_id;
    console.log(`\nMost recent game_id: ${mostRecentGameId}`);

    console.log('\n=== QUERY B: All round_events for most recent game ===');
    const resultB = await pool.query(
      `SELECT id, round_index, event_type, created_at FROM round_events WHERE game_id = $1 ORDER BY id ASC;`,
      [mostRecentGameId]
    );
    console.table(resultB.rows);

    console.log('\n=== QUERY C: loadLastEventWithLock simulation (last event) ===');
    const resultC = await pool.query(
      `SELECT event_type, round_index, created_at FROM round_events WHERE game_id = $1 ORDER BY id DESC LIMIT 1;`,
      [mostRecentGameId]
    );
    console.table(resultC.rows);

    console.log('\n=== ANSWER ===');
    console.log(`Last event_type for game ${mostRecentGameId}: ${resultC.rows[0]?.event_type ?? 'NULL'}`);
    console.log(`Last round_index for game ${mostRecentGameId}: ${resultC.rows[0]?.round_index ?? 'NULL'}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

runQueries();
