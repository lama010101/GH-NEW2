import Link from "next/link";
import { notFound } from "next/navigation";
import { getDbPool } from "@/server/db";
import {
  fetchStageHeader,
  fetchStageCandidates,
  type CandidateRow,
} from "../queries";
import { CandidateRowActions } from "./CandidateRowActions";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

// Historian's Journey — admin candidate-review drilldown for one stage
// (HJ-BUILD-ADMINREVIEW-CANDIDATES-001). Shows the stage's candidate events
// joined from journey_stage_events → events, with approve/reject actions.

export default async function JourneyStageDrilldownPage({
  params,
}: {
  params: { stageId: string };
  searchParams: SearchParams;
}) {
  const pool = getDbPool();
  const stageId = params.stageId;

  // Validate stageId is a UUID — same guard as events/[eventId]/page.tsx.
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(stageId)) {
    notFound();
  }

  const [stage, candidates] = await Promise.all([
    fetchStageHeader(pool, stageId),
    fetchStageCandidates(pool, stageId),
  ]);

  if (!stage) {
    notFound();
  }

  return (
    <div className="ops-page">
      <div className="mb-4 flex items-center gap-4">
        <Link href="/admin/dashboard/journey" className="ops-btn">
          Journey
        </Link>
      </div>

      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Stage {stage.stage_number}</h1>
          <p className="ops-pagesub">
            Min accuracy: {stage.min_accuracy_pct}% · Pool size:{" "}
            {stage.pool_size} · {candidates.length} candidates
          </p>
        </div>
      </header>

      <div className="ops-panel-flush">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Event</th>
              <th className="num">Year</th>
              <th>Category</th>
              <th>Celebrity</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((row: CandidateRow) => (
              <tr key={row.id}>
                <td data-label="Event">
                  <span className="ops-cellname">
                    <span>
                      <span className="ops-truncate">{row.title}</span>
                      {row.description && (
                        <span
                          className="block text-xs"
                          style={{ color: "var(--ops-mute)" }}
                        >
                          {row.description.length > 120
                            ? `${row.description.slice(0, 120)}…`
                            : row.description}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="num" data-label="Year">
                  {row.event_year}
                </td>
                <td data-label="Category">{row.category ?? "—"}</td>
                <td data-label="Celebrity">
                  {row.celebrity ? "Yes" : "No"}
                </td>
                <td data-label="Status">
                  {row.approved_by ? (
                    <span className="ops-chip">Approved</span>
                  ) : (
                    <span className="ops-chip">Pending</span>
                  )}
                </td>
                <td data-label="Actions">
                  <CandidateRowActions
                    jseId={row.id}
                    approved={row.approved_by !== null}
                  />
                </td>
              </tr>
            ))}
            {candidates.length === 0 && (
              <tr>
                <td colSpan={6}>No candidates for this stage.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
