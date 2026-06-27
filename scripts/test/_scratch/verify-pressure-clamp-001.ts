// =============================================================================
// MP-CLOSEOUT-COMPETE-CONSOLIDATED-001 — A2 PRESSURE-CLAMP BEHAVIORAL PROOF
// =============================================================================
// Reusable 2-player behavioral proof for the inline pressure clamp in
// submitGuess (src/server/sessionCore.ts). Exercises the REAL production code
// path by importing submitGuess / createCompeteSession / etc. directly — NOT a
// raw-SQL reimplementation.
//
// Run:  npx tsx scripts/test/_scratch/verify-pressure-clamp-001.ts
//
// What it proves:
//   1. P1 submits with >30s remaining  → roundEndsAt clamped to ~30s
//   2. Exactly 1 PRESSURE_APPLIED row exists in round_events after P1
//   3. P2 submits ~200ms later         → roundEndsAt UNCHANGED (no jump back)
//   4. Still exactly 1 PRESSURE_APPLIED row after P2
//   5. Final status is ROUND_COMPLETE (both submitted → round completes)
//
// DB: writes to the DB pointed at by SUPABASE_DB_CONNECTION (.env.local).
//     INSERT-only — creates one tagged test session. No deletes. The created
//     game_id is printed so the test pollution is identifiable/cleanable later.
//
// Test marker: both players' display names contain "MP-CLOSEOUT-PROOF-TEST".
//
// NOTE on .ts vs .mjs: the task prompt suggested .mjs, but importing the real
// TypeScript submitGuess (with @/ path aliases) requires tsx + .ts. A .mjs
// raw-SQL reimplementation would test a reimplementation, not the production
// code path — defeating the purpose.
// =============================================================================

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { randomUUID } from "crypto";
import {
  createCompeteSession,
  joinCompeteSession,
  setCompetePlayerReady,
  startCompeteSession,
  submitGuess,
  loadCompeteSessionSnapshot,
} from "@/server/sessionCore";
import { dbPool } from "@/server/db";

const TEST_TAG = "MP-CLOSEOUT-PROOF-TEST";
const ROUND_TIMER_SEC = 120; // comfortably above the 30s clamp threshold
const P2_DELAY_MS = 200;
const TOLERANCE_MS = 4000; // clock/round-trip slack for clamp comparisons

function assert(cond: boolean, label: string, detail?: unknown): void {
  if (cond) {
    console.log(`  [PASS] ${label}`);
  } else {
    console.error(`  [FAIL] ${label}`);
    if (detail !== undefined) console.error("         detail:", JSON.stringify(detail, null, 2));
    process.exitCode = 1;
  }
}

async function countPressureApplied(gameId: string, roundIndex: number): Promise<number> {
  const r = await dbPool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM round_events
     WHERE game_id = $1 AND round_index = $2 AND event_type = 'PRESSURE_APPLIED'`,
    [gameId, roundIndex]
  );
  return parseInt(r.rows[0].cnt, 10);
}

async function main(): Promise<void> {
  const hostId = randomUUID();
  const p2Id = randomUUID();

  console.log("================================================================");
  console.log(" MP-CLOSEOUT A2 PRESSURE-CLAMP PROOF — start");
  console.log("================================================================");
  console.log(` host playerId: ${hostId}`);
  console.log(` p2   playerId: ${p2Id}`);
  console.log(` roundTimerSec: ${ROUND_TIMER_SEC} (clamp threshold = 30s)`);
  console.log("");

  // --- Step 1: create session (host) ---
  console.log("[STEP 1] createCompeteSession (host = P1)");
  const created = await createCompeteSession({
    playerId: hostId,
    displayName: `${TEST_TAG}-P1`,
    mode: "sync",
    roundTimerSec: ROUND_TIMER_SEC,
    totalRounds: 2,
    yearMin: 1900,
    yearMax: 2026,
  });
  const gameId = created.gameId;
  console.log(`  gameId: ${gameId}`);
  console.log(`  status: ${created.status}`);
  console.log("");

  // --- Step 2: P2 joins ---
  console.log("[STEP 2] joinCompeteSession (P2)");
  await joinCompeteSession({
    gameId,
    playerId: p2Id,
    displayName: `${TEST_TAG}-P2`,
  });
  console.log("  joined");
  console.log("");

  // --- Step 3: both ready ---
  console.log("[STEP 3] setCompetePlayerReady (both)");
  await setCompetePlayerReady({ gameId, playerId: hostId, ready: true });
  await setCompetePlayerReady({ gameId, playerId: p2Id, ready: true });
  console.log("  both ready");
  console.log("");

  // --- Step 4: host starts ---
  console.log("[STEP 4] startCompeteSession (host)");
  const started = await startCompeteSession({ gameId, playerId: hostId, cause: "player" });
  console.log(`  status: ${started.status}`);
  console.log(`  roundEndsAt (original): ${started.roundEndsAt}`);
  const originalEndsAtMs = started.roundEndsAt ? Date.parse(started.roundEndsAt) : null;
  console.log("");

  // --- Step 5: P1 submits (first submission → clamp should fire) ---
  console.log("[STEP 5] submitGuess P1 (first submit, ~120s remaining → expect clamp to 30s)");
  const tBeforeP1 = Date.now();
  const afterP1 = await submitGuess({
    gameId,
    playerId: hostId,
    roundIndex: 0,
    yearGuess: 1980,
    locationGuess: { lat: 48.85, lng: 2.35 },
    hintsUsed: [],
    _executionContext: "partykit",
  });
  const tAfterP1 = Date.now();
  console.log(`  status after P1: ${afterP1.status}`);
  console.log(`  roundEndsAt after P1: ${afterP1.roundEndsAt}`);
  const clampedEndsAtMs = afterP1.roundEndsAt ? Date.parse(afterP1.roundEndsAt) : null;

  const p1Count = await countPressureApplied(gameId, 0);
  console.log(`  PRESSURE_APPLIED rows for round 0 after P1: ${p1Count}`);
  console.log("");

  // --- Assertions after P1 ---
  console.log("[ASSERT after P1]");
  // Clamp: roundEndsAt should be ~now+30s, NOT ~now+120s
  const expectedClampedMs = tAfterP1 + 30_000;
  const clampedOk =
    clampedEndsAtMs !== null &&
    Math.abs(clampedEndsAtMs - expectedClampedMs) < TOLERANCE_MS;
  assert(clampedOk, "roundEndsAt clamped to ~30s (not 120s)", {
    clampedEndsAtMs,
    expectedClampedMs,
    diff: clampedEndsAtMs !== null ? clampedEndsAtMs - expectedClampedMs : null,
  });
  // And it must be materially earlier than the original 120s deadline
  const earlierThanOriginal =
    originalEndsAtMs !== null &&
    clampedEndsAtMs !== null &&
    clampedEndsAtMs < originalEndsAtMs - 60_000;
  assert(earlierThanOriginal, "clamped deadline is materially earlier than original 120s", {
    originalEndsAtMs,
    clampedEndsAtMs,
  });
  assert(p1Count === 1, "exactly 1 PRESSURE_APPLIED row after P1", { p1Count });
  console.log("");

  // --- Step 6: P2 submits ~200ms later ---
  console.log(`[STEP 6] submitGuess P2 (~${P2_DELAY_MS}ms later)`);
  await new Promise((r) => setTimeout(r, P2_DELAY_MS));
  const afterP2 = await submitGuess({
    gameId,
    playerId: p2Id,
    roundIndex: 0,
    yearGuess: 1990,
    locationGuess: { lat: 40.71, lng: -74.0 },
    hintsUsed: [],
    _executionContext: "partykit",
  });
  console.log(`  status after P2: ${afterP2.status}`);
  console.log(`  roundEndsAt after P2: ${afterP2.roundEndsAt}`);
  const afterP2EndsAtMs = afterP2.roundEndsAt ? Date.parse(afterP2.roundEndsAt) : null;

  const p2Count = await countPressureApplied(gameId, 0);
  console.log(`  PRESSURE_APPLIED rows for round 0 after P2: ${p2Count}`);
  console.log("");

  // --- Assertions after P2 ---
  console.log("[ASSERT after P2]");
  // roundEndsAt UNCHANGED from clamped value (no jump back to ~120s)
  const unchanged =
    clampedEndsAtMs !== null &&
    afterP2EndsAtMs !== null &&
    Math.abs(afterP2EndsAtMs - clampedEndsAtMs) < TOLERANCE_MS;
  assert(unchanged, "roundEndsAt UNCHANGED from clamped value (no jump back)", {
    clampedEndsAtMs,
    afterP2EndsAtMs,
    diff: afterP2EndsAtMs !== null ? afterP2EndsAtMs - clampedEndsAtMs : null,
  });
  assert(p2Count === 1, "still exactly 1 PRESSURE_APPLIED row after P2", { p2Count });
  assert(afterP2.status === "ROUND_COMPLETE", "final status is ROUND_COMPLETE", {
    status: afterP2.status,
  });
  console.log("");

  // --- Independent snapshot check ---
  console.log("[STEP 7] independent loadCompeteSessionSnapshot (no playerId bias)");
  const indep = await loadCompeteSessionSnapshot(gameId, null);
  const indepEndsAtMs = indep?.roundEndsAt ? Date.parse(indep.roundEndsAt) : null;
  console.log(`  independent roundEndsAt: ${indep?.roundEndsAt}`);
  const indepUnchanged =
    clampedEndsAtMs !== null &&
    indepEndsAtMs !== null &&
    Math.abs(indepEndsAtMs - clampedEndsAtMs) < TOLERANCE_MS;
  assert(indepUnchanged, "independent snapshot sees the clamped deadline", {
    clampedEndsAtMs,
    indepEndsAtMs,
  });
  console.log("");

  console.log("================================================================");
  console.log(" PROOF COMPLETE");
  console.log("================================================================");
  console.log(` TEST game_id (for cleanup identification): ${gameId}`);
  console.log(` TEST marker in display names:               ${TEST_TAG}-P1 / ${TEST_TAG}-P2`);
  console.log(` exit code: ${process.exitCode} (0 = all assertions passed)`);
  console.log("================================================================");

  await dbPool.end();
}

main().catch((err) => {
  console.error("[FATAL] proof script threw:", err);
  process.exit(1);
});
