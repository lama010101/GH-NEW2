// Pure helpers for persisting the OpenRouter model catalog.
// Task: AIP-BUILD-CATALOGSTORE-1026-204.
//
// No I/O here: fetching and DB writes live in src/server/openrouterCatalogSync.ts.
// Everything below is deterministic given its inputs (time is always injected).

import { createHash } from "node:crypto";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** A feed smaller than this is treated as a partial response and aborts the sync. */
export const MIN_FEED_SIZE = 50;
/** A feed smaller than this fraction of the live snapshot aborts the sync. */
export const MIN_FEED_RATIO = 0.5;
/** Days before expiration_date at which a model counts as 'expiring'. */
export const EXPIRING_WINDOW_DAYS = 30;

export const CHANGE_KINDS = [
  "new",
  "price_changed",
  "modality_changed",
  "context_changed",
  "delisted",
  "relisted",
  "expiring",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export type AvailabilityStatus =
  | "available"
  | "no_endpoints"
  | "not_in_catalog"
  | "expiring"
  | "unknown";

export const ABSENT_REASON = "absent from catalog in 2 consecutive syncs";
export const EXPIRED_REASON = "expired";

/** One element of the `data` array of GET /api/v1/models (fields we read). */
export type OpenRouterRawEntry = {
  id?: unknown;
  canonical_slug?: unknown;
  name?: unknown;
  created?: unknown;
  description?: unknown;
  context_length?: unknown;
  expiration_date?: unknown;
  supported_parameters?: unknown;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown } | null;
  pricing?: Record<string, unknown> | null;
  top_provider?: { max_completion_tokens?: unknown } | null;
  alias_target?: unknown;
};

/** Normalized catalog entry: the data columns of public.openrouter_models. */
export type NormalizedEntry = {
  model_id: string;
  canonical_slug: string | null;
  alias_target: string | null;
  provider_slug: string;
  name: string;
  description: string | null;
  created_ts: string | null; // ISO timestamp
  context_length: number | null;
  max_completion_tokens: number | null;
  input_modalities: string[];
  output_modalities: string[];
  is_vision: boolean;
  supported_parameters: string[];
  price_prompt_usd: number | null;
  price_completion_usd: number | null;
  price_image_usd: number | null;
  price_request_usd: number | null;
  price_reasoning_usd: number | null;
  variable_pricing: boolean;
  is_free: boolean;
  expiration_date: string | null; // YYYY-MM-DD
};

/** A snapshot row as read back from the DB (already coerced by the caller). */
export type CatalogRow = NormalizedEntry & {
  availability_status: AvailabilityStatus;
  availability_reason: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  missing_since: Date | null;
  raw_hash: string;
};

/** A row to upsert into the snapshot (first_seen_at is never overwritten on conflict). */
export type PlannedRow = NormalizedEntry & {
  availability_status: AvailabilityStatus;
  availability_reason: string | null;
  raw_hash: string;
};

export type HistoryRow = {
  model_id: string;
  observed_at: Date;
  change_kinds: ChangeKind[];
  price_prompt_usd: number | null;
  price_completion_usd: number | null;
  price_image_usd: number | null;
  context_length: number | null;
  input_modalities: string[];
  availability_status: AvailabilityStatus;
  raw_hash: string;
};

export type MissingUpdate = {
  model_id: string;
  missing_since: Date;
  availability_status: AvailabilityStatus;
  availability_reason: string | null;
};

export type SyncCounts = {
  models_seen: number;
  new_count: number;
  changed_count: number; // existing rows updated, excluding relisted ones
  delisted_count: number;
  relisted_count: number;
  missing_marked_count: number; // first absence: missing_since set, nothing else
};

export type SyncPlan = {
  inserts: PlannedRow[];
  updates: PlannedRow[];
  unchanged_ids: string[];
  missing_updates: MissingUpdate[];
  history_rows: HistoryRow[];
  counts: SyncCounts;
  /** Non-null when the safety guard tripped: every other list is empty. */
  abort_reason: string | null;
};

// ---------------------------------------------------------------------------
// normalizeEntry

const MAX_PG_INT = 2147483647;
const MAX_PRICE = 1e8; // numeric(20,12) holds < 1e8

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_PG_INT) return null;
  return Math.trunc(n);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(v.filter((x): x is string => typeof x === "string"))
  ).sort();
}

type ParsedPrice = { value: number | null; negative: boolean };

function parsePrice(v: unknown): ParsedPrice {
  if (v === null || v === undefined) return { value: null, negative: false };
  if (typeof v === "string" && v.trim() === "") {
    return { value: null, negative: false };
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return { value: null, negative: false };
  if (n < 0) return { value: null, negative: true };
  if (n >= MAX_PRICE) return { value: null, negative: false };
  // Round to the column scale so DB round-trips compare equal.
  return { value: Number(n.toFixed(12)), negative: false };
}

function asDateString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : null;
}

export function normalizeEntry(raw: OpenRouterRawEntry): NormalizedEntry | null {
  const id = asString(raw.id);
  if (!id) return null;

  const inputModalities = asStringArray(raw.architecture?.input_modalities);
  const outputModalities = asStringArray(raw.architecture?.output_modalities);

  const pricing = raw.pricing ?? {};
  const prompt = parsePrice(pricing.prompt);
  const completion = parsePrice(pricing.completion);
  const image = parsePrice(pricing.image);
  const request = parsePrice(pricing.request);
  const reasoning = parsePrice(pricing.internal_reasoning);
  const variable =
    prompt.negative ||
    completion.negative ||
    image.negative ||
    request.negative ||
    reasoning.negative;

  const createdSeconds =
    typeof raw.created === "number" && Number.isFinite(raw.created)
      ? raw.created
      : null;
  const createdTs =
    createdSeconds === null ? null : new Date(createdSeconds * 1000).toISOString();

  const slash = id.indexOf("/");
  const bothZero =
    prompt.value !== null &&
    completion.value !== null &&
    prompt.value === 0 &&
    completion.value === 0;

  return {
    model_id: id,
    canonical_slug: asString(raw.canonical_slug),
    alias_target: asString(raw.alias_target),
    provider_slug: slash > 0 ? id.slice(0, slash) : id,
    name: asString(raw.name) ?? id,
    description: asString(raw.description),
    created_ts: createdTs,
    context_length: asInt(raw.context_length),
    max_completion_tokens: asInt(raw.top_provider?.max_completion_tokens),
    input_modalities: inputModalities,
    output_modalities: outputModalities,
    is_vision: inputModalities.includes("image"),
    supported_parameters: asStringArray(raw.supported_parameters),
    price_prompt_usd: prompt.value,
    price_completion_usd: completion.value,
    price_image_usd: image.value,
    price_request_usd: request.value,
    price_reasoning_usd: reasoning.value,
    variable_pricing: variable,
    is_free: id.endsWith(":free") || bothZero,
    expiration_date: asDateString(raw.expiration_date),
  };
}

// ---------------------------------------------------------------------------
// rawHash

type HashInput = Pick<
  NormalizedEntry,
  | "model_id"
  | "canonical_slug"
  | "name"
  | "context_length"
  | "max_completion_tokens"
  | "input_modalities"
  | "output_modalities"
  | "supported_parameters"
  | "price_prompt_usd"
  | "price_completion_usd"
  | "price_image_usd"
  | "price_request_usd"
  | "price_reasoning_usd"
  | "variable_pricing"
  | "expiration_date"
>;

/** sha256 over the TRACKED fields only (description is deliberately excluded). */
export function rawHash(n: HashInput): string {
  const stable = {
    model_id: n.model_id,
    canonical_slug: n.canonical_slug,
    name: n.name,
    context_length: n.context_length,
    max_completion_tokens: n.max_completion_tokens,
    input_modalities: [...n.input_modalities].sort(),
    output_modalities: [...n.output_modalities].sort(),
    supported_parameters: [...n.supported_parameters].sort(),
    price_prompt_usd: n.price_prompt_usd,
    price_completion_usd: n.price_completion_usd,
    price_image_usd: n.price_image_usd,
    price_request_usd: n.price_request_usd,
    price_reasoning_usd: n.price_reasoning_usd,
    variable_pricing: n.variable_pricing,
    expiration_date: n.expiration_date,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

// ---------------------------------------------------------------------------
// classifyAvailability

const MS_PER_DAY = 86_400_000;

function utcDayNumber(d: Date): number {
  return Math.floor(d.getTime() / MS_PER_DAY);
}

export function classifyAvailability(
  entry: Pick<NormalizedEntry, "expiration_date">,
  today: Date
): { status: AvailabilityStatus; reason: string | null } {
  if (!entry.expiration_date) return { status: "available", reason: null };
  const expiry = Date.parse(`${entry.expiration_date}T00:00:00Z`);
  if (!Number.isFinite(expiry)) return { status: "available", reason: null };
  const daysLeft = Math.floor(expiry / MS_PER_DAY) - utcDayNumber(today);
  if (daysLeft <= 0) return { status: "not_in_catalog", reason: EXPIRED_REASON };
  if (daysLeft <= EXPIRING_WINDOW_DAYS) {
    return {
      status: "expiring",
      reason: `expires ${entry.expiration_date}`,
    };
  }
  return { status: "available", reason: null };
}

// ---------------------------------------------------------------------------
// diffKinds

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

/**
 * Tracked-change kinds between the stored row and the freshly fetched entry.
 * Empty array = nothing worth a history row.
 * 'expiring' fires when expiration_date is newly set or changed, or when the
 * model enters the 30-day window (so a steady expiring model is not re-logged daily).
 * 'relisted' requires an actual delisting (status 'not_in_catalog' with missing_since
 * set); a one-day feed blip, where missing_since is set but status is unchanged, is not a relist.
 */
export function diffKinds(
  previous: CatalogRow | null,
  next: NormalizedEntry,
  today: Date
): ChangeKind[] {
  const kinds: ChangeKind[] = [];
  const nextAvail = classifyAvailability(next, today);

  if (previous === null) {
    kinds.push("new");
    if (next.expiration_date !== null && nextAvail.status === "expiring") {
      kinds.push("expiring");
    }
    return kinds;
  }

  if (
    previous.price_prompt_usd !== next.price_prompt_usd ||
    previous.price_completion_usd !== next.price_completion_usd ||
    previous.price_image_usd !== next.price_image_usd ||
    previous.price_request_usd !== next.price_request_usd ||
    previous.price_reasoning_usd !== next.price_reasoning_usd ||
    previous.variable_pricing !== next.variable_pricing
  ) {
    kinds.push("price_changed");
  }
  if (
    !sameArray(previous.input_modalities, next.input_modalities) ||
    !sameArray(previous.output_modalities, next.output_modalities)
  ) {
    kinds.push("modality_changed");
  }
  if (
    previous.context_length !== next.context_length ||
    previous.max_completion_tokens !== next.max_completion_tokens
  ) {
    kinds.push("context_changed");
  }
  if (
    previous.missing_since !== null &&
    previous.availability_status === "not_in_catalog"
  ) {
    kinds.push("relisted");
  }
  if (
    next.expiration_date !== null &&
    (previous.expiration_date !== next.expiration_date ||
      (nextAvail.status === "expiring" &&
        previous.availability_status !== "expiring"))
  ) {
    kinds.push("expiring");
  }
  return kinds;
}

// ---------------------------------------------------------------------------
// planSync

function emptyPlan(counts: SyncCounts, abort: string | null): SyncPlan {
  return {
    inserts: [],
    updates: [],
    unchanged_ids: [],
    missing_updates: [],
    history_rows: [],
    counts,
    abort_reason: abort,
  };
}

function historyFor(
  row: PlannedRow,
  kinds: ChangeKind[],
  now: Date
): HistoryRow {
  return {
    model_id: row.model_id,
    observed_at: now,
    change_kinds: kinds,
    price_prompt_usd: row.price_prompt_usd,
    price_completion_usd: row.price_completion_usd,
    price_image_usd: row.price_image_usd,
    context_length: row.context_length,
    input_modalities: row.input_modalities,
    availability_status: row.availability_status,
    raw_hash: row.raw_hash,
  };
}

function untrackedDiffers(prev: CatalogRow, next: NormalizedEntry): boolean {
  return (
    prev.description !== next.description ||
    prev.alias_target !== next.alias_target ||
    prev.created_ts !== next.created_ts ||
    prev.provider_slug !== next.provider_slug ||
    prev.is_free !== next.is_free
  );
}

export function planSync(
  existingRows: readonly CatalogRow[],
  fetchedEntries: readonly NormalizedEntry[],
  now: Date
): SyncPlan {
  // Dedupe the feed by model_id (last occurrence wins).
  const fetched = new Map<string, NormalizedEntry>();
  for (const e of fetchedEntries) fetched.set(e.model_id, e);

  const counts: SyncCounts = {
    models_seen: fetched.size,
    new_count: 0,
    changed_count: 0,
    delisted_count: 0,
    relisted_count: 0,
    missing_marked_count: 0,
  };

  // Safety guard: a partial response must never mass-delist the catalog.
  const liveCount = existingRows.filter(
    (r) => r.availability_status !== "not_in_catalog"
  ).length;
  if (fetched.size < MIN_FEED_SIZE) {
    return emptyPlan(
      counts,
      `feed has ${fetched.size} models (< ${MIN_FEED_SIZE}); sync aborted, nothing changed`
    );
  }
  if (liveCount > 0 && fetched.size < liveCount * MIN_FEED_RATIO) {
    return emptyPlan(
      counts,
      `feed has ${fetched.size} models (< ${MIN_FEED_RATIO * 100}% of ${liveCount} live); sync aborted, nothing changed`
    );
  }

  const plan = emptyPlan(counts, null);
  const existingById = new Map(existingRows.map((r) => [r.model_id, r]));

  for (const entry of fetched.values()) {
    const prev = existingById.get(entry.model_id) ?? null;
    const avail = classifyAvailability(entry, now);
    const row: PlannedRow = {
      ...entry,
      availability_status: avail.status,
      availability_reason: avail.reason,
      raw_hash: rawHash(entry),
    };

    if (prev === null) {
      const kinds = diffKinds(null, entry, now);
      plan.inserts.push(row);
      plan.history_rows.push(historyFor(row, kinds, now));
      counts.new_count++;
      continue;
    }

    const kinds = diffKinds(prev, entry, now);
    const changed =
      kinds.length > 0 ||
      prev.raw_hash !== row.raw_hash ||
      prev.availability_status !== row.availability_status ||
      prev.availability_reason !== row.availability_reason ||
      untrackedDiffers(prev, entry);

    if (!changed) {
      plan.unchanged_ids.push(entry.model_id);
      continue;
    }
    plan.updates.push(row);
    if (kinds.length > 0) plan.history_rows.push(historyFor(row, kinds, now));
    if (kinds.includes("relisted")) counts.relisted_count++;
    else counts.changed_count++;
  }

  for (const prev of existingRows) {
    if (fetched.has(prev.model_id)) continue;
    if (prev.missing_since === null) {
      plan.missing_updates.push({
        model_id: prev.model_id,
        missing_since: now,
        availability_status: prev.availability_status,
        availability_reason: prev.availability_reason,
      });
      counts.missing_marked_count++;
    } else if (prev.availability_status !== "not_in_catalog") {
      plan.missing_updates.push({
        model_id: prev.model_id,
        missing_since: prev.missing_since,
        availability_status: "not_in_catalog",
        availability_reason: ABSENT_REASON,
      });
      plan.history_rows.push({
        model_id: prev.model_id,
        observed_at: now,
        change_kinds: ["delisted"],
        price_prompt_usd: prev.price_prompt_usd,
        price_completion_usd: prev.price_completion_usd,
        price_image_usd: prev.price_image_usd,
        context_length: prev.context_length,
        input_modalities: prev.input_modalities,
        availability_status: "not_in_catalog",
        raw_hash: prev.raw_hash,
      });
      counts.delisted_count++;
    }
  }

  return plan;
}
