// EDQ-BUILD-BENCHWIRE-1122-816 — resumable, cost-capped benchmark runner.
//
// Plays the bench-v1 prompt (scripts/ai-players/benchmarkPrompt.ts) for each
// model in --models over the items of --set, recording one
// ai_benchmark_attempts row per (run_id, event_id, attempt_no) — idempotent
// and resumable: events with outcome='success' are skipped, the next
// attempt_no is max(existing)+1, and --max-attempts bounds retries.
//
//   --set=<uuid>              benchmark set id (required)
//   --models=<csv model_ids>  ai_players.model_id list (required)
//   --max-cost-usd=<n>        per-model spend cap across this set's runs
//   --max-cost-usd-total=<n>  total spend cap across all --models lanes
//   --limit=<n>               play only the first n set items (seq order)
//   --max-attempts=<n>        attempts per (run,event) cap (default 2)
//   --live                    spend + write (default is --dry-run plan)
//
// bench-v1 flow per item (hints OFF, image-only): turn1 guess via
// callOpenRouterChat -> gateBenchTurn1Response -> ONE in-lane retry on gate
// failure -> review turn (buildBenchCritiqueMessages + parseBenchPostReveal)
// -> evaluateRound (the game's scoring) -> ai_answer_bank row (success only)
// + ai_benchmark_attempts row.
//
// Error classes: 402/401 -> provider_error + lane abort; 429 ->
// rate_limit_deferred + lane stop; timeout -> 'timeout'; gate failures ->
// no_reasoning/missing_fields; everything else -> provider_error.
// Every console line passes through redact() (same block as
// image-chrono-audit.ts). Env via `npx tsx --env-file=<path>`.

import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { getDbPool } from "@/server/db";
import { callOpenRouterChat } from "@/server/openrouter";
import { evaluateRound } from "@/core/rules";
import type { EventHint, EventRecord, Location } from "@/core/types";
import {
  catalogModelFromRow,
  CHEAP_TIER_MAX_USD_PER_TOKEN,
  type CatalogModel,
  type CatalogModelRow,
} from "@/core/aiEligibility";
import {
  DEFAULT_RATE_SETTINGS,
  TokenBucket,
  parseRateSettings,
  type RateSettings,
} from "@/core/aiRateBudget";
import { evaluateBudget, DEFAULT_FLEET_DAILY_CAP_USD } from "@/core/aiBudget";
import { fetchSpendTodayByPlayer, getFleetDailyCap } from "@/server/aiSpend";
import { getDailyChallengeDate } from "@/core/dailyDate";
import { cleanJson } from "@/core/aiEventAudit";
import { isUuid } from "@/core/isUuid";
import { AI_PLAYER_TIMER_MS } from "@/core/aiPlayers";
import {
  BENCH_PROMPT_VERSION,
  buildBenchCritiqueMessages,
  buildBenchTurn1Messages,
  gateBenchTurn1Response,
  parseBenchPostReveal,
  type BenchPostReveal,
  type BenchPreReveal,
  type BenchTurn1Ok,
} from "../ai-players/benchmarkPrompt";

const CALL_TIMEOUT_MS = 90_000;
const GUESS_MAX_TOKENS = 4096;
const REVIEW_MAX_TOKENS = 2048;
const TEMPERATURE = 0.2;
const DETAIL_MODE = "auto";
const DEFAULT_MAX_COST_USD = 5;
const DEFAULT_MAX_COST_USD_TOTAL = 25;
const DEFAULT_MAX_ATTEMPTS = 2;
/** Worst-case prompt tokens per call for dry-run estimates. */
const EST_PROMPT_TOKENS = 3000;

// ---------------------------------------------------------------------------
// SECRET-SAFETY redactor — identical pattern to image-chrono-audit.ts.
// ---------------------------------------------------------------------------

const SENSITIVE_NAME_RE = /KEY|SECRET|TOKEN|PASSWORD|CONNECTION|PRIVATE/i;
const SECRET_VALUE_RES: readonly RegExp[] = [
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
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export type AttemptOutcome =
  | "success"
  | "no_reasoning"
  | "missing_fields"
  | "provider_error"
  | "rate_limit_deferred"
  | "timeout";

export type CallFailure = {
  outcome: AttemptOutcome;
  /** 'abort' stops the model lane; 'stop' ends the lane without abort flag; 'continue' keeps going. */
  lane: "abort" | "stop" | "continue";
  status: number | null;
};

/** Map an OpenRouter/transport failure to an attempt outcome + lane action. */
export function classifyCallFailure(errorText: string | null | undefined, timedOut = false): CallFailure {
  if (timedOut) return { outcome: "timeout", lane: "continue", status: null };
  if (typeof errorText !== "string" || errorText.length === 0) {
    return { outcome: "provider_error", lane: "continue", status: null };
  }
  const m = /OpenRouter request failed: (\d{3})/.exec(errorText);
  const status = m ? Number(m[1]) : null;
  if (status === 402 || status === 401) {
    // Key limit / key rejected — abort this model's lane (never retried).
    return { outcome: "provider_error", lane: "abort", status };
  }
  if (status === 429) {
    return { outcome: "rate_limit_deferred", lane: "stop", status };
  }
  if (status !== null && status >= 500) {
    return { outcome: "provider_error", lane: "continue", status };
  }
  if (errorText.startsWith("TIMEOUT_DEADLINE:") || errorText.includes("fetch failed")) {
    return { outcome: "provider_error", lane: "continue", status };
  }
  return { outcome: "provider_error", lane: "continue", status };
}

/** Vision + (free OR cheap) — premium excluded by construction. */
export function benchEligible(model: CatalogModel | null): model is CatalogModel {
  if (model === null || !model.isVision) return false;
  if (model.isFree) return true;
  if (model.promptPrice === null || model.completionPrice === null) return false;
  return model.promptPrice + model.completionPrice <= CHEAP_TIER_MAX_USD_PER_TOKEN;
}

export function estimateCallCostUsd(model: CatalogModel): number {
  const prompt = model.promptPrice ?? 0;
  const completion = model.completionPrice ?? 0;
  return prompt * EST_PROMPT_TOKENS + completion * GUESS_MAX_TOKENS;
}

export type ExistingAttempt = {
  event_id: string;
  attempt_no: number;
  outcome: string;
};

/**
 * Resume plan for one run: events with a 'success' attempt are done;
 * others get attempt_no = max(existing)+1 while under maxAttempts.
 * Returns the items still to play with their next attempt_no.
 */
export function planAttempts(
  items: readonly { event_id: string }[],
  existing: readonly ExistingAttempt[],
  maxAttempts: number
): { event_id: string; attempt_no: number }[] {
  const byEvent = new Map<string, ExistingAttempt[]>();
  for (const a of existing) {
    const list = byEvent.get(a.event_id);
    if (list) list.push(a);
    else byEvent.set(a.event_id, [a]);
  }
  const out: { event_id: string; attempt_no: number }[] = [];
  for (const item of items) {
    const rows = byEvent.get(item.event_id) ?? [];
    if (rows.some((r) => r.outcome === "success")) continue;
    if (rows.length >= maxAttempts) continue;
    const maxNo = rows.reduce((acc, r) => Math.max(acc, r.attempt_no), 0);
    out.push({ event_id: item.event_id, attempt_no: maxNo + 1 });
  }
  return out;
}

/** Does the reply JSON carry a `reasoning` string at all (for reasoning_present)? */
export function hasReasoningField(content: string): boolean {
  try {
    const parsed = JSON.parse(cleanJson(content));
    if (typeof parsed !== "object" || parsed === null) return false;
    const r = (parsed as Record<string, unknown>).reasoning;
    return typeof r === "string" && r.trim().length > 0;
  } catch {
    return false;
  }
}

export function parseArgs(argv: readonly string[]): {
  setId: string;
  modelIds: string[];
  maxCostUsd: number;
  maxCostUsdTotal: number;
  limit: number | null;
  maxAttempts: number;
  live: boolean;
} {
  const opt = (name: string): string | null =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1] ?? null;
  const setId = opt("set");
  if (setId === null || !isUuid(setId)) {
    logError("Invalid or missing --set=<uuid>");
    process.exit(1);
  }
  const modelsRaw = opt("models");
  const modelIds = (modelsRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (modelIds.length === 0) {
    logError("Invalid or missing --models=<csv model_ids>");
    process.exit(1);
  }
  const num = (name: string, dflt: number): number => {
    const raw = opt(name);
    if (raw === null) return dflt;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      logError(`Invalid --${name}=${raw} (expected a positive number)`);
      process.exit(1);
    }
    return n;
  };
  const limitRaw = opt("limit");
  const limit = limitRaw === null ? null : Number(limitRaw);
  if (limitRaw !== null && (!Number.isInteger(limit) || (limit as number) <= 0)) {
    logError(`Invalid --limit=${limitRaw} (expected a positive integer)`);
    process.exit(1);
  }
  const maxAttemptsRaw = opt("max-attempts");
  const maxAttempts = maxAttemptsRaw === null ? DEFAULT_MAX_ATTEMPTS : Number(maxAttemptsRaw);
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    logError(`Invalid --max-attempts=${maxAttemptsRaw} (expected a positive integer)`);
    process.exit(1);
  }
  return {
    setId: setId as string,
    modelIds,
    maxCostUsd: num("max-cost-usd", DEFAULT_MAX_COST_USD),
    maxCostUsdTotal: num("max-cost-usd-total", DEFAULT_MAX_COST_USD_TOTAL),
    limit: limit as number | null,
    maxAttempts: maxAttempts as number,
    live: argv.includes("--live"),
  };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

type SetRow = { id: string; version: number; name: string; status: string; prompt_version: string };

const SET_SQL = `SELECT id, version, name, status, prompt_version FROM public.ai_benchmark_sets WHERE id = $1`;

const ITEMS_SQL = `SELECT si.seq, si.event_id, e.event_year, e.title, e.description,
    loc.latitude, loc.longitude, loc.display_name AS location_name, loc.country, loc.continent,
    img.url AS image_url
  FROM public.ai_benchmark_set_items si
  JOIN public.events e ON e.id = si.event_id
  JOIN LATERAL (
    SELECT l.latitude, l.longitude, l.display_name, l.country, l.continent
    FROM public.locations l
    WHERE l.event_id = e.id AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
    ORDER BY l.id ASC LIMIT 1
  ) loc ON true
  LEFT JOIN LATERAL (
    SELECT i.url FROM public.images i WHERE i.event_id = e.id
    ORDER BY i.display_order ASC NULLS LAST, i.created_at ASC, i.id ASC LIMIT 1
  ) img ON true
  WHERE si.set_id = $1
  ORDER BY si.seq ASC`;

const HINTS_SQL = `SELECT id, tier, type, content, display_order FROM public.hints
  WHERE event_id = $1 ORDER BY tier, type, display_order`;

const PLAYER_SQL = `SELECT id, name, provider, model_id, is_active, is_active_daily,
  is_active_practice, max_tokens, daily_cost_cap_usd, deleted_at
  FROM public.ai_players WHERE model_id = ANY($1::text[]) AND deleted_at IS NULL`;

const CATALOG_SQL = `SELECT model_id, is_free, is_vision, availability_status,
  context_length, price_prompt_usd, price_completion_usd
  FROM public.openrouter_models`;

const RUN_ENSURE_SQL = `INSERT INTO public.ai_benchmark_runs (set_id, ai_player_id, prompt_version, status)
  VALUES ($1, $2, $3, 'running')
  ON CONFLICT (set_id, ai_player_id) DO NOTHING
  RETURNING id`;

const RUN_GET_SQL = `SELECT id, status FROM public.ai_benchmark_runs
  WHERE set_id = $1 AND ai_player_id = $2`;

const RUN_FINISH_SQL = `UPDATE public.ai_benchmark_runs
  SET status = $2, finished_at = CASE WHEN $2 = 'running' THEN finished_at ELSE now() END
  WHERE id = $1 AND status <> 'complete'`;

const ATTEMPTS_SQL = `SELECT a.event_id, a.attempt_no, a.outcome
  FROM public.ai_benchmark_attempts a
  JOIN public.ai_benchmark_runs r ON r.id = a.run_id
  WHERE r.set_id = $1 AND r.ai_player_id = $2`;

const SPEND_SQL = `SELECT COALESCE(SUM(a.cost_usd), 0) AS spent FROM public.ai_benchmark_attempts a
  JOIN public.ai_benchmark_runs r ON r.id = a.run_id
  WHERE r.set_id = $1 AND r.ai_player_id = $2`;

const SPEND_TOTAL_SQL = `SELECT COALESCE(SUM(a.cost_usd), 0) AS spent FROM public.ai_benchmark_attempts a
  JOIN public.ai_benchmark_runs r ON r.id = a.run_id
  WHERE r.set_id = $1 AND r.ai_player_id = ANY($2::uuid[])`;

const ATTEMPT_INSERT_SQL = `INSERT INTO public.ai_benchmark_attempts
  (run_id, event_id, ai_answer_bank_id, attempt_no, outcome, reasoning_present, error_text, cost_usd, duration_ms)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (run_id, event_id, attempt_no) DO NOTHING
  RETURNING id`;

const BANK_UPSERT_SQL = `INSERT INTO public.ai_answer_bank (
    event_id, ai_player_id, guess_lat, guess_lng, guess_year,
    distance_km, year_diff, location_accuracy, year_accuracy,
    round_accuracy, round_xp, raw_llm_response, error,
    reference_year, reasoning, hints_requested, hint_penalty_applied,
    time_to_guess_ms, critique_error,
    play_mode, hints_off, total_cost_usd, total_tokens,
    latency_ms, timer_ms, model_slug, confidence,
    prompt_version, benchmark_run_id, structured_payload,
    ai_image_depiction_score, fame_score
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
  ON CONFLICT (event_id, ai_player_id) DO UPDATE SET
    guess_lat = EXCLUDED.guess_lat, guess_lng = EXCLUDED.guess_lng, guess_year = EXCLUDED.guess_year,
    distance_km = EXCLUDED.distance_km, year_diff = EXCLUDED.year_diff,
    location_accuracy = EXCLUDED.location_accuracy, year_accuracy = EXCLUDED.year_accuracy,
    round_accuracy = EXCLUDED.round_accuracy, round_xp = EXCLUDED.round_xp,
    raw_llm_response = EXCLUDED.raw_llm_response, error = EXCLUDED.error,
    reference_year = EXCLUDED.reference_year, reasoning = EXCLUDED.reasoning,
    hints_requested = EXCLUDED.hints_requested, hint_penalty_applied = EXCLUDED.hint_penalty_applied,
    time_to_guess_ms = EXCLUDED.time_to_guess_ms, critique_error = EXCLUDED.critique_error,
    play_mode = EXCLUDED.play_mode, hints_off = EXCLUDED.hints_off,
    total_cost_usd = EXCLUDED.total_cost_usd, total_tokens = EXCLUDED.total_tokens,
    latency_ms = EXCLUDED.latency_ms, timer_ms = EXCLUDED.timer_ms,
    model_slug = EXCLUDED.model_slug, confidence = EXCLUDED.confidence,
    prompt_version = EXCLUDED.prompt_version, benchmark_run_id = EXCLUDED.benchmark_run_id,
    structured_payload = EXCLUDED.structured_payload,
    ai_image_depiction_score = EXCLUDED.ai_image_depiction_score, fame_score = EXCLUDED.fame_score,
    created_at = now()
  RETURNING id`;

const RATE_USAGE_SQL = `SELECT p.model_id, count(*) FROM ai_answer_bank_calls c
  JOIN ai_answer_bank b ON b.id=c.ai_answer_bank_id
  JOIN ai_players p ON p.id=b.ai_player_id
  WHERE c.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') GROUP BY 1`;

// ---------------------------------------------------------------------------
// Types + helpers
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

type ItemRow = {
  seq: number;
  event_id: string;
  event_year: number;
  title: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  location_name: string | null;
  country: string | null;
  continent: string | null;
  image_url: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithTimeout<T>(p: Promise<T>, ms: number): Promise<T | "__timeout__"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"__timeout__">((resolve) => {
    timer = setTimeout(() => resolve("__timeout__"), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { setId, modelIds, maxCostUsd, maxCostUsdTotal, limit, maxAttempts, live } =
    parseArgs(process.argv.slice(2));

  const apiKey = process.env.OPENROUTER_API_KEY;
  if ((!apiKey || apiKey.trim().length === 0) && live) {
    logError("OPENROUTER_API_KEY is missing.");
    process.exit(1);
    return;
  }

  const pool = getDbPool();

  const setResult = await pool.query<SetRow>(SET_SQL, [setId]);
  if (setResult.rows.length === 0) {
    logError(`[BENCH] set ${setId} not found`);
    await pool.end();
    process.exit(1);
    return;
  }
  const set = setResult.rows[0];
  log(`[BENCH] set ${set.id} version=${set.version} name='${set.name}' status=${set.status} prompt_version=${set.prompt_version}`);

  const itemsResult = await pool.query<ItemRow>(ITEMS_SQL, [setId]);
  const allItems = itemsResult.rows;
  const playable = allItems.filter((i) => typeof i.image_url === "string" && i.image_url.length > 0);
  const noImage = allItems.length - playable.length;
  const items = limit === null ? playable : playable.slice(0, limit);
  log(`[BENCH] set items: ${allItems.length} (${noImage} skipped: no image) -> playing ${items.length}`);
  if (items.length === 0) {
    log("[BENCH] No playable items; nothing to do.");
    await pool.end();
    return;
  }

  // Roster + catalog eligibility.
  const catalog = new Map<string, CatalogModel>();
  try {
    const catalogResult = await pool.query<CatalogModelRow>(CATALOG_SQL);
    for (const row of catalogResult.rows) {
      const model = catalogModelFromRow(row);
      if (model !== null) catalog.set(model.id, model);
    }
  } catch (err) {
    logError(`[BENCH] catalog query failed: ${err instanceof Error ? err.message : err}`);
  }

  const playersResult = await pool.query<PlayerRow>(PLAYER_SQL, [modelIds]);
  const found = new Set(playersResult.rows.map((p) => p.model_id));
  const missingModels = modelIds.filter((m) => !found.has(m));
  if (missingModels.length > 0) {
    logError(`[BENCH] --models not found (or deleted) in ai_players: ${missingModels.join(", ")}`);
  }
  const players: { player: PlayerRow; model: CatalogModel }[] = [];
  for (const player of playersResult.rows) {
    const model = catalog.get(player.model_id) ?? null;
    if (!benchEligible(model)) {
      log(`[ELIGIBILITY] SKIP ${player.name} (${player.model_id}): not vision or premium tier`);
      continue;
    }
    players.push({ player, model: model as CatalogModel });
  }
  log(`[BENCH] Eligible models: ${players.length}/${modelIds.length}`);
  if (players.length === 0) {
    log("[BENCH] No eligible models; nothing to do.");
    await pool.end();
    return;
  }

  // Settings + fleet budget context.
  let settings: RateSettings = DEFAULT_RATE_SETTINGS;
  try {
    const settingsResult = await pool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM ai_fleet_settings"
    );
    settings = parseRateSettings(settingsResult.rows);
  } catch (err) {
    logError(`[RATE-SETTINGS] query failed (defaults applied): ${err instanceof Error ? err.message : err}`);
  }
  const dateIso = getDailyChallengeDate();
  let fleetCapUsd: number | null = null;
  try {
    fleetCapUsd = await getFleetDailyCap(pool);
  } catch {
    fleetCapUsd = DEFAULT_FLEET_DAILY_CAP_USD;
  }

  // Per-model lanes: ensure run rows, load existing attempts (resume plan).
  type Lane = {
    player: PlayerRow;
    model: CatalogModel;
    runId: string | null;
    runStatus: string | null;
    plan: { event_id: string; attempt_no: number }[];
    done: number;
    spentUsd: number;
    finished: boolean;
  };
  const lanes: Lane[] = [];
  const playerIds: string[] = [];
  for (const { player, model } of players) {
    playerIds.push(player.id);
    const lane: Lane = { player, model, runId: null, runStatus: null, plan: [], done: 0, spentUsd: 0, finished: false };
    if (live) {
      const ensured = await pool.query<{ id: string }>(RUN_ENSURE_SQL, [
        setId,
        player.id,
        BENCH_PROMPT_VERSION,
      ]);
      const run = ensured.rows[0]
        ? { id: ensured.rows[0].id, status: "running" }
        : (await pool.query<{ id: string; status: string }>(RUN_GET_SQL, [setId, player.id])).rows[0];
      if (!run) {
        logError(`[BENCH] could not ensure run for ${player.model_id}`);
        continue;
      }
      lane.runId = run.id;
      lane.runStatus = run.status;
      if (run.status === "complete") {
        log(`[BENCH] ${player.model_id}: run already complete — skipping`);
        lanes.push(lane);
        continue;
      }
      const attempts = await pool.query<ExistingAttempt>(ATTEMPTS_SQL, [setId, player.id]);
      const itemIds = items.map((i) => ({ event_id: i.event_id }));
      lane.plan = planAttempts(itemIds, attempts.rows, maxAttempts);
      const spent = await pool.query<{ spent: string | number }>(SPEND_SQL, [setId, player.id]);
      lane.spentUsd = Number(spent.rows[0]?.spent ?? 0) || 0;
      log(
        `[BENCH] ${player.model_id}: run=${run.id} status=${run.status} items=${items.length} ` +
          `to_play=${lane.plan.length} spent=$${lane.spentUsd.toFixed(6)}`
      );
    } else {
      log(`[BENCH] ${player.model_id}: dry-run lane (run row not ensured)`);
    }
    lanes.push(lane);
  }

  // Total spend across managed lanes (seeded from DB in live mode).
  let totalSpentUsd = 0;
  if (live) {
    const totalSpent = await pool.query<{ spent: string | number }>(SPEND_TOTAL_SQL, [
      setId,
      playerIds,
    ]);
    totalSpentUsd = Number(totalSpent.rows[0]?.spent ?? 0) || 0;
  }
  const plannedCalls = lanes.reduce((acc, l) => acc + (live ? l.plan.length : items.length), 0);
  let worstCaseUsd = 0;
  for (const lane of lanes) {
    const n = live ? lane.plan.length : items.length;
    worstCaseUsd += n * estimateCallCostUsd(lane.model) * 2; // guess(+retry) + review
  }
  log(
    `[BENCH] Planned plays: ${plannedCalls} | worst-case cost: $${worstCaseUsd.toFixed(6)} | ` +
      `caps: per-model $${maxCostUsd} total $${maxCostUsdTotal}${live ? "" : " (dry-run)"}`
  );

  if (!live) {
    log("[BENCH] Dry-run: plan printed; no OpenRouter calls, no writes. Pass --live to spend.");
    await pool.end();
    return;
  }

  // Request budgets (one usage query per run).
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
    logError(`[RATE-BUDGET] usage query failed (zero usage assumed): ${err instanceof Error ? err.message : err}`);
  }

  let abortAll = false;
  let costHalted = false;
  let budgetHalted = false;
  let played = 0;
  let okCount = 0;
  let failCount = 0;
  const outcomeCounts = new Map<AttemptOutcome, number>();

  const itemById = new Map(items.map((i) => [i.event_id, i]));

  async function writeAttempt(
    lane: Lane,
    eventId: string,
    attemptNo: number,
    bankId: string | null,
    outcome: AttemptOutcome,
    reasoningPresent: boolean,
    errorText: string | null,
    costUsd: number | null,
    durationMs: number
  ): Promise<void> {
    await pool.query(ATTEMPT_INSERT_SQL, [
      lane.runId,
      eventId,
      bankId,
      attemptNo,
      outcome,
      reasoningPresent,
      errorText === null ? null : errorText.slice(0, 1000),
      costUsd,
      Math.round(durationMs),
    ]);
    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);
  }

  async function modelWorker(lane: Lane): Promise<void> {
    const { player, model } = lane;
    if (lane.runId === null || lane.plan.length === 0) return;
    const rpm =
      settings.rpmOverrides[player.model_id] ??
      (model.isFree ? settings.rpmFree : settings.rpmPaid);
    const bucket = new TokenBucket({ now: Date.now, refillPerSec: rpm / 60, capacity: 1 });
    let laneAborted = false;
    let laneStopped = false;
    let processed = 0;

    for (const step of lane.plan) {
      processed++;
      if (abortAll || costHalted || budgetHalted || laneAborted || laneStopped) {
        processed--;
        break;
      }
      const item = itemById.get(step.event_id);
      if (!item) {
        processed--;
        continue;
      }

      // Cost caps (per-model + total) from accumulated attempt spend.
      if (lane.spentUsd >= maxCostUsd) {
        costHalted = true;
        logError(`[COST-HALT] ${player.model_id} spent $${lane.spentUsd.toFixed(6)} >= $${maxCostUsd}`);
        break;
      }
      if (totalSpentUsd >= maxCostUsdTotal) {
        costHalted = true;
        logError(`[COST-HALT] total spent $${totalSpentUsd.toFixed(6)} >= $${maxCostUsdTotal}`);
        break;
      }

      // Request budgets.
      if (globalUsed >= settings.globalRpd) {
        logError(`[RATE-BUDGET] global rpd ${globalUsed} >= ${settings.globalRpd} — stopping`);
        break;
      }
      const free = isFreeModel(player.model_id);
      if (free && freeFleetUsed >= settings.freeRpdFleet) {
        laneStopped = true;
        log(`[RATE-BUDGET] free-fleet rpd ${freeFleetUsed} >= ${settings.freeRpdFleet} — stopping ${player.model_id}`);
        break;
      }
      if (!free && (usageByModel.get(player.model_id) ?? 0) >= settings.rpdPaidModel) {
        laneStopped = true;
        log(`[RATE-BUDGET] ${player.model_id} rpd cap — stopping`);
        break;
      }

      // Fleet USD budget per dispatch (fail-open).
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
          logError(`[BUDGET-HALT] ${verdict.reason} — stopping benchmark`);
          break;
        }
        if (verdict.action === "skip_model") {
          log(`[BUDGET] skip ${player.model_id}: ${verdict.reason}`);
          laneStopped = true;
          break;
        }
      } catch (err) {
        logError(`[BUDGET] spend query failed (fail-open): ${err instanceof Error ? err.message : err}`);
      }

      // Pacing: one token per OpenRouter call (guess+retry+review ≈ up to 3).
      while (!bucket.tryTake(1)) {
        const wait = bucket.msUntil(1);
        if (!Number.isFinite(wait)) break;
        await sleep(Math.min(Math.max(wait, 1), 5000));
      }
      if (abortAll || costHalted || budgetHalted || laneAborted || laneStopped) break;

      globalUsed++;
      if (free) freeFleetUsed++;
      else usageByModel.set(player.model_id, (usageByModel.get(player.model_id) ?? 0) + 1);
      played++;

      const playStart = Date.now();
      let costUsd = 0;
      let totalTokens: number | null = null;
      let guessMs = 0;

      // ---- Turn 1: guess (image-only, hints off) ----
      const turn1Messages = buildBenchTurn1Messages(item.image_url as string, DETAIL_MODE);
      const turn1Raw = await callWithTimeout(
        callOpenRouterChat({
          apiKey: apiKey as string,
          model: player.model_id,
          messages: turn1Messages,
          temperature: TEMPERATURE,
          maxTokens: GUESS_MAX_TOKENS,
        }),
        CALL_TIMEOUT_MS
      );
      if (turn1Raw === "__timeout__") {
        await writeAttempt(lane, item.event_id, step.attempt_no, null, "timeout", false,
          `call exceeded ${CALL_TIMEOUT_MS}ms`, null, Date.now() - playStart);
        failCount++;
        continue;
      }
      const turn1 = turn1Raw;
      costUsd += turn1.usage.cost ?? 0;
      totalTokens = (totalTokens ?? 0) + (turn1.usage.total_tokens ?? 0);

      if (!turn1.ok) {
        const fail = classifyCallFailure(turn1.error);
        await writeAttempt(lane, item.event_id, step.attempt_no, null, fail.outcome, false,
          turn1.error, costUsd, Date.now() - playStart);
        failCount++;
        lane.spentUsd += costUsd;
        totalSpentUsd += costUsd;
        if (fail.lane === "abort") {
          laneAborted = true;
          abortAll = true; // key-class failure — stop every lane
          logError(`[ABORT] ${player.model_id}: ${turn1.error} — aborting run`);
        } else if (fail.lane === "stop") {
          laneStopped = true;
          log(`[DEFER] ${player.model_id} ${item.event_id}: ${turn1.error} — stopping lane`);
        }
        continue;
      }

      // ---- Gate: structured parse + reasoning ----
      const gate1 = gateBenchTurn1Response(turn1.content, { text: null, tokens: null });
      let adopted: BenchTurn1Ok | null = null;
      let guessCall = turn1;
      if (gate1.kind === "ok") {
        adopted = gate1;
      } else {
        // ONE in-lane retry of the guess turn.
        const retryRaw = await callWithTimeout(
          callOpenRouterChat({
            apiKey: apiKey as string,
            model: player.model_id,
            messages: turn1Messages,
            temperature: TEMPERATURE,
            maxTokens: GUESS_MAX_TOKENS,
          }),
          CALL_TIMEOUT_MS
        );
        if (retryRaw === "__timeout__") {
          await writeAttempt(lane, item.event_id, step.attempt_no, null, "timeout",
            hasReasoningField(turn1.content), `retry exceeded ${CALL_TIMEOUT_MS}ms`,
            costUsd, Date.now() - playStart);
          failCount++;
          lane.spentUsd += costUsd;
          totalSpentUsd += costUsd;
          continue;
        }
        costUsd += retryRaw.usage.cost ?? 0;
        totalTokens = (totalTokens ?? 0) + (retryRaw.usage.total_tokens ?? 0);
        if (!retryRaw.ok) {
          const fail = classifyCallFailure(retryRaw.error);
          await writeAttempt(lane, item.event_id, step.attempt_no, null, fail.outcome,
            hasReasoningField(turn1.content), retryRaw.error, costUsd, Date.now() - playStart);
          failCount++;
          lane.spentUsd += costUsd;
          totalSpentUsd += costUsd;
          if (fail.lane === "abort") {
            laneAborted = true;
            abortAll = true;
            logError(`[ABORT] ${player.model_id}: ${retryRaw.error} — aborting run`);
          } else if (fail.lane === "stop") {
            laneStopped = true;
            log(`[DEFER] ${player.model_id} ${item.event_id}: ${retryRaw.error} — stopping lane`);
          }
          continue;
        }
        const gate2 = gateBenchTurn1Response(retryRaw.content, { text: null, tokens: null });
        if (gate2.kind === "ok") {
          adopted = gate2;
          guessCall = retryRaw;
        } else {
          await writeAttempt(lane, item.event_id, step.attempt_no, null, gate2.errorClass,
            hasReasoningField(retryRaw.content), gate2.error, costUsd, Date.now() - playStart);
          failCount++;
          lane.spentUsd += costUsd;
          totalSpentUsd += costUsd;
          continue;
        }
      }
      if (adopted === null) continue;
      guessMs = Date.now() - playStart;

      // ---- Review turn (post-reveal; non-fatal on parse failure) ----
      const hintsResult = await pool
        .query(HINTS_SQL, [item.event_id])
        .catch(() => ({ rows: [] as EventHint[] }));
      const hints = hintsResult.rows;
      const trueAnswer = {
        lat: item.latitude,
        lng: item.longitude,
        year: item.event_year,
        locationName: item.location_name,
      };
      const reviewMessages = buildBenchCritiqueMessages(
        item.image_url as string,
        trueAnswer,
        item.title ?? "",
        item.location_name ?? "",
        item.description ?? null,
        hints,
        DETAIL_MODE
      );
      const reviewRaw = await callWithTimeout(
        callOpenRouterChat({
          apiKey: apiKey as string,
          model: player.model_id,
          messages: reviewMessages,
          temperature: TEMPERATURE,
          maxTokens: REVIEW_MAX_TOKENS,
        }),
        CALL_TIMEOUT_MS
      );
      let postReveal: BenchPostReveal | null = null;
      let critiqueError: string | null = null;
      if (reviewRaw === "__timeout__") {
        critiqueError = `review call exceeded ${CALL_TIMEOUT_MS}ms`;
      } else {
        costUsd += reviewRaw.usage.cost ?? 0;
        totalTokens = (totalTokens ?? 0) + (reviewRaw.usage.total_tokens ?? 0);
        if (!reviewRaw.ok) {
          critiqueError = `review call failed: ${reviewRaw.error}`;
        } else {
          const post = parseBenchPostReveal(reviewRaw.content);
          if (post.postReveal !== null) postReveal = post.postReveal;
          else if (post.error !== null) critiqueError = post.error;
        }
      }

      // ---- Score with the game's own evaluateRound (hints off => zero penalties) ----
      const fg = adopted.finalGuess;
      const location: Location = {
        id: item.event_id,
        name: item.location_name ?? "",
        lat: item.latitude,
        lng: item.longitude,
      };
      const eventRecord: EventRecord = {
        id: item.event_id,
        title: item.title ?? "",
        description: item.description ?? "",
        year: item.event_year,
        location,
        region: item.continent ?? item.country ?? "",
        imageUrl: item.image_url,
        thumbUrl: null,
        hints,
      };
      const referenceYear = new Date().getFullYear();
      const result = evaluateRound(
        eventRecord,
        { year: fg.year, location: { lat: fg.latitude, lng: fg.longitude } },
        0,
        false,
        0,
        0,
        referenceYear
      );

      const preReveal: BenchPreReveal = adopted.preReveal;
      const structuredPayload = {
        prompt_version: BENCH_PROMPT_VERSION,
        preReveal,
        postReveal,
      };

      const bankRes = await pool.query<{ id: string }>(BANK_UPSERT_SQL, [
        item.event_id,
        player.id,
        fg.latitude,
        fg.longitude,
        fg.year,
        result.distanceKm,
        result.yearDiff,
        result.locationAccuracy,
        result.yearAccuracy,
        result.roundAccuracy,
        result.roundXp,
        guessCall.content,
        null,
        referenceYear,
        adopted.reasoning,
        "[]",
        JSON.stringify({ whenPenaltyRate: 0, wherePenaltyRate: 0, validHintCount: 0 }),
        guessMs,
        critiqueError,
        "practice",
        true,
        costUsd,
        totalTokens,
        Date.now() - playStart,
        AI_PLAYER_TIMER_MS,
        player.model_id,
        fg.confidence,
        BENCH_PROMPT_VERSION,
        lane.runId,
        JSON.stringify(structuredPayload),
        postReveal?.ai_image_depiction_score ?? null,
        postReveal?.fame_score ?? null,
      ]);
      const bankId = bankRes.rows[0]?.id ?? null;

      await writeAttempt(lane, item.event_id, step.attempt_no, bankId, "success", true,
        null, costUsd, Date.now() - playStart);
      okCount++;
      lane.done++;
      lane.spentUsd += costUsd;
      totalSpentUsd += costUsd;
      log(
        `[OK] ${player.model_id} ${item.event_id} seq=${item.seq} ` +
          `year_acc=${result.yearAccuracy} loc_acc=${result.locationAccuracy} cost=$${costUsd.toFixed(6)}`
      );
    }

    lane.finished = processed === lane.plan.length && lane.plan.length > 0;
  }

  await Promise.all(lanes.map((lane) => modelWorker(lane)));

  // Finalize run rows: 'complete' only when the lane finished its whole plan;
  // anything else stays resumable as 'aborted' (never 'running' forever).
  for (const lane of lanes) {
    if (lane.runId === null) continue;
    const status = lane.finished ? "complete" : "aborted";
    try {
      await pool.query(RUN_FINISH_SQL, [lane.runId, status]);
    } catch (err) {
      logError(`[BENCH] run finalize failed ${lane.runId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  await pool.end();

  log("\n=== Benchmark run summary ===");
  log(`Played: ${played} | success: ${okCount} | failures: ${failCount}`);
  for (const [k, v] of outcomeCounts) log(`  outcome ${k}: ${v}`);
  log(`Spent (attempt cost_usd sums): $${totalSpentUsd.toFixed(6)}`);
  if (costHalted) log("Halted: cost cap reached");
  if (budgetHalted) log("Halted: fleet budget");
  process.exit(0);
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    logError("Unexpected error:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
