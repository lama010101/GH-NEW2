"use client";

import { useTransition } from "react";
import { restoreAiPlayer } from "../models/actions";

export function RestorePlayerButton({ playerId }: { playerId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await restoreAiPlayer(playerId);
        })
      }
      disabled={isPending}
      className="rounded border border-[var(--gh-border-default)] px-2 py-1 text-xs text-gh-text hover:bg-gh-bg-elevated disabled:opacity-50"
    >
      {isPending ? "…" : "Restore"}
    </button>
  );
}
