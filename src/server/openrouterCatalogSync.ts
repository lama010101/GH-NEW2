// Fetch the OpenRouter model catalog and persist it (snapshot + history + run log).
// Task: AIP-BUILD-CATALOGSTORE-1026-204.
//
// The decision logic lives in src/core/openrouterCatalog.ts (pure). This module
// only does I/O: HTTP fetch, DB reads, one write transaction, and the
// sync_runs bookkeeping around it.

import { getDbPool } from "@/server/db";
import {
  normalizeEntry,
  OPENROUTER_MODELS_URL,
  planSync,
  type CatalogRow,
  type NormalizedEntry,
  type OpenRouterRawEntry,
  type PlannedRow,
  type SyncCounts,
} from "@/core/openrouterCatalog";

export type SyncSource = "vercel_cron" | "github" | "admin" | "cli";

export type SyncSummary = SyncCounts & {
  source: SyncSource;
  dry_run: boolean;
  run_id: string | null;
  unchanged_count: number;
  skipped_invalid: number;
  /** Dry run only: the first 20 planned changes. */
  planned_changes?: { model_id: string; change_kinds: string[] }[];
};

const FETCH_TIMEOUT_MS = 20_000;
const UPSERT_CHUNK = 40;
const HISTORY_CHUNK = 100;
const PLANNED_CHANGES_LIMIT = 20;

type TxClient = {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
};

async function fetchCatalog(): Promise<{
  entries: NormalizedEntry[];
  skipped: number;
}> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      "HTTP-Referer": "https://guess-history.com",
      "X-Title": "Guess-History AI Dashboard",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    throw new Error(
      `OpenRouter catalog fetch failed: ${response.status} ${response.statusText}`
    );
  }
  const body = (await response.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) {
    throw new Error("OpenRouter catalog response has no data array");
  }
  const entries: NormalizedEntry[] = [];
  let skipped = 0;
  for (const raw of body.data as OpenRouterRawEntry[]) {
    const n =
      raw && typeof raw === "object" ? normalizeEntry(raw) : null;
    if (n) entries.push(n);
    else skipped++;
  }
  return { entries, skipped };
}

type ExistingDbRow = Omit<CatalogRow, "created_ts"> & {
  created_ts: Date | null;
};

async function loadExisting(): Promise<CatalogRow[]> {
  const { rows } = await getDbPool().query<ExistingDbRow>(
    `SELECT model_id, canonical_slug, alias_target, provider_slug, name,
            description, created_ts, context_length, max_completion_tokens,
            input_modalities, output_modalities, is_vision, supported_parameters,
            price_prompt_usd::float8 AS price_prompt_usd,
            price_completion_usd::float8 AS price_completion_usd,
            price_image_usd::float8 AS price_image_usd,
            price_request_usd::float8 AS price_request_usd,
            price_reasoning_usd::float8 AS price_reasoning_usd,
            variable_pricing, is_free,
            to_char(expiration_date, 'YYYY-MM-DD') AS expiration_date,
            availability_status, availability_reason,
            first_seen_at, last_seen_at, missing_since, raw_hash
     FROM public.openrouter_models`
  );
  return rows.map((r) => ({
    ...r,
    created_ts: r.created_ts ? r.created_ts.toISOString() : null,
  }));
}

const UPSERT_COLUMNS: { name: keyof PlannedRow; cast: string }[] = [
  { name: "model_id", cast: "text" },
  { name: "canonical_slug", cast: "text" },
  { name: "alias_target", cast: "text" },
  { name: "provider_slug", cast: "text" },
  { name: "name", cast: "text" },
  { name: "description", cast: "text" },
  { name: "created_ts", cast: "timestamptz" },
  { name: "context_length", cast: "integer" },
  { name: "max_completion_tokens", cast: "integer" },
  { name: "input_modalities", cast: "text[]" },
  { name: "output_modalities", cast: "text[]" },
  { name: "is_vision", cast: "boolean" },
  { name: "supported_parameters", cast: "text[]" },
  { name: "price_prompt_usd", cast: "numeric" },
  { name: "price_completion_usd", cast: "numeric" },
  { name: "price_image_usd", cast: "numeric" },
  { name: "price_request_usd", cast: "numeric" },
  { name: "price_reasoning_usd", cast: "numeric" },
  { name: "variable_pricing", cast: "boolean" },
  { name: "is_free", cast: "boolean" },
  { name: "expiration_date", cast: "date" },
  { name: "availability_status", cast: "text" },
  { name: "availability_reason", cast: "text" },
  { name: "raw_hash", cast: "text" },
];

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function upsertRows(client: TxClient, rows: PlannedRow[]): Promise<void> {
  const cols = UPSERT_COLUMNS.map((c) => c.name);
  const updateSet = cols
    .filter((c) => c !== "model_id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  for (const part of chunk(rows, UPSERT_CHUNK)) {
    const values: unknown[] = [];
    const tuples = part.map((row) => {
      const ph = UPSERT_COLUMNS.map((c) => {
        values.push(row[c.name]);
        return `$${values.length}::${c.cast}`;
      });
      return `(${ph.join(", ")})`;
    });
    await client.query(
      `INSERT INTO public.openrouter_models (${cols.join(", ")})
       VALUES ${tuples.join(", ")}
       ON CONFLICT (model_id) DO UPDATE SET ${updateSet},
         last_seen_at = now(), missing_since = NULL, updated_at = now()`,
      values
    );
  }
}

const HISTORY_COLUMNS = [
  { name: "model_id", cast: "text" },
  { name: "observed_at", cast: "timestamptz" },
  { name: "change_kinds", cast: "text[]" },
  { name: "price_prompt_usd", cast: "numeric" },
  { name: "price_completion_usd", cast: "numeric" },
  { name: "price_image_usd", cast: "numeric" },
  { name: "context_length", cast: "integer" },
  { name: "input_modalities", cast: "text[]" },
  { name: "availability_status", cast: "text" },
  { name: "raw_hash", cast: "text" },
] as const;

async function finalizeRun(
  runId: string,
  status: "ok" | "error",
  counts: SyncCounts | null,
  error: string | null
): Promise<void> {
  await getDbPool().query(
    `UPDATE public.openrouter_sync_runs
     SET finished_at = now(), status = $2, models_seen = $3, new_count = $4,
         changed_count = $5, delisted_count = $6, relisted_count = $7, error = $8
     WHERE id = $1`,
    [
      runId,
      status,
      counts?.models_seen ?? null,
      counts?.new_count ?? null,
      counts?.changed_count ?? null,
      counts?.delisted_count ?? null,
      counts?.relisted_count ?? null,
      error,
    ]
  );
}

export async function syncOpenRouterCatalog(opts: {
  source: SyncSource;
  dryRun: boolean;
}): Promise<SyncSummary> {
  const { source, dryRun } = opts;
  const pool = getDbPool();

  // The run row is written BEFORE the transaction so a failed sync still leaves a record.
  let runId: string | null = null;
  if (!dryRun) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO public.openrouter_sync_runs (source, status)
       VALUES ($1, 'running') RETURNING id`,
      [source]
    );
    runId = rows[0].id;
  }

  let counts: SyncCounts | null = null;
  try {
    const { entries, skipped } = await fetchCatalog();
    const existing = await loadExisting();
    const now = new Date();
    const plan = planSync(existing, entries, now);
    counts = plan.counts;
    if (plan.abort_reason) throw new Error(plan.abort_reason);

    const summary: SyncSummary = {
      ...plan.counts,
      source,
      dry_run: dryRun,
      run_id: runId,
      unchanged_count: plan.unchanged_ids.length,
      skipped_invalid: skipped,
    };

    if (dryRun) {
      const absentFirst = plan.missing_updates
        .filter((m) => m.availability_status !== "not_in_catalog")
        .map((m) => ({ model_id: m.model_id, change_kinds: ["missing_marked"] }));
      summary.planned_changes = [
        ...plan.history_rows.map((h) => ({
          model_id: h.model_id,
          change_kinds: h.change_kinds as string[],
        })),
        ...absentFirst,
      ].slice(0, PLANNED_CHANGES_LIMIT);
      return summary;
    }

    // Same transaction-capable cast pattern as
    // src/app/api/cron/apply-ai-schedule-changes/route.ts.
    const client = await (
      pool as unknown as { connect(): Promise<TxClient> }
    ).connect();
    try {
      await client.query("BEGIN");
      await upsertRows(client, [...plan.inserts, ...plan.updates]);

      if (plan.unchanged_ids.length > 0) {
        await client.query(
          `UPDATE public.openrouter_models
           SET last_seen_at = now(), missing_since = NULL
           WHERE model_id = ANY($1::text[])`,
          [plan.unchanged_ids]
        );
      }

      if (plan.missing_updates.length > 0) {
        await client.query(
          `UPDATE public.openrouter_models m
           SET missing_since = u.missing_since,
               availability_status = u.status,
               availability_reason = u.reason,
               updated_at = now()
           FROM unnest($1::text[], $2::timestamptz[], $3::text[], $4::text[])
             AS u(model_id, missing_since, status, reason)
           WHERE m.model_id = u.model_id`,
          [
            plan.missing_updates.map((m) => m.model_id),
            plan.missing_updates.map((m) => m.missing_since),
            plan.missing_updates.map((m) => m.availability_status),
            plan.missing_updates.map((m) => m.availability_reason),
          ]
        );
      }

      for (const part of chunk(plan.history_rows, HISTORY_CHUNK)) {
        const values: unknown[] = [];
        const tuples = part.map((h) => {
          const ph = HISTORY_COLUMNS.map((c) => {
            values.push(h[c.name]);
            return `$${values.length}::${c.cast}`;
          });
          return `(${ph.join(", ")})`;
        });
        await client.query(
          `INSERT INTO public.openrouter_model_history
             (${HISTORY_COLUMNS.map((c) => c.name).join(", ")})
           VALUES ${tuples.join(", ")}`,
          values
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // connection already broken — nothing to roll back
      }
      throw err;
    } finally {
      client.release();
    }

    if (runId) await finalizeRun(runId, "ok", plan.counts, null);
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) {
      try {
        await finalizeRun(runId, "error", counts, message);
      } catch {
        // run row stays 'running'; the original error is what matters
      }
    }
    throw err;
  }
}
