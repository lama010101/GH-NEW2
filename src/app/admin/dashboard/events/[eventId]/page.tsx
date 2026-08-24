import Link from "next/link";
import { notFound } from "next/navigation";
import { getDbPool } from "@/server/db";
import {
  fetchEventLeaderboard,
  fetchEventModeBreakdown,
} from "../../queries";
import {
  EventLeaderboardTable,
  LeaderboardTypeFilter,
} from "../EventLeaderboardTable";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function EventDrilldownPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: SearchParams;
}) {
  const pool = getDbPool();
  const eventId = params.eventId;

  // Validate eventId is a UUID-ish string to avoid raw injection into messages.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(eventId)) {
    notFound();
  }

  const ptypeRaw = getParam(searchParams, "ptype") || "all";
  const filter: "all" | "ai" | "human" =
    ptypeRaw === "ai" || ptypeRaw === "human" ? ptypeRaw : "all";

  const [leaderboard, modeBreakdown, eventRow] = await Promise.all([
    fetchEventLeaderboard(pool, eventId, {
      playerType: filter === "all" ? null : filter,
    }),
    fetchEventModeBreakdown(pool, eventId),
    pool.query<{ id: string; title: string; event_year: number; description: string | null }>(
      `SELECT id, title, event_year, description FROM events WHERE id = $1::uuid`,
      [eventId]
    ),
  ]);

  if (eventRow.rows.length === 0) {
    notFound();
  }

  const event = eventRow.rows[0];
  const basePath = `/admin/dashboard/events/${eventId}`;

  const aiCount = leaderboard.filter((r) => r.player_type === "ai").length;
  const humanCount = leaderboard.filter((r) => r.player_type === "human").length;

  return (
    <main className="min-h-screen bg-gh-bg-base p-6 text-gh-text">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center gap-4">
          <Link
            href="/admin/dashboard/events"
            className="text-gh-text-sec hover:text-gh-text text-sm"
          >
            ← Events
          </Link>
          <Link
            href="/admin/dashboard"
            className="text-gh-text-sec hover:text-gh-text text-sm"
          >
            Dashboard
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <div className="mt-1 text-sm text-gh-text-sec">
            Year: {event.event_year} · {aiCount} AI · {humanCount} Human
          </div>
          {event.description && (
            <p className="mt-2 max-w-3xl text-sm text-gh-text-sec">
              {event.description}
            </p>
          )}
        </div>

        {/* Mode breakdown */}
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gh-text-sec">
            Mode breakdown (human plays)
          </h2>
          <div className="flex flex-wrap gap-2">
            {modeBreakdown.length > 0 ? (
              modeBreakdown.map((m) => (
                <span
                  key={m.mode}
                  className="rounded-full border border-[var(--gh-border-default)] bg-gh-bg-surface px-3 py-1 text-xs text-gh-text"
                >
                  {m.mode}: {m.play_count}
                </span>
              ))
            ) : (
              <span className="text-xs text-gh-text-sec">
                No human plays recorded.
              </span>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <div className="text-xs text-gh-text-sec">
            Sorted by XP (0-200) descending. Acc% = AI round_accuracy / human
            ROUND(score/2).
          </div>
        </div>

        <LeaderboardTypeFilter current={filter} basePath={basePath} />

        <EventLeaderboardTable rows={leaderboard} filter="all" />
      </div>
    </main>
  );
}
