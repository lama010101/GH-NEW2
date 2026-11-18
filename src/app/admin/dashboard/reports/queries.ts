// Query helpers + pure shaping for the admin event-reports triage page
// (ADM-BUILD-REPORTTRIAGE-1117-507, slice 3 of EDQ-PLAN-TRUTHLOOP-1111-103).
//
// event_reports is service-role only (RLS enabled with zero policies — see
// supabase/migrations/20261112065052_event_reports.sql), so every read goes
// through the pg pool, same posture as POST /api/event-reports/route.ts.
// Status and reason values mirror the CHECK constraints in that migration —
// do not invent values here.

import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Status / reason vocabularies (CHECK-constrained in the migration)
// ---------------------------------------------------------------------------

export const EVENT_REPORT_STATUSES = [
  "open",
  "triaged",
  "upheld",
  "dismissed",
] as const;

export type EventReportStatus = (typeof EVENT_REPORT_STATUSES)[number];

export function isEventReportStatus(value: string): value is EventReportStatus {
  return (EVENT_REPORT_STATUSES as readonly string[]).includes(value);
}

/** Plain-language chip/filter labels for the CHECK-constrained status values. */
export const EVENT_REPORT_STATUS_LABEL: Record<EventReportStatus, string> = {
  open: "Open",
  triaged: "Reviewed",
  upheld: "Confirmed",
  dismissed: "Dismissed",
};

/** Plain-language labels for the CHECK-constrained reason values. */
export const EVENT_REPORT_REASON_LABEL: Record<string, string> = {
  wrong_year: "Wrong year",
  wrong_location: "Wrong location",
  not_real_event: "Not a real event",
  misleading_image: "Misleading image",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Sort params — whitelisted keys only; the ORDER BY fragment is built here so
// no raw searchParams text ever reaches SQL.
// ---------------------------------------------------------------------------

export type ReportSortKey = "event" | "reason" | "note" | "status" | "reported";

const REPORT_SORT_KEYS: readonly ReportSortKey[] = [
  "event",
  "reason",
  "note",
  "status",
  "reported",
];

const REPORT_SORT_SQL: Record<ReportSortKey, string> = {
  event: "event_title",
  reason: "r.reason",
  note: "r.details",
  status: "r.status",
  reported: "r.created_at",
};

export function parseReportSort(value: string | undefined): ReportSortKey {
  return REPORT_SORT_KEYS.includes(value as ReportSortKey)
    ? (value as ReportSortKey)
    : "reported";
}

export function parseReportDir(value: string | undefined): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

/** Same NULLS convention as fetchEventsList: asc -> NULLS FIRST, desc -> NULLS LAST. */
export function buildReportOrderBy(
  sort: ReportSortKey,
  dir: "asc" | "desc"
): string {
  const nulls = dir === "asc" ? "NULLS FIRST" : "NULLS LAST";
  return `${REPORT_SORT_SQL[sort]} ${dir.toUpperCase()} ${nulls}`;
}

// ---------------------------------------------------------------------------
// Reporter note — truncated preview with expandable full text
// ---------------------------------------------------------------------------

export const REPORT_NOTE_PREVIEW_LENGTH = 80;

export function truncateReportNote(
  text: string,
  max: number = REPORT_NOTE_PREVIEW_LENGTH
): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function splitReportNote(
  details: string | null
): { text: string | null; expandable: boolean } {
  if (!details) return { text: null, expandable: false };
  const trimmed = details.trim();
  if (trimmed.length === 0) return { text: null, expandable: false };
  return {
    text: trimmed,
    expandable: trimmed.length > REPORT_NOTE_PREVIEW_LENGTH,
  };
}

// ---------------------------------------------------------------------------
// Row shape + fetchers
// ---------------------------------------------------------------------------

export type EventReportListRow = {
  id: string;
  event_id: string;
  reason: string;
  details: string | null;
  status: string;
  resolution_note: string | null;
  reporter_is_anonymous: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  /** Live event title, falling back to the title captured in event_snapshot. */
  event_title: string | null;
  event_slug: string | null;
  event_year: number | null;
  /** COUNT(*) OVER() — total rows matching the filter (pagination). */
  total_count: number;
};

export async function fetchEventReports(
  pool: Pool,
  opts: {
    status?: string | null;
    sort?: string;
    dir?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<EventReportListRow[]> {
  const status =
    opts.status && isEventReportStatus(opts.status) ? opts.status : null;
  const sort = parseReportSort(opts.sort);
  const dir = parseReportDir(opts.dir);
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;

  const { rows } = await pool.query<EventReportListRow>(
    `
    SELECT
      r.id,
      r.event_id,
      r.reason,
      r.details,
      r.status,
      r.resolution_note,
      r.reporter_is_anonymous,
      r.created_at::text AS created_at,
      r.updated_at::text AS updated_at,
      r.resolved_at::text AS resolved_at,
      COALESCE(e.title, r.event_snapshot->>'title') AS event_title,
      e.slug AS event_slug,
      e.event_year AS event_year,
      COUNT(*) OVER() AS total_count
    FROM event_reports r
    LEFT JOIN events e ON e.id = r.event_id
    WHERE ($1::text IS NULL OR r.status = $1)
    ORDER BY ${buildReportOrderBy(sort, dir)}
    LIMIT $2 OFFSET $3
    `,
    [status, limit, offset]
  );
  return rows;
}

/** Unfiltered per-status counts for the filter chips. */
export async function fetchEventReportStatusCounts(
  pool: Pool
): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ status: string; count: number }>(
    `
    SELECT status, COUNT(*)::int AS count
    FROM event_reports
    GROUP BY status
    `
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = row.count;
  return out;
}
