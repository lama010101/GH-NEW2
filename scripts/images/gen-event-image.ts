// EDQ-BUILD-ADMINGEN-1122-815 — batch/admin CLI for event-image generation.
//
//   npx tsx --env-file=<path> scripts/images/gen-event-image.ts \
//     --event-ids=<uuid,uuid,...> | --candidate-ids=<uuid,uuid,...> \
//     --model=<registry id> [--max-cost-usd=1.00] [--dry-run|--live]
//
// --dry-run is the DEFAULT: prints the resolved plan (targets, model, est
// cost) with zero provider calls and zero writes. --live spends real money
// through the SAME core pipeline as the admin route
// (src/app/api/admin/generator/generate/lib.ts) — pending->completed/
// failed rows land in image_generation_log with admin_user_id NULL.
//
// Env is provided by the caller via `npx tsx --env-file=<path>` — this
// script never reads .env files itself. Every console line passes through
// redact() (same masks as scripts/ai-players/image-chrono-audit.ts);
// provider URLs, request bodies and headers are never logged.
//
// Provider 401/402/403 abort the whole run immediately (exit 1).

import { getDbPool } from "@/server/db";
import { isUuid } from "@/core/isUuid";
import {
  getImageGenModel,
  type ImageGenRegistryEntry,
} from "@/core/imageGen/registry";
import {
  buildGeneratorPrompt,
  buildGeneratorNegativePrompt,
} from "@/core/imageGen/promptTemplate";
import {
  generateAndStoreImage,
  isAbortableGenerateError,
  providerApiKeyFor,
  GenerateError,
} from "@/app/api/admin/generator/generate/lib";

// ---------------------------------------------------------------------------
// SECRET-SAFETY redactor — identical masks to image-chrono-audit.ts.
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
// Args
// ---------------------------------------------------------------------------

const DEFAULT_MAX_COST_USD = 1.0;

function parseIdList(raw: string | null, flag: string): string[] {
  if (raw === null) return [];
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const id of ids) {
    if (!isUuid(id)) {
      logError(`Invalid ${flag} entry (expected uuid): ${id.slice(0, 8)}…`);
      process.exit(1);
    }
  }
  return ids;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = (name: string): string | null =>
    args.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1] ?? null;
  const eventIds = parseIdList(opt("event-ids"), "--event-ids");
  const candidateIds = parseIdList(opt("candidate-ids"), "--candidate-ids");
  const modelId = opt("model");
  const rawMax = opt("max-cost-usd");
  const maxCostUsd = rawMax === null ? DEFAULT_MAX_COST_USD : Number(rawMax);
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    logError(`Invalid --max-cost-usd=${rawMax} (expected a positive number)`);
    process.exit(1);
  }
  if (eventIds.length === 0 && candidateIds.length === 0) {
    logError("Provide --event-ids=<uuid,...> and/or --candidate-ids=<uuid,...>");
    process.exit(1);
  }
  if (!modelId) {
    logError("Provide --model=<registry id>");
    process.exit(1);
  }
  const live = args.includes("--live");
  const dryRun = !live; // --dry-run is the default; --live spends
  return { eventIds, candidateIds, modelId, maxCostUsd, dryRun, live };
}

// ---------------------------------------------------------------------------
// Target resolution — one row per id, prompt built from the shared template.
// ---------------------------------------------------------------------------

type Target = {
  kind: "event" | "candidate";
  id: string;
  eventId: string | null;
  candidateId: string | null;
  title: string | null;
  year: number | null;
  location: string | null;
};

async function loadTargets(
  pool: ReturnType<typeof getDbPool>,
  eventIds: string[],
  candidateIds: string[]
): Promise<Target[]> {
  const out: Target[] = [];
  if (eventIds.length > 0) {
    const { rows } = await pool.query<{
      id: string; title: string | null; event_year: number | null;
      location_name: string | null;
    }>(
      `SELECT e.id, e.title, e.event_year, l.display_name AS location_name
       FROM events e LEFT JOIN locations l ON l.event_id = e.id
       WHERE e.id = ANY($1::uuid[])`,
      [eventIds]
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of eventIds) {
      const r = byId.get(id);
      if (!r) {
        logError(`event ${id.slice(0, 8)}… not found — skipped`);
        continue;
      }
      out.push({
        kind: "event", id, eventId: id, candidateId: null,
        title: r.title, year: r.event_year, location: r.location_name,
      });
    }
  }
  if (candidateIds.length > 0) {
    const { rows } = await pool.query<{
      id: string; title: string | null; wd_label: string | null;
      event_year: number | null; location_name: string | null;
      event_id: string | null;
    }>(
      `SELECT id, title, wd_label, event_year, location_name, event_id
       FROM generation_candidates WHERE id = ANY($1::uuid[])`,
      [candidateIds]
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of candidateIds) {
      const r = byId.get(id);
      if (!r) {
        logError(`candidate ${id.slice(0, 8)}… not found — skipped`);
        continue;
      }
      out.push({
        kind: "candidate", id,
        eventId: r.event_id, candidateId: id,
        title: r.title ?? r.wd_label, year: r.event_year,
        location: r.location_name,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const entry: ImageGenRegistryEntry | undefined = getImageGenModel(args.modelId);
  if (!entry) {
    logError(`unknown model_id: ${args.modelId}`);
    process.exit(1);
  }
  if (!entry.enabled || !entry.airId) {
    logError(`model ${entry.id} is not enabled`);
    process.exit(1);
  }
  const apiKey = providerApiKeyFor(entry);
  if (!apiKey && args.live) {
    logError(`${entry.requiredKeyName} is not configured — cannot run --live`);
    process.exit(1);
  }

  const pool = getDbPool();
  const targets = await loadTargets(pool, args.eventIds, args.candidateIds);
  if (targets.length === 0) {
    logError("no resolvable targets");
    process.exit(1);
  }

  const negativePrompt = buildGeneratorNegativePrompt();
  const estTotal = targets.length * (entry.price_usd_est ?? 0);

  log(
    `[gen-event-image] mode=${args.dryRun ? "dry-run" : "LIVE"} model=${entry.id}` +
      ` air=${entry.airId} targets=${targets.length} est_total=$${estTotal.toFixed(4)}` +
      ` max_cost=$${args.maxCostUsd}`
  );

  if (args.dryRun) {
    for (const t of targets) {
      const prompt = buildGeneratorPrompt({
        title: t.title, year: t.year, location: t.location,
      });
      log(
        `  ${t.kind} ${t.id.slice(0, 8)}… title="${(t.title ?? "").slice(0, 60)}"` +
          ` year=${t.year ?? "?"} loc="${(t.location ?? "").slice(0, 40)}"` +
          ` prompt_len=${prompt.length}`
      );
    }
    log("[gen-event-image] dry-run complete — pass --live to spend");
    return;
  }

  let spent = 0;
  let done = 0;
  let failed = 0;
  for (const t of targets) {
    if (spent + (entry.price_usd_est ?? 0) > args.maxCostUsd) {
      log(
        `[gen-event-image] max-cost reached (spent=$${spent.toFixed(4)} + est ` +
          `$${(entry.price_usd_est ?? 0)} > $${args.maxCostUsd}) — stopping`
      );
      break;
    }
    const prompt = buildGeneratorPrompt({
      title: t.title, year: t.year, location: t.location,
    });
    try {
      const r = await generateAndStoreImage({
        pool,
        modelId: entry.id,
        prompt,
        negativePrompt,
        eventId: t.eventId,
        candidateId: t.candidateId,
        adminUserId: null,
      });
      done += 1;
      spent += r.costUsd ?? entry.price_usd_est ?? 0;
      log(
        `[gen-event-image] OK ${t.kind} ${t.id.slice(0, 8)}… log=${r.logId.slice(0, 8)}…` +
          ` cost=$${r.costUsd ?? "?"} path=${r.storagePath}`
      );
    } catch (e) {
      if (isAbortableGenerateError(e)) {
        logError(
          `[gen-event-image] ABORT provider ${String(
            (e as GenerateError).providerStatus
          )} — stopping run`
        );
        process.exit(1);
      }
      failed += 1;
      const msg = e instanceof GenerateError ? `${e.code}: ${e.message}` : String(e);
      logError(`[gen-event-image] FAIL ${t.kind} ${t.id.slice(0, 8)}… ${msg}`);
    }
  }
  log(`[gen-event-image] done: ${done} ok, ${failed} failed, spent=$${spent.toFixed(4)}`);
  process.exit(failed > 0 && done === 0 ? 1 : 0);
}

main().catch((e) => {
  logError(`[gen-event-image] fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
