import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDailyChallengeDate } from "@/core/dailyDate";
import { dbPool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "today";
    const date = searchParams.get("date");

    if (view === "today") {
      const targetDate = date ?? getDailyChallengeDate();

      // Top 50 for today
      const topRows = await dbPool.query<{
        player_id: string;
        avg_accuracy: number;
        total_xp: number;
      }>(
        `WITH human_daily AS (
          SELECT player_id, avg_accuracy, total_xp, completed_at, best_round_accuracy AS best_accuracy
          FROM leaderboard_daily
          WHERE date = $1
        ),
        ai_daily AS (
          SELECT
            a.ai_player_id AS player_id,
            ROUND(AVG(a.round_accuracy)::numeric, 2) AS avg_accuracy,
            COALESCE(SUM(a.round_xp), 0)::int AS total_xp,
            MAX(a.created_at) AS completed_at,
            MAX(a.round_accuracy)::numeric(5,2) AS best_accuracy
          FROM ai_answer_bank a
          JOIN ai_players ap ON ap.id = a.ai_player_id AND ap.is_active_daily = true
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
            best_accuracy,
            RANK() OVER (ORDER BY avg_accuracy DESC, best_accuracy DESC NULLS LAST)::int AS rank
          FROM combined
        )
        SELECT player_id, avg_accuracy, total_xp
        FROM ranked
        ORDER BY rank
        LIMIT 50`,
        [targetDate]
      );

      // Requesting player's own rank
      const ownRow = await dbPool.query<{
        avg_accuracy: number;
        best_round_accuracy: number | null;
        total_xp: number;
        rank: number;
      }>(
        `WITH human_daily AS (
          SELECT player_id, avg_accuracy, total_xp, completed_at, best_round_accuracy AS best_accuracy
          FROM leaderboard_daily
          WHERE date = $1
        ),
        ai_daily AS (
          SELECT
            a.ai_player_id AS player_id,
            ROUND(AVG(a.round_accuracy)::numeric, 2) AS avg_accuracy,
            COALESCE(SUM(a.round_xp), 0)::int AS total_xp,
            MAX(a.created_at) AS completed_at,
            MAX(a.round_accuracy)::numeric(5,2) AS best_accuracy
          FROM ai_answer_bank a
          JOIN ai_players ap ON ap.id = a.ai_player_id AND ap.is_active_daily = true
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
            best_accuracy,
            RANK() OVER (ORDER BY avg_accuracy DESC, best_accuracy DESC NULLS LAST)::int AS rank
          FROM combined
        )
        SELECT avg_accuracy, best_accuracy AS best_round_accuracy, total_xp, rank
        FROM ranked
        WHERE player_id = $2`,
        [targetDate, user.id]
      );

      let ownRank = null;
      let ownEntry = null;
      if (ownRow.rows.length > 0) {
        const { rank, ...entry } = ownRow.rows[0];
        ownRank = rank;
        ownEntry = entry;
      }

      // Global average accuracy today
      const avgResult = await dbPool.query<{ avg: number | null }>(
        `WITH human_daily AS (
          SELECT player_id, avg_accuracy, total_xp, completed_at, best_round_accuracy AS best_accuracy
          FROM leaderboard_daily
          WHERE date = $1
        ),
        ai_daily AS (
          SELECT
            a.ai_player_id AS player_id,
            ROUND(AVG(a.round_accuracy)::numeric, 2) AS avg_accuracy,
            COALESCE(SUM(a.round_xp), 0)::int AS total_xp,
            MAX(a.created_at) AS completed_at,
            MAX(a.round_accuracy)::numeric(5,2) AS best_accuracy
          FROM ai_answer_bank a
          JOIN ai_players ap ON ap.id = a.ai_player_id AND ap.is_active_daily = true
          JOIN daily_challenges dc ON dc.date = $1 AND a.event_id = ANY(dc.event_ids)
          WHERE a.error IS NULL
          GROUP BY a.ai_player_id
        ),
        combined AS (
          SELECT * FROM human_daily
          UNION ALL
          SELECT * FROM ai_daily
        )
        SELECT AVG(avg_accuracy) AS avg FROM combined`,
        [targetDate]
      );

      return NextResponse.json({
        view: "today",
        date: targetDate,
        top: topRows.rows,
        ownRank,
        ownEntry,
        globalAvgAccuracy: avgResult.rows[0]?.avg ?? null,
      });
    }

    if (view === "alltime") {
      const topRows = await dbPool.query<{
        player_id: string;
        avg_accuracy: number;
        total_xp: number;
        games_played: number;
      }>(
        `SELECT player_id, avg_accuracy, total_xp, games_played
         FROM leaderboard_daily_alltime
         ORDER BY avg_accuracy DESC, total_xp DESC
         LIMIT 50`,
        []
      );

      const ownRow = await dbPool.query<{
        avg_accuracy: number;
        total_xp: number;
        games_played: number;
      }>(
        `SELECT avg_accuracy, total_xp, games_played FROM leaderboard_daily_alltime
         WHERE player_id = $1`,
        [user.id]
      );

      let ownRank = null;
      if (ownRow.rows.length > 0) {
        const rankResult = await dbPool.query<{ rank: number }>(
          `SELECT COUNT(*)::int + 1 AS rank
           FROM leaderboard_daily_alltime
           WHERE (avg_accuracy, total_xp) > ($1, $2)`,
          [ownRow.rows[0].avg_accuracy, ownRow.rows[0].total_xp]
        );
        ownRank = rankResult.rows[0]?.rank ?? null;
      }

      return NextResponse.json({
        view: "alltime",
        top: topRows.rows,
        ownRank,
        ownEntry: ownRow.rows[0] ?? null,
      });
    }

    return NextResponse.json({ error: "Invalid view parameter (use 'today' or 'alltime')" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch leaderboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
