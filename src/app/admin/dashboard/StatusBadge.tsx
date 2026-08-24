// StatusBadge — roster health status pill for the Phase A Overview surface.
// Task: AIP-BUILD-PRODASHBOARD-OVERVIEWKPI-001
//
// Uses existing gh-* design tokens only (--gh-success, --gh-danger,
// --gh-gold, --gh-text-muted, --gh-text-tertiary).

export type RosterStatus = "active" | "idle" | "erroring" | "disabled";

const STATUS_CONFIG: Record<
  RosterStatus,
  { label: string; color: string; bg: string }
> = {
  active: {
    label: "Active",
    color: "var(--gh-success)",
    bg: "rgba(34, 197, 94, 0.12)",
  },
  idle: {
    label: "Idle",
    color: "var(--gh-text-muted)",
    bg: "rgba(255, 255, 255, 0.06)",
  },
  erroring: {
    label: "Erroring",
    color: "var(--gh-danger)",
    bg: "rgba(239, 68, 68, 0.12)",
  },
  disabled: {
    label: "Disabled",
    color: "var(--gh-text-tertiary)",
    bg: "rgba(255, 255, 255, 0.04)",
  },
};

export function StatusBadge({ status }: { status: RosterStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{
        color: cfg.color,
        background: cfg.bg,
        fontSize: "var(--font-2xs)",
      }}
    >
      {cfg.label}
    </span>
  );
}
