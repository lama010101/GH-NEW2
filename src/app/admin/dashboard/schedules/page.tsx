import { getDbPool } from "@/server/db";
import { fetchScheduledChanges } from "../queries";
import { CancelScheduleButton } from "./CancelScheduleButton";

export const dynamic = "force-dynamic";

// Scheduled AI-player mode changes (AIP-BUILD-PRODASHBOARD-FULLUIX-002).
// Pending rows are applied by /api/cron/apply-ai-schedule-changes (Vercel cron).

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

export default async function SchedulesPage() {
  const pool = getDbPool();
  const rows = await fetchScheduledChanges(pool, { limit: 200 });

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <section>
      <h1 className="mb-1 text-lg font-semibold">Scheduled mode changes</h1>
      <p className="mb-4 text-sm text-gh-text-sec">
        {pending.length} pending · applied by the cron route every minute
      </p>

      <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
              <th className="px-4 py-3 font-semibold">AI player</th>
              <th className="px-4 py-3 font-semibold">Mode</th>
              <th className="px-4 py-3 font-semibold">Change</th>
              <th className="px-4 py-3 font-semibold">Apply at</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
              >
                <td className="px-4 py-3">
                  {r.player_name ?? r.ai_player_id}
                  {r.model_id && (
                    <div className="text-xs text-gh-text-sec">{r.model_id}</div>
                  )}
                </td>
                <td className="px-4 py-3 capitalize">{r.mode}</td>
                <td className="px-4 py-3">
                  {r.target_value ? "Enable" : "Disable"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gh-text-sec">
                  {formatDate(r.apply_at)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      r.status === "pending"
                        ? "text-[var(--gh-gold)]"
                        : r.status === "applied"
                          ? "text-[var(--gh-success)]"
                          : "text-gh-text-sec"
                    }`}
                  >
                    {r.status}
                    {r.status === "applied" && r.applied_at
                      ? ` · ${formatDate(r.applied_at)}`
                      : ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.status === "pending" && (
                    <CancelScheduleButton changeId={r.id} />
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-gh-text-sec" colSpan={6}>
                  No scheduled changes. Create one from the AI Roster tab
                  (&quot;Schedule…&quot; per row).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {done.length > 0 && (
        <p className="mt-3 text-xs text-gh-text-sec">
          Showing {rows.length} rows ({pending.length} pending, {done.length}{" "}
          applied/cancelled).
        </p>
      )}
    </section>
  );
}
