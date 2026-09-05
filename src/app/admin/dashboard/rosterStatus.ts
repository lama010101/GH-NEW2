// Roster status derivation — single source of truth for per-model health
// status, shared by the Overview fleet-exceptions panel and the Models table
// (AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002). Extracted from the former
// RosterHealthTable component; the full-roster table itself was removed from
// Overview by the approved plan (fleet exceptions only).

export type RosterStatus = "active" | "idle" | "erroring" | "disabled";

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

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ERROR_THRESHOLD = 0.05;

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

// Maps a RosterStatus to the ops status bar tier used by table row edges.
// idle is healthy (no action needed), so it tiers as "ok".
export function statusTier(status: RosterStatus): "ok" | "bad" | "off" {
  switch (status) {
    case "active":
    case "idle":
      return "ok";
    case "erroring":
      return "bad";
    default:
      return "off";
  }
}
