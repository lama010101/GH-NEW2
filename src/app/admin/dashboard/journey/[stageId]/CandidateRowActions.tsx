"use client";

import { useTransition } from "react";
import { approveCandidate, rejectCandidate } from "./actions";

// Per-candidate approve/reject buttons for the Journey stage drilldown
// (HJ-BUILD-ADMINREVIEW-CANDIDATES-001). Matches the ModelRowActions /
// RestorePlayerButton pattern: useTransition + direct server-action import,
// no API route. Reject uses window.confirm, matching ModelRowActions.handleTrash.

export function CandidateRowActions({
  jseId,
  approved,
}: {
  jseId: string;
  approved: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    if (isPending || approved) return;
    startTransition(async () => {
      await approveCandidate(jseId);
    });
  };

  const handleReject = () => {
    if (isPending) return;
    if (!window.confirm("Reject this candidate? This permanently deletes the row.")) return;
    startTransition(async () => {
      await rejectCandidate(jseId);
    });
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleApprove}
        disabled={isPending || approved}
        className="ops-btn disabled:opacity-50"
      >
        {isPending ? "…" : approved ? "Approved" : "Approve"}
      </button>
      <button
        onClick={handleReject}
        disabled={isPending}
        className="ops-btn disabled:opacity-50"
        style={{ color: "var(--ops-bad)" }}
      >
        {isPending ? "…" : "Reject"}
      </button>
    </div>
  );
}
