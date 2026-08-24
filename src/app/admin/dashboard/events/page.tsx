import Link from "next/link";
import { getDbPool } from "@/server/db";
import { fetchEventsList, type EventListRow } from "../queries";
import { EventsFilters } from "./EventsFilters";

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

  return (
    <main className="min-h-screen bg-gh-bg-base p-6 text-gh-text">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center gap-4">
          <Link
            href="/admin/dashboard"
            className="text-gh-text-sec hover:text-gh-text text-sm"
          >
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold">Events</h1>
        </div>

        <EventsFilters currentMode={mode} currentType={playerType} />

        <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
                <th className="px-4 py-3 font-semibold">
                  <Link href={sortLink("title")} className="hover:underline">
                    Event{sortIndicator("title")}
                  </Link>
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  <Link href={sortLink("event_year")} className="hover:underline">
                    Year{sortIndicator("event_year")}
                  </Link>
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  <Link href={sortLink("avg_xp")} className="hover:underline">
                    Avg XP{sortIndicator("avg_xp")}
                  </Link>
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  <Link href={sortLink("avg_accuracy")} className="hover:underline">
                    Avg Acc%{sortIndicator("avg_accuracy")}
                  </Link>
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  <Link href={sortLink("total_plays")} className="hover:underline">
                    Plays{sortIndicator("total_plays")}
                  </Link>
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  <Link href={sortLink("human_plays")} className="hover:underline">
                    Human{sortIndicator("human_plays")}
                  </Link>
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  <Link href={sortLink("ai_plays")} className="hover:underline">
                    AI{sortIndicator("ai_plays")}
                  </Link>
                </th>
                <th className="px-4 py-3 font-semibold">Modes</th>
                <th className="px-4 py-3 font-semibold">Drilldown</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: EventListRow) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
                >
                  <td className="max-w-[280px] truncate px-4 py-3" title={row.title}>
                    {row.title}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.event_year}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {toNumber(row.avg_xp).toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.avg_accuracy}%
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.total_plays.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.human_plays.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.ai_plays.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-gh-text-sec">
                    {row.modes || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/admin/dashboard/events/${row.id}`}
                      className="text-gh-text-sec hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-gh-text-sec" colSpan={9}>
                    No events found for the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="text-gh-text-sec">
              Page {page} of {totalPages} ({totalCount.toLocaleString()} events)
            </div>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={makeLink({ page: String(page - 1) })}
                  className="rounded border border-[var(--gh-border-default)] bg-gh-bg-surface px-3 py-1 text-gh-text hover:bg-gh-bg-elevated"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded border border-[var(--gh-border-default)] px-3 py-1 text-gh-text-sec opacity-50">
                  Previous
                </span>
              )}
              {page < totalPages ? (
                <Link
                  href={makeLink({ page: String(page + 1) })}
                  className="rounded border border-[var(--gh-border-default)] bg-gh-bg-surface px-3 py-1 text-gh-text hover:bg-gh-bg-elevated"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded border border-[var(--gh-border-default)] px-3 py-1 text-gh-text-sec opacity-50">
                  Next
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
