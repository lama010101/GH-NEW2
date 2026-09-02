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
    <div className="ops-panel-flush">
      <table className="ops-table">
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">XP (0-200)</th>
            <th className="num">Acc% (0-100)</th>
            <th className="num">Loc</th>
            <th className="num">Time/Yr</th>
            <th>Mode</th>
            <th className="num">Session rank</th>
            <th>AI feedback</th>
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
                <tr>
                  <td data-label="Player">
                    <span className="ops-cellname">
                      <span className="ops-rank">{idx + 1}</span>
                      <span
                        className={`ops-chip ${isAi ? "ops-chip-muted" : ""}`}
                        style={isAi ? { borderColor: "var(--ops-accent)", color: "var(--ops-accent)" } : undefined}
                      >
                        {isAi ? "AI" : "Human"}
                      </span>
                      <span className="ops-truncate" title={row.display_name}>
                        {row.display_name || "—"}
                      </span>
                    </span>
                  </td>
                  <td className="num" data-label="XP (0-200)" style={{ fontWeight: 600 }}>
                    {row.score}
                  </td>
                  <td className="num" data-label="Acc% (0-100)">
                    {row.accuracy_pct}%
                  </td>
                  <td className="num" data-label="Loc" style={{ color: "var(--ops-mute)" }}>
                    {row.location_score ?? "—"}
                  </td>
                  <td className="num" data-label="Time/Yr" style={{ color: "var(--ops-mute)" }}>
                    {row.time_score ?? "—"}
                  </td>
                  <td data-label="Mode">
                    <span className="ops-chip ops-chip-muted">{row.mode || "—"}</span>
                  </td>
                  <td className="num" data-label="Session rank" style={{ color: "var(--ops-mute)" }}>
                    {row.rank ?? "—"}
                  </td>
                  <td data-label="AI feedback">
                    {hasFeedback ? (
                      <button
                        type="button"
                        onClick={() => toggle(rowKey)}
                        className="ops-btn"
                      >
                        {isOpen ? "Hide" : "Show"}
                      </button>
                    ) : (
                      <span style={{ color: "var(--ops-mute)" }}>—</span>
                    )}
                  </td>
                </tr>
                {isOpen && hasFeedback && (
                  <tr>
                    <td colSpan={8} style={{ background: "var(--ops-canvas)" }}>
                      <div className="space-y-2 text-xs">
                        {row.reasoning && (
                          <div>
                            <span className="font-semibold" style={{ color: "var(--ops-mute)" }}>Reasoning: </span>
                            <span>{row.reasoning}</span>
                          </div>
                        )}
                        {row.critique_error && (
                          <div>
                            <span className="font-semibold" style={{ color: "var(--ops-mute)" }}>Critique error: </span>
                            <span>{row.critique_error}</span>
                          </div>
                        )}
                        {row.image_quality_notes && (
                          <div>
                            <span className="font-semibold" style={{ color: "var(--ops-mute)" }}>Image quality notes: </span>
                            <span>{row.image_quality_notes}</span>
                          </div>
                        )}
                        {row.image_quality_score != null && (
                          <div>
                            <span className="font-semibold" style={{ color: "var(--ops-mute)" }}>Image quality score: </span>
                            <span>{row.image_quality_score}</span>
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
              <td colSpan={8}>
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
          className={`ops-btn ${current === o.value ? "ops-btn-primary" : ""}`}
        >
          {o.label}
        </a>
      ))}
    </div>
  );
}
