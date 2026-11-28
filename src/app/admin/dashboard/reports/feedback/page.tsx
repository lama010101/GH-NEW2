import Link from "next/link";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

// UX-BUILD-EVENTFEEDBACK-1128-925 — read-only admin list for player correction
// claims. No write actions: review remains the separate event-review process.

const PAGE_SIZE = 10;

type SearchParams = { [key: string]: string | string[] | undefined };

type FeedbackGroupRow = {
  event_id: string;
  event_title: string | null;
  event_year: number | null;
  total_count: number;
  title_count: number;
  year_count: number;
  location_count: number;
  description_count: number;
  image_count: number;
  pending_count: number;
  supported_count: number;
  contradicted_count: number;
  inconclusive_count: number;
  newest_at: string;
};

type FeedbackItemRow = {
  id: string;
  event_id: string;
  field: string;
  current_value: string | null;
  proposed_value: string | null;
  image_reasons: string[] | null;
  comment: string | null;
  review_status: string;
  reporter_is_anonymous: boolean;
  created_at: string;
};

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  );
}

function valueCell(value: string | null): string {
  return value && value.trim().length > 0 ? value : "—";
}

export default async function EventFeedbackAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pageRaw = getParam(searchParams, "page");
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const pool = getDbPool();

  let groups: FeedbackGroupRow[];
  let rows: FeedbackItemRow[];
  let totalGroups: number;
  try {
    const [groupResult, countResult] = await Promise.all([
      pool.query<FeedbackGroupRow>(
        `SELECT
           f.event_id,
           e.title AS event_title,
           e.event_year,
           COUNT(*)::int AS total_count,
           COUNT(*) FILTER (WHERE f.field = 'title')::int AS title_count,
           COUNT(*) FILTER (WHERE f.field = 'year')::int AS year_count,
           COUNT(*) FILTER (WHERE f.field = 'location')::int AS location_count,
           COUNT(*) FILTER (WHERE f.field = 'description')::int AS description_count,
           COUNT(*) FILTER (WHERE f.field = 'image')::int AS image_count,
           COUNT(*) FILTER (WHERE f.review_status = 'pending')::int AS pending_count,
           COUNT(*) FILTER (WHERE f.review_status = 'supported')::int AS supported_count,
           COUNT(*) FILTER (WHERE f.review_status = 'contradicted')::int AS contradicted_count,
           COUNT(*) FILTER (WHERE f.review_status = 'inconclusive')::int AS inconclusive_count,
           MAX(f.created_at)::text AS newest_at
         FROM public.event_feedback f
         LEFT JOIN public.events e ON e.id = f.event_id
         GROUP BY f.event_id, e.title, e.event_year
         ORDER BY MAX(f.created_at) DESC, f.event_id
         LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, offset]
      ),
      pool.query<{ total_groups: number }>(
        `SELECT COUNT(*)::int AS total_groups
         FROM (SELECT event_id FROM public.event_feedback GROUP BY event_id) g`
      ),
    ]);
    groups = groupResult.rows;
    totalGroups = countResult.rows[0]?.total_groups ?? 0;
    const eventIds = groups.map((group) => group.event_id);
    rows = eventIds.length
      ? (
          await pool.query<FeedbackItemRow>(
            `SELECT
               id,
               event_id,
               field,
               current_value,
               proposed_value,
               image_reasons,
               comment,
               review_status,
               reporter_is_anonymous,
               created_at::text AS created_at
             FROM public.event_feedback
             WHERE event_id = ANY($1::uuid[])
             ORDER BY created_at DESC`,
            [eventIds]
          )
        ).rows
      : [];
  } catch (error) {
    if (isMissingTableError(error)) {
      return (
        <div className="ops-page">
          <header className="ops-pagehead">
            <div>
              <h1 className="ops-h1">Event feedback</h1>
              <p className="ops-pagesub">Player correction claims are not built yet.</p>
            </div>
          </header>
          <div className="ops-panel-flush" style={{ padding: 16 }}>
            The event_feedback table is not present in this environment.
          </div>
          <p>
            <Link href="/admin/dashboard/reports" className="ops-btn">
              Back to event reports
            </Link>
          </p>
        </div>
      );
    }
    throw error;
  }

  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const rowsByEvent = new Map<string, FeedbackItemRow[]>();
  for (const row of rows) {
    const list = rowsByEvent.get(row.event_id) ?? [];
    list.push(row);
    rowsByEvent.set(row.event_id, list);
  }

  function pageLink(nextPage: number): string {
    return `/admin/dashboard/reports/feedback?page=${nextPage}`;
  }

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Event feedback</h1>
          <p className="ops-pagesub">
            {totalGroups.toLocaleString()} event{totalGroups === 1 ? "" : "s"} with player correction claims — read only
          </p>
        </div>
        <Link href="/admin/dashboard/reports" className="ops-btn">
          Event reports
        </Link>
      </header>

      {groups.length === 0 ? (
        <div className="ops-panel-flush" style={{ padding: 16 }}>
          No feedback yet. Player correction claims will appear here grouped by event.
        </div>
      ) : (
        groups.map((group) => {
          const eventRows = rowsByEvent.get(group.event_id) ?? [];
          return (
            <section key={group.event_id} className="ops-panel-flush" style={{ marginBottom: 16, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>
                {group.event_title ?? "Unknown event"} {group.event_year != null ? `(${group.event_year})` : ""}
              </h2>
              <p style={{ color: "var(--ops-mute)" }}>
                {group.total_count} claim{group.total_count === 1 ? "" : "s"} · fields: title {group.title_count}, year {group.year_count}, location {group.location_count}, description {group.description_count}, image {group.image_count}
                {" · status: pending "}{group.pending_count}, supported {group.supported_count}, contradicted {group.contradicted_count}, inconclusive {group.inconclusive_count}
                {" · newest "}{formatDate(group.newest_at)}
              </p>
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Current value</th>
                    <th>Proposed value / image reasons</th>
                    <th>Comment</th>
                    <th>Status</th>
                    <th>Reporter</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {eventRows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Field">{row.field}</td>
                      <td data-label="Current value" style={{ whiteSpace: "pre-wrap" }}>
                        {valueCell(row.current_value)}
                      </td>
                      <td data-label="Proposed value / image reasons" style={{ whiteSpace: "pre-wrap" }}>
                        {row.field === "image"
                          ? row.image_reasons?.join(", ") || "—"
                          : valueCell(row.proposed_value)}
                      </td>
                      <td data-label="Comment" style={{ whiteSpace: "pre-wrap" }}>
                        {valueCell(row.comment)}
                      </td>
                      <td data-label="Status">{row.review_status}</td>
                      <td data-label="Reporter">
                        {row.reporter_is_anonymous ? "anonymous guest" : "signed-in player"}
                      </td>
                      <td data-label="Created" style={{ color: "var(--ops-mute)" }}>
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}

      {totalPages > 1 && (
        <div className="ops-pagination">
          <div>
            Page {page} of {totalPages} ({totalGroups.toLocaleString()} events)
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={pageLink(page - 1)} className="ops-btn">
                Previous
              </Link>
            ) : (
              <span className="ops-btn" style={{ opacity: 0.5 }}>
                Previous
              </span>
            )}
            {page < totalPages ? (
              <Link href={pageLink(page + 1)} className="ops-btn">
                Next
              </Link>
            ) : (
              <span className="ops-btn" style={{ opacity: 0.5 }}>
                Next
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
