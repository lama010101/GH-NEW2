// HJ-BUILD-PLAYTHROUGH-START-001 — one-off PROD verification harness.
// Calls startJourneyPlaythrough for a real player + stage, reads back every
// row it wrote, then (with --start) proves the created session is playable via
// the EXISTING practice path: loadCompeteSessionSnapshot (LOBBY) +
// startCompeteSession (the function behind POST /api/practice/[gameId]/start).
//
// Usage:
//   npx tsx scripts/journey/test-playthrough-start.ts --player=<uuid> --stage=<uuid> [--start]
// Requires .env.local with SUPABASE_DB_CONNECTION (service-role pg).

import { config } from "dotenv";
config({ path: ".env.local" });

import { getDbPool } from "@/server/db";
import { startJourneyPlaythrough } from "@/server/journeyCore";
import {
  loadCompeteSessionSnapshot,
  startCompeteSession,
} from "@/server/sessionCore";
import { TransitionCause } from "@/core/transitionCause";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=", 2)[1];
}

async function main() {
  const playerId = arg("player");
  const stageId = arg("stage");
  if (!playerId || !stageId) {
    console.error("usage: --player=<uuid> --stage=<uuid> [--start]");
    process.exit(2);
  }
  const doStart = process.argv.includes("--start");
  const pool = getDbPool();

  const result = await startJourneyPlaythrough({ playerId, stageId });
  console.log("[OK] startJourneyPlaythrough:", JSON.stringify(result));

  const pt = await pool.query(
    `SELECT id, player_id, stage_id, session_id, drawn_event_ids, accuracy_pct, badge_awarded, xp_awarded, completed_at, created_at
     FROM journey_playthroughs WHERE id = $1`,
    [result.playthroughId]
  );
  const prog = await pool.query(
    `SELECT status, attempts_count, last_played_at FROM journey_player_progress
     WHERE player_id = $1 AND stage_id = $2`,
    [playerId, stageId]
  );
  const sess = await pool.query(
    `SELECT game_id, mode, total_rounds, round_timer_sec, year_min, year_max, results_auto_advance_sec
     FROM sessions WHERE game_id = $1`,
    [result.gameId]
  );
  const sp = await pool.query(
    `SELECT player_id, display_name, ready, is_host FROM session_players WHERE game_id = $1`,
    [result.gameId]
  );
  const ev = await pool.query(
    `SELECT event_type, payload->'eventIds' AS event_ids FROM round_events
     WHERE game_id = $1 AND event_type = 'SESSION_CREATED'`,
    [result.gameId]
  );
  const approvedCheck = await pool.query(
    `SELECT count(*)::int AS drawn_approved
     FROM journey_stage_events jse
     WHERE jse.stage_id = $2 AND jse.approved_at IS NOT NULL
       AND jse.event_id = ANY($1::uuid[])`,
    [result.drawnEventIds, stageId]
  );
  console.log(
    "[rows]",
    JSON.stringify({
      playthrough: pt.rows[0] ?? null,
      progress: prog.rows[0] ?? null,
      session: sess.rows[0] ?? null,
      sessionPlayer: sp.rows[0] ?? null,
      sessionCreated: ev.rows[0] ?? null,
      drawnApprovedCount: approvedCheck.rows[0]?.drawn_approved ?? null,
    })
  );

  const snap = await loadCompeteSessionSnapshot(result.gameId, playerId);
  console.log("[snapshot]", snap ? `status=${snap.status}` : "NULL");

  if (doStart) {
    const started = await startCompeteSession({
      gameId: result.gameId,
      playerId,
      cause: TransitionCause.PLAYER,
    });
    console.log("[started] status:", started.status);
    const re = await pool.query(
      `SELECT round_index, payload->>'eventId' AS event_id FROM round_events
       WHERE game_id = $1 AND event_type = 'ROUND_STARTED'`,
      [result.gameId]
    );
    console.log("[round_started]", JSON.stringify(re.rows));
  }

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("[FAIL]", e instanceof Error ? e.message : e);
  process.exit(1);
});
