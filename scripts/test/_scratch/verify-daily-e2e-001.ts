// =============================================================================
// MP-VERIFY-DAILY-E2E-001 — End-to-end live verification of Daily mode
// =============================================================================
// Exercises the REAL committed createDailySession path by importing the real
// sessionCore / dailyChallenge functions directly — NO mocks, NO reimplemented
// logic. Mirrors the Bug 6 scratch repro pattern (verify-pressure-clamp-001.ts).
//
// Run:  npx tsx scripts/test/_scratch/verify-daily-e2e-001.ts
//
// DB: writes to the DB pointed at by SUPABASE_DB_CONNECTION (.env.local).
//     Creates one tagged synthetic test player + one daily session. ALL rows
//     created by this task are deleted in the final D7 cleanup step.
//
// Test marker: session host display name contains "MP-VERIFY-DAILY-E2E-TEST".
// =============================================================================
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { randomUUID } from "crypto";
import {
  startCompeteSession,
  submitGuess,
  advanceRound,
  loadCompeteSessionSnapshot,
} from "@/server/sessionCore";
import { startDailyAttempt, getOrCreateDailyChallenge } from "@/server/dailyChallenge";
import { TransitionCause } from "@/core/transitionCause";
import { dbPool } from "@/server/db";

const TEST_TAG = "MP-VERIFY-DAILY-E2E-TEST";
const TOTAL_ROUNDS = 5;

function log(label: string, value: unknown): void {
  console.log(`  ${label}: ${JSON.stringify(value)}`);
}

async function q<T = unknown>(sql: string, params: unknown[]): Promise<T[]> {
  const r = await dbPool.query<T>(sql, params);
  return r.rows;
}

async function main(): Promise<void> {
  const testPlayerId = randomUUID();
  console.log("================================================================");
  console.log(" MP-VERIFY-DAILY-E2E-001 — Daily E2E live verification — start");
  console.log("================================================================");
  console.log(` testPlayerId (synthetic, no auth account): ${testPlayerId}`);
  console.log(` today (UTC ISO date): ${new Date().toISOString().slice(0, 10)}`);
  console.log("");

  // ===========================================================================
  // D1 — Attempt start with pinned events
  // ===========================================================================
  console.log("[D1] startDailyAttempt (pinned events check)");
  const d1 = await startDailyAttempt(testPlayerId);
  const gameId = d1.gameId;
  console.log(`  startDailyAttempt response: ${JSON.stringify(d1)}`);
  log("status", d1.status);
  log("gameId", gameId);

  // session mode + event ids
  const sessionRow = await q<{ mode: string; seed: string }>(
    `SELECT mode, seed::text FROM sessions WHERE game_id = $1`,
    [gameId]
  );
  log("sessions.mode", sessionRow[0]?.mode);

  const sessionCreatedEvent = await q<{ payload: { eventIds: string[] } }>(
    `SELECT payload FROM round_events
     WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
     ORDER BY id ASC LIMIT 1`,
    [gameId]
  );
  const sessionEventIds = sessionCreatedEvent[0]?.payload?.eventIds ?? [];
  log("SESSION_CREATED.payload.eventIds", sessionEventIds);

  const todayIso = new Date().toISOString().slice(0, 10);
  const challenge = await getOrCreateDailyChallenge(todayIso);
  log("daily_challenges.event_ids", challenge.event_ids);
  log("daily_challenges.date", challenge.date);
  log("daily_challenges.seed", challenge.seed);

  const d1ModeOk = sessionRow[0]?.mode === "daily";
  const d1EventsMatch =
    Array.isArray(sessionEventIds) &&
    Array.isArray(challenge.event_ids) &&
    sessionEventIds.length === challenge.event_ids.length &&
    sessionEventIds.every((id, i) => id === challenge.event_ids[i]);
  console.log(`  [D1 VERDICT] mode='daily': ${d1ModeOk ? "PASS" : "FAIL"} | event IDs match daily_challenges: ${d1EventsMatch ? "PASS" : "FAIL"}`);
  console.log("");

  // ===========================================================================
  // D2 — Session startable (auto-ready)
  // ===========================================================================
  console.log("[D2] startCompeteSession (auto-ready, no manual ready toggle)");
  let d2Status = "";
  let d2Error: string | null = null;
  try {
    const started = await startCompeteSession({
      gameId,
      playerId: testPlayerId,
      cause: TransitionCause.PLAYER,
    });
    d2Status = started.status;
    log("status after startCompeteSession", d2Status);
    log("currentRoundIndex", started.currentRoundIndex);
  } catch (e) {
    d2Error = e instanceof Error ? e.message : String(e);
    console.log(`  startCompeteSession threw: ${d2Error}`);
  }
  const d2Ok = d2Status === "ROUND_ACTIVE" && d2Error === null;
  console.log(`  [D2 VERDICT] ${d2Ok ? "PASS" : "FAIL"} (status=${d2Status}, error=${d2Error})`);
  console.log("");

  // ===========================================================================
  // D3 — Full 5-round completion
  // ===========================================================================
  console.log("[D3] Full 5-round completion (submit + advance x5)");
  let d3Ok = true;
  const roundStatuses: { round: number; afterSubmit: string; afterAdvance: string }[] = [];
  for (let r = 0; r < TOTAL_ROUNDS; r++) {
    console.log(`  --- round ${r} ---`);
    let afterSubmit = "";
    try {
      const submitted = await submitGuess({
        gameId,
        playerId: testPlayerId,
        roundIndex: r,
        yearGuess: 1950,
        locationGuess: { lat: 48.85, lng: 2.35 },
        hintsUsed: [],
        _executionContext: "partykit",
      });
      afterSubmit = submitted.status;
      log(`round ${r} status after submitGuess`, afterSubmit);
    } catch (e) {
      afterSubmit = `ERROR:${e instanceof Error ? e.message : String(e)}`;
      console.log(`  submitGuess round ${r} threw: ${afterSubmit}`);
      d3Ok = false;
    }

    let afterAdvance = "";
    if (r < TOTAL_ROUNDS - 1) {
      try {
        const advanced = await advanceRound({
          gameId,
          cause: TransitionCause.PLAYER,
          playerId: testPlayerId,
          roundIndex: r,
          _executionContext: "api",
        });
        afterAdvance = advanced.status;
        log(`round ${r} status after advanceRound`, afterAdvance);
      } catch (e) {
        afterAdvance = `ERROR:${e instanceof Error ? e.message : String(e)}`;
        console.log(`  advanceRound round ${r} threw: ${afterAdvance}`);
        d3Ok = false;
      }
    } else {
      // final round: advanceRound should trigger SESSION_COMPLETE
      try {
        const advanced = await advanceRound({
          gameId,
          cause: TransitionCause.PLAYER,
          playerId: testPlayerId,
          roundIndex: r,
          _executionContext: "api",
        });
        afterAdvance = advanced.status;
        log(`round ${r} status after advanceRound (final)`, afterAdvance);
      } catch (e) {
        afterAdvance = `ERROR:${e instanceof Error ? e.message : String(e)}`;
        console.log(`  advanceRound round ${r} (final) threw: ${afterAdvance}`);
        d3Ok = false;
      }
    }
    roundStatuses.push({ round: r, afterSubmit, afterAdvance });
  }

  // round_events event_type sequence for the game
  const eventSeq = await q<{ event_type: string; round_index: number; id: number }>(
    `SELECT id, event_type, round_index FROM round_events
     WHERE game_id = $1 ORDER BY id ASC`,
    [gameId]
  );
  const eventSeqStr = eventSeq.map(e => `${e.event_type}[r${e.round_index}]`).join(" -> ");
  console.log(`  round_events event_type sequence:`);
  console.log(`    ${eventSeqStr}`);

  // SESSION_COMPLETE before round 4 completion check
  const sessionCompleteEvents = eventSeq.filter(e => e.event_type === "SESSION_COMPLETE");
  const firstSessionComplete = sessionCompleteEvents[0];
  const round4Complete = eventSeq.find(e => e.event_type === "ROUND_COMPLETE" && e.round_index === 4);
  const noEarlySessionComplete =
    firstSessionComplete !== undefined &&
    round4Complete !== undefined &&
    firstSessionComplete.id > round4Complete.id;
  const finalSnapshot = await loadCompeteSessionSnapshot(gameId, testPlayerId);
  const finalStatus = finalSnapshot?.status ?? "null";
  log("final snapshot status", finalStatus);

  const d3RoundsReached = roundStatuses.every(rs => !rs.afterSubmit.startsWith("ERROR") && !rs.afterAdvance.startsWith("ERROR"));
  const d3FinalComplete = finalStatus === "SESSION_COMPLETE";
  console.log(`  [D3 VERDICT] all 5 rounds reached w/o error: ${d3RoundsReached ? "PASS" : "FAIL"} | no SESSION_COMPLETE before round 4 completion: ${noEarlySessionComplete ? "PASS" : "FAIL"} | final status SESSION_COMPLETE: ${d3FinalComplete ? "PASS" : "FAIL"}`);
  console.log("");

  // ===========================================================================
  // D4 — daily_attempts finalization
  // ===========================================================================
  console.log("[D4] daily_attempts finalization");
  const daRow = await q<{ date: string; status: string; game_id: string; completed_at: string | null }>(
    `SELECT date::text, status, game_id, completed_at FROM daily_attempts WHERE player_id = $1 AND date = $2`,
    [testPlayerId, todayIso]
  );
  console.log(`  daily_attempts SELECT output:`);
  console.log(`    ${JSON.stringify(daRow)}`);
  const d4Ok = daRow.length === 1 && daRow[0].status === "completed";
  console.log(`  [D4 VERDICT] ${d4Ok ? "PASS" : "FAIL"} (status=${daRow[0]?.status})`);
  console.log("");

  // ===========================================================================
  // D5 — Leaderboard writes with challenge date (C1)
  // ===========================================================================
  console.log("[D5] Leaderboard writes with challenge date (C1)");
  const lbDaily = await q<{ date: string; player_id: string; avg_accuracy: number; total_xp: number; completed_at: string }>(
    `SELECT date::text, player_id, avg_accuracy, total_xp, completed_at FROM leaderboard_daily
     WHERE player_id = $1 AND date = $2`,
    [testPlayerId, todayIso]
  );
  console.log(`  leaderboard_daily row:`);
  console.log(`    ${JSON.stringify(lbDaily)}`);

  const lbAlltime = await q<{ player_id: string; games_played: number; avg_accuracy: number; total_xp: number; updated_at: string }>(
    `SELECT player_id, games_played, avg_accuracy, total_xp, updated_at FROM leaderboard_daily_alltime
     WHERE player_id = $1`,
    [testPlayerId]
  );
  console.log(`  leaderboard_daily_alltime row:`);
  console.log(`    ${JSON.stringify(lbAlltime)}`);

  const d5LbDailyOk =
    lbDaily.length === 1 &&
    lbDaily[0].date === daRow[0]?.date &&
    lbDaily[0].date === todayIso;
  const d5AlltimeOk =
    lbAlltime.length === 1 &&
    lbAlltime[0].games_played === 1;
  const d5DateEqualsAttemptDate = lbDaily.length === 1 && lbDaily[0].date === daRow[0]?.date;
  console.log(`  [D5 VERDICT] exactly 1 leaderboard_daily row for (date,player): ${d5LbDailyOk ? "PASS" : "FAIL"} | date == daily_attempts.date: ${d5DateEqualsAttemptDate ? "PASS" : "FAIL"} | leaderboard_daily_alltime exists games_played=1: ${d5AlltimeOk ? "PASS" : "FAIL"}`);
  console.log("");

  // ===========================================================================
  // D6 — One attempt per day
  // ===========================================================================
  console.log("[D6] startDailyAttempt again (one attempt per day)");
  const d6 = await startDailyAttempt(testPlayerId);
  console.log(`  second startDailyAttempt response: ${JSON.stringify(d6)}`);

  const daCount = await q<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM daily_attempts WHERE player_id = $1 AND date = $2`,
    [testPlayerId, todayIso]
  );
  log("daily_attempts row count for (player, date)", daCount[0]?.cnt);

  const sessionCount = await q<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM sessions WHERE game_id = $1`,
    [gameId]
  );
  log("sessions row count for original gameId", sessionCount[0]?.cnt);

  // Spec: no second PLAYABLE session created. status should be "completed" (attempt rejected/routed to result).
  const d6Ok = d6.status === "completed" && d6.gameId === gameId && daCount[0]?.cnt === "1";
  console.log(`  [D6 VERDICT] ${d6Ok ? "PASS" : "FAIL"} (second status=${d6.status}, same gameId=${d6.gameId === gameId}, da count=${daCount[0]?.cnt})`);
  console.log("");

  // ===========================================================================
  // D7 — CLEANUP (runs last)
  // ===========================================================================
  console.log("[D7] CLEANUP — delete all rows created by this task");
  const tables = [
    { name: "round_events", sql: "DELETE FROM round_events WHERE game_id = $1", params: [gameId] },
    { name: "round_results", sql: "DELETE FROM round_results WHERE game_id = $1", params: [gameId] },
    { name: "round_commits", sql: "DELETE FROM round_commits WHERE game_id = $1", params: [gameId] },
    { name: "round_hints", sql: "DELETE FROM round_hints WHERE game_id = $1", params: [gameId] },
    { name: "session_players", sql: "DELETE FROM session_players WHERE game_id = $1", params: [gameId] },
    { name: "sessions", sql: "DELETE FROM sessions WHERE game_id = $1", params: [gameId] },
    { name: "daily_attempts", sql: "DELETE FROM daily_attempts WHERE player_id = $1 AND date = $2", params: [testPlayerId, todayIso] },
    { name: "leaderboard_daily", sql: "DELETE FROM leaderboard_daily WHERE player_id = $1 AND date = $2", params: [testPlayerId, todayIso] },
    { name: "leaderboard_daily_alltime", sql: "DELETE FROM leaderboard_daily_alltime WHERE player_id = $1", params: [testPlayerId] },
    { name: "player_global_stats", sql: "DELETE FROM player_global_stats WHERE player_id = $1", params: [testPlayerId] },
  ];
  for (const t of tables) {
    try {
      const res = await dbPool.query(t.sql, t.params);
      console.log(`  DELETE ${t.name}: rowCount=${(res as unknown as { rowCount: number | null }).rowCount}`);
    } catch (e) {
      console.log(`  DELETE ${t.name} ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // post-delete SELECT counts
  console.log("");
  console.log("  post-delete SELECT counts (must be 0):");
  const checks = [
    { name: "round_events", sql: "SELECT COUNT(*)::text AS cnt FROM round_events WHERE game_id = $1", params: [gameId] },
    { name: "round_results", sql: "SELECT COUNT(*)::text AS cnt FROM round_results WHERE game_id = $1", params: [gameId] },
    { name: "round_commits", sql: "SELECT COUNT(*)::text AS cnt FROM round_commits WHERE game_id = $1", params: [gameId] },
    { name: "round_hints", sql: "SELECT COUNT(*)::text AS cnt FROM round_hints WHERE game_id = $1", params: [gameId] },
    { name: "session_players", sql: "SELECT COUNT(*)::text AS cnt FROM session_players WHERE game_id = $1", params: [gameId] },
    { name: "sessions", sql: "SELECT COUNT(*)::text AS cnt FROM sessions WHERE game_id = $1", params: [gameId] },
    { name: "daily_attempts", sql: "SELECT COUNT(*)::text AS cnt FROM daily_attempts WHERE player_id = $1 AND date = $2", params: [testPlayerId, todayIso] },
    { name: "leaderboard_daily", sql: "SELECT COUNT(*)::text AS cnt FROM leaderboard_daily WHERE player_id = $1 AND date = $2", params: [testPlayerId, todayIso] },
    { name: "leaderboard_daily_alltime", sql: "SELECT COUNT(*)::text AS cnt FROM leaderboard_daily_alltime WHERE player_id = $1", params: [testPlayerId] },
    { name: "player_global_stats", sql: "SELECT COUNT(*)::text AS cnt FROM player_global_stats WHERE player_id = $1", params: [testPlayerId] },
  ];
  let allClean = true;
  for (const c of checks) {
    const rows = await q<{ cnt: string }>(c.sql, c.params);
    const cnt = rows[0]?.cnt ?? "?";
    const ok = cnt === "0";
    if (!ok) allClean = false;
    console.log(`    ${c.name}: ${cnt} ${ok ? "(OK)" : "(NOT ZERO!)"}`);
  }
  console.log(`  [D7 VERDICT] ${allClean ? "PASS" : "FAIL"} (all post-delete counts = 0)`);
  console.log("");

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log("================================================================");
  console.log(" SUMMARY");
  console.log("================================================================");
  console.log(`  D1 (pinned events):          ${d1ModeOk && d1EventsMatch ? "PASS" : "FAIL"}`);
  console.log(`  D2 (auto-ready start):       ${d2Ok ? "PASS" : "FAIL"}`);
  console.log(`  D3 (5-round completion):      ${d3RoundsReached && noEarlySessionComplete && d3FinalComplete ? "PASS" : "FAIL"}`);
  console.log(`  D4 (daily_attempts completed):${d4Ok ? "PASS" : "FAIL"}`);
  console.log(`  D5 (leaderboard + C1 date):   ${d5LbDailyOk && d5DateEqualsAttemptDate && d5AlltimeOk ? "PASS" : "FAIL"}`);
  console.log(`  D6 (one attempt per day):     ${d6Ok ? "PASS" : "FAIL"}`);
  console.log(`  D7 (cleanup):                 ${allClean ? "PASS" : "FAIL"}`);
  console.log(`  testPlayerId: ${testPlayerId}`);
  console.log(`  gameId:       ${gameId}`);
  console.log("================================================================");

  await dbPool.end();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  try { await dbPool.end(); } catch {}
  process.exit(1);
});
