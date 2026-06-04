import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getDbPool } from '@/server/db';

export const dynamic = 'force-dynamic';

interface ProgressData {
  stats: {
    avgAccuracy: number | null
    totalXp: number | null
    roundsPlayed: number | null
    gamesPlayed: number | null
  }
  byCentury: Array<{
    century: string
    avgAccuracy: number
    roundCount: number
  }>
  byContinent: Array<{
    continent: string
    avgAccuracy: number
    roundCount: number
  }>
  eventsSeenCount: number
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_: NextRequest) {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore — called from Server Component context
          }
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const playerId = user.id;

  try {
    const db = getDbPool();

    const [statsResult, centuryResult, continentResult, eventsSeenResult] = await Promise.all([
      db.query<{
        avg_accuracy: number | null;
        total_xp: number | null;
        rounds_played: number | null;
        games_played: number | null;
      }>(
        `SELECT avg_accuracy, total_xp, rounds_played, games_played
         FROM player_global_stats
         WHERE player_id = $1
         LIMIT 1`,
        [playerId]
      ),
      db.query<{
        century: string;
        avg_accuracy: string;
        round_count: string;
      }>(
        `SELECT
          CASE
            WHEN e.event_year >= 2000 THEN '2000s'
            WHEN e.event_year >= 1900 THEN '1900s'
            WHEN e.event_year >= 1800 THEN '1800s'
            WHEN e.event_year >= 1700 THEN '1700s'
            WHEN e.event_year >= 1600 THEN '1600s'
            WHEN e.event_year >= 1500 THEN '1500s'
            ELSE 'pre-1500'
          END AS century,
          ROUND(AVG((rr.location_score + rr.time_score) / 2.0), 1) AS avg_accuracy,
          COUNT(*) AS round_count
        FROM round_results rr
        JOIN round_events re
          ON re.game_id = rr.game_id
          AND re.round_index = rr.round_index
          AND re.event_type = 'ROUND_STARTED'
        JOIN events e
          ON e.id = (re.payload->>'eventId')::uuid
        WHERE rr.player_id = $1
          AND rr.location_score IS NOT NULL
          AND rr.time_score IS NOT NULL
        GROUP BY century
        ORDER BY MIN(e.event_year) DESC`,
        [playerId]
      ),
      db.query<{
        continent: string;
        avg_accuracy: string;
        round_count: string;
      }>(
        `SELECT
          l.continent,
          ROUND(AVG((rr.location_score + rr.time_score) / 2.0), 1) AS avg_accuracy,
          COUNT(*) AS round_count
        FROM round_results rr
        JOIN round_events re
          ON re.game_id = rr.game_id
          AND re.round_index = rr.round_index
          AND re.event_type = 'ROUND_STARTED'
        JOIN events e
          ON e.id = (re.payload->>'eventId')::uuid
        JOIN locations l
          ON l.event_id = e.id
        WHERE rr.player_id = $1
          AND l.continent IS NOT NULL
          AND rr.location_score IS NOT NULL
          AND rr.time_score IS NOT NULL
        GROUP BY l.continent
        ORDER BY avg_accuracy DESC`,
        [playerId]
      ),
      db.query<{ events_seen: string }>(
        `SELECT COUNT(DISTINCT (re.payload->>'eventId')::uuid) AS events_seen
         FROM round_results rr
         JOIN round_events re
           ON re.game_id = rr.game_id
           AND re.round_index = rr.round_index
           AND re.event_type = 'ROUND_STARTED'
         WHERE rr.player_id = $1`,
        [playerId]
      ),
    ]);

    const statsRow = statsResult.rows[0] ?? null;

    const response: ProgressData = {
      stats: {
        avgAccuracy: statsRow?.avg_accuracy ?? null,
        totalXp: statsRow?.total_xp ?? null,
        roundsPlayed: statsRow?.rounds_played ?? null,
        gamesPlayed: statsRow?.games_played ?? null,
      },
      byCentury: centuryResult.rows.map((row) => ({
        century: row.century,
        avgAccuracy: parseFloat(row.avg_accuracy),
        roundCount: parseInt(row.round_count, 10),
      })),
      byContinent: continentResult.rows.map((row) => ({
        continent: row.continent,
        avgAccuracy: parseFloat(row.avg_accuracy),
        roundCount: parseInt(row.round_count, 10),
      })),
      eventsSeenCount: parseInt(eventsSeenResult.rows[0]?.events_seen ?? '0', 10),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[api/progress] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
