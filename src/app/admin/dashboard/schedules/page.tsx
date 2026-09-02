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
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Scheduled mode changes</h1>
          <p className="ops-pagesub">
            {pending.length} pending · applied by the cron route every minute
          </p>
        </div>
      </header>

      <div className="ops-panel-flush">
        <table className="ops-table">
          <thead>
            <tr>
              <th>AI player</th>
              <th>Mode</th>
              <th>Change</th>
              <th>Apply at</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="AI player">
                  <span className="ops-truncate">{r.player_name ?? r.ai_player_id}</span>
                  {r.model_id && (
                    <div className="ops-mono" style={{ color: "var(--ops-mute)" }}>
                      {r.model_id}
                    </div>
                  )}
                </td>
                <td data-label="Mode">{r.mode}</td>
                <td data-label="Change">
                  {r.target_value ? "Enable" : "Disable"}
                </td>
                <td data-label="Apply at" style={{ color: "var(--ops-mute)" }}>
                  {formatDate(r.apply_at)}
                </td>
                <td data-label="Status">
                  <span
                    className={`ops-chip ${
                      r.status === "pending"
                        ? "ops-chip-warn"
                        : r.status === "applied"
                        ? "ops-chip-ok"
                        : "ops-chip-muted"
                    }`}
                  >
                    {r.status}
                    {r.status === "applied" && r.applied_at
                      ? ` · ${formatDate(r.applied_at)}`
                      : ""}
                  </span>
                </td>
                <td data-label="Actions">
                  {r.status === "pending" && (
                    <CancelScheduleButton changeId={r.id} />
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  No scheduled changes. Create one from the Models page
                  (&quot;Schedule…&quot; per row).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {done.length > 0 && (
        <p className="ops-footnote">
          Showing {rows.length} rows ({pending.length} pending, {done.length}{" "}
          applied/cancelled).
        </p>
      )}
    </div>
  );
}
