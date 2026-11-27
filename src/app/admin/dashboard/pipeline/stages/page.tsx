import Link from "next/link";
import { requireAdmin } from "@/core/adminAuth";
import {
  AUTOMATION_LABELS,
  PIPELINE_KPI_BY_ID,
  PIPELINE_SAFEGUARD_BY_ID,
  PIPELINE_STEPS,
  type PipelineStep,
} from "@/core/pipelineRegistry";
import { getDbPool } from "@/server/db";
import { StatusBadge } from "../StatusBadge";
import { collectPipelineKpis, formatKpiValue, type PipelineKpiResult, type PipelineQueryable } from "../pipelineQueries";
import styles from "../pipeline.module.css";

export const dynamic = "force-dynamic";

const STAGE_ORDER: readonly PipelineStep["stage"][] = ["collect", "verify", "images", "publish"];

function listOrDash(values: readonly string[]) {
  if (values.length === 0) return <span className={styles.smallNote}>—</span>;
  return (
    <ul className={styles.detailList}>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

function StepCard({
  step,
  kpis,
}: {
  step: PipelineStep;
  kpis: Record<string, PipelineKpiResult>;
}) {
  return (
    <article className={styles.stepCard} id={step.id}>
      <div className={styles.stepHead}>
        <div>
          <h3 className={styles.stepTitle}>{step.title}</h3>
          <p className={styles.stepMeta}>
            {step.stage} · {step.track} track · {AUTOMATION_LABELS[step.automation]} · {step.deterministicVsLlm}
          </p>
        </div>
        <StatusBadge status={step.status} />
      </div>

      <p className={styles.stepSummary}>{step.summary}</p>

      <div className={styles.detailGrid}>
        <section className={styles.detailBlock}>
          <h4 className={styles.detailTitle}>How it works</h4>
          {listOrDash(step.how)}
        </section>
        <section className={styles.detailBlock}>
          <h4 className={styles.detailTitle}>Inputs</h4>
          {listOrDash(step.inputs)}
        </section>
        <section className={styles.detailBlock}>
          <h4 className={styles.detailTitle}>Outputs</h4>
          {listOrDash(step.outputs)}
        </section>
        <section className={styles.detailBlock}>
          <h4 className={styles.detailTitle}>Models</h4>
          {step.models.length === 0 ? (
            <span className={styles.smallNote}>None declared</span>
          ) : (
            <div className={styles.inlineChips}>
              {step.models.map((model) => (
                <span className={styles.inlineChip} key={model}>{model}</span>
              ))}
            </div>
          )}
        </section>
        <section className={styles.detailBlock}>
          <h4 className={styles.detailTitle}>Safeguards</h4>
          {step.safeguards.length === 0 ? (
            <span className={styles.smallNote}>None declared</span>
          ) : (
            <ul className={styles.detailList}>
              {step.safeguards.map((id) => (
                <li key={id}>{PIPELINE_SAFEGUARD_BY_ID[id]?.title ?? id}</li>
              ))}
            </ul>
          )}
        </section>
        <section className={styles.detailBlock}>
          <h4 className={styles.detailTitle}>KPIs with live values</h4>
          {step.kpis.length === 0 ? (
            <span className={styles.smallNote}>No KPI declared for this step</span>
          ) : (
            <div className={styles.kpiInline}>
              {step.kpis.map((id) => {
                const kpi = PIPELINE_KPI_BY_ID[id];
                return (
                  <div className={styles.kpiInlineRow} key={id}>
                    <span>{kpi?.label ?? id}</span>
                    <span>{kpi ? formatKpiValue(kpis[kpi.liveKey]) : "not measured"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <dl className={styles.metaTable}>
        <dt>Owner task</dt>
        <dd>{step.ownerTask ?? "—"}</dd>
        <dt>Last updated</dt>
        <dd>{step.lastUpdated}</dd>
        <dt>Done when</dt>
        <dd>{step.doneWhen || "—"}</dd>
        <dt>Note</dt>
        <dd>{step.note || "—"}</dd>
        <dt>Code paths</dt>
        <dd>{step.codePaths.length > 0 ? step.codePaths.join(", ") : "—"}</dd>
      </dl>
    </article>
  );
}

export default async function PipelineStagesPage() {
  await requireAdmin();
  const pool = getDbPool();
  const kpis = await collectPipelineKpis(pool as unknown as PipelineQueryable);

  return (
    <div className="ops-page">
      <div className={styles.pageStack}>
        <header className="ops-pagehead">
          <div>
            <h1 className="ops-h1">Pipeline stages</h1>
            <p className="ops-pagesub">
              Every declared pipeline step, its ownership, mechanics, safeguards, and live KPI values
            </p>
          </div>
          <Link href="/admin/dashboard/pipeline" className="ops-btn">
            Overview
          </Link>
        </header>

        {STAGE_ORDER.map((stage) => {
          const steps = PIPELINE_STEPS.filter((step) => step.stage === stage);
          return (
            <section className={styles.stageSection} key={stage} aria-label={`${stage} stage`}>
              <h2 className={styles.stageHeading}>{stage}</h2>
              {steps.map((step) => (
                <StepCard key={step.id} step={step} kpis={kpis} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
