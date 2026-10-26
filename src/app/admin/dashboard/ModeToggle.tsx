"use client";

import { useTransition } from "react";
import { Toggle } from "@/components/home/Toggle";
import { toggleAiPlayerMode } from "./actions";

export function ModeToggle({
  playerId,
  mode,
  enabled,
  modelActive = true,
}: {
  playerId: string;
  mode: "practice" | "daily";
  enabled: boolean;
  modelActive?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ opacity: isPending ? 0.5 : 1 }}
      title={
        mode === "practice"
          ? "Not wired yet: no feature reads this flag today."
          : undefined
      }
    >
      <span className="text-xs text-gh-text-sec capitalize">{mode}</span>
      <Toggle
        on={enabled}
        onClick={() => {
          if (isPending) return;
          startTransition(async () => {
            await toggleAiPlayerMode(playerId, mode, !enabled);
          });
        }}
      />
      {mode === "daily" && enabled && modelActive === false && (
        <span
          className="ops-chip ops-chip-warn"
          title="Daily is ON but this model is deactivated, so the daily runner skips it. Click Reactivate in Actions."
        >
          Won&apos;t run
        </span>
      )}
    </div>
  );
}
