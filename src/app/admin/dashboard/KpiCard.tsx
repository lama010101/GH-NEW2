// KpiCard — KPI cell for the ops-console Overview strip.
// Task: AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002
//
// Uses the pinned ops tokens (ops-ok / ops-bad / ops-warn); sentence-case
// label, tabular-numeral value, no uppercase tracking, no card shadow.

export type KpiTone = "success" | "danger" | "gold" | null;

const TONE_COLOR: Record<Exclude<KpiTone, null>, string> = {
  success: "var(--ops-ok)",
  danger: "var(--ops-bad)",
  gold: "var(--ops-warn)",
};

export function KpiCard({
  label,
  value,
  subtext,
  tone,
}: {
  label: string;
  value: string;
  subtext?: string;
  tone?: KpiTone;
}) {
  const color = tone ? TONE_COLOR[tone] : "var(--ops-ink)";
  return (
    <div className="ops-kpi">
      <div className="ops-kpi-label">{label}</div>
      <div className="ops-kpi-value" style={{ color }}>
        {value}
      </div>
      {subtext && <div className="ops-kpi-label" style={{ marginTop: 4 }}>{subtext}</div>}
    </div>
  );
}
