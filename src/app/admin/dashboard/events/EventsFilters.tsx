"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const MODE_OPTIONS = ["sync", "async", "practice", "compete", "daily"];
const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "both", label: "Has both" },
  { value: "ai", label: "AI only" },
  { value: "human", label: "Human only" },
];

export function EventsFilters({
  currentMode,
  currentType,
}: {
  currentMode: string;
  currentType: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const navigate = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      const qs = next.toString();
      router.push(`/admin/dashboard/events${qs ? `?${qs}` : ""}`);
    },
    [router, sp]
  );

  return (
    <div className="mb-6 flex flex-wrap gap-4">
      <div>
        <label className="mb-1 block text-xs text-gh-text-sec">Mode</label>
        <select
          value={currentMode}
          className="rounded border border-[var(--gh-border-default)] bg-gh-bg-surface px-3 py-1.5 text-sm text-gh-text"
          onChange={(e) => navigate({ mode: e.target.value })}
        >
          <option value="">All modes</option>
          {MODE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gh-text-sec">Player type</label>
        <select
          value={currentType}
          className="rounded border border-[var(--gh-border-default)] bg-gh-bg-surface px-3 py-1.5 text-sm text-gh-text"
          onChange={(e) => navigate({ ptype: e.target.value })}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
