import { NextResponse } from "next/server";
import { dbPool } from "@/server/db";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDailyChallengeDate } from "@/core/dailyDate";
import { loadCompeteSessionSnapshot } from "@/server/sessionCore";
import { finalizeStaleDailyAttempts } from "@/server/dailyChallenge";
import { loadDailyRankedRows } from "@/server/dailyRankedRows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const playerId = user.id;
    const todayIso = getDailyChallengeDate();

    // Lazy finalization of stale attempts from past dates (DAILY_MODE_SPEC.md §5.4)
    await finalizeStaleDailyAttempts(playerId, todayIso);

    const attempt = await dbPool.query<{ game_id: string; status: string }>(
      `SELECT game_id, status FROM daily_attempts WHERE date = $1 AND player_id = $2`,
      [todayIso, playerId]
    );

    if (attempt.rows.length === 0) {
      return NextResponse.json({ status: "not_started", date: todayIso });
    }

    const { game_id: gameId, status } = attempt.rows[0];

    if (status === "in_progress") {
      const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
      return NextResponse.json({
        status: "in_progress",
        date: todayIso,
        gameId,
        currentRoundIndex: snapshot?.currentRoundIndex ?? 0,
        phase: snapshot?.status ?? "LOBBY",
      });
    }

    // completed or expired — build result payload from leaderboard_daily
    const leaderboard = await dbPool.query<{
      avg_accuracy: number;
      best_round_accuracy: number | null;
      total_xp: number;
    }>(
      `SELECT avg_accuracy, best_round_accuracy, total_xp FROM leaderboard_daily WHERE date = $1 AND player_id = $2`,
      [todayIso, playerId]
    );

    let rank: number | null = null;
    if (leaderboard.rows.length > 0) {
      // Rank basis is humans+AI via the shared loader — the same rows
      // /api/daily/results and /api/daily/panel rank from (single owner).
      const rankedRows = await loadDailyRankedRows(todayIso);
      rank = rankedRows.find((r) => r.player_id === playerId)?.rank ?? null;
    }

    return NextResponse.json({
      status,
      date: todayIso,
      gameId,
      results: {
        avgAccuracy: leaderboard.rows[0]?.avg_accuracy ?? 0,
        totalXp: leaderboard.rows[0]?.total_xp ?? 0,
        rank,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch daily status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
