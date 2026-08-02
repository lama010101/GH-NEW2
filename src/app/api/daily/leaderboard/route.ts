import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
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
      const targetDate = date ?? new Date().toISOString().slice(0, 10);

      // Top 50 for today
      const topRows = await dbPool.query<{
        player_id: string;
        avg_accuracy: number;
        total_xp: number;
      }>(
        `SELECT player_id, avg_accuracy, total_xp
         FROM leaderboard_daily
         WHERE date = $1
         ORDER BY avg_accuracy DESC, best_round_accuracy DESC NULLS LAST
         LIMIT 50`,
        [targetDate]
      );

      // Requesting player's own rank
      const ownRow = await dbPool.query<{
        avg_accuracy: number;
        best_round_accuracy: number | null;
        total_xp: number;
      }>(
        `SELECT avg_accuracy, best_round_accuracy, total_xp FROM leaderboard_daily
         WHERE date = $1 AND player_id = $2`,
        [targetDate, user.id]
      );

      let ownRank = null;
      if (ownRow.rows.length > 0) {
        const own = ownRow.rows[0];
        const rankResult = await dbPool.query<{ rank: number }>(
          `SELECT COUNT(*)::int + 1 AS rank
           FROM leaderboard_daily
           WHERE date = $1
             AND (avg_accuracy, COALESCE(best_round_accuracy, -1.0)) > ($2, COALESCE($3, -1.0))`,
          [targetDate, own.avg_accuracy, own.best_round_accuracy]
        );
        ownRank = rankResult.rows[0]?.rank ?? null;
      }

      // Global average accuracy today
      const avgResult = await dbPool.query<{ avg: number | null }>(
        `SELECT AVG(avg_accuracy) AS avg FROM leaderboard_daily WHERE date = $1`,
        [targetDate]
      );

      return NextResponse.json({
        view: "today",
        date: targetDate,
        top: topRows.rows,
        ownRank,
        ownEntry: ownRow.rows[0] ?? null,
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
