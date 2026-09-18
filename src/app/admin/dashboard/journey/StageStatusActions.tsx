"use client";

import { useTransition } from "react";
import { promoteStage, demoteStage } from "./actions";

// Per-stage promote/demote controls for the Journey stage list
// (HJ-BUILD-STAGESTATUS-PROMOTE-001). Matches the CandidateRowActions
// pattern: useTransition + direct server-action import, no API route.
// window.confirm is only required when demoting FROM live — that's the one
// transition with real player-facing impact.

const NEXT_LABEL: Record<string, string> = {
  draft: "→ Approve",
  approved: "→ Live",
};

export function StageStatusActions({
  stageId,
  status,
}: {
  stageId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handlePromote = () => {
    if (isPending || status === "live") return;
    startTransition(async () => {
      await promoteStage(stageId);
    });
  };

  const handleDemote = () => {
    if (isPending || status === "draft") return;
    if (
      status === "live" &&
      !window.confirm(
        "Demote this stage from live? It will disappear from player-facing Journey immediately."
      )
    ) {
      return;
    }
    startTransition(async () => {
      await demoteStage(stageId);
    });
  };

  return (
    <div className="flex gap-2 items-center">
      <span className="ops-truncate">{status}</span>
      <button
        onClick={handlePromote}
        disabled={isPending || status === "live"}
        className="ops-btn disabled:opacity-50"
      >
        {isPending ? "…" : NEXT_LABEL[status] ?? "Promote"}
      </button>
      <button
        onClick={handleDemote}
        disabled={isPending || status === "draft"}
        className="ops-btn disabled:opacity-50"
        style={{ color: "var(--ops-bad)" }}
      >
        {isPending ? "…" : "Demote"}
      </button>
    </div>
  );
}
