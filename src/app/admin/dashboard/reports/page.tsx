import Link from "next/link";
import { getDbPool } from "@/server/db";
import {
  EVENT_REPORT_REASON_LABEL,
  EVENT_REPORT_STATUSES,
  EVENT_REPORT_STATUS_LABEL,
  fetchEventReportStatusCounts,
  fetchEventReports,
  isEventReportStatus,
  parseReportDir,
  parseReportSort,
  splitReportNote,
  truncateReportNote,
  type EventReportListRow,
  type EventReportStatus,
  type ReportSortKey,
} from "./queries";
import { updateEventReportStatus } from "./actions";

export const dynamic = "force-dynamic";

// Admin triage for player-submitted event_reports
// (ADM-BUILD-REPORTTRIAGE-1117-507, slice 3 of EDQ-PLAN-TRUTHLOOP-1111-103).
// Reports never auto-retire an event — this page is where a human decides.
// Table/sort/filter conventions mirror admin/dashboard/events + users pages.

const PAGE_SIZE = 25;

type SearchParams = { [key: string]: string | string[] | undefined };

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

/** Text columns open ascending on first click; dates/counts open descending. */
const TEXT_SORTS: ReadonlySet<ReportSortKey> = new Set([
  "event",
  "reason",
  "note",
  "status",
]);

const STATUS_CHIP_CLASS: Record<EventReportStatus, string> = {
  open: "ops-chip ops-chip-warn",
  triaged: "ops-chip",
  upheld: "ops-chip ops-chip-bad",
  dismissed: "ops-chip ops-chip-muted",
};

export default async function EventReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pool = getDbPool();

  const statusParam = getParam(searchParams, "status");
  const status: EventReportStatus | null =
    statusParam && isEventReportStatus(statusParam) ? statusParam : null;
  const sort = parseReportSort(getParam(searchParams, "sort"));
  const dir = parseReportDir(getParam(searchParams, "dir"));
  const pageRaw = getParam(searchParams, "page");
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, statusCounts] = await Promise.all([
    fetchEventReports(pool, {
      status,
      sort,
      dir,
      limit: PAGE_SIZE,
      offset,
    }),
    fetchEventReportStatusCounts(pool),
  ]);

  const totalCount = rows[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const totalReports = EVENT_REPORT_STATUSES.reduce(
    (sum, s) => sum + (statusCounts[s] ?? 0),
    0
  );
  const openCount = statusCounts.open ?? 0;

  function makeLink(updates: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const allParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(searchParams)) {
      if (v == null) continue;
      allParams[k] = Array.isArray(v) ? v[0] : v;
    }
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) delete allParams[k];
      else allParams[k] = v;
    }
    for (const [k, v] of Object.entries(allParams)) {
      next.set(k, v);
    }
    const qs = next.toString();
    return `/admin/dashboard/reports${qs ? `?${qs}` : ""}`;
  }

  function sortLink(column: ReportSortKey): string {
    const nextDir =
      sort === column
        ? dir === "desc"
          ? "asc"
          : "desc"
        : TEXT_SORTS.has(column)
          ? "asc"
          : "desc";
    return makeLink({ sort: column, dir: nextDir, page: undefined });
  }

  function sortIndicator(column: ReportSortKey): string {
    if (column !== sort) return "";
    return dir === "asc" ? " ↑" : " ↓";
  }

  function chipClass(active: boolean): string {
    return `ops-chip ops-chip-toggle${active ? " ops-chip-on" : ""}`;
  }

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Event reports</h1>
          <p className="ops-pagesub">
            {totalReports.toLocaleString()} report
            {totalReports === 1 ? "" : "s"} · {openCount.toLocaleString()} open
            {" — players flag problems; nothing is removed automatically"}
          </p>
        </div>
        <Link href="/admin/dashboard/reports/feedback" className="ops-btn">
          Event feedback
        </Link>
      </header>

      <div className="fleet-filterbar" role="group" aria-label="Filter by status">
        <Link
          href={makeLink({ status: undefined, page: undefined })}
          className={chipClass(status === null)}
        >
          All ({totalReports.toLocaleString()})
        </Link>
        {EVENT_REPORT_STATUSES.map((s) => (
          <Link
            key={s}
            href={makeLink({ status: s, page: undefined })}
            className={chipClass(status === s)}
          >
            {EVENT_REPORT_STATUS_LABEL[s]} ({(statusCounts[s] ?? 0).toLocaleString()})
          </Link>
        ))}
      </div>

      <div className="ops-panel-flush">
        <table className="ops-table">
          <thead>
            <tr>
              <th>
                <Link href={sortLink("event")} className="hover:underline">
                  Event{sortIndicator("event")}
                </Link>
              </th>
              <th>
                <Link href={sortLink("reason")} className="hover:underline">
                  Reason{sortIndicator("reason")}
                </Link>
              </th>
              <th>
                <Link href={sortLink("note")} className="hover:underline">
                  Reporter note{sortIndicator("note")}
                </Link>
              </th>
              <th>
                <Link href={sortLink("status")} className="hover:underline">
                  Status{sortIndicator("status")}
                </Link>
              </th>
              <th>
                <Link href={sortLink("reported")} className="hover:underline">
                  Reported{sortIndicator("reported")}
                </Link>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: EventReportListRow) => {
              const note = splitReportNote(row.details);
              const rowStatus = isEventReportStatus(row.status)
                ? row.status
                : null;
              return (
                <tr key={row.id}>
                  <td data-label="Event">
                    <span className="ops-truncate">
                      {row.event_title ?? "Unknown event"}
                    </span>
                    <span
                      className="block text-xs"
                      style={{ color: "var(--ops-mute)" }}
                    >
                      {row.event_year ?? "—"}
                      {row.event_slug ? " · " : ""}
                      {row.event_slug ? (
                        <Link
                          href={`/events/${row.event_slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          public page
                        </Link>
                      ) : null}
                    </span>
                  </td>
                  <td data-label="Reason">
                    {EVENT_REPORT_REASON_LABEL[row.reason] ?? row.reason}
                  </td>
                  <td data-label="Reporter note">
                    {note.text === null ? (
                      "—"
                    ) : note.expandable ? (
                      <details className="fleet-schedule">
                        <summary>{truncateReportNote(note.text)}</summary>
                        <p style={{ whiteSpace: "pre-wrap" }}>{note.text}</p>
                      </details>
                    ) : (
                      <span style={{ whiteSpace: "pre-wrap" }}>{note.text}</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <span
                      className={
                        rowStatus
                          ? STATUS_CHIP_CLASS[rowStatus]
                          : "ops-chip ops-chip-muted"
                      }
                    >
                      {rowStatus
                        ? EVENT_REPORT_STATUS_LABEL[rowStatus]
                        : row.status}
                    </span>
                  </td>
                  <td
                    data-label="Reported"
                    style={{ color: "var(--ops-mute)" }}
                  >
                    {formatDate(row.created_at)}
                  </td>
                  <td data-label="Actions">
                    <form
                      action={updateEventReportStatus}
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <input type="hidden" name="reportId" value={row.id} />
                      <select
                        name="status"
                        defaultValue={row.status}
                        className="ops-input"
                        aria-label="New status"
                      >
                        {EVENT_REPORT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {EVENT_REPORT_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        name="note"
                        placeholder="Note (optional)"
                        maxLength={500}
                        className="ops-input"
                        aria-label="Resolution note"
                        style={{ minWidth: 140 }}
                      />
                      <button type="submit" className="ops-btn">
                        Update
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  {status
                    ? `No ${EVENT_REPORT_STATUS_LABEL[status].toLowerCase()} reports.`
                    : "No reports yet. When a player flags a problem with an event, it will show up here for review."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="ops-pagination">
          <div>
            Page {page} of {totalPages} ({totalCount.toLocaleString()} reports)
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={makeLink({ page: String(page - 1) })} className="ops-btn">
                Previous
              </Link>
            ) : (
              <span className="ops-btn" style={{ opacity: 0.5 }}>
                Previous
              </span>
            )}
            {page < totalPages ? (
              <Link href={makeLink({ page: String(page + 1) })} className="ops-btn">
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
