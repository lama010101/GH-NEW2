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
    <section>
      <h1 className="mb-1 text-lg font-semibold">Trash</h1>
      <p className="mb-4 text-sm text-gh-text-sec">
        {rows.length} trashed AI player{rows.length === 1 ? "" : "s"} · trashed
        players are excluded from the roster and catalog until restored
      </p>

      <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
              <th className="px-4 py-3 font-semibold">AI player</th>
              <th className="px-4 py-3 font-semibold">Model</th>
              <th className="px-4 py-3 font-semibold">Provider</th>
              <th className="px-4 py-3 font-semibold">Trashed at</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
              >
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3 text-gh-text-sec">{r.model_id}</td>
                <td className="px-4 py-3">{r.provider}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gh-text-sec">
                  {formatDate(r.deleted_at)}
                </td>
                <td className="px-4 py-3">
                  <RestorePlayerButton playerId={r.id} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-gh-text-sec" colSpan={5}>
                  Trash is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
