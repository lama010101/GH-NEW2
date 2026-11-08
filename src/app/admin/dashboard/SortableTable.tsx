"use client";

// SortableTable — ONE reusable sortable table for every table on the AI
// fleet page (ADM-BUILD-FLEETDASH-1107-120). Column headers are real
// <button>s inside <th aria-sort>; numeric/date columns compare by value
// (never as strings); missing values always sort last.

import { useMemo, useState } from "react";
import {
  sortRows,
  type SortDirection,
  type SortKind,
  type SortValue,
} from "./fleetOverview";

export type SortableColumn = {
  key: string;
  label: string;
  kind?: SortKind;
  /** 'right' renders the header + cells right-aligned (numeric columns). */
  align?: "left" | "right";
  title?: string;
};

export type SortableRow = {
  id: string;
  /** Cell content per column, same order as `columns`. */
  cells: React.ReactNode[];
  /** Sort key per column key; missing => sorts last. */
  sort: Record<string, SortValue>;
};

export function SortableTable({
  columns,
  rows,
  footer,
  emptyText = "Nothing to show.",
  caption,
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
  /** Optional totals row — rendered as <tfoot>, not sortable. */
  footer?: React.ReactNode[];
  emptyText?: string;
  caption?: string;
}) {
  const [sortKey, setSortKey] = useState<string>(columns[0]?.key ?? "");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    return sortRows(rows, sortKey, sortDir, col.kind ?? "text");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, columns]);

  const toggle = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        {caption && <caption className="ops-caption">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => {
              const active = col.key === sortKey;
              const ariaSort = active
                ? sortDir === "asc"
                  ? "ascending"
                  : "descending"
                : "none";
              return (
                <th
                  key={col.key}
                  aria-sort={ariaSort}
                  className={col.align === "right" ? "num" : undefined}
                  title={col.title}
                >
                  <button
                    type="button"
                    className="ops-sortbtn"
                    onClick={() => toggle(col.key)}
                  >
                    {col.label}
                    <span className="ops-sortarrow" aria-hidden="true">
                      {active ? (sortDir === "asc" ? " ↑" : " ↓") : " ⇅"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, i) => (
                <td
                  key={i}
                  className={columns[i]?.align === "right" ? "num" : undefined}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length}>{emptyText}</td>
            </tr>
          )}
        </tbody>
        {footer && footer.length > 0 && (
          <tfoot>
            <tr className="ops-tfoot-row">
              {footer.map((cell, i) => (
                <td
                  key={i}
                  className={columns[i]?.align === "right" ? "num" : undefined}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
