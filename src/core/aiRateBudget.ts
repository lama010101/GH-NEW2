// Pure rate-budget primitives — decision D3 of
// AIP-BUILD-FLEETFINAL-1103-060 (fleet-design-060.md).
//
// The 429 lesson (diagnosis §1A): retries must never be immediate, pacing is
// per-model, and Retry-After hints are honored. Everything here is
// deterministic: TokenBucket takes an injected clock, backoffMs an injected
// rand(), parseRetryAfterMs an injected now — no Date.now()/Math.random()
// inside unless the caller accepts the default.
//
//   parseRateSettings(rows)  ai_fleet_settings jsonb rows -> typed settings,
//                            D3 defaults when missing/invalid
//   TokenBucket              per-model pacing (capacity 1, refill rpm/60)
//   parseRetryAfterMs(text)  retry_after_ms= token / Retry-After seconds /
//                            Retry-After HTTP-date -> ms, null when absent
//   backoffMs                exponential backoff, full jitter, capped
//   classifyOutcome          worker error text -> run disposition, consistent
//                            with src/core/aiFailureCauses.ts causes

import { classifyFailure } from "./aiFailureCauses";

// ---------------------------------------------------------------------------
// D3 settings (ai_fleet_settings keys -> typed fields)
// ---------------------------------------------------------------------------

export type RateSettings = {
  /** Requests/min for :free-tier models (OpenRouter free limit 20; 25% margin). */
  rpmFree: number;
  /** Requests/min for paid models. */
  rpmPaid: number;
  /** Per-slug rpm overrides (upstream-pool throttles etc.). */
  rpmOverrides: Record<string, number>;
  /** Account-wide free requests/day ceiling (limit 1000/day, 10% margin). */
  freeRpdFleet: number;
  /** Per-model paid requests/day ceiling. */
  rpdPaidModel: number;
  /** Fleet-wide requests/day ceiling. */
  globalRpd: number;
  /** Max play work items dispatched per run. */
  runMaxPlays: number;
  /** Max audit work items dispatched per run. */
  runMaxAudits: number;
  /** Calls one play is expected to cost (guess+optional hint+review). */
  callsPerPlay: number;
  /** Exponential-backoff base for 429/transient cooldowns. */
  backoffBaseMs: number;
  /** Backoff ceiling. */
  backoffMaxMs: number;
  /** Cooldowns a model tolerates per run before its queue is deferred. */
  maxCooldownsPerModel: number;
  /** Per-player practice plays per run. */
  practicePerPlayerPerRun: number;
  /** Premium-tier benchmark subset size (D7 step 3). */
  benchmarkSubsetSize: number;
};

export const DEFAULT_RATE_SETTINGS: RateSettings = {
  rpmFree: 15,
  rpmPaid: 20,
  rpmOverrides: {
    "qwen/qwen3-vl-8b-instruct": 6,
    "google/gemini-2.5-flash-lite": 10,
  },
  freeRpdFleet: 900,
  rpdPaidModel: 1500,
  globalRpd: 3000,
  runMaxPlays: 150,
  runMaxAudits: 120,
  callsPerPlay: 3,
  backoffBaseMs: 30_000,
  backoffMaxMs: 600_000,
  maxCooldownsPerModel: 3,
  practicePerPlayerPerRun: 20,
  benchmarkSubsetSize: 50,
};

const NUMERIC_KEYS = {
  ai_rpm_free: "rpmFree",
  ai_rpm_paid: "rpmPaid",
  ai_free_rpd_fleet: "freeRpdFleet",
  ai_rpd_paid_model: "rpdPaidModel",
  ai_global_rpd: "globalRpd",
  ai_run_max_plays: "runMaxPlays",
  ai_run_max_audits: "runMaxAudits",
  ai_calls_per_play: "callsPerPlay",
  ai_backoff_base_ms: "backoffBaseMs",
  ai_backoff_max_ms: "backoffMaxMs",
  ai_max_cooldowns_per_model: "maxCooldownsPerModel",
  ai_practice_per_player_per_run: "practicePerPlayerPerRun",
  ai_benchmark_subset_size: "benchmarkSubsetSize",
} as const;

type NumericKey = (typeof NUMERIC_KEYS)[keyof typeof NUMERIC_KEYS];

function toPositiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sanitizeOverrides(value: unknown): Record<string, number> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = toPositiveNumber(v);
    if (n !== null) out[k] = n;
  }
  return out;
}

/**
 * ai_fleet_settings rows ({key, value: jsonb}) -> typed settings.
 * Missing keys, non-positive numbers, wrong JSON types and malformed
 * override objects all fall back to the D3 default for that key — a bad
 * settings row must never silently un-throttle the fleet.
 */
export function parseRateSettings(
  rows: readonly { key: unknown; value: unknown }[] | null | undefined
): RateSettings {
  const settings: RateSettings = {
    ...DEFAULT_RATE_SETTINGS,
    rpmOverrides: { ...DEFAULT_RATE_SETTINGS.rpmOverrides },
  };
  if (!Array.isArray(rows)) return settings;
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    if (row.key === "ai_rpm_overrides") {
      const overrides = sanitizeOverrides(row.value);
      // A present-but-non-object value keeps the D3 defaults; a real object
      // replaces them ({} is a legitimate way to clear all overrides).
      if (overrides !== null) settings.rpmOverrides = overrides;
      continue;
    }
    const field = (NUMERIC_KEYS as Record<string, NumericKey>)[String(row.key)];
    if (field === undefined) continue;
    const n = toPositiveNumber(row.value);
    if (n !== null) settings[field] = n;
  }
  return settings;
}

// ---------------------------------------------------------------------------
// TokenBucket — per-model pacing governor (D3: capacity 1, refill rpm/60/s)
// ---------------------------------------------------------------------------

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  private readonly now: () => number;
  private readonly capacity: number;
  private readonly refillPerSec: number;

  constructor(opts: {
    now: () => number;
    /** Tokens per second (e.g. rpm/60). Non-positive = never refills. */
    refillPerSec: number;
    /** Max tokens held; default 1 per D3. */
    capacity?: number;
    /** Starting tokens; default = capacity (a fresh bucket allows one call). */
    initialTokens?: number;
  }) {
    this.now = opts.now;
    this.capacity = opts.capacity ?? 1;
    this.refillPerSec = opts.refillPerSec;
    this.tokens = Math.min(opts.initialTokens ?? this.capacity, this.capacity);
    this.lastRefillMs = opts.now();
  }

  private refill(): void {
    const t = this.now();
    const dt = t - this.lastRefillMs;
    if (dt <= 0) return; // clock skew: no refill, keep timestamp
    this.lastRefillMs = t;
    if (this.refillPerSec <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + (dt / 1000) * this.refillPerSec);
  }

  /** Takes n tokens if available; never takes a partial charge. */
  tryTake(n = 1): boolean {
    this.refill();
    if (n <= this.tokens) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /** Ms until n tokens are available (0 = now, Infinity = never reachable). */
  msUntil(n = 1): number {
    this.refill();
    if (n <= this.tokens) return 0;
    if (n > this.capacity || this.refillPerSec <= 0) return Number.POSITIVE_INFINITY;
    return ((n - this.tokens) / this.refillPerSec) * 1000;
  }

  get tokensAvailable(): number {
    this.refill();
    return this.tokens;
  }
}

// ---------------------------------------------------------------------------
// Retry-After parsing (D3: honor Retry-After; worker prints retry_after_ms=)
// ---------------------------------------------------------------------------

/**
 * Extracts a retry delay (ms) from worker stderr / an error body.
 * Handles, in order:
 *   1. `retry_after_ms=<n>` (the worker's RATE_LIMIT_DEFERRED contract)
 *   2. `Retry-After: <seconds>` (also retry_after / "retry_after": JSON forms)
 *   3. `Retry-After: <HTTP-date>` — parsed against the injected clock
 * Returns null when no parseable hint exists; a past HTTP-date yields 0.
 */
export function parseRetryAfterMs(
  text: string | null | undefined,
  now: () => number = Date.now
): number | null {
  if (typeof text !== "string" || text.length === 0) return null;

  const msMatch = /retry_after_ms\s*["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i.exec(text);
  if (msMatch) {
    const n = Number(msMatch[1]);
    if (Number.isFinite(n)) return n;
  }

  const generic = /retry[-_ ]?after\s*["']?\s*[:=]\s*["']?([^\n;"'\]}]+)/i.exec(text);
  if (generic) {
    const value = generic[1].trim();
    // Leading number = Retry-After seconds; trailing JSON/prose chars tolerated.
    const numMatch = /^(\d+(?:\.\d+)?)(?!\d)/.exec(value);
    if (numMatch) return Number(numMatch[1]) * 1000;
    const parsed = Date.parse(value.replace(/["'}\]]+$/, "").trim());
    if (Number.isFinite(parsed)) return Math.max(0, parsed - now());
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backoff (D3: exponential + full jitter, base/max from settings)
// ---------------------------------------------------------------------------

/**
 * Full-jitter exponential backoff: uniform in [0, min(max, base * 2^attempt)].
 * attempt is a 0-based retry index (attempt 0 -> up to base).
 * rand is injected for determinism; non-finite rand/base/max degrade to 0.
 */
export function backoffMs(
  attempt: number,
  base: number,
  max: number,
  rand: () => number = Math.random
): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  const exp = Math.max(0, Math.floor(Number.isFinite(attempt) ? attempt : 0));
  const cap = Math.min(max, base * 2 ** exp);
  const r = rand();
  const u = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0;
  return u * cap;
}

// ---------------------------------------------------------------------------
// Outcome classification — consistent with aiFailureCauses causes
// ---------------------------------------------------------------------------

export type WorkOutcome = "ok" | "rate_limit_deferred" | "transient" | "permanent";

/**
 * Maps a worker error text to the run disposition:
 *   ok                   — no error
 *   rate_limit_deferred  — RATE_LIMIT_DEFERRED marker OR generic 429: never an
 *                          immediate retry; the governor penalizes + defers
 *   permanent            — auth (401) / gone (404): retrying cannot help
 *   transient            — bad_output / other (5xx, network, timeouts,
 *                          TRUNCATED_*): bounded retries with governor backoff
 */
export function classifyOutcome(errorText: string | null | undefined): WorkOutcome {
  const cause = classifyFailure(errorText);
  if (cause === null) return "ok";
  if (cause === "rate_limit" || cause === "rate_limit_deferred") return "rate_limit_deferred";
  if (cause === "auth" || cause === "gone") return "permanent";
  return "transient";
}
