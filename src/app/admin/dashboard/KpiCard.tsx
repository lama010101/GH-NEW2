// KpiCard — upgraded KPI card for the Phase A Overview home surface.
// Task: AIP-BUILD-PRODASHBOARD-OVERVIEWKPI-001
//
// Uses existing gh-* design tokens only (--gh-bg-elevated, --font-2xl,
// --font-2xs, --gh-success, --gh-danger, --gh-gold).

export type KpiTone = "success" | "danger" | "gold" | null;

const TONE_COLOR: Record<Exclude<KpiTone, null>, string> = {
  success: "var(--gh-success)",
  danger: "var(--gh-danger)",
  gold: "var(--gh-gold)",
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
  const color = tone ? TONE_COLOR[tone] : "var(--gh-text-primary)";
  return (
    <div
      className="rounded-2xl border border-[var(--gh-border-default)] p-4"
      style={{ background: "var(--gh-bg-elevated)" }}
    >
      <div
        className="text-xs uppercase tracking-wide"
        style={{
          color: "var(--gh-text-secondary)",
          fontSize: "var(--font-2xs)",
        }}
      >
        {label}
      </div>
      <div
        className="mt-1 font-semibold"
        style={{
          color,
          fontSize: "var(--font-2xl)",
          lineHeight: "1.3",
        }}
      >
        {value}
      </div>
      {subtext && (
        <div
          className="mt-1"
          style={{
            color: "var(--gh-text-muted)",
            fontSize: "var(--font-xs)",
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}
