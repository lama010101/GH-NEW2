// RosterHealthTable — compact per-model roster health table for the Phase A
// Overview home surface. One row per model with a status badge, mode pills,
// 24h calls/errors/cost, vs-cap indicator, and last-seen relative time.
// Task: AIP-BUILD-PRODASHBOARD-OVERVIEWKPI-001
//
// Uses existing gh-* design tokens only.

import { StatusBadge, type RosterStatus } from "./StatusBadge";

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ERROR_THRESHOLD = 0.05;

export type RosterHealthDisplayRow = {
  id: string;
  name: string;
  model_id: string;
  is_active: boolean;
  is_active_practice: boolean;
  is_active_daily: boolean;
  daily_cost_cap_usd: number | null;
  calls_24h: number;
  errors_24h: number;
  cost_24h: number;
  last_call_at: string | null;
  last_seen_relative: string;
};

export function deriveStatus(row: {
  is_active: boolean;
  calls_24h: number;
  errors_24h: number;
  last_call_at: string | null;
}): RosterStatus {
  if (!row.is_active) return "disabled";
  const errorRate =
    row.calls_24h > 0 ? row.errors_24h / row.calls_24h : 0;
  if (errorRate > ERROR_THRESHOLD) return "erroring";
  const lastCallMs = row.last_call_at
    ? new Date(row.last_call_at).getTime()
    : 0;
  const ageMs = Date.now() - lastCallMs;
  if (ageMs <= FIFTEEN_MIN_MS) return "active";
  return "idle";
}

function formatCost(value: number): string {
  if (value === 0) return "0.000000";
  return value.toFixed(6);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function ModePill({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold"
      style={{
        color: enabled ? "var(--gh-success)" : "var(--gh-text-muted)",
        background: enabled
          ? "rgba(34, 197, 94, 0.12)"
          : "rgba(255, 255, 255, 0.04)",
        fontSize: "var(--font-2xs)",
      }}
    >
      {label}
    </span>
  );
}

function VsCapCell({
  cost24h,
  dailyCap,
}: {
  cost24h: number;
  dailyCap: number | null;
}) {
  if (!dailyCap || dailyCap <= 0) {
    return <span style={{ color: "var(--gh-text-muted)" }}>—</span>;
  }
  const pct = (cost24h / dailyCap) * 100;
  const color =
    pct > 100
      ? "var(--gh-danger)"
      : pct >= 80
      ? "var(--gh-gold)"
      : "var(--gh-success)";
  return (
    <span className="whitespace-nowrap" style={{ color }}>
      {formatPercent(pct)}
    </span>
  );
}

export function RosterHealthTable({
  rows,
}: {
  rows: RosterHealthDisplayRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr
            className="border-b border-[var(--gh-border-default)]"
            style={{ color: "var(--gh-text-secondary)" }}
          >
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Model</th>
            <th className="px-4 py-3 text-center font-semibold">Modes</th>
            <th className="px-4 py-3 text-right font-semibold">Calls 24h</th>
            <th className="px-4 py-3 text-right font-semibold">Err% 24h</th>
            <th className="px-4 py-3 text-right font-semibold">Cost 24h</th>
            <th className="px-4 py-3 text-right font-semibold">vs Cap</th>
            <th className="px-4 py-3 font-semibold">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = deriveStatus(row);
            const errPct =
              row.calls_24h > 0
                ? (row.errors_24h / row.calls_24h) * 100
                : 0;
            const errColor =
              errPct > 5
                ? "var(--gh-danger)"
                : errPct > 1
                ? "var(--gh-gold)"
                : "var(--gh-text-primary)";
            return (
              <tr
                key={row.id}
                className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
              >
                <td className="px-4 py-3">
                  <StatusBadge status={status} />
                </td>
                <td
                  className="max-w-[220px] truncate px-4 py-3"
                  title={row.model_id}
                >
                  {row.name}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-1">
                    <ModePill label="P" enabled={row.is_active_practice} />
                    <ModePill label="D" enabled={row.is_active_daily} />
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {row.calls_24h.toLocaleString()}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-3 text-right"
                  style={{ color: errColor }}
                >
                  {row.calls_24h > 0 ? formatPercent(errPct) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {formatCost(row.cost_24h)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <VsCapCell
                    cost24h={row.cost_24h}
                    dailyCap={row.daily_cost_cap_usd}
                  />
                </td>
                <td
                  className="whitespace-nowrap px-4 py-3"
                  style={{ color: "var(--gh-text-secondary)" }}
                >
                  {row.last_seen_relative}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td
                className="px-4 py-6"
                style={{ color: "var(--gh-text-secondary)" }}
                colSpan={8}
              >
                No models found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
