import Link from "next/link";
import { getDbPool } from "@/server/db";
import { fetchEventsList, type EventListRow } from "../queries";
import { EventsFilters } from "./EventsFilters";
import { RecordDrawer, type DrawerField } from "../components/RecordDrawer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = { [key: string]: string | string[] | undefined };

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const p = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(p) ? p : 0;
}

const MODE_OPTIONS = ["sync", "async", "practice", "compete", "daily"];

export default async function EventsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pool = getDbPool();

  const mode = getParam(searchParams, "mode") || "";
  const playerTypeRaw = getParam(searchParams, "ptype") || "";
  const playerType =
    playerTypeRaw === "ai" || playerTypeRaw === "human" || playerTypeRaw === "both"
      ? playerTypeRaw
      : "";
  const sort = getParam(searchParams, "sort") || "total_plays";
  const dirRaw = getParam(searchParams, "dir") || "desc";
  const dir: "asc" | "desc" = dirRaw === "asc" ? "asc" : "desc";
  const pageRaw = getParam(searchParams, "page");
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await fetchEventsList(pool, {
    mode: mode && MODE_OPTIONS.includes(mode) ? mode : null,
    playerType: playerType ? (playerType as "ai" | "human" | "both") : null,
    sort,
    dir,
    limit: PAGE_SIZE,
    offset,
  });

  const totalCount = rows[0]?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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
    return `/admin/dashboard/events${qs ? `?${qs}` : ""}`;
  }

  function sortLink(column: string): string {
    const nextDir = sort === column ? (dir === "desc" ? "asc" : "desc") : "desc";
    return makeLink({ sort: column, dir: nextDir, page: undefined });
  }

  function sortIndicator(column: string): string {
    if (column !== sort) return "";
    return dir === "asc" ? " ↑" : " ↓";
  }

  // Shared RecordDrawer state (?drawer=<eventId>).
  const drawerId = getParam(searchParams, "drawer");
  const drawerRow = drawerId
    ? rows.find((r) => r.id === drawerId) ?? null
    : null;
  const drawerCloseHref = makeLink({ drawer: undefined });
  const drawerFields: DrawerField[] | undefined = drawerRow
    ? [
        { label: "Event ID", value: drawerRow.id, mono: true },
        { label: "Year", value: drawerRow.event_year },
        { label: "Total plays", value: drawerRow.total_plays.toLocaleString() },
        { label: "Human plays", value: drawerRow.human_plays.toLocaleString() },
        { label: "AI plays", value: drawerRow.ai_plays.toLocaleString() },
        { label: "Modes", value: drawerRow.modes || "—" },
        { label: "Avg XP (0-100)", value: toNumber(drawerRow.avg_xp).toFixed(2) },
        { label: "Avg accuracy", value: `${drawerRow.avg_accuracy}%` },
      ]
    : undefined;

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Events</h1>
          <p className="ops-pagesub">
            {totalCount.toLocaleString()} events with recorded plays
          </p>
        </div>
      </header>

        <EventsFilters currentMode={mode} currentType={playerType} />

        <div className="ops-panel-flush">
          <table className="ops-table">
            <thead>
              <tr>
                <th>
                  <Link href={sortLink("title")} className="hover:underline">
                    Event{sortIndicator("title")}
                  </Link>
                </th>
                <th className="num">
                  <Link href={sortLink("event_year")} className="hover:underline">
                    Year{sortIndicator("event_year")}
                  </Link>
                </th>
                <th className="num">
                  <Link href={sortLink("avg_xp")} className="hover:underline">
                    Avg XP{sortIndicator("avg_xp")}
                  </Link>
                </th>
                <th className="num">
                  <Link href={sortLink("avg_accuracy")} className="hover:underline">
                    Avg Acc%{sortIndicator("avg_accuracy")}
                  </Link>
                </th>
                <th className="num">
                  <Link href={sortLink("total_plays")} className="hover:underline">
                    Plays{sortIndicator("total_plays")}
                  </Link>
                </th>
                <th className="num">
                  <Link href={sortLink("human_plays")} className="hover:underline">
                    Human{sortIndicator("human_plays")}
                  </Link>
                </th>
                <th className="num">
                  <Link href={sortLink("ai_plays")} className="hover:underline">
                    AI{sortIndicator("ai_plays")}
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: EventListRow) => (
                <tr key={row.id}>
                  <td data-label="Event">
                    <Link
                      href={makeLink({ drawer: row.id })}
                      className="ops-celllink"
                      title="Open record"
                    >
                      <span className="ops-cellname">
                        <span>
                          <span className="ops-truncate">{row.title}</span>
                          <span
                            className="block text-xs"
                            style={{ color: "var(--ops-mute)" }}
                          >
                            {row.modes || "—"}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="num" data-label="Year">
                    {row.event_year}
                  </td>
                  <td className="num" data-label="Avg XP">
                    {toNumber(row.avg_xp).toFixed(1)}
                  </td>
                  <td className="num" data-label="Avg Acc%">
                    {row.avg_accuracy}%
                  </td>
                  <td className="num" data-label="Plays">
                    {row.total_plays.toLocaleString()}
                  </td>
                  <td className="num" data-label="Human">
                    {row.human_plays.toLocaleString()}
                  </td>
                  <td className="num" data-label="AI">
                    {row.ai_plays.toLocaleString()}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    No events found for the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="ops-pagination">
            <div>
              Page {page} of {totalPages} ({totalCount.toLocaleString()} events)
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

        <RecordDrawer
          open={drawerRow != null}
          closeHref={drawerCloseHref}
          title={drawerRow?.title ?? ""}
          subtitle={drawerRow ? `${drawerRow.avg_accuracy}% avg accuracy` : undefined}
          fields={drawerFields}
          actions={
            drawerRow ? (
              <Link
                href={`/admin/dashboard/events/${drawerRow.id}`}
                className="ops-btn ops-btn-primary"
              >
                Open full drilldown
              </Link>
            ) : undefined
          }
        />
      </div>
  );
}
