import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDailyChallengeDate } from "@/core/dailyDate";
import { dbPool } from "@/server/db";
import { loadDailyRankedRows } from "@/server/dailyRankedRows";
import {
  bucketizeAccuracy,
  summarizeDailyPanelRows,
} from "@/core/dailyPanelStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return formatError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const rawDate = searchParams.get("date");
    const targetDate = rawDate ?? getDailyChallengeDate();

    if (!DATE_REGEX.test(targetDate)) {
      return formatError("Invalid date format. Use YYYY-MM-DD.", 400);
    }

    const rankedRows = await loadDailyRankedRows(targetDate);
    const { totalPlayers, aiPlayers, globalAvgAccuracy } =
      summarizeDailyPanelRows(rankedRows);
    const histogram = bucketizeAccuracy(
      rankedRows.map((row) => row.avg_accuracy)
    );

    const ownRow = rankedRows.find((row) => row.player_id === user.id);
    const rank = ownRow ? ownRow.rank : null;

    const streakResult = await dbPool.query<{
      daily_streak_current: number;
      daily_streak_best: number;
    }>(
      `SELECT daily_streak_current, daily_streak_best
       FROM player_daily_streak
       WHERE player_id = $1`,
      [user.id]
    );
    const streakRow = streakResult.rows[0];
    const streak = {
      current: streakRow ? Number(streakRow.daily_streak_current) : 0,
      best: streakRow ? Number(streakRow.daily_streak_best) : 0,
    };

    return NextResponse.json({
      date: targetDate,
      rank,
      totalPlayers,
      aiPlayers,
      globalAvgAccuracy,
      histogram,
      streak,
    });
  } catch (error) {
    console.error("[daily/panel] Failed to load daily panel:", error);
    const message = error instanceof Error ? error.message : "Unable to fetch daily panel";
    return formatError(message, 500);
  }
}
