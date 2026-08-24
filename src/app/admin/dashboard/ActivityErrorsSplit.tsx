// ActivityErrorsSplit — compact 2-column split for the Phase A Overview
// home surface. Left = last 10 activity rows, right = top 5 recent errors.
// Task: AIP-BUILD-PRODASHBOARD-OVERVIEWKPI-001
//
// Uses existing gh-* design tokens only (--gh-mini-card-bg, --gh-danger,
// --gh-gold, --gh-text-secondary, --gh-text-muted, etc.).

import Link from "next/link";
import type { ErrorBucket } from "./queries";

export type CompactActivityRow = {
  id: string;
  model_name: string;
  mode: string;
  round_accuracy: number | null;
  cost: number;
  created_at: string;
  created_at_relative: string;
};

export type CompactErrorRow = {
  id: string;
  model_name: string;
  error: string;
  error_type: ErrorBucket | "other";
  created_at: string;
  created_at_relative: string;
};

const ERROR_TYPE_LABEL: Record<ErrorBucket | "other", string> = {
  rate_limit: "Rate limit",
  not_found: "404",
  parse: "Parse",
  other: "Other",
};

const ERROR_TYPE_COLOR: Record<ErrorBucket | "other", string> = {
  rate_limit: "var(--gh-gold)",
  not_found: "var(--gh-text-muted)",
  parse: "var(--gh-danger)",
  other: "var(--gh-text-muted)",
};

function formatCost(value: number): string {
  if (value === 0) return "0.000000";
  return value.toFixed(6);
}

function formatAccuracy(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

function ErrorTypePill({ type }: { type: ErrorBucket | "other" }) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{
        color: ERROR_TYPE_COLOR[type],
        background: "rgba(255, 255, 255, 0.06)",
        fontSize: "var(--font-2xs)",
      }}
    >
      {ERROR_TYPE_LABEL[type]}
    </span>
  );
}

export function ActivityErrorsSplit({
  activity,
  errors,
  viewAllActivityHref,
  viewAllErrorsHref,
}: {
  activity: CompactActivityRow[];
  errors: CompactErrorRow[];
  viewAllActivityHref: string;
  viewAllErrorsHref: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Recent activity */}
      <div
        className="rounded-2xl border border-[var(--gh-border-default)] p-4"
        style={{ background: "var(--gh-mini-card-bg)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3
            className="font-semibold"
            style={{ fontSize: "var(--font-lg)" }}
          >
            Recent activity
          </h3>
          <Link
            href={viewAllActivityHref}
            className="text-xs hover:underline"
            style={{ color: "var(--gh-text-secondary)" }}
          >
            View all →
          </Link>
        </div>
        {activity.length === 0 ? (
          <p
            className="py-4 text-center text-sm"
            style={{ color: "var(--gh-text-muted)" }}
          >
            No recent activity.
          </p>
        ) : (
          <div className="space-y-2">
            {activity.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="max-w-[140px] truncate"
                    title={row.model_name}
                  >
                    {row.model_name}
                  </span>
                  <span
                    className="whitespace-nowrap text-xs"
                    style={{
                      color: "var(--gh-text-muted)",
                      fontSize: "var(--font-2xs)",
                    }}
                  >
                    {row.mode}
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span
                    className="text-xs"
                    style={{
                      color: "var(--gh-text-secondary)",
                      fontSize: "var(--font-xs)",
                    }}
                  >
                    {formatAccuracy(row.round_accuracy)}
                  </span>
                  <span
                    className="whitespace-nowrap text-xs"
                    style={{
                      color: "var(--gh-text-secondary)",
                      fontSize: "var(--font-xs)",
                    }}
                  >
                    {formatCost(row.cost)}
                  </span>
                  <span
                    className="whitespace-nowrap text-xs"
                    style={{
                      color: "var(--gh-text-muted)",
                      fontSize: "var(--font-2xs)",
                    }}
                  >
                    {row.created_at_relative}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent errors */}
      <div
        className="rounded-2xl border border-[var(--gh-border-default)] p-4"
        style={{ background: "var(--gh-mini-card-bg)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3
            className="font-semibold"
            style={{ fontSize: "var(--font-lg)" }}
          >
            Recent errors
          </h3>
          <Link
            href={viewAllErrorsHref}
            className="text-xs hover:underline"
            style={{ color: "var(--gh-text-secondary)" }}
          >
            View all →
          </Link>
        </div>
        {errors.length === 0 ? (
          <p
            className="py-4 text-center text-sm"
            style={{ color: "var(--gh-text-muted)" }}
          >
            No recent errors.
          </p>
        ) : (
          <div className="space-y-2">
            {errors.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ErrorTypePill type={row.error_type} />
                  <span
                    className="max-w-[120px] truncate"
                    title={row.model_name}
                  >
                    {row.model_name}
                  </span>
                </div>
                <span
                  className="whitespace-nowrap text-xs"
                  style={{
                    color: "var(--gh-text-muted)",
                    fontSize: "var(--font-2xs)",
                  }}
                >
                  {row.created_at_relative}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
