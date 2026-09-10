import Link from "next/link";
import { getDbPool } from "@/server/db";
import { fetchStageSummary, type StageSummaryRow } from "./queries";

export const dynamic = "force-dynamic";

// Historian's Journey — admin candidate-review stage list
// (HJ-BUILD-ADMINREVIEW-CANDIDATES-001). Lists the 10 journey_stages rows
// with per-stage candidate counts (total / approved / pending). Each row
// links to the [stageId] drilldown where candidates can be approved/rejected.

export default async function JourneyStageListPage() {
  const pool = getDbPool();
  const stages = await fetchStageSummary(pool);

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Historian&apos;s Journey</h1>
          <p className="ops-pagesub">
            {stages.length} stages · candidate review
          </p>
        </div>
      </header>

      <div className="ops-panel-flush">
        <table className="ops-table">
          <thead>
            <tr>
              <th className="num">Stage</th>
              <th className="num">Min accuracy</th>
              <th className="num">Pool size</th>
              <th className="num">Approved</th>
              <th className="num">Pending</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((row: StageSummaryRow) => (
              <tr key={row.id}>
                <td className="num" data-label="Stage">
                  <Link
                    href={`/admin/dashboard/journey/${row.id}`}
                    className="ops-celllink"
                  >
                    <span className="ops-cellname">
                      <span className="ops-truncate">Stage {row.stage_number}</span>
                    </span>
                  </Link>
                </td>
                <td className="num" data-label="Min accuracy">
                  {row.min_accuracy_pct}%
                </td>
                <td className="num" data-label="Pool size">
                  {row.pool_size}
                </td>
                <td className="num" data-label="Approved">
                  {row.approved_candidates}
                </td>
                <td className="num" data-label="Pending">
                  {row.pending_candidates}
                </td>
                <td className="num" data-label="Total">
                  {row.total_candidates}
                </td>
              </tr>
            ))}
            {stages.length === 0 && (
              <tr>
                <td colSpan={6}>No journey stages found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
