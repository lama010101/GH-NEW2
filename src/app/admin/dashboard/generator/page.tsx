import Link from "next/link";
import { requireAdmin } from "@/core/adminAuth";
import { getDbPool } from "@/server/db";
import { CandidateTable, type CandidateRow } from "./CandidateTable";
import { CANDIDATE_STATUSES, statusChipClass } from "./formatCandidates";

export const dynamic = "force-dynamic";

// Generator — read-only admin list for public.generation_candidates
// (GEN-BUILD-CANDIDLIST-1028-001). Follows the existing dashboard
// convention: service-role pg pool (getDbPool), parameterized SQL only.
// requireAdmin() is the first awaited call — defense in depth, since the
// middleware /admin gate is skipped when NODE_ENV !== 'production'.

const PAGE_SIZE = 50;

type SearchParams = { [key: string]: string | string[] | undefined };

function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function GeneratorCandidatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const pool = getDbPool();

  const statusRaw = getParam(searchParams, "status") ?? "";
  const status = (CANDIDATE_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : null;
  const page = Math.max(
    1,
    parseInt(getParam(searchParams, "page") || "1", 10) || 1
  );
  const offset = (page - 1) * PAGE_SIZE;

  const [rowsRes, countRes, statusRes] = await Promise.all([
    pool.query<CandidateRow>(
      `
      SELECT
        id, status, wikidata_qid, wd_label, title, event_year,
        coord_source, sitelinks, quota_bucket, checks, event_id,
        created_at::text AS created_at
      FROM public.generation_candidates
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [status, PAGE_SIZE, offset]
    ),
    pool.query<{ total: number }>(
      `
      SELECT COUNT(*)::int AS total
      FROM public.generation_candidates
      WHERE ($1::text IS NULL OR status = $1)
      `,
      [status]
    ),
    pool.query<{ status: string; n: number }>(
      `
      SELECT status, COUNT(*)::int AS n
      FROM public.generation_candidates
      GROUP BY status
      `
    ),
  ]);

  const rows = rowsRes.rows;
  const total = countRes.rows[0]?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const perStatus = new Map(statusRes.rows.map((r) => [r.status, r.n]));

  function makeLink(updates: {
    status?: string | null;
    page?: number;
  }): string {
    const next = new URLSearchParams();
    const s = updates.status === undefined ? status : updates.status;
    const p = updates.page === undefined ? 1 : updates.page;
    if (s) next.set("status", s);
    if (p > 1) next.set("page", String(p));
    const qs = next.toString();
    return `/admin/dashboard/generator${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">Generator</h1>
          <p className="ops-pagesub">
            {total.toLocaleString()} candidates
            {status ? ` · status=${status}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {CANDIDATE_STATUSES.map((s) => (
            <span key={s} className={statusChipClass(s)}>
              {s} {perStatus.get(s) ?? 0}
            </span>
          ))}
        </div>
      </header>

      <div className="ops-toolbar">
        <span>
          Status:
          <Link href={makeLink({ status: null })} className="ops-btn">
            All
          </Link>{" "}
          {CANDIDATE_STATUSES.map((s) =>
            s === status ? (
              <span key={s} className="ops-chip ops-chip-ok">
                {s}
              </span>
            ) : (
              <Link key={s} href={makeLink({ status: s })} className="ops-btn">
                {s}
              </Link>
            )
          )}
        </span>
      </div>

      <CandidateTable rows={rows} />

      {totalPages > 1 && (
        <div className="ops-pagination">
          <div>
            Page {page} of {totalPages} ({total.toLocaleString()} candidates)
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={makeLink({ page: page - 1 })} className="ops-btn">
                Previous
              </Link>
            ) : (
              <span className="ops-btn" style={{ opacity: 0.5 }}>
                Previous
              </span>
            )}
            {page < totalPages ? (
              <Link href={makeLink({ page: page + 1 })} className="ops-btn">
                Next
              </Link>
            ) : (
              <span className="ops-btn" style={{ opacity: 0.5 }}>
                Next
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
