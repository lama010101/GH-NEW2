import Link from "next/link";
import { requireAdmin } from "@/core/adminAuth";
import {
  PIPELINE_KPI_BY_ID,
  PIPELINE_STEPS,
  STATUS_DEFINITIONS,
  STATUS_ORDER,
  registryLastUpdated,
} from "@/core/pipelineRegistry";
import { getDbPool } from "@/server/db";
import { PipelineDiagram } from "./PipelineDiagram";
import { StatusBadge } from "./StatusBadge";
import { collectPipelineKpis, formatKpiValue, type PipelineQueryable } from "./pipelineQueries";
import styles from "./pipeline.module.css";

export const dynamic = "force-dynamic";

const HEADLINE_KEYS = [
  "events_in_play",
  "events_checked",
  "verdict_mix",
  "pool_95",
  "candidates_by_status",
  "verify_spend_usd",
] as const;

export default async function PipelineOverviewPage() {
  await requireAdmin();
  const pool = getDbPool();
  const kpis = await collectPipelineKpis(pool as unknown as PipelineQueryable);

  const statusCounts = new Map(
    STATUS_ORDER.map((status) => [
      status,
      PIPELINE_STEPS.filter((step) => step.status === status).length,
    ])
  );

  return (
    <div className="ops-page">
      <div className={styles.pageStack}>
        <header className="ops-pagehead">
          <div>
            <h1 className="ops-h1">Pipeline</h1>
            <p className="ops-pagesub">
              Metadata collection, fact verification, image generation, and publication readiness
            </p>
          </div>
        </header>

        <p className={styles.notice}>
          Statuses are declared in src/core/pipelineRegistry.ts and updated by each pipeline task.
          Numbers are live from the database.
        </p>

        <section className={styles.kpiGrid} aria-label="Headline pipeline KPIs">
          {HEADLINE_KEYS.map((key) => {
            const kpi = PIPELINE_KPI_BY_ID[key];
            return (
              <div className={styles.kpiTile} key={key}>
                <p className={styles.kpiLabel}>{kpi.label}</p>
                <p className={styles.kpiValue}>{formatKpiValue(kpis[key])}</p>
              </div>
            );
          })}
        </section>

        <section className={styles.panel} aria-label="Pipeline visualization">
          <h2 className={styles.panelTitle}>Whole-pipeline diagram</h2>
          <p className={styles.panelSub}>
            The legacy and generation tracks converge on the same verification, reliability, image,
            ready-gate, translation, and play spine.
          </p>
          <PipelineDiagram />
        </section>

        <section className={styles.panel} aria-label="Step status summary">
          <h2 className={styles.panelTitle}>Status summary</h2>
          <p className={styles.panelSub}>Last registry update: {registryLastUpdated()}</p>
          <div className={styles.statusGrid}>
            {STATUS_ORDER.map((status) => (
              <div className={styles.statusCount} key={status} title={STATUS_DEFINITIONS[status]}>
                <StatusBadge status={status} />
                <span className={styles.statusNumber}>{statusCounts.get(status) ?? 0}</span>
                <span className={styles.smallNote}>{STATUS_DEFINITIONS[status]}</span>
              </div>
            ))}
          </div>
        </section>

        <nav className={styles.linkRow} aria-label="Pipeline detail pages">
          <Link href="/admin/dashboard/pipeline/stages">Every step in detail</Link>
          <Link href="/admin/dashboard/pipeline/kpis">KPI catalogue</Link>
          <Link href="/admin/dashboard/pipeline/safeguards">Safeguards and automation</Link>
        </nav>
      </div>
    </div>
  );
}
