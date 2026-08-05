import { NextResponse } from "next/server";
import { dbPool } from "@/server/db";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { resolvePlayerIdentities } from "@/core/playerIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type RawRow = {
  player_id: string;
  rank: number;
  avg_accuracy: number;
  total_xp: number;
  completed_at: string | null;
  best_round_accuracy: number | null;
};

export async function GET(request: Request) {
  try {
    const supabase = createAuthenticatedServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    if (!DATE_REGEX.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const result = await dbPool.query<RawRow>(
      `WITH human_daily AS (
        SELECT player_id, avg_accuracy::float, total_xp, completed_at, best_round_accuracy::float
        FROM leaderboard_daily
        WHERE date = $1
      ),
      ai_daily AS (
        SELECT
          a.ai_player_id AS player_id,
          ROUND(AVG(a.round_accuracy)::numeric, 2)::float AS avg_accuracy,
          COALESCE(SUM(a.round_xp), 0)::int AS total_xp,
          MAX(a.created_at) AS completed_at,
          MAX(a.round_accuracy)::numeric(5,2)::float AS best_round_accuracy
        FROM ai_answer_bank a
        JOIN ai_players ap ON ap.id = a.ai_player_id AND ap.is_active = true
        JOIN daily_challenges dc ON dc.date = $1 AND a.event_id = ANY(dc.event_ids)
        WHERE a.error IS NULL
        GROUP BY a.ai_player_id
      ),
      combined AS (
        SELECT * FROM human_daily
        UNION ALL
        SELECT * FROM ai_daily
      ),
      ranked AS (
        SELECT
          player_id,
          avg_accuracy,
          total_xp,
          completed_at,
          best_round_accuracy,
          RANK() OVER (ORDER BY avg_accuracy DESC, best_round_accuracy DESC NULLS LAST)::int AS rank
        FROM combined
      )
      SELECT player_id, rank, avg_accuracy, total_xp, completed_at, best_round_accuracy
      FROM ranked
      ORDER BY rank`,
      [date]
    );

    const playerIds = result.rows.map((r) => r.player_id);
    const identities = await resolvePlayerIdentities(dbPool, playerIds);

    const results = result.rows.map((row) => {
      const identity = identities.get(row.player_id);
      return {
        player_id: row.player_id,
        rank: row.rank,
        display_name: identity?.display_name ?? null,
        avatar_url: identity?.avatar_url ?? null,
        is_ai: identity?.is_ai ?? false,
        avg_accuracy: row.avg_accuracy,
        total_xp: row.total_xp,
        completed_at: row.completed_at,
        best_round_accuracy: row.best_round_accuracy,
      };
    });

    return NextResponse.json({ date, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch daily results";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
