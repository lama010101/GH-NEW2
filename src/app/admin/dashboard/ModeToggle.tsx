"use client";

import { useTransition } from "react";
import { Toggle } from "@/components/home/Toggle";
import { toggleAiPlayerMode } from "./actions";

export function ModeToggle({
  playerId,
  mode,
  enabled,
}: {
  playerId: string;
  mode: "practice" | "daily";
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ opacity: isPending ? 0.5 : 1 }}
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
    </div>
  );
}
