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
    <div className="ops-page">
      <div className="mb-4 flex items-center gap-4">
        <Link
          href="/admin/dashboard/events"
          className="ops-btn"
        >
          Events
        </Link>
      </div>

      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">{event.title}</h1>
          <p className="ops-pagesub">
            Year: {event.event_year} · {aiCount} AI · {humanCount} Human
          </p>
        </div>
      </header>
      {event.description && (
        <p className="mb-4 max-w-3xl text-sm" style={{ color: "var(--ops-mute)" }}>
          {event.description}
        </p>
      )}

      {/* Mode breakdown */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--ops-mute)" }}>
          Mode breakdown (human plays)
        </h2>
        <div className="flex flex-wrap gap-2">
          {modeBreakdown.length > 0 ? (
            modeBreakdown.map((m) => (
              <span key={m.mode} className="ops-chip">
                {m.mode}: {m.play_count}
              </span>
            ))
          ) : (
            <span className="text-xs" style={{ color: "var(--ops-mute)" }}>
              No human plays recorded.
            </span>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <div className="text-xs" style={{ color: "var(--ops-mute)" }}>
          Sorted by XP (0-200) descending. Acc% = AI round_accuracy / human
          ROUND(score/2).
        </div>
      </div>

      <LeaderboardTypeFilter current={filter} basePath={basePath} />

      <EventLeaderboardTable rows={leaderboard} filter="all" />
    </div>
  );
}
