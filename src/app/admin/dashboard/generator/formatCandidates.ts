// Pure formatting helpers for the admin Generator candidate list
// (GEN-BUILD-CANDIDLIST-1028-001). No data fetching — unit-testable
// with fixture rows. checks/quota_bucket jsonb shapes are not yet
// defined on this branch (the discovery writer is a parallel task),
// so the summaries below are shape-agnostic and deterministic.

export const CANDIDATE_STATUSES = [
  "new",
  "narrated",
  "checked",
  "published",
  "rejected",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** Year label: negative years render as "N BCE"; null → "—". */
export function formatEventYear(year: number | null): string {
  if (year === null) return "—";
  return year < 0 ? `${-year} BCE` : String(year);
}

/** timestamptz::text / ISO → "YYYY-MM-DD HH:mm". */
export function formatCreatedAt(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function scalar(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * quota_bucket summary. Object → "k=v" pairs (first 3, then "+N more");
 * array → "N entries"; scalar → String(value); null/empty object → "—".
 */
export function summarizeQuotaBucket(bucket: unknown): string {
  if (bucket === null || bucket === undefined) return "—";
  if (Array.isArray(bucket)) {
    return `${bucket.length} entr${bucket.length === 1 ? "y" : "ies"}`;
  }
  if (typeof bucket === "object") {
    const entries = Object.entries(bucket as Record<string, unknown>);
    if (entries.length === 0) return "—";
    const shown = entries
      .slice(0, 3)
      .map(([k, v]) => `${k}=${scalar(v)}`)
      .join(", ");
    return entries.length > 3 ? `${shown} +${entries.length - 3} more` : shown;
  }
  return scalar(bucket);
}

/**
 * checks flags summary: number of flag entries in the jsonb payload.
 * Object/array → entry count as "N flag(s)"; null/malformed → "—".
 */
export function summarizeChecks(checks: unknown): string {
  if (checks === null || checks === undefined) return "—";
  const n = Array.isArray(checks)
    ? checks.length
    : typeof checks === "object"
      ? Object.keys(checks).length
      : -1;
  if (n < 0) return "—";
  return `${n} flag${n === 1 ? "" : "s"}`;
}

/** status → ops-chip classes (new → muted, narrated → warn, checked/published → ok, rejected → bad). */
export function statusChipClass(status: string): string {
  switch (status) {
    case "published":
    case "checked":
      return "ops-chip ops-chip-ok";
    case "rejected":
      return "ops-chip ops-chip-bad";
    case "narrated":
      return "ops-chip ops-chip-warn";
    default:
      return "ops-chip ops-chip-muted";
  }
}
