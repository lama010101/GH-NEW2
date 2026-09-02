// StatusBadge — roster health status chip for the ops-console surfaces.
// Task: AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002
//
// Squared 2px chip with status color as the only chroma (ops tokens);
// replaces the former translucent dark-theme tint pill.

export type RosterStatus = "active" | "idle" | "erroring" | "disabled";

const STATUS_CONFIG: Record<RosterStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "var(--ops-ok)" },
  idle: { label: "Idle", color: "var(--ops-mute)" },
  erroring: { label: "Erroring", color: "var(--ops-bad)" },
  disabled: { label: "Disabled", color: "var(--ops-mute)" },
};

export function StatusBadge({ status }: { status: RosterStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="ops-chip"
      style={{ color: cfg.color, borderColor: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}
