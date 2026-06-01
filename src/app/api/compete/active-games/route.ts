import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
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
            // The `set` method was called from a Server Component.
            // This can be ignored if middleware refreshes sessions.
          }
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playerId = user.id;
  const pool = getDbPool();

  try {
    // Step 1: Fetch all sessions where this player is active
    const sessionsResult = await pool.query<{
      game_id: string;
      total_rounds: number;
      mode: string;
      created_at: Date;
    }>(
      `SELECT s.game_id, s.total_rounds, s.mode, s.created_at
       FROM sessions s
       JOIN session_players sp ON sp.game_id = s.game_id
       WHERE sp.player_id = $1
         AND sp.left_at IS NULL
         AND s.mode IN ('sync', 'async')
       ORDER BY s.created_at DESC
       LIMIT 20`,
      [playerId]
    );

    const games: Array<{
      id: string;
      game_id: string;
      opponent_name: string;
      opponent_avatar?: string;
      round_current: number;
      round_total: number;
      status: "your_turn" | "waiting" | "completed";
      score_you?: number;
      score_them?: number;
      accuracy_you: number;
    }> = [];

    for (const session of sessionsResult.rows) {
      const gameId = session.game_id;

      // Step 2: Get opponent
      const opponentResult = await pool.query<{
        player_id: string;
        display_name: string;
        avatar_url: string | null;
      }>(
        `SELECT sp.player_id, sp.display_name, sp.avatar_url
         FROM session_players sp
         WHERE sp.game_id = $1
           AND sp.player_id != $2
           AND sp.left_at IS NULL
         LIMIT 1`,
        [gameId, playerId]
      );

      // Skip sessions with no opponent
      if (opponentResult.rows.length === 0) continue;

      const opponent = opponentResult.rows[0];

      // Step 3: Get latest event to determine status
      const latestEventResult = await pool.query<{
        event_type: string;
      }>(
        `SELECT event_type FROM round_events
         WHERE game_id = $1
         ORDER BY id DESC
         LIMIT 1`,
        [gameId]
      );

      const latestEventType = latestEventResult.rows[0]?.event_type ?? null;

      // Step 4: Derive current round index
      const roundCountResult = await pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT round_index) AS count FROM round_events
         WHERE game_id = $1 AND event_type = 'ROUND_STARTED'`,
        [gameId]
      );
      const roundStartedCount = parseInt(roundCountResult.rows[0]?.count ?? "0", 10);
      const currentRoundIndex = roundStartedCount > 0 ? roundStartedCount - 1 : 0;

      // Step 5: Map event_type to frontend status
      let status: "your_turn" | "waiting" | "completed";

      if (latestEventType === "SESSION_COMPLETE") {
        status = "completed";
      } else if (
        latestEventType === null ||
        latestEventType === "SESSION_CREATED"
      ) {
        status = "waiting";
      } else if (
        latestEventType === "ROUND_STARTED" ||
        latestEventType === "GUESS_SUBMITTED" ||
        latestEventType === "PRESSURE_APPLIED"
      ) {
        // Check if current player has submitted for this round
        const commitResult = await pool.query<{ player_id: string }>(
          `SELECT player_id FROM round_commits
           WHERE game_id = $1 AND player_id = $2 AND round_index = $3
           LIMIT 1`,
          [gameId, playerId, currentRoundIndex]
        );
        status = commitResult.rows.length === 0 && session.mode === 'async' ? "your_turn" : "waiting";
      } else {
        // ROUND_COMPLETE, READY_NEXT, RESULT_STARTED
        status = "waiting";
      }

      // Step 6: Fetch scores and accuracy
      const scoresResult = await pool.query<{
        player_id: string;
        total_score: string;
        avg_accuracy: string;
      }>(
        `SELECT
           player_id,
           SUM(score) as total_score,
           ROUND(AVG((COALESCE(location_score,0) + COALESCE(time_score,0)) / 2.0))::int as avg_accuracy
         FROM round_results
         WHERE game_id = $1
         GROUP BY player_id`,
        [gameId]
      );

      let scoreYou: number | undefined;
      let scoreThem: number | undefined;
      let accuracyYou: number = 0;

      for (const row of scoresResult.rows) {
        const total = parseInt(row.total_score ?? "0", 10);
        if (row.player_id === playerId) {
          scoreYou = total;
          accuracyYou = parseInt(row.avg_accuracy ?? "0", 10);
        } else if (row.player_id === opponent.player_id) {
          scoreThem = total;
        }
      }

      games.push({
        id: gameId,
        game_id: gameId,
        opponent_name: opponent.display_name || "Unknown",
        opponent_avatar: opponent.avatar_url ?? undefined,
        round_current: currentRoundIndex + 1,
        round_total: session.total_rounds,
        status,
        score_you: scoreYou,
        score_them: scoreThem,
        accuracy_you: accuracyYou,
      });
    }

    return NextResponse.json({ games });
  } catch (error) {
    console.error("[active-games] Error:", error);
    return NextResponse.json({ games: [] });
  }
}
