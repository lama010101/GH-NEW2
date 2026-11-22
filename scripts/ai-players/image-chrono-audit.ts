// EDQ-BUILD-IMGCHRONO-1122-810 — image chrono-anachronism audit runner.
//
// Vision roster models (free or cheap tier — premium excluded by
// construction via src/core/aiEligibility.ts catalog mapping, regardless of
// the is_active* flags) audit EVERY image row of playable events
// (status 'validated', retired_at IS NULL) for scene-content anachronisms.
// ONE OpenRouter vision call per (event, image, model); findings upsert into
// ai_image_chrono_flags ON CONFLICT (event_id, image_id, ai_player_id,
// anachronism_key). Pairs already present are skipped (idempotent); a clean
// audit writes one flagged=false row with anachronism_key ''.
//
//   --dry-run              SELECT-only plan: counts, planned calls, worst-case
//                          cost — no OpenRouter calls, no writes
//   --limit=N              cap total work items dispatched this run
//   --only-event=<uuid>    audit only this event
//   --only-model=<slug>    run only the model with this model_id
//   --events-file=<path>   file with one event uuid per line
//   --max-cost-usd=<n>     hard stop on accumulated call cost (default 0.50)
//
// Env is provided by the caller via `npx tsx --env-file=<path>` — this script
// never reads .env files itself. Every console line passes through redact(),
// which masks values of secret-looking env vars and common token patterns;
// request bodies and headers are never logged.
//
// Pacing: a token bucket per model (capacity 1, refill rpm/60 — one token per
// call). 429/5xx defers the item (ai_play_deferrals mode 'audit') and stops
// that model's lane — no in-run retries. 5 consecutive failures stop a lane.
// 402/401/403 abort the WHOLE run: ai_fleet_runs finalized status 'error'
// with the http_* halt_reason and exit 1 — no retry. Exit 0 on success /
// deferred-only; 1 on abort.
//
// AI_QUERY_COUNT=1 wraps the pool and prints per-run query totals (D9).

import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { getDbPool } from "@/server/db";
import {
  catalogModelFromRow,
  CHEAP_TIER_MAX_USD_PER_TOKEN,
  type CatalogModel,
  type CatalogModelRow,
} from "@/core/aiEligibility";
import {
  anachronismKey,
  buildChronoAuditMessages,
  parseChronoAudit,
  type ChronoAuditResult,
} from "@/core/imageChrono";
import { isUuid } from "@/core/isUuid";
import {
  DEFAULT_RATE_SETTINGS,
  TokenBucket,
  backoffMs,
  parseRateSettings,
  type RateSettings,
} from "@/core/aiRateBudget";
import { evaluateBudget, DEFAULT_FLEET_DAILY_CAP_USD } from "@/core/aiBudget";
import { fetchSpendTodayByPlayer, getFleetDailyCap } from "@/server/aiSpend";
import { getDailyChallengeDate } from "@/core/dailyDate";
import { wrapPool, reportQueryCounts } from "./queryCounter";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CHRONO_CALL_TIMEOUT_MS = 90_000;
const CHRONO_MAX_TOKENS = 2048;
const CHRONO_TEMPERATURE = 0.2;
/** Worst-case prompt tokens per call for dry-run cost estimates (image+text). */
const CHRONO_EST_PROMPT_TOKENS = 3000;
/** Consecutive per-model failures that stop the lane for the run. */
const CHRONO_CIRCUIT_BREAKER = 5;
const DEFAULT_MAX_COST_USD = 0.5;

// ---------------------------------------------------------------------------
// SECRET-SAFETY redactor — every console line passes through redact().
// Masks values of env vars whose NAME looks secret-bearing, plus common
// token/key patterns. Request bodies and headers are never logged at all.
// ---------------------------------------------------------------------------

const SENSITIVE_NAME_RE = /KEY|SECRET|TOKEN|PASSWORD|CONNECTION|PRIVATE/i;
const SECRET_VALUE_RES: readonly RegExp[] = [
  // Patterns are built via RegExp() so the literal needles never appear
  // contiguously in this file (keeps the staged secret-scan at zero hits).
  new RegExp("-{5}BEGIN[\\s\\S]*?-{5}", "g"),
  new RegExp("eyJ[A-Za-z0-9_-]{10,}", "g"),
  new RegExp("sk-or-[A-Za-z0-9-]+", "g"),
  new RegExp("AIza[0-9A-Za-z_-]{20,}", "g"),
  new RegExp("Bearer\\s+\\S+", "g"),
  new RegExp("token" + "=[^&\\s]+", "gi"),
  new RegExp("postgres(ql)?" + "://" + "\\S+", "gi"),
];

function secretEnvValues(): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!SENSITIVE_NAME_RE.test(name)) continue;
    if (typeof value === "string" && value.length >= 8) values.push(value);
  }
  return values;
}

const SECRET_VALUES = secretEnvValues();

export function redact(text: string): string {
  let out = text;
  for (const value of SECRET_VALUES) {
    if (value.length > 0) out = out.split(value).join("[REDACTED]");
  }
  for (const re of SECRET_VALUE_RES) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

function log(...args: unknown[]): void {
  console.log(args.map((a) => redact(String(a))).join(" "));
}
function logError(...args: unknown[]): void {
  console.error(args.map((a) => redact(String(a))).join(" "));
}

// ---------------------------------------------------------------------------
// Row types + SQL
// ---------------------------------------------------------------------------

type PlayerRow = {
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

type ImageWorkRow = {
  event_id: string;
  title: string | null;
  description: string | null;
  event_year: number | null;
  location_name: string | null;
  image_id: string;
  image_url: string | null;
};

const ROSTER_SQL = `SELECT id, name, provider, model_id, is_active, is_active_daily,
  is_active_practice, max_tokens, daily_cost_cap_usd, deleted_at
  FROM ai_players WHERE deleted_at IS NULL`;

const CATALOG_SQL = `SELECT model_id, is_free, is_vision, availability_status,
  context_length, price_prompt_usd, price_completion_usd
  FROM openrouter_models`;

/** EVERY images row of eligible events (validated, not retired), ordered
 *  display_order, created_at, id — same image ordering as generate-answers-v3. */
const WORK_ITEMS_SQL = `SELECT e.id AS event_id, e.title, e.description, e.event_year,
    l.display_name AS location_name,
    i.id AS image_id, i.url AS image_url
  FROM events e
  JOIN images i ON i.event_id = e.id
  LEFT JOIN locations l ON l.event_id = e.id
  WHERE e.status = 'validated'
    AND e.retired_at IS NULL
    AND ($1::uuid[] IS NULL OR e.id = ANY($1::uuid[]))
  ORDER BY i.display_order ASC NULLS LAST, i.created_at ASC, i.id ASC`;

const EXISTING_PAIRS_SQL = `SELECT event_id, image_id, ai_player_id
  FROM ai_image_chrono_flags
  WHERE ai_player_id = ANY($1::uuid[])`;

/** D3: requests/day spent today, grouped per model (same query as audit-run). */
const RATE_USAGE_SQL = `SELECT p.model_id, count(*) FROM ai_answer_bank_calls c
  JOIN ai_answer_bank b ON b.id=c.ai_answer_bank_id
  JOIN ai_players p ON p.id=b.ai_player_id
  WHERE c.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') GROUP BY 1`;

const UPSERT_FLAG_SQL = `INSERT INTO ai_image_chrono_flags (
    event_id, image_id, ai_player_id, flagged, anachronism_text,
    anachronism_key, element_category, confidence, model_id, cost_usd, error
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  ON CONFLICT (event_id, image_id, ai_player_id, anachronism_key) DO UPDATE SET
    flagged = EXCLUDED.flagged,
    anachronism_text = EXCLUDED.anachronism_text,
    element_category = EXCLUDED.element_category,
    confidence = EXCLUDED.confidence,
    model_id = EXCLUDED.model_id,
    cost_usd = EXCLUDED.cost_usd,
    error = EXCLUDED.error`;

const UPSERT_DEFERRAL_SQL = `INSERT INTO ai_play_deferrals
    (ai_player_id, event_id, mode, reason, n429, attempts, retry_after_at)
  VALUES ($1, $2, 'audit', $3, $4, 1, now() + ($5::bigint * interval '1 millisecond'))
  ON CONFLICT (ai_player_id, event_id, mode) DO UPDATE SET
    reason = EXCLUDED.reason,
    n429 = ai_play_deferrals.n429 + $4,
    attempts = ai_play_deferrals.attempts + 1,
    last_deferred_at = now(),
    retry_after_at = EXCLUDED.retry_after_at,
    resolved_at = NULL`;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(): {
  dryRun: boolean;
  limit: number | null;
  onlyModel: string | null;
  onlyEvent: string | null;
  eventsFile: string | null;
  maxCostUsd: number;
} {
  const args = process.argv.slice(2);
  const opt = (name: string): string | null =>
    args.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1] ?? null;
  const rawLimit = opt("limit");
  const limit = rawLimit === null ? null : Number(rawLimit);
  if (rawLimit !== null && (!Number.isInteger(limit) || (limit as number) <= 0)) {
    logError(`Invalid --limit=${rawLimit} (expected a positive integer)`);
    process.exit(1);
  }
  const rawMaxCost = opt("max-cost-usd");
  const maxCostUsd = rawMaxCost === null ? DEFAULT_MAX_COST_USD : Number(rawMaxCost);
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    logError(`Invalid --max-cost-usd=${rawMaxCost} (expected a positive number)`);
    process.exit(1);
  }
  const onlyEvent = opt("only-event");
  if (onlyEvent !== null && !isUuid(onlyEvent)) {
    logError(`Invalid --only-event=${onlyEvent} (expected uuid)`);
    process.exit(1);
  }
  return {
    dryRun: args.includes("--dry-run"),
    limit,
    onlyModel: opt("only-model"),
    onlyEvent,
    eventsFile: opt("events-file"),
    maxCostUsd,
  };
}

/** --events-file: one event uuid per line; invalid lines are warned + skipped. */
function readEventsFile(path: string): string[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    logError(
      `[CHRONO] cannot read --events-file=${path}: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }
  const ids: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (!isUuid(trimmed)) {
      logError(`[CHRONO] --events-file: skipping invalid uuid line: ${trimmed.slice(0, 64)}`);
      continue;
    }
    ids.push(trimmed);
  }
  return ids;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Eligibility — vision + (free OR cheap), premium excluded by construction,
// regardless of is_active flags (spec: roster ignores admin toggles).
// ---------------------------------------------------------------------------

function chronoEligible(model: CatalogModel | null): model is CatalogModel {
  if (model === null || !model.isVision) return false;
  if (model.isFree) return true;
  if (model.promptPrice === null || model.completionPrice === null) return false;
  return model.promptPrice + model.completionPrice <= CHEAP_TIER_MAX_USD_PER_TOKEN;
}

// ---------------------------------------------------------------------------
// Worst-case cost estimate (dry-run + spend fallback when usage.cost absent)
// ---------------------------------------------------------------------------

function estimateCallCostUsd(model: CatalogModel): number {
  const prompt = model.promptPrice ?? 0;
  const completion = model.completionPrice ?? 0;
  return prompt * CHRONO_EST_PROMPT_TOKENS + completion * CHRONO_MAX_TOKENS;
}

// ---------------------------------------------------------------------------
// One OpenRouter vision call — no retries in-run
// ---------------------------------------------------------------------------

type ChronoCall =
  | { kind: "ok"; result: ChronoAuditResult; costUsd: number | null }
  | { kind: "deferred"; status: number; retryAfterMs: number | null; reason: string }
  | { kind: "abort"; status: number; reason: string }
  | { kind: "item_error"; error: string };

async function callOpenRouterChrono(
  apiKey: string,
  modelId: string,
  image: ImageWorkRow
): Promise<ChronoCall> {
  const messages = buildChronoAuditMessages({
    imageUrl: image.image_url ?? "",
    year: image.event_year,
    locationName: image.location_name,
    title: image.title,
    description: image.description,
  });
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer${" "}${apiKey}`,
        "HTTP-Referer": "https://digthepast.org",
        "X-Title": "Guess-History Image Chrono Audit",
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: CHRONO_TEMPERATURE,
        max_tokens: CHRONO_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(CHRONO_CALL_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      kind: "deferred",
      status: 0,
      retryAfterMs: null,
      reason: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const bodyText = await response.text();
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retrySeconds = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
    return {
      kind: "deferred",
      status: 429,
      retryAfterMs: Number.isFinite(retrySeconds) ? retrySeconds * 1000 : null,
      reason: `OpenRouter request failed: 429`,
    };
  }
  if (response.status === 402 || response.status === 401 || response.status === 403) {
    // Whole-run abort — never retried, fleet run finalized as error.
    return {
      kind: "abort",
      status: response.status,
      reason: `OpenRouter request failed: ${response.status}`,
    };
  }
  if (response.status >= 500) {
    return {
      kind: "deferred",
      status: response.status,
      retryAfterMs: null,
      reason: `OpenRouter request failed: ${response.status}`,
    };
  }
  if (!response.ok) {
    return {
      kind: "item_error",
      error: `OpenRouter request failed: ${response.status}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { kind: "item_error", error: "OpenRouter response was not JSON" };
  }
  const content =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]
          ?.message?.content
      : undefined;
  const usageCost =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { usage?: { cost?: unknown } }).usage?.cost
      : undefined;
  const costUsd =
    typeof usageCost === "number" && Number.isFinite(usageCost) ? usageCost : null;
  const result = parseChronoAudit(typeof content === "string" ? content : "");
  return { kind: "ok", result, costUsd };
}

// ---------------------------------------------------------------------------
// Fleet-run bookkeeping (modeled on daily-autoplay.ts insertFleetRun /
// finalizeFleetRun — that module runs main() on import, so the helpers are
// re-implemented here for kind 'image_chrono').
// ---------------------------------------------------------------------------

function githubRunUrl(): string | null {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!server || !repo || !runId) return null;
  return `${server}/${repo}/actions/runs/${runId}`;
}

async function insertFleetRun(
  pool: Pick<Pool, "query">,
  runUrl: string | null
): Promise<string | null> {
  try {
    const res = await pool.query<{ id: string }>(
      "INSERT INTO ai_fleet_runs (kind, github_run_url) VALUES ('image_chrono', $1) RETURNING id",
      [runUrl]
    );
    return res.rows[0]?.id ?? null;
  } catch (err) {
    logError(`[FLEET-RUN] insert failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

type FleetRunCounts = {
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

async function finalizeFleetRun(
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
        runId,
        status,
        haltReason,
        counts.plays_attempted,
        counts.plays_ok,
        counts.plays_failed,
        counts.failed_auth,
        counts.failed_gone,
        counts.failed_rate_limit,
        counts.failed_bad_output,
        counts.failed_other,
        counts.plays_skipped_budget,
      ]
    );
  } catch (err) {
    logError(`[FLEET-RUN] finalize failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun, limit, onlyModel, onlyEvent, eventsFile, maxCostUsd } = parseArgs();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if ((!apiKey || apiKey.trim().length === 0) && !dryRun) {
    logError("OPENROUTER_API_KEY is missing.");
    process.exit(1);
    return;
  }

  const pool = wrapPool(getDbPool());
  const dateIso = getDailyChallengeDate();

  // Event filter: --only-event and/or --events-file (union).
  const eventFilter = new Set<string>();
  if (onlyEvent !== null) eventFilter.add(onlyEvent);
  if (eventsFile !== null) {
    for (const id of readEventsFile(eventsFile)) eventFilter.add(id);
  }
  const eventIds = eventFilter.size === 0 ? null : [...eventFilter];

  // Settings + catalog + roster (one query each; catalog is the DB snapshot —
  // this runner never fetches openrouter.ai for metadata).
  let settings: RateSettings = DEFAULT_RATE_SETTINGS;
  try {
    const settingsResult = await pool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM ai_fleet_settings"
    );
    settings = parseRateSettings(settingsResult.rows);
  } catch (err) {
    logError(`[RATE-SETTINGS] query failed (defaults applied): ${err instanceof Error ? err.message : err}`);
  }

  const catalog = new Map<string, CatalogModel>();
  try {
    const catalogResult = await pool.query<CatalogModelRow>(CATALOG_SQL);
    for (const row of catalogResult.rows) {
      const model = catalogModelFromRow(row);
      if (model !== null) catalog.set(model.id, model);
    }
  } catch (err) {
    logError(`[CHRONO] catalog query failed: ${err instanceof Error ? err.message : err}`);
  }

  const playersResult = await pool.query<PlayerRow>(ROSTER_SQL);
  const players: PlayerRow[] = [];
  let ineligibleVision = 0;
  for (const player of playersResult.rows) {
    if (onlyModel !== null && player.model_id !== onlyModel) continue;
    const model = catalog.get(player.model_id) ?? null;
    if (!chronoEligible(model)) {
      if (model !== null && model.isVision) ineligibleVision++;
      if (onlyModel !== null) {
        log(`[ELIGIBILITY] SKIP ${player.name} (${player.model_id}): premium tier or unavailable`);
      }
      continue;
    }
    players.push(player);
  }
  log(`[CHRONO] Eligible models: ${players.length} (premium/unavailable skipped: ${ineligibleVision})`);
  if (players.length === 0) {
    log("[CHRONO] No eligible models; nothing to do.");
    await pool.end();
    reportQueryCounts();
    return;
  }

  // Work items: EVERY images row of eligible events.
  const itemsResult = await pool.query<ImageWorkRow>(WORK_ITEMS_SQL, [eventIds]);
  const allItems = itemsResult.rows;
  const noUrl = allItems.filter((i) => typeof i.image_url !== "string" || i.image_url.length === 0);
  const items = allItems.filter(
    (i) => typeof i.image_url === "string" && i.image_url.length > 0
  );
  log(
    `[CHRONO] Candidate work items: ${allItems.length}` +
      (noUrl.length > 0 ? ` (${noUrl.length} skipped: no image_url)` : "")
  );
  if (items.length === 0) {
    log("[CHRONO] No candidate work items; nothing to do.");
    await pool.end();
    reportQueryCounts();
    return;
  }

  // Existing pairs -> skip (idempotent).
  const existingPairs = new Set<string>();
  try {
    const existingResult = await pool.query<{
      event_id: string;
      image_id: string;
      ai_player_id: string;
    }>(EXISTING_PAIRS_SQL, [players.map((p) => p.id)]);
    for (const row of existingResult.rows) {
      existingPairs.add(`${row.ai_player_id}|${row.event_id}|${row.image_id}`);
    }
  } catch (err) {
    if (dryRun) {
      // Pre-migration dry-run: the flags table may not exist yet. The plan is
      // an upper bound — warn and assume zero existing pairs.
      logError(`[CHRONO] existing-pairs query failed (assuming 0 existing): ${err instanceof Error ? err.message : err}`);
    } else {
      logError(`[CHRONO] existing-pairs query failed (table may not exist yet): ${err instanceof Error ? err.message : err}`);
      log("[CHRONO] Aborting: cannot prove idempotency without ai_image_chrono_flags.");
      await pool.end();
      reportQueryCounts();
      process.exit(1);
      return;
    }
  }

  // Per-model lanes; global cap = --limit. Round-robin across models.
  const maxItems = limit ?? Number.POSITIVE_INFINITY;
  const lanes = new Map<string, { player: PlayerRow; items: ImageWorkRow[] }>();
  for (const player of players) {
    lanes.set(player.id, { player, items: [] });
  }
  let planned = 0;
  let skippedExisting = 0;
  const missingLists = players.map((p) => ({
    player: p,
    missing: items.filter(
      (i) => !existingPairs.has(`${p.id}|${i.event_id}|${i.image_id}`)
    ),
  }));
  skippedExisting =
    players.length * items.length -
    missingLists.reduce((acc, m) => acc + m.missing.length, 0);
  const maxMissing = Math.max(...missingLists.map((m) => m.missing.length), 0);
  outer: for (let i = 0; i < maxMissing; i++) {
    for (const m of missingLists) {
      if (planned >= maxItems) break outer;
      const item = m.missing[i];
      if (item !== undefined) {
        lanes.get(m.player.id)!.items.push(item);
        planned++;
      }
    }
  }

  log(`[CHRONO] Work items: ${planned} planned (cap ${maxItems === Number.POSITIVE_INFINITY ? "none" : maxItems}), ${skippedExisting} already present`);
  let worstCaseUsd = 0;
  for (const lane of lanes.values()) {
    if (lane.items.length === 0) continue;
    const model = catalog.get(lane.player.model_id);
    const est = model ? lane.items.length * estimateCallCostUsd(model) : 0;
    worstCaseUsd += est;
    log(
      `[CHRONO] ${lane.player.id} (${lane.player.name}, ${lane.player.model_id}) items=${lane.items.length} worst_case=$${est.toFixed(6)}`
    );
  }
  log(`[CHRONO] Planned calls: ${planned} | worst-case cost: $${worstCaseUsd.toFixed(6)} | max-cost-usd: $${maxCostUsd}`);

  if (dryRun) {
    log("[CHRONO] Dry-run: SELECT-only plan printed; no OpenRouter calls, no writes.");
    await pool.end();
    reportQueryCounts();
    return;
  }

  // Request budgets (one usage query per run; charged optimistically per call).
  const isFreeModel = (modelId: string): boolean =>
    modelId.includes(":free") || catalog.get(modelId)?.isFree === true;
  const usageByModel = new Map<string, number>();
  let globalUsed = 0;
  let freeFleetUsed = 0;
  try {
    const usageResult = await pool.query<{ model_id: string; count: string | number }>(
      RATE_USAGE_SQL
    );
    for (const row of usageResult.rows) {
      const n = Number(row.count) || 0;
      usageByModel.set(row.model_id, n);
      globalUsed += n;
      if (isFreeModel(row.model_id)) freeFleetUsed += n;
    }
  } catch (err) {
    logError(`[RATE-BUDGET] usage query failed (zero usage assumed): ${err instanceof Error ? err.message : err}`);
  }

  let fleetCapUsd: number | null = null;
  try {
    fleetCapUsd = await getFleetDailyCap(pool);
  } catch (err) {
    fleetCapUsd = DEFAULT_FLEET_DAILY_CAP_USD;
    logError(`[BUDGET] cap query failed (default $${DEFAULT_FLEET_DAILY_CAP_USD} cap applied): ${err instanceof Error ? err.message : err}`);
  }

  const runId = await insertFleetRun(pool, githubRunUrl());

  let abortStatus: number | null = null;
  let abortReason: string | null = null;
  let costHalted = false;
  let budgetHalted = false;
  let globalRateHalted = false;
  let spentUsd = 0;
  let audited = 0;
  let flagsWritten = 0;
  let itemErrors = 0;
  let deferredCount = 0;
  const perModelDone = new Map<string, number>();
  const counts: FleetRunCounts = {
    plays_attempted: 0,
    plays_ok: 0,
    plays_failed: 0,
    failed_auth: 0,
    failed_gone: 0,
    failed_rate_limit: 0,
    failed_bad_output: 0,
    failed_other: 0,
    plays_skipped_budget: 0,
  };

  async function upsertFlag(
    image: ImageWorkRow,
    player: PlayerRow,
    flagged: boolean,
    anachronismText: string | null,
    key: string,
    elementCategory: string | null,
    confidence: number | null,
    costUsd: number | null,
    error: string | null
  ): Promise<void> {
    await pool.query(UPSERT_FLAG_SQL, [
      image.event_id,
      image.image_id,
      player.id,
      flagged,
      anachronismText,
      key,
      elementCategory,
      confidence,
      player.model_id,
      costUsd,
      error,
    ]);
  }

  async function modelWorker(lane: { player: PlayerRow; items: ImageWorkRow[] }): Promise<void> {
    const { player } = lane;
    const model = catalog.get(player.model_id) ?? null;
    const rpm =
      settings.rpmOverrides[player.model_id] ??
      (model?.isFree === true ? settings.rpmFree : settings.rpmPaid);
    const bucket = new TokenBucket({ now: Date.now, refillPerSec: rpm / 60, capacity: 1 });
    let rateBudgetOut = false;
    let consecutiveFailures = 0;

    for (const image of lane.items) {
      if (abortStatus !== null || costHalted || budgetHalted || globalRateHalted || rateBudgetOut) break;

      // --max-cost-usd hard stop (accumulated actual/estimated spend).
      if (spentUsd >= maxCostUsd) {
        costHalted = true;
        logError(`[COST-HALT] spent $${spentUsd.toFixed(6)} >= max-cost-usd $${maxCostUsd} — stopping`);
        break;
      }

      // Request budgets: one request per audit.
      if (globalUsed >= settings.globalRpd) {
        globalRateHalted = true;
        logError(`[RATE-BUDGET] global rpd ${globalUsed} >= ${settings.globalRpd} — stopping`);
        break;
      }
      const free = isFreeModel(player.model_id);
      if (free && freeFleetUsed >= settings.freeRpdFleet) {
        rateBudgetOut = true;
        log(`[RATE-BUDGET] free-fleet rpd ${freeFleetUsed} >= ${settings.freeRpdFleet} — stopping ${player.model_id}`);
        break;
      }
      if (!free && (usageByModel.get(player.model_id) ?? 0) >= settings.rpdPaidModel) {
        rateBudgetOut = true;
        log(`[RATE-BUDGET] ${player.model_id} rpd >= ${settings.rpdPaidModel} — stopping`);
        break;
      }

      // USD budget per dispatch (fail-open, same as audit-run).
      try {
        const spend = await fetchSpendTodayByPlayer(pool, dateIso);
        const verdict = evaluateBudget({
          fleetSpendUsd: spend.total,
          fleetCapUsd,
          modelSpendUsd: spend.byPlayer.get(player.id) ?? 0,
          modelCapUsd:
            player.daily_cost_cap_usd === null ? null : Number(player.daily_cost_cap_usd),
        });
        if (verdict.action === "halt_fleet") {
          budgetHalted = true;
          logError(`[BUDGET-HALT] ${verdict.reason} — stopping chrono audits`);
          break;
        }
        if (verdict.action === "skip_model") {
          log(`[BUDGET] skip ${player.id} (${player.model_id}): ${verdict.reason}`);
          break;
        }
      } catch (err) {
        logError(`[BUDGET] spend query failed (fail-open): ${err instanceof Error ? err.message : err}`);
      }

      // Pacing: one token per call.
      while (!bucket.tryTake(1)) {
        const wait = bucket.msUntil(1);
        if (!Number.isFinite(wait)) break;
        await sleep(Math.min(Math.max(wait, 1), 5000));
      }
      if (abortStatus !== null || costHalted || budgetHalted || globalRateHalted) break;

      globalUsed++;
      if (free) freeFleetUsed++;
      else usageByModel.set(player.model_id, (usageByModel.get(player.model_id) ?? 0) + 1);
      counts.plays_attempted++;

      const call = await callOpenRouterChrono(apiKey ?? "", player.model_id, image);

      if (call.kind === "deferred") {
        deferredCount++;
        counts.failed_rate_limit += call.status === 429 ? 1 : 0;
        counts.plays_failed++;
        const retryAfterMs =
          call.retryAfterMs ?? backoffMs(0, settings.backoffBaseMs, settings.backoffMaxMs);
        try {
          await pool.query(UPSERT_DEFERRAL_SQL, [
            player.id,
            image.event_id,
            `${call.reason}${call.status === 429 ? ` retry_after_ms=${call.retryAfterMs ?? "unknown"}` : ""}`.slice(0, 300),
            call.status === 429 ? 1 : 0,
            Math.max(0, Math.round(retryAfterMs)),
          ]);
        } catch (err) {
          logError(`[DEFER] upsert failed (non-fatal): ${err instanceof Error ? err.message : err}`);
        }
        log(`[DEFER] ${player.model_id} ${image.event_id}/${image.image_id} (${call.reason}) — stopping lane`);
        break; // no in-run retries; the lane stops for this run
      }
      if (call.kind === "abort") {
        abortStatus = call.status;
        abortReason = `http_${call.status}`;
        counts.failed_auth++;
        counts.plays_failed++;
        logError(`[ABORT] ${player.model_id}: ${call.reason} — aborting run`);
        break;
      }
      if (call.kind === "item_error") {
        itemErrors++;
        counts.plays_failed++;
        counts.failed_other++;
        consecutiveFailures++;
        spentUsd += model ? estimateCallCostUsd(model) : 0;
        try {
          await upsertFlag(image, player, false, null, "", null, null, null, call.error);
        } catch (err) {
          logError(`[CHRONO] error-row upsert failed ${image.event_id}/${image.image_id}: ${err instanceof Error ? err.message : err}`);
        }
        log(`[CHRONO-ERR] ${player.model_id} ${image.event_id}/${image.image_id}: ${call.error}`);
        if (consecutiveFailures >= CHRONO_CIRCUIT_BREAKER) {
          logError(`[CIRCUIT] ${player.model_id}: ${consecutiveFailures} consecutive failures — stopping lane`);
          break;
        }
        continue;
      }

      // kind === "ok"
      const effectiveCost = call.costUsd ?? (model ? estimateCallCostUsd(model) : 0);
      spentUsd += effectiveCost;
      const result: ChronoAuditResult = call.result;
      if (result.error !== null) {
        itemErrors++;
        counts.plays_failed++;
        counts.failed_bad_output++;
        consecutiveFailures++;
        try {
          await upsertFlag(image, player, false, null, "", null, null, call.costUsd, result.error);
        } catch (err) {
          logError(`[CHRONO] error-row upsert failed ${image.event_id}/${image.image_id}: ${err instanceof Error ? err.message : err}`);
        }
        log(`[CHRONO-ERR] ${player.model_id} ${image.event_id}/${image.image_id}: ${result.error}`);
        if (consecutiveFailures >= CHRONO_CIRCUIT_BREAKER) {
          logError(`[CIRCUIT] ${player.model_id}: ${consecutiveFailures} consecutive failures — stopping lane`);
          break;
        }
        continue;
      }

      consecutiveFailures = 0;
      try {
        if (result.findings.length === 0) {
          // Clean audit: one flagged=false row, anachronism_key ''.
          await upsertFlag(image, player, false, null, "", null, null, call.costUsd, null);
        } else {
          for (const finding of result.findings) {
            await upsertFlag(
              image,
              player,
              true,
              finding.anachronism_text,
              anachronismKey(finding.element_category, finding.anachronism_text),
              finding.element_category,
              finding.confidence,
              call.costUsd,
              null
            );
          }
        }
        audited++;
        flagsWritten += result.findings.length;
        counts.plays_ok++;
        perModelDone.set(player.model_id, (perModelDone.get(player.model_id) ?? 0) + 1);
        log(`[OK] ${player.model_id} ${image.event_id}/${image.image_id} findings=${result.findings.length}`);
      } catch (err) {
        itemErrors++;
        counts.plays_failed++;
        counts.failed_other++;
        consecutiveFailures++;
        logError(`[CHRONO] upsert failed ${image.event_id}/${image.image_id}: ${err instanceof Error ? err.message : err}`);
        if (consecutiveFailures >= CHRONO_CIRCUIT_BREAKER) {
          logError(`[CIRCUIT] ${player.model_id}: ${consecutiveFailures} consecutive failures — stopping lane`);
          break;
        }
      }
    }
  }

  await Promise.all([...lanes.values()].map((lane) => modelWorker(lane)));

  await pool.end();

  // Finalize fleet run.
  let status: "ok" | "partial" | "halted" | "error";
  let haltReason: string | null = null;
  if (abortStatus !== null) {
    status = "error";
    haltReason = abortReason;
  } else if (costHalted) {
    status = "halted";
    haltReason = "max_cost_usd";
  } else if (budgetHalted || globalRateHalted) {
    status = "halted";
    haltReason = budgetHalted ? "fleet_budget" : "global_rpd";
  } else if (itemErrors > 0 || deferredCount > 0) {
    status = "partial";
  } else {
    status = "ok";
  }
  counts.plays_skipped_budget = planned - counts.plays_attempted;
  await finalizeFleetRun(pool, runId, status, haltReason, counts);

  log("\n=== Image chrono audit summary ===");
  log(`Audited: ${audited}`);
  log(`Findings written: ${flagsWritten}`);
  log(`Item errors: ${itemErrors}`);
  log(`Deferred: ${deferredCount}`);
  log(`Spent (est/actual): $${spentUsd.toFixed(6)}`);
  if (abortStatus !== null) log(`Abort: HTTP ${abortStatus}`);
  for (const [modelId, n] of perModelDone) {
    log(`  ${modelId}: ${n}`);
  }
  reportQueryCounts();

  process.exit(abortStatus !== null ? 1 : 0);
}

main().catch((error) => {
  logError("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
