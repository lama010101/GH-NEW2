// Pure presentational table for the admin Generator candidate list
// (GEN-BUILD-CANDIDLIST-1028-001). No data fetching — the server page
// supplies rows; fixtures drive the render test. Read-only: no actions.

import {
  formatCreatedAt,
  formatEventYear,
  statusChipClass,
  summarizeChecks,
  summarizeQuotaBucket,
} from "./formatCandidates";

export type CandidateRow = {
  id: string;
  status: string;
  wikidata_qid: string | null;
  wd_label: string | null;
  title: string | null;
  event_year: number | null;
  coord_source: string | null;
  sitelinks: number | null;
  quota_bucket: unknown;
  checks: unknown;
  event_id: string | null;
  created_at: string;
};

export function CandidateTable({ rows }: { rows: CandidateRow[] }) {
  return (
    <div className="ops-panel-flush">
      <table className="ops-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Wikidata</th>
            <th>Label / Title</th>
            <th className="num">Year</th>
            <th>Coords</th>
            <th className="num">Sitelinks</th>
            <th>Bucket</th>
            <th>Checks</th>
            <th>Event</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td data-label="Status">
                <span className={statusChipClass(row.status)}>{row.status}</span>
              </td>
              <td data-label="Wikidata">
                {row.wikidata_qid ? (
                  <a
                    href={`https://www.wikidata.org/wiki/${row.wikidata_qid}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="ops-mono"
                  >
                    {row.wikidata_qid}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td data-label="Label / Title">
                <span className="ops-cellname">
                  <span>
                    <span className="ops-truncate">
                      {row.wd_label ?? row.title ?? "—"}
                    </span>
                    {row.wd_label && row.title && (
                      <span
                        className="block text-xs"
                        style={{ color: "var(--ops-mute)" }}
                      >
                        {row.title}
                      </span>
                    )}
                  </span>
                </span>
              </td>
              <td className="num" data-label="Year">
                {formatEventYear(row.event_year)}
              </td>
              <td data-label="Coords">{row.coord_source ?? "—"}</td>
              <td className="num" data-label="Sitelinks">
                {row.sitelinks === null ? "—" : row.sitelinks.toLocaleString()}
              </td>
              <td data-label="Bucket">
                <span className="ops-truncate">
                  {summarizeQuotaBucket(row.quota_bucket)}
                </span>
              </td>
              <td data-label="Checks">{summarizeChecks(row.checks)}</td>
              <td data-label="Event">{row.event_id ? "yes" : "no"}</td>
              <td data-label="Created">
                <span className="ops-mono">
                  {formatCreatedAt(row.created_at)}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10}>
                <div className="ops-empty">
                  No candidates yet. Run
                  scripts/generation/discover-wikidata.ts
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
