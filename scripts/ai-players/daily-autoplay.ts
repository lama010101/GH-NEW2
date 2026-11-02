import { config } from "dotenv";
import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import type { Pool } from "pg";
import { getDbPool } from "@/server/db";
import { getOrCreateDailyChallenge } from "@/server/dailyChallenge";
import { getDailyChallengeDate } from "@/core/dailyDate";
import { AI_PLAYER_TIMER_MS, AI_WORKER_CRITIQUE_CAP_MS, AI_WORKER_DB_GRACE_MS } from "@/core/aiPlayers";
import { classifyFailure } from "@/core/aiFailureCauses";
import { shouldHaltFleet, type FleetOutcomeEvent } from "@/core/aiFleetHalt";
import { preflightRoster } from "./rosterPreflight";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const WORKER_SCRIPT = resolve(process.cwd(), "scripts/ai-players/generate-answers-v3.ts");
const TSX_BIN = resolve(process.cwd(), "node_modules/.bin/tsx");

const PLAYER_CONCURRENCY = 3;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 4000];
// AIP-FIX-DAILY-429SWEEP-1024-001: cooldown before the single transient-failure
// sweep. AI_DAILY_SWEEP_COOLDOWN_MS is a test seam only; the workflow never
// sets it, so production always waits the full 120000ms.
const SWEEP_COOLDOWN_MS = Number(process.env.AI_DAILY_SWEEP_COOLDOWN_MS ?? 120000);

// AIP-FIX-AITIMERKILL-1011-008: the previous 120s budget (timer + 30s) could
// SIGKILL a worker that used the full 90s answer timer and was still inside
// its 30s critique turn or writing rows — silently losing the answer. The
// budget is now answer timer + critique cap + DB-write grace (= 150s).
const WORKER_HARD_KILL_MS = AI_PLAYER_TIMER_MS + AI_WORKER_CRITIQUE_CAP_MS + AI_WORKER_DB_GRACE_MS;

type AiPlayer = {
  id: string;
  name: string;
  provider: string;
  model_id: string;
};

type WorkItem = {
  player: AiPlayer;
  eventId: string;
};

type PlayerWork = {
  player: AiPlayer;
  missing: string[];
};

export type ItemResult = {
  item: WorkItem;
  ok: boolean;
  lastFailureTransient: boolean;
  /** stderr (or stdout) of the final attempt; null on success. */
  lastError?: string | null;
};

// AIP-BUILD-FLEETHALT-1102-043: registry of live worker children so the
// fleet-halt path can terminate them with the existing SIGKILL mechanism.
const activeChildren = new Set<ChildProcess>();

// AIP-FIX-FLEETHALT-MERGE-1102-051: module-level halt latch. recordOutcome is a
// main() closure, so its local `fleetHalted` flag cannot reach processOne's
// retry loop — the latch can. Once set, processOne never spawns another worker
// and never sleeps; cancelled items report lastError 'FLEET_HALTED' and stay
// out of the results array and every run counter (cancelled, not failed).
let fleetHaltLatched = false;
export function latchFleetHalt(): void {
  fleetHaltLatched = true;
}
export function isFleetHaltLatched(): boolean {
  return fleetHaltLatched;
}
// Test seam only — production never resets a halt mid-run.
export function resetFleetHaltLatch(): void {
  fleetHaltLatched = false;
}

// ---------------------------------------------------------------------------
// AIP-BUILD-FLEETHALT-1102-043 — run/alert bookkeeping helpers.
// Every helper swallows its own errors: bookkeeping must never crash the
// autoplay or change its behaviour. The halt DECISION never touches the DB.
// ---------------------------------------------------------------------------

export function githubRunUrl(): string | null {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!server || !repo || !runId) return null;
  return `${server}/${repo}/actions/runs/${runId}`;
}

export async function insertFleetRun(
  pool: Pick<Pool, "query">,
  kind: "daily" | "practice" | "manual",
  runUrl: string | null
): Promise<string | null> {
  try {
    const res = await pool.query<{ id: string }>(
      "INSERT INTO ai_fleet_runs (kind, github_run_url) VALUES ($1, $2) RETURNING id",
      [kind, runUrl]
    );
    return res.rows[0]?.id ?? null;
  } catch (err) {
    console.error(`[FLEET-RUN] insert failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export type FleetRunCounts = {
  plays_attempted: number;
  plays_ok: number;
  plays_failed: number;
  failed_auth: number;
  failed_gone: number;
  failed_rate_limit: number;
  failed_bad_output: number;
  failed_other: number;
};

/** Final per-cause tallies from the post-sweep results array (pure). */
export function summarizeResults(results: ItemResult[]): FleetRunCounts {
  // AIP-FIX-FLEETHALT-MERGE-1102-051: FLEET_HALTED entries are cancelled plays,
  // not failures — they enter no counter (defensive; callers must not push them).
  const counted = results.filter((r) => r.lastError !== "FLEET_HALTED");
  const counts: FleetRunCounts = {
    plays_attempted: counted.length,
    plays_ok: 0,
    plays_failed: 0,
    failed_auth: 0,
    failed_gone: 0,
    failed_rate_limit: 0,
    failed_bad_output: 0,
    failed_other: 0,
  };
  for (const r of counted) {
    if (r.ok) {
      counts.plays_ok++;
      continue;
    }
    counts.plays_failed++;
    const cause = classifyFailure(r.lastError);
    if (cause === "auth") counts.failed_auth++;
    else if (cause === "gone") counts.failed_gone++;
    else if (cause === "rate_limit") counts.failed_rate_limit++;
    else if (cause === "bad_output") counts.failed_bad_output++;
    else counts.failed_other++;
  }
  return counts;
}

export async function finalizeFleetRun(
  pool: Pick<Pool, "query">,
  runId: string | null,
  status: "ok" | "partial" | "halted" | "error",
  haltReason: string | null,
  counts: FleetRunCounts
): Promise<void> {
  if (!runId) return;
  try {
    await pool.query(
      `UPDATE ai_fleet_runs
       SET finished_at = now(), status = $2, halt_reason = $3,
           plays_attempted = $4, plays_ok = $5, plays_failed = $6,
           failed_auth = $7, failed_gone = $8, failed_rate_limit = $9,
           failed_bad_output = $10, failed_other = $11
       WHERE id = $1`,
      [
        runId, status, haltReason,
        counts.plays_attempted, counts.plays_ok, counts.plays_failed,
        counts.failed_auth, counts.failed_gone, counts.failed_rate_limit,
        counts.failed_bad_output, counts.failed_other,
      ]
    );
  } catch (err) {
    console.error(`[FLEET-RUN] finalize failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Upsert: if an UNRESOLVED 'auth_fleet' alert exists with created_at within
// 24h, bump occurrences + last_seen_at; otherwise insert a new critical row.
export async function upsertAuthFleetAlert(
  pool: Pick<Pool, "query">,
  runId: string | null,
  distinctModels: number
): Promise<void> {
  try {
    const message = `OpenRouter key rejected (HTTP 401) by ${distinctModels} models; Daily run halted`;
    const updated = await pool.query<{ id: string }>(
      `UPDATE ai_fleet_alerts
       SET occurrences = occurrences + 1, last_seen_at = now()
       WHERE id = (
         SELECT id FROM ai_fleet_alerts
         WHERE kind = 'auth_fleet' AND resolved_at IS NULL
           AND created_at >= now() - interval '24 hours'
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING id`,
      []
    );
    if (updated.rows.length > 0) return;
    await pool.query(
      `INSERT INTO ai_fleet_alerts (kind, severity, message, run_id)
       VALUES ('auth_fleet', 'critical', $1, $2)`,
      [message, runId]
    );
  } catch (err) {
    console.error(`[FLEET-ALERT] upsert failed: ${err instanceof Error ? err.message : err}`);
  }
}

function todayUtcIso(): string {
  return getDailyChallengeDate();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
  };
}

function runWorker(item: WorkItem): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      TSX_BIN,
      [
        WORKER_SCRIPT,
        item.eventId,
        `--model=${item.player.model_id}`,
        `--provider=${item.player.provider}`,
        `--player-name=${item.player.name}`,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "pipe",
      }
    );

    activeChildren.add(child);

    let stdout = "";
    let stderr = "";

    const killTimer = setTimeout(() => {
      stderr += `\nHARD_KILL: worker exceeded ${WORKER_HARD_KILL_MS}ms`;
      child.kill("SIGKILL");
    }, WORKER_HARD_KILL_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      activeChildren.delete(child);
      clearTimeout(killTimer);
      stderr += `\nSPAWN_ERROR: ${err.message}`;
      resolve({ code: -1, stdout, stderr });
    });

    child.on("close", (code) => {
      activeChildren.delete(child);
      clearTimeout(killTimer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function isTransientFailure(stderr: string, stdout: string): Promise<boolean> {
  const output = `${stderr}\n${stdout}`;

  const nonTransientPatterns = [
    /OPENROUTER_API_KEY is missing/,
    /No validated event found/,
    /has no image_url/,
    /Failed to parse AI guess/,
    /Usage:/,
  ];
  for (const pattern of nonTransientPatterns) {
    if (pattern.test(output)) return false;
  }

  const httpMatch = output.match(/OpenRouter request failed:\s*(\d{3})/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    return status === 429 || (status >= 500 && status < 600);
  }

  const transientNetworkPatterns = [
    /fetch failed/i,
    /ECONNREFUSED/,
    /ECONNRESET/,
    /ETIMEDOUT/,
    /EAI_AGAIN/,
    /ENOTFOUND/,
    /Socket timeout/i,
    /socket hang up/i,
    /SPAWN_ERROR:/,
    // AIP-FIX-AITIMERKILL-1011-008: a SIGKILLed worker may have died before
    // writing its row — treat the kill as transient so the item is retried
    // instead of silently dropped.
    /HARD_KILL:/,
    /PROVIDER_ERROR:/,
    // AIP-FIX-DAILY-RETRY-PARSEERRORS-1022-A04: nondeterministic model-output failures; a retry usually succeeds.
    /Failed to parse AI final guess response/,
    /Final guess response missing finalGuess/,
  ];
  for (const pattern of transientNetworkPatterns) {
    if (pattern.test(output)) return true;
  }

  return false;
}

// AIP-FIX-FLEETHALT-MERGE-1102-051: exported for tests; `worker` is the test
// seam (injected runWorker) — production callers omit it.
export async function processOne(item: WorkItem, worker: typeof runWorker = runWorker): Promise<{ ok: boolean; lastFailureTransient: boolean; lastError: string | null }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Latch check (top of iteration): a halted fleet never starts an attempt.
    if (isFleetHaltLatched()) {
      return { ok: false, lastFailureTransient: false, lastError: "FLEET_HALTED" };
    }
    const { code, stdout, stderr } = await worker(item);

    // Latch check (post-return): a halt declared while this worker ran cancels
    // the item before classification and before any retry delay.
    if (isFleetHaltLatched()) {
      return { ok: false, lastFailureTransient: false, lastError: "FLEET_HALTED" };
    }

    if (code === 0) {
      console.log(`[OK] ${item.player.id} ${item.eventId}`);
      return { ok: true, lastFailureTransient: false, lastError: null };
    }

    const transient = await isTransientFailure(stderr, stdout);
    const lastAttempt = attempt === MAX_RETRIES;
    if (!lastAttempt && transient) {
      const delay = RETRY_DELAYS_MS[attempt];
      console.log(`[RETRY] ${item.player.id} ${item.eventId} transient failure (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    console.error(`[ERROR] ${item.player.id} ${item.eventId} worker exited ${code}:`);
    console.error(stderr || stdout);
    return { ok: false, lastFailureTransient: transient, lastError: stderr || stdout || null };
  }

  return { ok: false, lastFailureTransient: false, lastError: null };
}

// AIP-FIX-DAILY-429SWEEP-1024-001: items eligible for the one cooldown sweep —
// final failure classified transient by isTransientFailure in processOne.
export function selectSweepItems(results: ItemResult[]): ItemResult[] {
  return results.filter((r) => !r.ok && r.lastFailureTransient);
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();

  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim().length === 0) {
    if (!dryRun) {
      console.error("OPENROUTER_API_KEY is missing.");
      process.exit(1);
    }
  }

  const pool = getDbPool();

  const dateIso = todayUtcIso();
  console.log(`[DAILY] UTC+14 date: ${dateIso}`);

  const challenge = await getOrCreateDailyChallenge(dateIso);
  const eventIds = challenge.event_ids;
  console.log(`[DAILY] Challenge events: ${eventIds.length}`);

  const playersResult = await pool.query<AiPlayer>(
    "SELECT id, name, provider, model_id FROM ai_players WHERE is_active_daily = true AND is_active = true AND deleted_at IS NULL"
  );
  const players = playersResult.rows;
  console.log(`[DAILY] Active AI players: ${players.length}`);

  if (players.length === 0) {
    console.log("[DAILY] No active AI players; nothing to do.");
    await pool.end();
    process.exit(0);
  }

  const preflight = await preflightRoster(players);
  for (const skipped of preflight.skipped) {
    console.log(`[PREFLIGHT] SKIP ${skipped.player.name} (${skipped.player.model_id}): ${skipped.reason}`);
  }
  for (const warning of preflight.warnings) {
    console.log(`[PREFLIGHT] WARN ${warning}`);
  }
  console.log(`[PREFLIGHT] keep=${preflight.keep.length} skipped=${preflight.skipped.length}`);
  if (players.length > 0 && preflight.keep.length === 0) {
    console.log("[PREFLIGHT] every roster player was skipped");
    await pool.end();
    process.exit(1);
  }
  const keptPlayers = preflight.keep;

  const playerQueue: PlayerWork[] = [];
  let totalWorkItems = 0;

  for (const player of keptPlayers) {
    const doneResult = await pool.query<{ event_id: string }>(
      `SELECT event_id
       FROM ai_answer_bank
       WHERE ai_player_id = $1
         AND event_id = ANY($2::uuid[])
         AND error IS NULL`,
      [player.id, eventIds]
    );
    const doneSet = new Set(doneResult.rows.map((r) => r.event_id));
    const missing = eventIds.filter((id) => !doneSet.has(id));

    console.log(`[PLAYER] ${player.id} (${player.name}) done=${doneSet.size}/${eventIds.length} missing=${missing.length}`);

    if (missing.length === 0) continue;

    playerQueue.push({ player, missing });
    totalWorkItems += missing.length;
  }

  console.log(`[DAILY] Work items to process: ${totalWorkItems}`);

  if (dryRun) {
    for (const pw of playerQueue) {
      for (const eventId of pw.missing) {
        console.log(`[DRY-RUN] would spawn worker: ${pw.player.id} ${eventId} --model=${pw.player.model_id} --provider=${pw.player.provider}`);
      }
    }
    await pool.end();
    process.exit(0);
  }

  // AIP-BUILD-FLEETHALT-1102-043: run log starts at dispatch start (after the
  // dry-run exit so dry runs never write rows). Bookkeeping failure is logged
  // and ignored — it must never alter autoplay behaviour.
  const fleetRunId = await insertFleetRun(pool, "daily", githubRunUrl());

  let queuePointer = 0;
  let succeeded = 0;
  let failed = 0;
  const results: ItemResult[] = [];

  // AIP-BUILD-FLEETHALT-1102-043: every FINAL play outcome (after its retries)
  // is recorded and evaluated by the pure halt rule. The halt decision uses
  // only in-memory events — it never depends on the DB.
  const fleetFailureEvents: FleetOutcomeEvent[] = [];
  let fleetHalted = false;
  let fleetHaltDistinctModels = 0;

  function recordOutcome(modelId: string, lastError: string | null): void {
    fleetFailureEvents.push({
      modelId,
      at: Date.now(),
      cause: classifyFailure(lastError),
    });
    if (fleetHalted) return;
    const verdict = shouldHaltFleet(fleetFailureEvents, Date.now());
    if (verdict.halt) {
      fleetHalted = true;
      latchFleetHalt(); // AIP-FIX-FLEETHALT-MERGE-1102-051
      fleetHaltDistinctModels = verdict.distinctModels;
      console.error(
        `[FLEET-HALT] ${verdict.authFailures} auth failures across ${verdict.distinctModels} models — halting fleet`
      );
      for (const child of activeChildren) {
        child.kill("SIGKILL");
      }
    }
  }

  async function playerWorker(): Promise<void> {
    while (!fleetHalted && queuePointer < playerQueue.length) {
      const pw = playerQueue[queuePointer++];
      let playerSucceeded = 0;
      let playerFailed = 0;
      for (const eventId of pw.missing) {
        if (fleetHalted) break;
        const item: WorkItem = { player: pw.player, eventId };
        const res = await processOne(item);
        // AIP-FIX-FLEETHALT-MERGE-1102-051: cancelled by fleet halt — not
        // pushed, not recorded, not counted.
        if (res.lastError === "FLEET_HALTED") continue;
        results.push({ item, ok: res.ok, lastFailureTransient: res.lastFailureTransient, lastError: res.lastError });
        recordOutcome(pw.player.model_id, res.lastError);
        if (res.ok) {
          playerSucceeded++;
        } else {
          playerFailed++;
        }
      }
      succeeded += playerSucceeded;
      failed += playerFailed;
    }
  }

  const workers = Array.from({ length: Math.min(PLAYER_CONCURRENCY, playerQueue.length) }, playerWorker);
  await Promise.all(workers);

  const sweepItems = fleetHalted ? [] : selectSweepItems(results);
  let recoveredInSweep = 0;
  if (sweepItems.length > 0) {
    console.log(`[SWEEP] ${sweepItems.length} transient failures, cooling down ${SWEEP_COOLDOWN_MS}ms`);
    await sleep(SWEEP_COOLDOWN_MS);

    let sweepPointer = 0;
    async function sweepWorker(): Promise<void> {
      while (!fleetHalted && sweepPointer < sweepItems.length) {
        const r = sweepItems[sweepPointer++];
        const res = await processOne(r.item);
        // AIP-FIX-FLEETHALT-MERGE-1102-051: cancelled sweep retry — keep the
        // first-pass outcome; do not record or count the cancelled attempt.
        if (res.lastError === "FLEET_HALTED") continue;
        if (res.ok) recoveredInSweep++;
        r.ok = res.ok;
        r.lastFailureTransient = res.lastFailureTransient;
        r.lastError = res.lastError;
        recordOutcome(r.item.player.model_id, res.lastError);
      }
    }
    const sweepWorkers = Array.from({ length: Math.min(PLAYER_CONCURRENCY, sweepItems.length) }, sweepWorker);
    await Promise.all(sweepWorkers);

    succeeded += recoveredInSweep;
    failed -= recoveredInSweep;
  }

  // AIP-BUILD-FLEETHALT-1102-043: alert upsert + run finalize. Both are
  // bookkeeping — failures here are logged and cannot change the exit code.
  if (fleetHalted) {
    await upsertAuthFleetAlert(pool, fleetRunId, fleetHaltDistinctModels);
  }
  const runCounts = summarizeResults(results);
  await finalizeFleetRun(
    pool,
    fleetRunId,
    fleetHalted ? "halted" : failed > 0 ? "partial" : "ok",
    fleetHalted ? "auth_fleet" : null,
    runCounts
  );

  await pool.end();

  console.log("\n=== Daily autoplay summary ===");
  console.log(`Date: ${dateIso}`);
  console.log(`Players: ${players.length}`);
  console.log(`Work items: ${totalWorkItems}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Recovered in sweep: ${recoveredInSweep}`);
  console.log(`Failed after sweep: ${failed}`);
  console.log(`Skipped (preflight): ${preflight.skipped.length}`);
  if (fleetHalted) {
    console.log(`Fleet halted: auth_fleet`);
  }

  if (fleetHalted || failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
