import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to DB\n');

    // Create tables
    console.log('=== Creating tables ===');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.sessions (
        game_id          UUID        PRIMARY KEY,
        mode             VARCHAR     NOT NULL,
        round_timer_sec  INT         NOT NULL,
        total_rounds     INT         NOT NULL,
        year_min         INT         NOT NULL,
        year_max         INT         NOT NULL,
        session_deadline TIMESTAMP,
        created_at       TIMESTAMP   DEFAULT now()
      );
    `);
    console.log('✓ sessions');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.session_players (
        game_id   UUID,
        player_id UUID,
        joined_at TIMESTAMP DEFAULT now(),
        left_at   TIMESTAMP,
        PRIMARY KEY (game_id, player_id)
      );
    `);
    console.log('✓ session_players');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.round_commits (
        game_id             UUID,
        player_id           UUID,
        round_index         INT,
        submitted_at        TIMESTAMP,
        year_guess          INT,
        location_lat        DOUBLE PRECISION,
        location_lng        DOUBLE PRECISION,
        hints_used          INT,
        score               INT,
        verification_token  UUID NOT NULL DEFAULT gen_random_uuid(),
        PRIMARY KEY (game_id, player_id, round_index)
      );
    `);
    console.log('✓ round_commits');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.round_results (
        game_id             UUID,
        round_index         INT,
        player_id           UUID,
        score               INT,
        rank                INT,
        distance_km         DOUBLE PRECISION,
        year_diff           INT,
        location_score      INT,
        time_score          INT,
        verification_token  UUID NOT NULL DEFAULT gen_random_uuid(),
        PRIMARY KEY (game_id, round_index, player_id)
      );
    `);
    console.log('✓ round_results');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.round_events (
        id                  BIGSERIAL   PRIMARY KEY,
        game_id             UUID,
        round_index         INT,
        event_type          VARCHAR,
        payload             JSONB,
        created_at          TIMESTAMP   DEFAULT now(),
        verification_token  UUID NOT NULL DEFAULT gen_random_uuid()
      );
    `);
    console.log('✓ round_events');

    // Enable RLS
    console.log('\n=== Enabling RLS ===');
    await client.query(`ALTER TABLE public.sessions        ENABLE ROW LEVEL SECURITY;`);
    console.log('✓ sessions RLS');
    await client.query(`ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;`);
    console.log('✓ session_players RLS');
    await client.query(`ALTER TABLE public.round_commits   ENABLE ROW LEVEL SECURITY;`);
    console.log('✓ round_commits RLS');
    await client.query(`ALTER TABLE public.round_results   ENABLE ROW LEVEL SECURITY;`);
    console.log('✓ round_results RLS');
    await client.query(`ALTER TABLE public.round_events    ENABLE ROW LEVEL SECURITY;`);
    console.log('✓ round_events RLS');

    // Verification query
    console.log('\n=== Verification query ===');
    const res = await client.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns c 
              WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
        AND table_name IN ('sessions','session_players','round_commits','round_results','round_events')
      ORDER BY table_name;
    `);
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
