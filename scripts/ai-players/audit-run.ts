// AIP-BUILD-FLEETFINAL-1103-060 (D8/E4) — text-only auditor runner.
//
// Auditors are the roster models classified role 'auditor' by
// src/core/aiEligibility.ts (non-vision models). Each audits playable events
// it lacks an ai_event_audits row for: ONE text-only OpenRouter call per
// event (no image), one UPSERT into ai_event_audits ON CONFLICT
// (event_id, ai_player_id). Audits never write events.
//
//   --dry-run            print the plan only — no calls, no writes
//   --limit=N            cap total audit items dispatched this run
//   --only-model=<slug>  run only the auditor with this model_id
//   --only-event=<uuid>  audit only this event
//
// Pacing: a token bucket per auditor (capacity 1, refill rpm/60 per D3 — one
// token per call). A 429/5xx defers the item (ai_play_deferrals mode 'audit',
// retry-after honoured) and stops that auditor's lane for the run — no
// in-run retries. Exit 0 on success / deferred-only; 1 on auth errors.
//
// AI_QUERY_COUNT=1 wraps the pool and prints per-run query totals (D9).

import { config } from "dotenv";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { getDbPool } from "@/server/db";
import {
  classifyPlayer,
  catalogModelFromRow,
  type CatalogModel,
  type CatalogModelRow,
} from "@/core/aiEligibility";
import {
  buildAuditMessages,
  parseEventAudit,
  type AuditEventInput,
  type EventAuditResult,
} from "@/core/aiEventAudit";
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

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const AUDIT_CALL_TIMEOUT_MS = 60_000;
const AUDIT_MAX_TOKENS = 2048;
const AUDIT_TEMPERATURE = 0.2;

type AuditorRow = {
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

type AuditEventRow = {
  event_id: string;
  title: string | null;
  description: string | null;
  event_year: number | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  hints: unknown;
  audit_count: string | number;
  avg_image_quality: string | number | null;
  avg_difficulty: string | number | null;
  image_quality_notes: string | null;
  difficulty_notes: string | null;
};

type AuditItem = { auditor: AuditorRow; event: AuditEventRow };

function parseArgs(): {
  dryRun: boolean;
  limit: number | null;
  onlyModel: string | null;
  onlyEvent: string | null;
} {
  const args = process.argv.slice(2);
  const opt = (name: string): string | null =>
    args.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1] ?? null;
  const rawLimit = opt("limit");
  const limit = rawLimit === null ? null : Number(rawLimit);
  if (rawLimit !== null && (!Number.isInteger(limit) || (limit as number) <= 0)) {
    console.error(`Invalid --limit=${rawLimit} (expected a positive integer)`);
    process.exit(1);
  }
  return {
    dryRun: args.includes("--dry-run"),
    limit,
    onlyModel: opt("only-model"),
    onlyEvent: opt("only-event"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Queries — one per concern per run
// ---------------------------------------------------------------------------

const ROSTER_SQL = `SELECT id, name, provider, model_id, is_active, is_active_daily,
  is_active_practice, max_tokens, daily_cost_cap_usd, deleted_at
  FROM ai_players WHERE deleted_at IS NULL`;

const CATALOG_SQL = `SELECT model_id, is_free, is_vision, availability_status,
  context_length, price_prompt_usd, price_completion_usd
  FROM openrouter_models`;

/** Playable events (same eligibility SQL as ai_model_reliability) with the
 *  full audit input: title/description/year/location, hints as jsonb, the
 *  per-event audit count used for ordering, and the vision models' existing
 *  image-quality/difficulty notes (D8). */
const AUDIT_EVENTS_SQL = `SELECT e.id AS event_id, e.title, e.description, e.event_year,
    l.display_name AS location_name, l.latitude, l.longitude,
    (SELECT COALESCE(
       jsonb_agg(
         jsonb_build_object('id', h.id, 'tier', h.tier, 'type', h.type, 'content', h.content)
         ORDER BY h.tier, h.display_order
       ), '[]'::jsonb)
     FROM hints h WHERE h.event_id = e.id) AS hints,
    (SELECT COUNT(*)::int FROM ai_event_audits a WHERE a.event_id = e.id) AS audit_count,
    (SELECT AVG(ef.image_quality_score) FROM eval_facts ef WHERE ef.event_id = e.id) AS avg_image_quality,
    (SELECT AVG(ef.difficulty_score) FROM eval_facts ef WHERE ef.event_id = e.id) AS avg_difficulty,
    (SELECT ef.image_quality_notes FROM eval_facts ef
      WHERE ef.event_id = e.id AND ef.image_quality_notes IS NOT NULL
      ORDER BY ef.created_at DESC LIMIT 1) AS image_quality_notes,
    (SELECT ef.difficulty_notes FROM eval_facts ef
      WHERE ef.event_id = e.id AND ef.difficulty_notes IS NOT NULL
      ORDER BY ef.created_at DESC LIMIT 1) AS difficulty_notes
  FROM events e
  JOIN locations l ON l.event_id = e.id
  WHERE e.status = 'validated'
    AND e.retired_at IS NULL
    AND l.latitude IS NOT NULL
    AND l.longitude IS NOT NULL
    AND EXISTS (SELECT 1 FROM images i WHERE i.event_id = e.id)
    AND ($1::uuid IS NULL OR e.id = $1::uuid)`;

const EXISTING_AUDITS_SQL = `SELECT event_id, ai_player_id FROM ai_event_audits
  WHERE ai_player_id = ANY($1::uuid[])`;

/** D3: requests/day spent today, grouped per model (same query as the
 *  supervisor — one query per run). */
const RATE_USAGE_SQL = `SELECT p.model_id, count(*) FROM ai_answer_bank_calls c
  JOIN ai_answer_bank b ON b.id=c.ai_answer_bank_id
  JOIN ai_players p ON p.id=b.ai_player_id
  WHERE c.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') GROUP BY 1`;

const UPSERT_AUDIT_SQL = `INSERT INTO ai_event_audits (
    event_id, ai_player_id, is_real_event, year_check, proposed_year,
    location_check, proposed_location, proposed_lat, proposed_lng,
    description_issues, hint_issues, difficulty_estimate_year,
    difficulty_estimate_location, improvement_suggestions, confidence,
    reasoning, raw_response, error
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
  ON CONFLICT (event_id, ai_player_id) DO UPDATE SET
    is_real_event = EXCLUDED.is_real_event,
    year_check = EXCLUDED.year_check,
    proposed_year = EXCLUDED.proposed_year,
    location_check = EXCLUDED.location_check,
    proposed_location = EXCLUDED.proposed_location,
    proposed_lat = EXCLUDED.proposed_lat,
    proposed_lng = EXCLUDED.proposed_lng,
    description_issues = EXCLUDED.description_issues,
    hint_issues = EXCLUDED.hint_issues,
    difficulty_estimate_year = EXCLUDED.difficulty_estimate_year,
    difficulty_estimate_location = EXCLUDED.difficulty_estimate_location,
    improvement_suggestions = EXCLUDED.improvement_suggestions,
    confidence = EXCLUDED.confidence,
    reasoning = EXCLUDED.reasoning,
    raw_response = EXCLUDED.raw_response,
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
// One OpenRouter call per audit — no retries in-run (429/5xx => deferred)
// ---------------------------------------------------------------------------

type AuditCall =
  | { kind: "ok"; audit: EventAuditResult; rawResponse: unknown }
  | { kind: "deferred"; status: number; retryAfterMs: number | null; reason: string }
  | { kind: "auth"; reason: string }
  | { kind: "item_error"; error: string; rawResponse: unknown };

async function callOpenRouterAudit(
  apiKey: string,
  modelId: string,
  event: AuditEventInput
): Promise<AuditCall> {
  const messages = buildAuditMessages(event);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://guess-history.com",
        "X-Title": "Guess-History AI Players",
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: AUDIT_TEMPERATURE,
        max_tokens: AUDIT_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(AUDIT_CALL_TIMEOUT_MS),
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
  if (response.status === 401) {
    return { kind: "auth", reason: "OpenRouter request failed: 401" };
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
      rawResponse: { rawText: bodyText },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { kind: "item_error", error: "OpenRouter response was not JSON", rawResponse: { rawText: bodyText } };
  }
  const content =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content
      : undefined;
  const audit = parseEventAudit(typeof content === "string" ? content : "");
  return { kind: "ok", audit, rawResponse: parsed };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun, limit, onlyModel, onlyEvent } = parseArgs();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if ((!apiKey || apiKey.trim().length === 0) && !dryRun) {
    console.error("OPENROUTER_API_KEY is missing.");
    process.exit(1);
    return; // unreachable in prod; mocked exits fall through in tests
  }

  const pool = wrapPool(getDbPool());
  const dateIso = getDailyChallengeDate();

  // Settings + catalog + roster (one query each; catalog is the DB snapshot —
  // this runner never fetches openrouter.ai for metadata).
  let settings: RateSettings = DEFAULT_RATE_SETTINGS;
  try {
    const settingsResult = await pool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM ai_fleet_settings"
    );
    settings = parseRateSettings(settingsResult.rows);
  } catch (err) {
    console.error(`[RATE-SETTINGS] query failed (defaults applied): ${err instanceof Error ? err.message : err}`);
  }

  const catalog = new Map<string, CatalogModel>();
  try {
    const catalogResult = await pool.query<CatalogModelRow>(CATALOG_SQL);
    for (const row of catalogResult.rows) {
      const model = catalogModelFromRow(row);
      if (model !== null) catalog.set(model.id, model);
    }
  } catch (err) {
    console.error(`[AUDIT] catalog query failed: ${err instanceof Error ? err.message : err}`);
  }

  const playersResult = await pool.query<AuditorRow>(ROSTER_SQL);
  const auditors: AuditorRow[] = [];
  for (const player of playersResult.rows) {
    if (onlyModel !== null && player.model_id !== onlyModel) continue;
    const verdict = classifyPlayer(player, catalog.get(player.model_id) ?? null, {
      action: "proceed",
    });
    if (verdict.role !== "auditor") {
      if (onlyModel !== null) {
        console.log(`[ELIGIBILITY] SKIP ${player.name} (${player.model_id}): ${verdict.reason} (not an auditor)`);
      }
      continue;
    }
    auditors.push(player);
  }
  console.log(`[AUDIT] Auditors: ${auditors.length}`);
  if (auditors.length === 0) {
    console.log("[AUDIT] No eligible auditors; nothing to do.");
    await pool.end();
    reportQueryCounts();
    return;
  }

  // Events + existing audits (one query each).
  const eventsResult = await pool.query<AuditEventRow>(AUDIT_EVENTS_SQL, [onlyEvent]);
  const events = eventsResult.rows;
  console.log(`[AUDIT] Candidate events: ${events.length}`);
  if (events.length === 0) {
    console.log("[AUDIT] No candidate events; nothing to do.");
    await pool.end();
    reportQueryCounts();
    return;
  }

  const existingAudits = new Set<string>();
  try {
    const existingResult = await pool.query<{ event_id: string; ai_player_id: string }>(
      EXISTING_AUDITS_SQL,
      [auditors.map((a) => a.id)]
    );
    for (const row of existingResult.rows) {
      existingAudits.add(`${row.ai_player_id} ${row.event_id}`);
    }
  } catch (err) {
    console.error(`[AUDIT] existing-audits query failed: ${err instanceof Error ? err.message : err}`);
  }

  // Order candidates: fewest existing audits first, ties by sha256(event id).
  const orderedEvents = [...events].sort((a, b) => {
    const ca = Number(a.audit_count) || 0;
    const cb = Number(b.audit_count) || 0;
    if (ca !== cb) return ca - cb;
    const ha = createHash("sha256").update(a.event_id).digest("hex");
    const hb = createHash("sha256").update(b.event_id).digest("hex");
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });

  // Per-auditor work lists; global cap = min(runMaxAudits, --limit).
  const maxItems = Math.min(settings.runMaxAudits, limit ?? Number.POSITIVE_INFINITY);
  const lanes = new Map<string, { auditor: AuditorRow; items: AuditEventRow[] }>();
  for (const auditor of auditors) {
    lanes.set(auditor.id, { auditor, items: [] });
  }
  let planned = 0;
  // Round-robin across auditors so the cap is shared fairly.
  const missingLists = auditors.map((a) => ({
    auditor: a,
    missing: orderedEvents.filter((e) => !existingAudits.has(`${a.id} ${e.event_id}`)),
  }));
  const maxMissing = Math.max(...missingLists.map((m) => m.missing.length), 0);
  outer: for (let i = 0; i < maxMissing; i++) {
    for (const m of missingLists) {
      if (planned >= maxItems) break outer;
      const event = m.missing[i];
      if (event !== undefined) {
        lanes.get(m.auditor.id)!.items.push(event);
        planned++;
      }
    }
  }

  console.log(`[AUDIT] Work items: ${planned} (cap ${maxItems === Number.POSITIVE_INFINITY ? "none" : maxItems})`);
  for (const lane of lanes.values()) {
    if (lane.items.length === 0) continue;
    const first10 = lane.items.slice(0, 10).map((e) => e.event_id).join(",");
    console.log(
      `[AUDIT] ${lane.auditor.id} (${lane.auditor.name}, ${lane.auditor.model_id}) items=${lane.items.length} events=[${first10}]`
    );
  }

  if (dryRun) {
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

  let fleetCapUsd: number | null = null;
  try {
    fleetCapUsd = await getFleetDailyCap(pool);
  } catch (err) {
    fleetCapUsd = DEFAULT_FLEET_DAILY_CAP_USD;
    console.error(`[BUDGET] cap query failed (default $${DEFAULT_FLEET_DAILY_CAP_USD} cap applied): ${err instanceof Error ? err.message : err}`);
  }

  let authFailed = false;
  let budgetHalted = false;
  let globalRateHalted = false;
  let audited = 0;
  let itemErrors = 0;
  let deferredCount = 0;
  const perModelDone = new Map<string, number>();

  async function auditorWorker(lane: { auditor: AuditorRow; items: AuditEventRow[] }): Promise<void> {
    const { auditor } = lane;
    const rpm =
      settings.rpmOverrides[auditor.model_id] ??
      (catalog.get(auditor.model_id)?.isFree === true ? settings.rpmFree : settings.rpmPaid);
    const bucket = new TokenBucket({ now: Date.now, refillPerSec: rpm / 60, capacity: 1 });
    let rateBudgetOut = false;

    for (const event of lane.items) {
      if (authFailed || budgetHalted || globalRateHalted || rateBudgetOut) break;

      // Request budgets: one request per audit.
      if (globalUsed >= settings.globalRpd) {
        globalRateHalted = true;
        console.error(`[RATE-BUDGET] global rpd ${globalUsed} >= ${settings.globalRpd} — stopping`);
        break;
      }
      const free = isFreeModel(auditor.model_id);
      if (free && freeFleetUsed >= settings.freeRpdFleet) {
        rateBudgetOut = true;
        console.log(`[RATE-BUDGET] free-fleet rpd ${freeFleetUsed} >= ${settings.freeRpdFleet} — stopping ${auditor.model_id}`);
        break;
      }
      if (!free && (usageByModel.get(auditor.model_id) ?? 0) >= settings.rpdPaidModel) {
        rateBudgetOut = true;
        console.log(`[RATE-BUDGET] ${auditor.model_id} rpd >= ${settings.rpdPaidModel} — stopping`);
        break;
      }

      // USD budget per dispatch (fail-open, same as the supervisor).
      try {
        const spend = await fetchSpendTodayByPlayer(pool, dateIso);
        const verdict = evaluateBudget({
          fleetSpendUsd: spend.total,
          fleetCapUsd,
          modelSpendUsd: spend.byPlayer.get(auditor.id) ?? 0,
          modelCapUsd:
            auditor.daily_cost_cap_usd === null ? null : Number(auditor.daily_cost_cap_usd),
        });
        if (verdict.action === "halt_fleet") {
          budgetHalted = true;
          console.error(`[BUDGET-HALT] ${verdict.reason} — stopping audits`);
          break;
        }
        if (verdict.action === "skip_model") {
          console.log(`[BUDGET] skip ${auditor.id} (${auditor.model_id}): ${verdict.reason}`);
          break;
        }
      } catch (err) {
        console.error(`[BUDGET] spend query failed (fail-open): ${err instanceof Error ? err.message : err}`);
      }

      // Pacing: one token per call.
      while (!bucket.tryTake(1)) {
        const wait = bucket.msUntil(1);
        if (!Number.isFinite(wait)) break;
        await sleep(Math.min(Math.max(wait, 1), 5000));
      }
      if (authFailed || budgetHalted || globalRateHalted) break;

      globalUsed++;
      if (free) freeFleetUsed++;
      else usageByModel.set(auditor.model_id, (usageByModel.get(auditor.model_id) ?? 0) + 1);

      const hints = Array.isArray(event.hints) ? (event.hints as AuditEventInput["hints"]) : [];
      const call = await callOpenRouterAudit(apiKey ?? "", auditor.model_id, {
        title: event.title,
        description: event.description,
        year: event.event_year,
        locationName: event.location_name,
        lat: event.latitude === null ? null : Number(event.latitude),
        lng: event.longitude === null ? null : Number(event.longitude),
        hints,
        imageQualityScore: event.avg_image_quality === null ? null : Number(event.avg_image_quality),
        imageQualityNotes: event.image_quality_notes,
        difficultyScore: event.avg_difficulty === null ? null : Number(event.avg_difficulty),
        difficultyNotes: event.difficulty_notes,
      });

      if (call.kind === "deferred") {
        deferredCount++;
        const retryAfterMs =
          call.retryAfterMs ?? backoffMs(0, settings.backoffBaseMs, settings.backoffMaxMs);
        try {
          await pool.query(UPSERT_DEFERRAL_SQL, [
            auditor.id,
            event.event_id,
            `${call.reason}${call.status === 429 ? ` retry_after_ms=${call.retryAfterMs ?? "unknown"}` : ""}`.slice(0, 300),
            call.status === 429 ? 1 : 0,
            Math.max(0, Math.round(retryAfterMs)),
          ]);
        } catch (err) {
          console.error(`[DEFER] upsert failed (non-fatal): ${err instanceof Error ? err.message : err}`);
        }
        console.log(`[DEFER] ${auditor.model_id} ${event.event_id} (${call.reason}) — stopping lane`);
        break; // no in-run retries; the lane stops for this run
      }
      if (call.kind === "auth") {
        authFailed = true;
        console.error(`[AUTH] ${auditor.model_id}: ${call.reason} — halting audits`);
        break;
      }

      const audit: EventAuditResult =
        call.kind === "ok"
          ? call.audit
          : ({
              is_real_event: "unknown",
              year_check: "unknown",
              proposed_year: null,
              location_check: "unknown",
              proposed_location: null,
              proposed_lat: null,
              proposed_lng: null,
              description_issues: [],
              hint_issues: [],
              difficulty_estimate_year: null,
              difficulty_estimate_location: null,
              improvement_suggestions: [],
              confidence: null,
              reasoning: null,
              error: call.error,
            } as EventAuditResult);
      const rawResponse = call.kind === "ok" ? call.rawResponse : call.rawResponse;

      try {
        await pool.query(UPSERT_AUDIT_SQL, [
          event.event_id,
          auditor.id,
          audit.is_real_event,
          audit.year_check,
          audit.proposed_year,
          audit.location_check,
          audit.proposed_location,
          audit.proposed_lat,
          audit.proposed_lng,
          JSON.stringify(audit.description_issues),
          JSON.stringify(audit.hint_issues),
          audit.difficulty_estimate_year,
          audit.difficulty_estimate_location,
          JSON.stringify(audit.improvement_suggestions),
          audit.confidence,
          audit.reasoning,
          JSON.stringify(rawResponse ?? null),
          audit.error,
        ]);
        if (audit.error === null) {
          audited++;
          console.log(`[OK] ${auditor.model_id} ${event.event_id}`);
        } else {
          itemErrors++;
          console.log(`[AUDIT-ERR] ${auditor.model_id} ${event.event_id}: ${audit.error}`);
        }
        perModelDone.set(auditor.model_id, (perModelDone.get(auditor.model_id) ?? 0) + 1);
      } catch (err) {
        console.error(`[AUDIT] upsert failed ${event.event_id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  await Promise.all([...lanes.values()].map((lane) => auditorWorker(lane)));

  await pool.end();

  console.log("\n=== Audit run summary ===");
  console.log(`Audited: ${audited}`);
  console.log(`Item errors: ${itemErrors}`);
  console.log(`Deferred: ${deferredCount}`);
  for (const [modelId, n] of perModelDone) {
    console.log(`  ${modelId}: ${n}`);
  }
  reportQueryCounts();

  // Auth errors exit 1; deferred-only exits 0.
  process.exit(authFailed ? 1 : 0);
}

main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
