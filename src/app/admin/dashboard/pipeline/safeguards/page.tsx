import Link from "next/link";
import { requireAdmin } from "@/core/adminAuth";
import {
  AUTOMATION_LABELS,
  PIPELINE_SAFEGUARDS,
  PIPELINE_STEPS,
  type Automation,
} from "@/core/pipelineRegistry";
import { StatusBadge } from "../StatusBadge";
import styles from "../pipeline.module.css";

export const dynamic = "force-dynamic";

const AUTOMATION_ORDER: readonly Automation[] = [
  "cron",
  "on_demand_script",
  "manual_devin",
  "manual_owner",
  "in_app_runtime",
];

export default async function PipelineSafeguardsPage() {
  await requireAdmin();
  return (
    <div className="ops-page">
      <div className={styles.pageStack}>
        <header className="ops-pagehead">
          <div>
            <h1 className="ops-h1">Pipeline safeguards</h1>
            <p className="ops-pagesub">
              Protective mechanisms, enforcement layer, status, and what is automated versus manual
            </p>
          </div>
          <Link href="/admin/dashboard/pipeline" className="ops-btn">
            Overview
          </Link>
        </header>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Safeguards</h2>
          <p className={styles.panelSub}>
            Statuses are declarations from the registry; owner tasks keep them current as pipeline work lands.
          </p>
          <div className={styles.tableWrap}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Safeguard</th>
                  <th>Protects</th>
                  <th>Mechanism</th>
                  <th>Enforced by</th>
                  <th>Status</th>
                  <th>Owner task</th>
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {PIPELINE_SAFEGUARDS.map((safeguard) => (
                  <tr key={safeguard.id}>
                    <td>
                      <strong>{safeguard.title}</strong>
                      <div className={styles.smallNote}>{safeguard.id}</div>
                    </td>
                    <td>{safeguard.protects}</td>
                    <td>{safeguard.mechanism}</td>
                    <td>{safeguard.enforcedBy}</td>
                    <td><StatusBadge status={safeguard.status} /></td>
                    <td>{safeguard.ownerTask ?? "—"}</td>
                    <td className={styles.numeric}>{safeguard.lastUpdated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Automated vs manual matrix</h2>
          <p className={styles.panelSub}>
            Built only from each step&apos;s declared automation field in the registry.
          </p>
          <div className={styles.matrixWrap}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Status</th>
                  {AUTOMATION_ORDER.map((automation) => (
                    <th key={automation} className="num">{AUTOMATION_LABELS[automation]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PIPELINE_STEPS.map((step) => (
                  <tr key={step.id}>
                    <td>
                      <Link href={`/admin/dashboard/pipeline/stages#${step.id}`} className="ops-celllink">
                        {step.title}
                      </Link>
                    </td>
                    <td><StatusBadge status={step.status} /></td>
                    {AUTOMATION_ORDER.map((automation) => (
                      <td className={styles.matrixMark} key={automation}>
                        {step.automation === automation ? "yes" : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
