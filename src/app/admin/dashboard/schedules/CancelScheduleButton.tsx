"use client";

import { useTransition } from "react";
import { cancelScheduledChange } from "../scheduling/actions";

export function CancelScheduleButton({ changeId }: { changeId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await cancelScheduledChange(changeId);
        })
      }
      disabled={isPending}
      className="rounded border border-[var(--gh-border-default)] px-2 py-1 text-xs text-gh-text-sec hover:text-gh-text disabled:opacity-50"
    >
      {isPending ? "…" : "Cancel"}
    </button>
  );
}
