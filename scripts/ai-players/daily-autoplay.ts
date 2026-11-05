import { config } from "dotenv";
import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import type { Pool } from "pg";
import { getDbPool } from "@/server/db";
import { getOrCreateDailyChallenge } from "@/server/dailyChallenge";
import { getDailyChallengeDate } from "@/core/dailyDate";
import { AI_PLAYER_TIMER_MS, AI_WORKER_CRITIQUE_CAP_MS, AI_WORKER_DB_GRACE_MS } from "@/core/aiPlayers";
import { classifyFailure, RATE_LIMIT_DEFERRED_MARKER } from "@/core/aiFailureCauses";
import { shouldHaltFleet, type FleetOutcomeEvent } from "@/core/aiFleetHalt";
import { evaluateBudget, DEFAULT_FLEET_DAILY_CAP_USD } from "@/core/aiBudget";
import { fetchSpendTodayByPlayer, getFleetDailyCap } from "@/server/aiSpend";
import {
  classifyPlayer,
  catalogModelFromRow,
  type CatalogModel,
  type CatalogModelRow,
  type EligibilityVerdict,
} from "@/core/aiEligibility";
import {
  buildQueue,
  type QueueCandidate,
  type QueueDeferral,
  type QueueErrorRow,
  type QueueMode,
  type QueueSuccess,
} from "@/core/aiWorkQueue";
import {
  DEFAULT_RATE_SETTINGS,
  TokenBucket,
  backoffMs,
  parseRateSettings,
  parseRetryAfterMs,
  type RateSettings,
} from "@/core/aiRateBudget";
import { wrapPool, reportQueryCounts } from "./queryCounter";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const WORKER_SCRIPT = resolve(process.cwd(), "scripts/ai-players/generate-answers-v3.ts");
const AUDIT_SCRIPT = resolve(process.cwd(), "scripts/ai-players/audit-run.ts");
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
  is_active: boolean | null;
  is_active_daily: boolean | null;
  is_active_practice: boolean | null;
  max_tokens: number | null;
  daily_cost_cap_usd: string | number | null;
  deleted_at: string | Date | null;
};

type WorkItem = {
  player: AiPlayer;
  eventId: string;
  mode: QueueMode;
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
  plays_skipped_budget: number;
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
    plays_skipped_budget: 0,
  };
  for (const r of counted) {
    if (r.ok) {
      counts.plays_ok++;
      continue;
    }
    const cause = classifyFailure(r.lastError);
    // AIP-BUILD-FLEETFINAL-1103-060 (D3): a rate_limit_deferred item was
    // attempted but is NOT a play failure — it is counted separately via
    // ai_play_deferrals/outcome stats and retried in a later run.
    if (cause === "rate_limit_deferred") continue;
    counts.plays_failed++;
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
           failed_bad_output = $10, failed_other = $11,
           plays_skipped_budget = $12
       WHERE id = $1`,
      [
        runId, status, haltReason,
        counts.plays_attempted, counts.plays_ok, counts.plays_failed,
        counts.failed_auth, counts.failed_gone, counts.failed_rate_limit,
        counts.failed_bad_output, counts.failed_other,
        counts.plays_skipped_budget,
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

// AIP-BUILD-BUDGET-1103-004: same 24h-unresolved dedupe as the auth alert —
// bump occurrences + last_seen_at, else insert a 'budget' warning row.
export async function upsertBudgetFleetAlert(
  pool: Pick<Pool, "query">,
  runId: string | null,
  fleetCapUsd: number,
  fleetSpendUsd: number
): Promise<void> {
  try {
    const message = `Fleet daily cap $${fleetCapUsd.toFixed(2)} reached ($${fleetSpendUsd.toFixed(2)} spent); Daily run stopped`;
    const updated = await pool.query<{ id: string }>(
      `UPDATE ai_fleet_alerts
       SET occurrences = occurrences + 1, last_seen_at = now()
       WHERE id = (
         SELECT id FROM ai_fleet_alerts
         WHERE kind = 'budget' AND resolved_at IS NULL
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
       VALUES ('budget', 'warning', $1, $2)`,
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

// AIP-BUILD-FLEETFINAL-1103-060 (D10/E3): --phase=daily|coverage|audit|all.
// 'daily' = today's challenge only (the pre-existing path); 'coverage' fills
// the answer bank on validated playable events (all non-Daily plays run in
// practice mode); 'audit' delegates to audit-run.ts; 'all' runs the three
// sequentially in one invocation.
type Phase = "daily" | "coverage" | "audit" | "all";
type PlayPhase = "daily" | "coverage";
const PHASES: readonly Phase[] = ["daily", "coverage", "audit", "all"];

function parseArgs(): { dryRun: boolean; phase: Phase } {
  const args = process.argv.slice(2);
  const raw = args.find((a) => a.startsWith("--phase="))?.split("=", 2)[1] ?? "daily";
  if (!(PHASES as readonly string[]).includes(raw)) {
    console.error(`Unknown --phase=${raw} (expected daily|coverage|audit|all)`);
    process.exit(1);
  }
  return { dryRun: args.includes("--dry-run"), phase: raw as Phase };
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
        // WORKER CONTRACT (generate-answers-v3): --mode=daily|practice drives
        // hints-off (practice => hints OFF per D2).
        `--mode=${item.mode ?? "daily"}`,
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

    // AIP-BUILD-FLEETFINAL-1103-060 (D3): a 429 is NEVER retried in-process —
    // the worker contract exits 75 + prints RATE_LIMIT_DEFERRED on stderr;
    // anything classifying as rate_limit gets the same treatment (a worker
    // that leaked a raw 429 still gets deferred, not retried). The marker is
    // forced into lastError so downstream summaries classify it as deferred.
    const output = stderr || stdout || "";
    const cause = classifyFailure(output);
    if (code === 75 || cause === "rate_limit_deferred" || cause === "rate_limit") {
      const lastError = output.includes(RATE_LIMIT_DEFERRED_MARKER)
        ? output
        : `${RATE_LIMIT_DEFERRED_MARKER} retry_after_ms=unknown ${output || `worker_exit_${code}`}`.trim();
      console.log(`[DEFER] ${item.player.id} ${item.eventId} rate limited — deferring`);
      return { ok: false, lastFailureTransient: false, lastError };
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
// Deferred (rate_limit_deferred) items never enter the sweep (D3): they are
// re-dispatched by a later run through the ai_play_deferrals refresh step.
export function selectSweepItems(results: ItemResult[]): ItemResult[] {
  return results.filter((r) => !r.ok && r.lastFailureTransient);
}

// ---------------------------------------------------------------------------
// AIP-BUILD-FLEETFINAL-1103-060 — deferral bookkeeping (D3) + lane plumbing
// ---------------------------------------------------------------------------

/** Upserts ai_play_deferrals for one (player,event,mode). Best-effort. */
async function upsertPlayDeferral(
  pool: Pick<Pool, "query">,
  args: {
    playerId: string;
    eventId: string;
    mode: "daily" | "practice" | "audit";
    reason: string;
    /** Absolute delay to set retry_after_at = now()+ms. */
    retryAfterMs: number;
    /** +1 when this deferral was caused by an actual 429. */
    n429Increment: number;
  }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_play_deferrals
         (ai_player_id, event_id, mode, reason, n429, attempts, retry_after_at)
       VALUES ($1, $2, $3, $4, $5, 1, now() + ($6::bigint * interval '1 millisecond'))
       ON CONFLICT (ai_player_id, event_id, mode) DO UPDATE SET
         reason = EXCLUDED.reason,
         n429 = ai_play_deferrals.n429 + $5,
         attempts = ai_play_deferrals.attempts + 1,
         last_deferred_at = now(),
         retry_after_at = EXCLUDED.retry_after_at,
         resolved_at = NULL`,
      [
        args.playerId,
        args.eventId,
        args.mode,
        args.reason.slice(0, 300),
        args.n429Increment,
        Math.max(0, Math.round(args.retryAfterMs)),
      ]
    );
  } catch (err) {
    console.error(`[DEFER] upsert failed (non-fatal): ${err instanceof Error ? err.message : err}`);
  }
}

/** Marks the open deferral for a successfully played item resolved. Best-effort. */
async function resolvePlayDeferral(
  pool: Pick<Pool, "query">,
  item: WorkItem
): Promise<void> {
  try {
    await pool.query(
      `UPDATE ai_play_deferrals SET resolved_at = now()
       WHERE ai_player_id = $1 AND event_id = $2 AND mode = $3 AND resolved_at IS NULL`,
      [item.player.id, item.eventId, item.mode]
    );
  } catch (err) {
    console.error(`[DEFER] resolve failed (non-fatal): ${err instanceof Error ? err.message : err}`);
  }
}

/** Simple counting semaphore — caps total in-flight workers (PLAYER_CONCURRENCY). */
class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];
  constructor(n: number) {
    this.available = n;
  }
  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.available++;
  }
}

/** Per-model dispatch state (D3): pacing bucket + 429 governor, run-local. */
type ModelLane = {
  modelId: string;
  items: WorkItem[];
  bucket: TokenBucket;
  /** Wall-clock ms until which this model is cooling down after a 429. */
  cooldownUntilMs: number;
  /** Cooldowns suffered this run; >= maxCooldownsPerModel => exhausted. */
  cooldowns: number;
  exhausted: boolean;
  /** Request-budget exhausted for this model's lane (rpd cap reached). */
  rateBudgetOut: boolean;
};

type ProcessResult = { ok: boolean; lastFailureTransient: boolean; lastError: string | null };

/** Waits out a token-bucket charge of `calls` (one token at a time — D3). */
async function acquireCallTokens(bucket: TokenBucket, calls: number): Promise<void> {
  for (let i = 0; i < calls; i++) {
    while (!bucket.tryTake(1)) {
      const wait = bucket.msUntil(1);
      if (!Number.isFinite(wait)) return; // rpm <= 0 — don't hang the lane
      await sleep(Math.min(Math.max(wait, 1), 5000));
    }
  }
}

// ---------------------------------------------------------------------------
// Phase runners
// ---------------------------------------------------------------------------

const ROSTER_SQL = `SELECT id, name, provider, model_id, is_active, is_active_daily,
  is_active_practice, max_tokens, daily_cost_cap_usd, deleted_at
  FROM ai_players WHERE deleted_at IS NULL`;

const CATALOG_SQL = `SELECT model_id, is_free, is_vision, availability_status,
  context_length, price_prompt_usd, price_completion_usd
  FROM openrouter_models`;

/** D3: requests/day actually spent today, grouped per model (one query/run). */
const RATE_USAGE_SQL = `SELECT p.model_id, count(*) FROM ai_answer_bank_calls c
  JOIN ai_answer_bank b ON b.id=c.ai_answer_bank_id
  JOIN ai_players p ON p.id=b.ai_player_id
  WHERE c.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') GROUP BY 1`;

/** Open deferrals for the roster — the D7 step-4 refresh input. */
const DEFERRALS_SQL = `SELECT ai_player_id, event_id, mode, retry_after_at
  FROM ai_play_deferrals WHERE resolved_at IS NULL AND ai_player_id = ANY($1::uuid[])`;

/** All bank rows for the roster — successes + stale error rows (one anti-join
 *  input per run for ALL players at once; missing pairs are computed in JS
 *  against the candidate sets). */
const BANK_ROWS_SQL = `SELECT ai_player_id, event_id, error, play_mode
  FROM ai_answer_bank WHERE ai_player_id = ANY($1::uuid[])`;

/** Coverage-phase candidates — same eligibility SQL as ai_model_reliability:
 *  validated, not retired, has an image row, has lat/lng coords. */
const COVERAGE_CANDIDATES_SQL = `SELECT e.id AS event_id,
    COUNT(ab.id) FILTER (WHERE ab.error IS NULL)::int AS coverage
  FROM events e
  LEFT JOIN ai_answer_bank ab ON ab.event_id = e.id
  WHERE e.status = 'validated'
    AND e.retired_at IS NULL
    AND EXISTS (SELECT 1 FROM images i WHERE i.event_id = e.id)
    AND EXISTS (
      SELECT 1 FROM locations l
      WHERE l.event_id = e.id AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
    )
  GROUP BY e.id`;

async function runPlayPhase(
  pool: Pick<Pool, "query">,
  phase: PlayPhase,
  dryRun: boolean
): Promise<number> {
  const label = phase === "daily" ? "DAILY" : "COVERAGE";
  const dateIso = todayUtcIso();
  console.log(`[${label}] UTC+14 date: ${dateIso}`);

  // -- Roster (2b): every live ai_player, classified by D1 eligibility ------
  const playersResult = await pool.query<AiPlayer>(ROSTER_SQL);
  const players = playersResult.rows;
  console.log(`[${label}] AI players: ${players.length}`);
  if (players.length === 0) {
    console.log(`[${label}] No AI players; nothing to do.`);
    return 0;
  }

  // -- Catalog: openrouter_models DB snapshot — NEVER openrouter.ai (2b) -----
  const catalog = new Map<string, CatalogModel>();
  try {
    const catalogResult = await pool.query<CatalogModelRow>(CATALOG_SQL);
    for (const row of catalogResult.rows) {
      const model = catalogModelFromRow(row);
      if (model !== null) catalog.set(model.id, model);
    }
  } catch (err) {
    console.error(`[${label}] catalog query failed: ${err instanceof Error ? err.message : err}`);
  }

  const eligible: { player: AiPlayer; verdict: EligibilityVerdict }[] = [];
  for (const player of players) {
    const verdict = classifyPlayer(player, catalog.get(player.model_id) ?? null, {
      action: "proceed",
    });
    if (verdict.role !== "player") {
      console.log(`[ELIGIBILITY] SKIP ${player.name} (${player.model_id}): ${verdict.reason}`);
      continue;
    }
    eligible.push({ player, verdict });
  }
  console.log(`[${label}] Eligible players: ${eligible.length}`);
  if (eligible.length === 0) {
    console.log(`[${label}] every roster player was excluded`);
    return 1;
  }

  // -- Rate settings + request budgets (2c): one settings read, one usage read
  let settings: RateSettings = DEFAULT_RATE_SETTINGS;
  try {
    const settingsResult = await pool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM ai_fleet_settings"
    );
    settings = parseRateSettings(settingsResult.rows);
  } catch (err) {
    console.error(`[RATE-SETTINGS] query failed (defaults applied): ${err instanceof Error ? err.message : err}`);
  }

  const isFreeModel = (modelId: string): boolean =>
    modelId.includes(":free") || catalog.get(modelId)?.isFree === true;

  const usageByModel = new Map<string, number>();
  let globalUsed = 0;
  let freeFleetUsed = 0;
  try {
    const usageResult = await pool.query<{ model_id: string; count: string | number }>(RATE_USAGE_SQL);
    for (const row of usageResult.rows) {
      const n = Number(row.count) || 0;
      usageByModel.set(row.model_id, n);
      globalUsed += n;
      if (isFreeModel(row.model_id)) freeFleetUsed += n;
    }
  } catch (err) {
    console.error(`[RATE-BUDGET] usage query failed (zero usage assumed): ${err instanceof Error ? err.message : err}`);
  }

  // -- Phase inputs (2e): today's challenge OR validated playable candidates -
  let dailyEventIds: string[] = [];
  let candidates: QueueCandidate[] = [];
  if (phase === "daily") {
    if (dryRun) {
      // getOrCreateDailyChallenge lazily INSERTs the challenge row — a
      // dry-run must never write, so it reads the stored row only. If no row
      // exists yet, the daily set is unknowable anyway (it is fixed at
      // creation time), so the plan just reports an empty daily set.
      const res = await pool.query<{ event_ids: string[] }>(
        `SELECT event_ids FROM daily_challenges WHERE date = $1`,
        [dateIso]
      );
      dailyEventIds = res.rows[0]?.event_ids ?? [];
      if (dailyEventIds.length === 0) {
        console.log(`[DAILY] no daily_challenges row for ${dateIso} — dry-run plans an empty daily set`);
      }
    } else {
      const challenge = await getOrCreateDailyChallenge(dateIso);
      dailyEventIds = challenge.event_ids;
    }
    console.log(`[DAILY] Challenge events: ${dailyEventIds.length}`);
  } else {
    try {
      const candidateResult = await pool.query<{ event_id: string; coverage: string | number }>(
        COVERAGE_CANDIDATES_SQL
      );
      candidates = candidateResult.rows.map((r) => ({
        eventId: r.event_id,
        coverage: Number(r.coverage) || 0,
      }));
    } catch (err) {
      console.error(`[COVERAGE] candidates query failed: ${err instanceof Error ? err.message : err}`);
    }
    console.log(`[COVERAGE] Candidate events: ${candidates.length}`);
  }

  const playerIds = eligible.map((e) => e.player.id);
  const playerById = new Map(eligible.map((e) => [e.player.id, e]));

  let deferrals: QueueDeferral[] = [];
  try {
    const deferralResult = await pool.query<{
      ai_player_id: string;
      event_id: string;
      mode: "daily" | "practice" | "audit";
      retry_after_at: string | Date | null;
    }>(DEFERRALS_SQL, [playerIds]);
    deferrals = deferralResult.rows.map((r) => ({
      playerId: r.ai_player_id,
      eventId: r.event_id,
      mode: r.mode,
      retryAfterAt: r.retry_after_at === null ? null : new Date(r.retry_after_at).getTime(),
    }));
  } catch (err) {
    console.error(`[DEFER] deferral query failed: ${err instanceof Error ? err.message : err}`);
  }

  const successes: QueueSuccess[] = [];
  const errorRows: QueueErrorRow[] = [];
  try {
    const bankResult = await pool.query<{
      ai_player_id: string;
      event_id: string;
      error: string | null;
      play_mode: string | null;
    }>(BANK_ROWS_SQL, [playerIds]);
    for (const row of bankResult.rows) {
      if (row.error === null) {
        successes.push({ playerId: row.ai_player_id, eventId: row.event_id });
      } else if (!row.error.includes(RATE_LIMIT_DEFERRED_MARKER)) {
        // A deferred error row is governed by its ai_play_deferrals row (D3) —
        // it must not ALSO come back as an immediate step-4 refresh item.
        errorRows.push({
          playerId: row.ai_player_id,
          eventId: row.event_id,
          mode: row.play_mode === "practice" ? "practice" : "daily",
        });
      }
    }
  } catch (err) {
    console.error(`[${label}] bank rows query failed: ${err instanceof Error ? err.message : err}`);
  }

  // -- Queue (D7) -----------------------------------------------------------
  const queue = buildQueue({
    players: eligible.map((e) => ({
      playerId: e.player.id,
      tier: e.verdict.tier ?? "free",
      modes: e.verdict.modes,
    })),
    dailyEventIds,
    candidates,
    successes,
    deferrals,
    errorRows,
    maxPlaysPerRun: settings.runMaxPlays,
    practicePerPlayerPerRun: settings.practicePerPlayerPerRun,
    benchmarkSubsetSize: settings.benchmarkSubsetSize,
    now: Date.now(),
  });
  const items: WorkItem[] = queue
    .map((q) => {
      const entry = playerById.get(q.playerId);
      return entry === undefined
        ? null
        : { player: entry.player, eventId: q.eventId, mode: q.mode };
    })
    .filter((x): x is WorkItem => x !== null);
  console.log(`[${label}] Work items to process: ${items.length}`);

  // -- Dry run (2h): full plan, projected requests vs budgets, coverage. ----
  if (dryRun) {
    const byPlayer = new Map<string, { player: AiPlayer; items: WorkItem[] }>();
    for (const item of items) {
      const entry = byPlayer.get(item.player.id) ?? { player: item.player, items: [] };
      entry.items.push(item);
      byPlayer.set(item.player.id, entry);
    }
    const projectedRequestsByModel = new Map<string, number>();
    for (const [pid, pw] of byPlayer) {
      const modes = playerById.get(pid)?.verdict.modes.join(",") ?? "";
      const perMode = pw.items.reduce<Record<string, number>>((acc, i) => {
        acc[i.mode] = (acc[i.mode] ?? 0) + 1;
        return acc;
      }, {});
      const modeSummary = Object.entries(perMode)
        .map(([m, n]) => `${m}=${n}`)
        .join(" ");
      const first10 = pw.items.slice(0, 10).map((i) => i.eventId).join(",");
      console.log(
        `[DRY-RUN] ${pw.player.id} (${pw.player.name}, modes=${modes}) items=${pw.items.length} ${modeSummary} events=[${first10}]`
      );
      projectedRequestsByModel.set(
        pw.player.model_id,
        (projectedRequestsByModel.get(pw.player.model_id) ?? 0) + pw.items.length * settings.callsPerPlay
      );
    }
    const projectedTotal = items.length * settings.callsPerPlay;
    let projectedFree = 0;
    let projectedPaidMax = 0;
    for (const [modelId, n] of projectedRequestsByModel) {
      if (isFreeModel(modelId)) projectedFree += n;
      else projectedPaidMax = Math.max(projectedPaidMax, (usageByModel.get(modelId) ?? 0) + n);
    }
    console.log(`[DRY-RUN] projected requests: ${projectedTotal} (calls_per_play=${settings.callsPerPlay})`);
    console.log(
      `[DRY-RUN] request budgets: global ${globalUsed}+${projectedTotal}/${settings.globalRpd};` +
        ` free-fleet ${freeFleetUsed}+${projectedFree}/${settings.freeRpdFleet};` +
        ` worst paid model ${projectedPaidMax}/${settings.rpdPaidModel}`
    );
    if (phase === "coverage" && candidates.length > 0) {
      const covered = candidates.filter((c) => c.coverage > 0).length;
      const planned = new Set(
        items.filter((i) => i.mode === "practice").map((i) => i.eventId)
      );
      const newlyCovered = candidates.filter(
        (c) => c.coverage === 0 && planned.has(c.eventId)
      ).length;
      const pct = (n: number) => ((100 * n) / candidates.length).toFixed(1);
      console.log(
        `[DRY-RUN] coverage: ${covered}/${candidates.length} (${pct(covered)}%) now;` +
          ` projected ${covered + newlyCovered}/${candidates.length} (${pct(covered + newlyCovered)}%)`
      );
    }
    return 0;
  }

  // -- Bookkeeping + dispatch ----------------------------------------------
  // AIP-BUILD-FLEETHALT-1102-043: run log starts at dispatch start (after the
  // dry-run exit so dry runs never write rows).
  const fleetRunId = await insertFleetRun(
    pool,
    phase === "daily" ? "daily" : "practice",
    githubRunUrl()
  );

  let fleetCapUsd: number | null = null;
  try {
    fleetCapUsd = await getFleetDailyCap(pool);
  } catch (err) {
    fleetCapUsd = DEFAULT_FLEET_DAILY_CAP_USD;
    console.error(`[BUDGET] cap query failed (default $${DEFAULT_FLEET_DAILY_CAP_USD} cap applied): ${err instanceof Error ? err.message : err}`);
  }
  let budgetHalted = false;
  let globalRateHalted = false;
  let budgetSkipped = 0;
  let rateBudgetSkipped = 0;
  let lastFleetSpendUsd = 0;
  const budgetSkippedPlayers = new Set<string>();

  let succeeded = 0;
  let failed = 0;
  let deferred = 0;
  const results: ItemResult[] = [];

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

  // Per-model lanes (2d): one lane per model_id, serialized within, parallel
  // across models; total in-flight workers capped by PLAYER_CONCURRENCY.
  const lanes = new Map<string, ModelLane>();
  const rpmFor = (player: AiPlayer): number =>
    settings.rpmOverrides[player.model_id] ??
    (playerById.get(player.id)?.verdict.tier === "free" ? settings.rpmFree : settings.rpmPaid);
  for (const item of items) {
    let lane = lanes.get(item.player.model_id);
    if (lane === undefined) {
      lane = {
        modelId: item.player.model_id,
        items: [],
        bucket: new TokenBucket({
          now: Date.now,
          refillPerSec: rpmFor(item.player) / 60,
          capacity: 1,
        }),
        cooldownUntilMs: 0,
        cooldowns: 0,
        exhausted: false,
        rateBudgetOut: false,
      };
      lanes.set(item.player.model_id, lane);
    }
    lane.items.push(item);
  }

  const spawnSem = new Semaphore(PLAYER_CONCURRENCY);

  async function checkUsdBudget(item: WorkItem): Promise<"proceed" | "skip" | "halt"> {
    if (budgetSkippedPlayers.has(item.player.id)) {
      budgetSkipped++;
      return "skip";
    }
    try {
      const spend = await fetchSpendTodayByPlayer(pool, dateIso);
      lastFleetSpendUsd = spend.total;
      const verdict = evaluateBudget({
        fleetSpendUsd: spend.total,
        fleetCapUsd,
        modelSpendUsd: spend.byPlayer.get(item.player.id) ?? 0,
        modelCapUsd:
          item.player.daily_cost_cap_usd === null
            ? null
            : Number(item.player.daily_cost_cap_usd),
      });
      if (verdict.action === "halt_fleet") {
        budgetHalted = true;
        console.error(`[BUDGET-HALT] ${verdict.reason} — stopping new dispatches`);
        return "halt";
      }
      if (verdict.action === "skip_model") {
        budgetSkippedPlayers.add(item.player.id);
        budgetSkipped++;
        console.log(`[BUDGET] skip ${item.player.id} (${item.player.model_id}): ${verdict.reason}`);
        return "skip";
      }
    } catch (err) {
      console.error(`[BUDGET] spend query failed (fail-open): ${err instanceof Error ? err.message : err}`);
    }
    return "proceed";
  }

  /** Outcome accounting shared by first pass and sweep. */
  async function handleOutcome(
    item: WorkItem,
    res: ProcessResult,
    lane: ModelLane,
    slot?: ItemResult
  ): Promise<void> {
    if (slot !== undefined) {
      slot.ok = res.ok;
      slot.lastFailureTransient = res.lastFailureTransient;
      slot.lastError = res.lastError;
    } else {
      results.push({
        item,
        ok: res.ok,
        lastFailureTransient: res.lastFailureTransient,
        lastError: res.lastError,
      });
    }
    recordOutcome(item.player.model_id, res.lastError);
    const cause = classifyFailure(res.lastError);
    if (res.ok) {
      succeeded++;
      if (slot !== undefined) failed--; // recovered in sweep
      await resolvePlayDeferral(pool, item);
      return;
    }
    if (cause === "rate_limit_deferred" || cause === "rate_limit") {
      deferred++;
      if (slot !== undefined) failed--; // a swept item that came back deferred
      const retryAfterMs =
        parseRetryAfterMs(res.lastError) ??
        backoffMs(lane.cooldowns, settings.backoffBaseMs, settings.backoffMaxMs);
      lane.cooldowns += 1;
      if (lane.cooldowns >= settings.maxCooldownsPerModel) {
        lane.exhausted = true;
        console.log(`[GOVERNOR] ${lane.modelId} exhausted after ${lane.cooldowns} cooldowns — deferring remaining items`);
      } else {
        lane.cooldownUntilMs = Date.now() + retryAfterMs;
        console.log(`[GOVERNOR] ${lane.modelId} cooling for ${Math.round(retryAfterMs)}ms`);
      }
      await upsertPlayDeferral(pool, {
        playerId: item.player.id,
        eventId: item.eventId,
        mode: item.mode,
        reason: res.lastError ?? RATE_LIMIT_DEFERRED_MARKER,
        retryAfterMs,
        n429Increment: 1,
      });
      return;
    }
    // A sweep slot already counted its first-pass failure — a swept re-failure
    // must not double-count.
    if (slot === undefined) failed++;
  }

  async function dispatchItem(item: WorkItem, lane: ModelLane, slot?: ItemResult): Promise<void> {
    // Request budgets (2c): fleet free rpd (shared across :free slugs),
    // per-model paid rpd, global rpd. Cancels, not failures.
    if (globalUsed >= settings.globalRpd) {
      globalRateHalted = true;
      console.error(`[RATE-BUDGET] global rpd ${globalUsed} >= ${settings.globalRpd} — stopping dispatch`);
      return;
    }
    const free = isFreeModel(item.player.model_id);
    if (lane.rateBudgetOut) {
      rateBudgetSkipped++;
      return;
    }
    if (free && freeFleetUsed >= settings.freeRpdFleet) {
      lane.rateBudgetOut = true;
      rateBudgetSkipped++;
      console.log(`[RATE-BUDGET] free-fleet rpd ${freeFleetUsed} >= ${settings.freeRpdFleet} — skipping ${lane.modelId}'s remaining items`);
      return;
    }
    if (!free && (usageByModel.get(item.player.model_id) ?? 0) >= settings.rpdPaidModel) {
      lane.rateBudgetOut = true;
      rateBudgetSkipped++;
      console.log(`[RATE-BUDGET] ${lane.modelId} rpd >= ${settings.rpdPaidModel} — skipping remaining items`);
      return;
    }

    const usd = await checkUsdBudget(item);
    if (usd === "halt") return;
    if (usd === "skip") return;

    // Token-bucket pacing (D3): charge callsPerPlay before EVERY spawn.
    // Halts gate NEW dispatches (lane loop + budget checks above); an item
    // that already passed its checks is "in-flight" — the pre-existing
    // semantic is that in-flight work finishes, never gets cancelled by a
    // racing halt flag (auth halt is still caught by the latch inside
    // processOne itself).
    await acquireCallTokens(lane.bucket, settings.callsPerPlay);

    // Charge the request budgets optimistically for the calls we expect.
    globalUsed += settings.callsPerPlay;
    if (free) freeFleetUsed += settings.callsPerPlay;
    else usageByModel.set(item.player.model_id, (usageByModel.get(item.player.model_id) ?? 0) + settings.callsPerPlay);

    await spawnSem.acquire();
    let res: ProcessResult;
    try {
      res = await processOne(item);
    } finally {
      spawnSem.release();
    }
    // AIP-FIX-FLEETHALT-MERGE-1102-051: cancelled by fleet halt — not pushed,
    // not recorded, not counted.
    if (res.lastError === "FLEET_HALTED") return;
    await handleOutcome(item, res, lane, slot);
  }

  async function laneWorker(lane: ModelLane): Promise<void> {
    for (const item of lane.items) {
      if (fleetHalted || budgetHalted || globalRateHalted) break;
      if (lane.exhausted) {
        // D3: the model burned all its cooldowns — remaining items defer to a
        // later run instead of dispatching.
        await upsertPlayDeferral(pool, {
          playerId: item.player.id,
          eventId: item.eventId,
          mode: item.mode,
          reason: "model_cooldown_exhausted",
          retryAfterMs: backoffMs(lane.cooldowns, settings.backoffBaseMs, settings.backoffMaxMs),
          n429Increment: 0,
        });
        deferred++;
        continue;
      }
      if (lane.cooldownUntilMs > Date.now()) {
        const wait = lane.cooldownUntilMs - Date.now();
        console.log(`[GOVERNOR] ${lane.modelId} waiting out ${Math.round(wait)}ms cooldown`);
        await sleep(wait);
        if (fleetHalted || budgetHalted || globalRateHalted) break;
      }
      await dispatchItem(item, lane);
    }
  }

  const laneList = [...lanes.values()];
  await Promise.all(laneList.map((lane) => laneWorker(lane)));

  // -- Sweep: non-429 transient failures only (deferred never re-run here) --
  const sweepItems = fleetHalted || budgetHalted || globalRateHalted ? [] : selectSweepItems(results);
  let recoveredInSweep = 0;
  if (sweepItems.length > 0) {
    console.log(`[SWEEP] ${sweepItems.length} transient failures, cooling down ${SWEEP_COOLDOWN_MS}ms`);
    await sleep(SWEEP_COOLDOWN_MS);

    // Group sweep items into lanes again (fresh item lists; lane governor
    // state — bucket, cooldowns — persists).
    const sweepLanes = new Map<string, ModelLane>();
    for (const r of sweepItems) {
      let lane = sweepLanes.get(r.item.player.model_id);
      if (lane === undefined) {
        const base = lanes.get(r.item.player.model_id)!;
        lane = { ...base, items: [] };
        sweepLanes.set(r.item.player.model_id, lane);
      }
      lane.items.push(r.item);
    }

    async function sweepLaneWorker(lane: ModelLane): Promise<void> {
      for (const item of lane.items) {
        if (fleetHalted || budgetHalted || globalRateHalted || lane.exhausted) break;
        if (lane.cooldownUntilMs > Date.now()) {
          await sleep(lane.cooldownUntilMs - Date.now());
          if (fleetHalted || budgetHalted || globalRateHalted || lane.exhausted) break;
        }
        const slot = sweepItems.find((r) => r.item === item)!;
        await dispatchItem(item, lane, slot);
        if (slot.ok) recoveredInSweep++;
      }
    }
    await Promise.all([...sweepLanes.values()].map((l) => sweepLaneWorker(l)));
  }

  // -- Alerts + finalize ----------------------------------------------------
  if (fleetHalted) {
    await upsertAuthFleetAlert(pool, fleetRunId, fleetHaltDistinctModels);
  }
  if (budgetHalted) {
    await upsertBudgetFleetAlert(pool, fleetRunId, fleetCapUsd ?? 0, lastFleetSpendUsd);
  }
  const runCounts = summarizeResults(results);
  runCounts.plays_skipped_budget = budgetSkipped; // AIP-BUILD-BUDGET-1103-004
  await finalizeFleetRun(
    pool,
    fleetRunId,
    fleetHalted || budgetHalted ? "halted" : failed > 0 ? "partial" : "ok",
    fleetHalted ? "auth_fleet" : budgetHalted ? "budget" : null,
    runCounts
  );

  console.log(`\n=== ${phase === "daily" ? "Daily" : "Coverage"} autoplay summary ===`);
  console.log(`Date: ${dateIso}`);
  console.log(`Players: ${players.length}`);
  console.log(`Eligible players: ${eligible.length}`);
  console.log(`Work items: ${items.length}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Deferred (rate limit): ${deferred}`);
  console.log(`Recovered in sweep: ${recoveredInSweep}`);
  console.log(`Failed after sweep: ${failed}`);
  console.log(`Skipped (excluded): ${players.length - eligible.length}`);
  console.log(`Skipped (budget): ${budgetSkipped}`);
  console.log(`Skipped (rate budget): ${rateBudgetSkipped}`);
  if (fleetHalted) {
    console.log(`Fleet halted: auth_fleet`);
  }
  if (budgetHalted) {
    console.log(`Fleet halted: budget`);
  }
  if (globalRateHalted) {
    console.log(`Fleet halted: rate_budget`);
  }

  // A budget/rate stop is expected — exit 0. The 401 auth halt keeps exit 1.
  return fleetHalted || (!budgetHalted && !globalRateHalted && failed > 0) ? 1 : 0;
}

/** --phase=audit: delegate to the standalone auditor runner (E4). */
async function runAuditPhase(dryRun: boolean): Promise<number> {
  if (isFleetHaltLatched()) {
    console.log("[AUDIT] fleet halted — skipping audit phase");
    return 1;
  }
  const args = dryRun ? ["--dry-run"] : [];
  console.log("[AUDIT] starting audit-run.ts");
  const res = await spawnScript(AUDIT_SCRIPT, args);
  return res.code ?? 1;
}

function spawnScript(script: string, extraArgs: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(TSX_BIN, [script, ...extraArgs], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
    });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (err) => {
      activeChildren.delete(child);
      stderr += `\nSPAWN_ERROR: ${err.message}`;
      resolve({ code: -1, stdout, stderr });
    });
    child.on("close", (code) => {
      activeChildren.delete(child);
      resolve({ code, stdout, stderr });
    });
  });
}

async function main(): Promise<void> {
  const { dryRun, phase } = parseArgs();

  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim().length === 0) {
    if (!dryRun) {
      console.error("OPENROUTER_API_KEY is missing.");
      process.exit(1);
    }
  }

  const pool = wrapPool(getDbPool());

  const playPhases: PlayPhase[] =
    phase === "all" ? ["daily", "coverage"] : phase === "daily" || phase === "coverage" ? [phase] : [];
  let exitCode = 0;
  for (const ph of playPhases) {
    if (isFleetHaltLatched()) break; // a halted fleet runs nothing else
    const code = await runPlayPhase(pool, ph, dryRun);
    if (code !== 0) exitCode = code;
  }
  if ((phase === "audit" || phase === "all") && !isFleetHaltLatched()) {
    const code = await runAuditPhase(dryRun);
    if (code !== 0) exitCode = code;
  }

  await pool.end();
  reportQueryCounts();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
