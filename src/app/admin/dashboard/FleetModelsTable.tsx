"use client";

// Models table for the AI fleet page — All / Playing / Not playing filter
// buttons (aria-pressed) on top of the shared SortableTable.
// (ADM-BUILD-FLEETDASH-1107-120)

import { useMemo, useState } from "react";
import { SortableTable, type SortableColumn, type SortableRow } from "./SortableTable";
import type { FleetModelStatus } from "./fleetOverview";

export type FleetModelTableRow = SortableRow & { status: FleetModelStatus };

export function FleetModelsTable({
  columns,
  rows,
  footer,
}: {
  columns: SortableColumn[];
  rows: FleetModelTableRow[];
  footer?: React.ReactNode[];
}) {
  const [filter, setFilter] = useState<"all" | "playing" | "not">("all");

  const counts = useMemo(
    () => ({
      all: rows.length,
      playing: rows.filter((r) => r.status === "playing").length,
      not: rows.filter((r) => r.status !== "playing").length,
    }),
    [rows]
  );

  const visible = useMemo(
    () =>
      filter === "all"
        ? rows
        : rows.filter((r) =>
            filter === "playing" ? r.status === "playing" : r.status !== "playing"
          ),
    [rows, filter]
  );

  const btn = (key: typeof filter, label: string, count: number) => (
    <button
      key={key}
      type="button"
      className={`ops-chip ops-chip-toggle${filter === key ? " ops-chip-on" : ""}`}
      aria-pressed={filter === key}
      onClick={() => setFilter(key)}
    >
      {label} ({count})
    </button>
  );

  return (
    <div>
      <div className="fleet-filterbar" role="group" aria-label="Filter models">
        {btn("all", "All", counts.all)}
        {btn("playing", "Playing", counts.playing)}
        {btn("not", "Not playing", counts.not)}
      </div>
      <SortableTable
        columns={columns}
        rows={visible}
        footer={footer}
        emptyText="No models match this filter."
      />
    </div>
  );
}
