import { getDbPool } from "@/server/db";
import { fetchTrashedPlayers } from "../queries";
import { RestorePlayerButton } from "./RestorePlayerButton";

export const dynamic = "force-dynamic";

// Trash view for soft-deleted AI players (AIP-BUILD-PRODASHBOARD-FULLUIX-002).
// Soft delete = ai_players.deleted_at flag; restore clears it. No hard DELETE.

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

export default async function TrashPage() {
  const pool = getDbPool();
  const rows = await fetchTrashedPlayers(pool);

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Trash</h1>
          <p className="ops-pagesub">
            {rows.length} trashed AI player{rows.length === 1 ? "" : "s"} ·
            trashed players are excluded from the roster and catalog until
            restored
          </p>
        </div>
      </header>

      <div className="ops-panel-flush">
        <table className="ops-table">
          <thead>
            <tr>
              <th>AI player</th>
              <th>Model</th>
              <th>Provider</th>
              <th>Trashed at</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="AI player">{r.name}</td>
                <td data-label="Model">
                  <span className="ops-mono" style={{ color: "var(--ops-mute)" }}>
                    {r.model_id}
                  </span>
                </td>
                <td data-label="Provider">{r.provider}</td>
                <td data-label="Trashed at" style={{ color: "var(--ops-mute)" }}>
                  {formatDate(r.deleted_at)}
                </td>
                <td data-label="Actions">
                  <RestorePlayerButton playerId={r.id} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5}>
                  Trash is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
