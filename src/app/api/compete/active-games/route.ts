import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";
import { deriveAsyncPlayerHomeState } from "@/server/sessionCore";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playerId = user.id;
  const pool = getDbPool();

  try {
    // Step 1: Fetch all sessions this player participates in — including ones
    // they have left (left_at IS NOT NULL). Surfacing left-but-in-progress
    // games lets the player resume from the Home → Compete → Your Turn list;
    // re-joining the game clears left_at server-side.
    const sessionsResult = await pool.query<{
      game_id: string;
      total_rounds: number;
      mode: string;
      created_at: Date;
      session_deadline: Date | null;
    }>(
      `SELECT s.game_id, s.total_rounds, s.mode, s.created_at, s.session_deadline
       FROM sessions s
       JOIN session_players sp ON sp.game_id = s.game_id
       WHERE sp.player_id = $1
         AND s.mode IN ('sync', 'async')
         AND NOT sp.kicked
       ORDER BY s.created_at DESC
       LIMIT 20`,
      [playerId]
    );

    const games: Array<{
      id: string;
      game_id: string;
      opponent_id?: string;
      opponent_name?: string;
      opponent_avatar?: string;
      is_host_opponent?: boolean;
      is_host_viewer: boolean;
      opponent_pending: boolean;
      round_current: number;
      round_total: number;
      status: "your_turn" | "waiting" | "completed";
      mode: "sync" | "async";
      score_you?: number;
      score_them?: number;
      accuracy_you: number;
      leaderboard_rank?: number;
      created_at: string;
      session_deadline?: string;
      completed_at?: string;
    }> = [];

    for (const session of sessionsResult.rows) {
      const gameId = session.game_id;

      // Fetch viewer's own is_host status for host badge display.
      // Runs before the opponent lookup so isHostViewer is available
      // even when no opponent has joined yet (host-created-unstarted case).
      const viewerHostResult = await pool.query<{ is_host: boolean }>(
        `SELECT is_host FROM session_players WHERE game_id = $1 AND player_id = $2`,
        [gameId, playerId]
      );
      const isHostViewer = viewerHostResult.rows[0]?.is_host ?? false;

      // Step 2: Get opponent. Prefer an active opponent, but still return one
      // that has left so a session the player can resume is not skipped.
      const opponentResult = await pool.query<{
        player_id: string;
        display_name: string;
        avatar_url: string | null;
        is_host: boolean;
      }>(
        `SELECT sp.player_id, sp.display_name, sp.avatar_url, sp.is_host
         FROM session_players sp
         WHERE sp.game_id = $1
           AND sp.player_id != $2
         ORDER BY (sp.left_at IS NULL) DESC, sp.joined_at ASC
         LIMIT 1`,
        [gameId, playerId]
      );

      // No opponent joined yet (host-created-unstarted). Proceed with a null
      // opponent so status derivation can still run and surface the session
      // under "Your Turn" for the host.
      const opponent = opponentResult.rows.length > 0 ? opponentResult.rows[0] : null;

      // Step 3: Derive current round index and status
      let status: "your_turn" | "waiting" | "completed";
      let currentRoundIndex = 0;

      if (session.mode === "async") {
        const homeState = await deriveAsyncPlayerHomeState(gameId, playerId, pool);
        status = homeState.status;
        currentRoundIndex = homeState.currentRoundIndex;
      } else {
        // Sync path: existing logic unchanged.
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

        const roundCountResult = await pool.query<{ count: string }>(
          `SELECT COUNT(DISTINCT round_index) AS count FROM round_events
           WHERE game_id = $1 AND event_type = 'ROUND_STARTED'`,
          [gameId]
        );
        const roundStartedCount = parseInt(roundCountResult.rows[0]?.count ?? "0", 10);
        currentRoundIndex = roundStartedCount > 0 ? roundStartedCount - 1 : 0;

        if (latestEventType === "SESSION_COMPLETE") {
          status = "completed";
        } else if (
          latestEventType === null ||
          latestEventType === "SESSION_CREATED"
        ) {
          // Unstarted session: the host created it and left before any round
          // began — it is the host's turn to start/invite/resume it, so surface
          // it under "Your Turn" for the host only. Non-host viewers (who have
          // not joined yet) keep "waiting" — invite-pending handling is out of
          // scope here.
          status = isHostViewer ? "your_turn" : "waiting";
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
          status = commitResult.rows.length === 0 ? "your_turn" : "waiting";
        } else {
          // ROUND_COMPLETE, READY_NEXT, RESULT_STARTED
          status = "waiting";
        }
      }

      // Derive completed_at from events:
      // async: MAX(occurred_at) of PLAYER_SESSION_COMPLETE events for this game
      // sync: created_at of the SESSION_COMPLETE round_event for this game
      let completedAt: string | undefined;
      if (status === "completed") {
        if (session.mode === "async") {
          const completedAtResult = await pool.query<{ completed_at: Date | null }>(
            `SELECT MAX(occurred_at) AS completed_at FROM player_round_events
             WHERE game_id = $1 AND event_type = 'PLAYER_SESSION_COMPLETE'`,
            [gameId]
          );
          if (completedAtResult.rows[0]?.completed_at) {
            completedAt = new Date(completedAtResult.rows[0].completed_at).toISOString();
          }
        } else {
          const completedAtResult = await pool.query<{ created_at: Date | null }>(
            `SELECT created_at FROM round_events
             WHERE game_id = $1 AND event_type = 'SESSION_COMPLETE'
             ORDER BY id DESC LIMIT 1`,
            [gameId]
          );
          if (completedAtResult.rows[0]?.created_at) {
            completedAt = new Date(completedAtResult.rows[0].created_at).toISOString();
          }
        }
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
        } else if (opponent && row.player_id === opponent.player_id) {
          scoreThem = total;
        }
      }

      let leaderboardRank: number | undefined;
      if (status === "completed" && scoresResult.rows.length > 0) {
        const sorted = [...scoresResult.rows].sort((a, b) => {
          const aAvg = parseInt(a.avg_accuracy ?? "0", 10);
          const bAvg = parseInt(b.avg_accuracy ?? "0", 10);
          if (bAvg !== aAvg) return bAvg - aAvg;
          const aScore = parseInt(a.total_score ?? "0", 10);
          const bScore = parseInt(b.total_score ?? "0", 10);
          if (bScore !== aScore) return bScore - aScore;
          return a.player_id.localeCompare(b.player_id);
        });
        const rankIndex = sorted.findIndex((r) => r.player_id === playerId);
        if (rankIndex >= 0) {
          leaderboardRank = rankIndex + 1;
        }
      }

      games.push({
        id: gameId,
        game_id: gameId,
        opponent_id: opponent?.player_id,
        opponent_name: opponent ? (opponent.display_name || "Unknown") : undefined,
        opponent_avatar: opponent?.avatar_url ?? undefined,
        is_host_opponent: opponent?.is_host,
        is_host_viewer: isHostViewer,
        opponent_pending: opponent === null,
        round_current: currentRoundIndex + 1,
        round_total: session.total_rounds,
        status,
        mode: session.mode === "sync" ? "sync" : "async",
        score_you: scoreYou,
        score_them: scoreThem,
        accuracy_you: accuracyYou,
        leaderboard_rank: leaderboardRank,
        created_at: new Date(session.created_at).toISOString(),
        session_deadline: session.session_deadline ? new Date(session.session_deadline).toISOString() : undefined,
        completed_at: completedAt,
      });
    }

    return NextResponse.json({ games });
  } catch (error) {
    console.error("[active-games] Error:", error);
    return NextResponse.json({ games: [] });
  }
}
