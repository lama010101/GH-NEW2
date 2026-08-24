"use client";

import { Fragment, useState } from "react";
import type { EventLeaderboardRow } from "../queries";

export function EventLeaderboardTable({
  rows,
  filter,
}: {
  rows: EventLeaderboardRow[];
  filter: "all" | "ai" | "human";
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered =
    filter === "all"
      ? rows
      : rows.filter((r) => r.player_type === filter);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
            <th className="px-4 py-3 text-right font-semibold">#</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Player</th>
            <th className="px-4 py-3 text-right font-semibold">XP (0-200)</th>
            <th className="px-4 py-3 text-right font-semibold">Acc% (0-100)</th>
            <th className="px-4 py-3 text-right font-semibold">Loc</th>
            <th className="px-4 py-3 text-right font-semibold">Time/Yr</th>
            <th className="px-4 py-3 font-semibold">Mode</th>
            <th className="px-4 py-3 font-semibold">Session rank</th>
            <th className="px-4 py-3 font-semibold">AI feedback</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => {
            const rowKey = `${row.player_type}-${row.player_id}`;
            const isAi = row.player_type === "ai";
            const hasFeedback =
              isAi &&
              (row.reasoning ||
                row.critique_error ||
                row.image_quality_notes ||
                row.image_quality_score != null);
            const isOpen = expanded.has(rowKey);
            return (
              <Fragment key={rowKey}>
                <tr
                  className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-right text-gh-text-sec">
                    {idx + 1}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        isAi
                          ? "bg-[var(--gh-accent-soft)] text-[var(--gh-accent-text)]"
                          : "bg-[var(--gh-bg-elevated)] text-gh-text"
                      }`}
                    >
                      {isAi ? "AI" : "Human"}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3" title={row.display_name}>
                    {row.display_name || (
                      <span className="text-gh-text-sec">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    {row.score}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.accuracy_pct}%
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-gh-text-sec">
                    {row.location_score ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-gh-text-sec">
                    {row.time_score ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gh-text-sec">
                    {row.mode || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-gh-text-sec">
                    {row.rank ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {hasFeedback ? (
                      <button
                        type="button"
                        onClick={() => toggle(rowKey)}
                        className="text-gh-text-sec hover:underline"
                      >
                        {isOpen ? "Hide" : "Show"}
                      </button>
                    ) : (
                      <span className="text-gh-text-sec">—</span>
                    )}
                  </td>
                </tr>
                {isOpen && hasFeedback && (
                  <tr className="border-b border-[var(--gh-border-subtle)]">
                    <td colSpan={10} className="bg-gh-bg-elevated px-6 py-4">
                      <div className="space-y-2 text-xs">
                        {row.reasoning && (
                          <div>
                            <span className="font-semibold text-gh-text-sec">Reasoning: </span>
                            <span className="text-gh-text">{row.reasoning}</span>
                          </div>
                        )}
                        {row.critique_error && (
                          <div>
                            <span className="font-semibold text-gh-text-sec">Critique error: </span>
                            <span className="text-gh-text">{row.critique_error}</span>
                          </div>
                        )}
                        {row.image_quality_notes && (
                          <div>
                            <span className="font-semibold text-gh-text-sec">Image quality notes: </span>
                            <span className="text-gh-text">{row.image_quality_notes}</span>
                          </div>
                        )}
                        {row.image_quality_score != null && (
                          <div>
                            <span className="font-semibold text-gh-text-sec">Image quality score: </span>
                            <span className="text-gh-text">{row.image_quality_score}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-gh-text-sec" colSpan={10}>
                No rows for this filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function LeaderboardTypeFilter({
  current,
  basePath,
}: {
  current: "all" | "ai" | "human";
  basePath: string;
}) {
  const options: { value: "all" | "ai" | "human"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "ai", label: "AI only" },
    { value: "human", label: "Human only" },
  ];
  return (
    <div className="mb-4 flex gap-1">
      {options.map((o) => (
        <a
          key={o.value}
          href={`${basePath}?ptype=${o.value}`}
          className={`rounded px-3 py-1.5 text-sm ${
            current === o.value
              ? "bg-gh-text text-gh-bg-base"
              : "bg-gh-bg-surface text-gh-text-sec hover:text-gh-text"
          }`}
        >
          {o.label}
        </a>
      ))}
    </div>
  );
}
