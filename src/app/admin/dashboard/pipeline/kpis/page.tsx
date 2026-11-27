import Link from "next/link";
import { requireAdmin } from "@/core/adminAuth";
import { PIPELINE_KPIS } from "@/core/pipelineRegistry";
import { getDbPool } from "@/server/db";
import { collectPipelineKpis, formatKpiValue, type PipelineKpiState, type PipelineQueryable } from "../pipelineQueries";
import styles from "../pipeline.module.css";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<PipelineKpiState, string> = {
  ok: "ok",
  not_built: "not built",
  error: "error",
};

const STATE_CLASS: Record<PipelineKpiState, string> = {
  ok: styles.stateOk,
  not_built: styles.stateNotBuilt,
  error: styles.stateError,
};

export default async function PipelineKpisPage() {
  await requireAdmin();
  const pool = getDbPool();
  const results = await collectPipelineKpis(pool as unknown as PipelineQueryable);

  return (
    <div className="ops-page">
      <div className={styles.pageStack}>
        <header className="ops-pagehead">
          <div>
            <h1 className="ops-h1">Pipeline KPIs</h1>
            <p className="ops-pagesub">
              Definitions, formulas, explicit denominators, declared targets, live values, and sources
            </p>
          </div>
          <Link href="/admin/dashboard/pipeline" className="ops-btn">
            Overview
          </Link>
        </header>

        <p className={styles.notice}>
          Percentages never mix denominators: each row states the denominator next to its formula and
          the live formatter repeats it in the value text.
        </p>

        <div className={styles.tableWrap}>
          <table className="ops-table">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Definition</th>
                <th>Formula</th>
                <th>Denominator</th>
                <th>Target</th>
                <th>Live value</th>
                <th>State</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {PIPELINE_KPIS.map((kpi) => {
                const result = results[kpi.liveKey];
                return (
                  <tr key={kpi.id}>
                    <td>
                      <strong>{kpi.label}</strong>
                      <div className={styles.smallNote}>{kpi.id}</div>
                    </td>
                    <td>{kpi.definition}</td>
                    <td>{kpi.formula}</td>
                    <td>{kpi.denominator}</td>
                    <td>{kpi.target}</td>
                    <td className={styles.numeric}>{formatKpiValue(result)}</td>
                    <td className={STATE_CLASS[result?.state ?? "error"]}>
                      {STATE_LABEL[result?.state ?? "error"]}
                    </td>
                    <td>{kpi.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
