// EDQ-BUILD-ADMINGEN-1122-815 — shared generation pipeline for the admin
// route and the CLI. One code path: registry lookup -> pending log row ->
// Runware call -> Supabase Storage upload -> log completed|failed.
//
// The route adds requireAdmin + the per-admin UTC-day spend cap; the CLI
// adds its own --max-cost-usd run accumulator. Neither re-implements the
// provider/storage/log legs — they all flow through generateAndStoreImage.

import type { Pool } from "pg";
import {
  getImageGenModel,
  type ImageGenRegistryEntry,
} from "@/core/imageGen/registry";
import {
  generateImageRunware,
  RunwareHttpError,
  isRunwareAbortStatus,
} from "@/core/imageGen/runware";
import { storeGeneratedEventImage } from "@/core/imageGen/store";

type DbExecutor = Pick<Pool, "query">;

export const ADMIN_DAILY_SPEND_CAP_USD = 5;
export const ADMIN_DAILY_COUNT_CAP = 100;
export const CONFIRM_PRICE_THRESHOLD_USD = 0.1;

export class GenerateError extends Error {
  readonly status: number;
  readonly code: string;
  /** Upstream HTTP status when the failure came from the provider. */
  readonly providerStatus: number | null;
  constructor(
    status: number,
    code: string,
    message: string,
    providerStatus: number | null = null
  ) {
    super(message);
    this.name = "GenerateError";
    this.status = status;
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

/** True when the failure must abort the whole run (provider 401/402/403). */
export function isAbortableGenerateError(err: unknown): boolean {
  return (
    err instanceof GenerateError &&
    err.providerStatus !== null &&
    isRunwareAbortStatus(err.providerStatus)
  );
}

export function resolveRegistryModel(modelId: string): ImageGenRegistryEntry {
  const entry = getImageGenModel(modelId);
  if (!entry) {
    throw new GenerateError(400, "unknown_model", `unknown model_id: ${modelId}`);
  }
  if (!entry.enabled || !entry.airId) {
    throw new GenerateError(400, "model_disabled", `model ${modelId} is not enabled`);
  }
  return entry;
}

export function providerApiKeyFor(entry: ImageGenRegistryEntry): string | null {
  const v = process.env[entry.requiredKeyName];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Current UTC calendar date as YYYY-MM-DD (aiSpend.ts boundary convention). */
export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Per-admin spend + attempt count for one UTC calendar date. */
export async function getAdminSpendToday(
  pool: DbExecutor,
  adminUserId: string,
  utcDate: string
): Promise<{ spendUsd: number; count: number }> {
  const { rows } = await pool.query<{ spend: string | number; n: number }>(
    `SELECT COALESCE(SUM(cost_usd), 0)::float8 AS spend, COUNT(*)::int AS n
     FROM image_generation_log
     WHERE admin_user_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + interval '1 day')`,
    [adminUserId, utcDate]
  );
  const raw = rows[0]?.spend;
  const spendUsd = typeof raw === "string" ? parseFloat(raw) : Number(raw ?? 0);
  return {
    spendUsd: Number.isFinite(spendUsd) ? spendUsd : 0,
    count: rows[0]?.n ?? 0,
  };
}

export function assertSpendWithinCap(spend: {
  spendUsd: number;
  count: number;
}): void {
  if (spend.spendUsd >= ADMIN_DAILY_SPEND_CAP_USD) {
    throw new GenerateError(
      429,
      "spend_cap_usd",
      `daily spend cap reached: $${spend.spendUsd.toFixed(2)} >= $${ADMIN_DAILY_SPEND_CAP_USD}`
    );
  }
  if (spend.count >= ADMIN_DAILY_COUNT_CAP) {
    throw new GenerateError(
      429,
      "spend_cap_count",
      `daily generation count cap reached: ${spend.count} >= ${ADMIN_DAILY_COUNT_CAP}`
    );
  }
}

export async function insertPendingLog(
  pool: DbExecutor,
  input: {
    adminUserId: string | null;
    eventId: string | null;
    candidateId: string | null;
    modelId: string;
    provider: string;
    prompt: string;
    negativePrompt: string | null;
  }
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO image_generation_log
       (admin_user_id, event_id, candidate_id, model_id, provider, prompt, negative_prompt, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING id`,
    [
      input.adminUserId,
      input.eventId,
      input.candidateId,
      input.modelId,
      input.provider,
      input.prompt,
      input.negativePrompt,
    ]
  );
  const id = rows[0]?.id;
  if (!id) throw new GenerateError(500, "log_insert_failed", "log insert returned no id");
  return id;
}

export async function markLogCompleted(
  pool: DbExecutor,
  logId: string,
  result: {
    imageUrl: string;
    storagePath: string;
    costUsd: number | null;
    durationMs: number;
  }
): Promise<void> {
  await pool.query(
    `UPDATE image_generation_log
     SET status = 'completed', image_url = $2, storage_path = $3,
         cost_usd = $4, duration_ms = $5, error = NULL
     WHERE id = $1`,
    [logId, result.imageUrl, result.storagePath, result.costUsd, result.durationMs]
  );
}

export async function markLogFailed(
  pool: DbExecutor,
  logId: string,
  error: string,
  durationMs: number | null
): Promise<void> {
  await pool.query(
    `UPDATE image_generation_log
     SET status = 'failed', error = $2, duration_ms = $3
     WHERE id = $1`,
    [logId, error.slice(0, 500), durationMs]
  );
}

export type GenerateAndStoreResult = {
  logId: string;
  imageUrl: string;
  storagePath: string;
  costUsd: number | null;
  durationMs: number;
};

function shortMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 300);
  return String(err).slice(0, 300);
}

/**
 * Full pipeline: registry -> pending log -> Runware -> Storage -> log
 * completed. Any failure after the pending insert marks the log failed.
 * Provider 401/402/403 surface as GenerateError with providerStatus set —
 * callers use isAbortableGenerateError to stop the run.
 */
export async function generateAndStoreImage(input: {
  pool: DbExecutor;
  modelId: string;
  prompt: string;
  negativePrompt?: string | null;
  eventId?: string | null;
  candidateId?: string | null;
  adminUserId?: string | null;
}): Promise<GenerateAndStoreResult> {
  const entry = resolveRegistryModel(input.modelId);
  const apiKey = providerApiKeyFor(entry);
  if (!apiKey) {
    throw new GenerateError(
      400,
      "key_not_configured",
      `${entry.requiredKeyName} is not configured`
    );
  }
  const prompt = input.prompt?.trim() ?? "";
  if (prompt.length === 0) {
    throw new GenerateError(400, "prompt_required", "prompt is required");
  }
  const negativePrompt = input.negativePrompt?.trim() || null;
  const eventId = input.eventId ?? null;
  const candidateId = input.candidateId ?? null;
  const scopeId = eventId ?? candidateId;
  if (!scopeId) {
    throw new GenerateError(400, "target_required", "event_id or candidate_id is required");
  }

  const logId = await insertPendingLog(input.pool, {
    adminUserId: input.adminUserId ?? null,
    eventId,
    candidateId,
    modelId: entry.id,
    provider: entry.provider,
    prompt,
    negativePrompt,
  });

  const started = Date.now();
  try {
    const generated = await generateImageRunware({
      model: entry.airId as string,
      prompt,
      negativePrompt: negativePrompt ?? undefined,
      width: entry.defaultSize.width,
      height: entry.defaultSize.height,
      apiKey,
    });
    const stored = await storeGeneratedEventImage({
      scopeId,
      imageId: logId,
      providerUrl: generated.imageUrl,
    });
    const durationMs = generated.durationMs + (Date.now() - started - generated.durationMs);
    await markLogCompleted(input.pool, logId, {
      imageUrl: stored.publicUrl,
      storagePath: stored.storagePath,
      costUsd: generated.cost,
      durationMs,
    });
    return {
      logId,
      imageUrl: stored.publicUrl,
      storagePath: stored.storagePath,
      costUsd: generated.cost,
      durationMs,
    };
  } catch (err) {
    const providerStatus =
      err instanceof RunwareHttpError ? err.status : null;
    const durationMs = Date.now() - started;
    try {
      await markLogFailed(input.pool, logId, shortMessage(err), durationMs);
    } catch {
      // log update failure must not mask the original error
    }
    if (err instanceof RunwareHttpError) {
      throw new GenerateError(
        502,
        `provider_http_${err.status}`,
        `provider error ${err.status}: ${err.message}`,
        err.status
      );
    }
    if (err instanceof GenerateError) throw err;
    throw new GenerateError(502, "generation_failed", shortMessage(err));
  }
}
