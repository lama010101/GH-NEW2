"use client";

import { useTransition, useState } from "react";
import { testAiPlayerModel, deactivateAiPlayer, reactivateAiPlayer, softDeleteAiPlayer } from "./actions";

type TestResult = {
  ok: boolean;
  content: string;
  usage: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    cost: number | null;
  };
  error: string | null;
  durationMs: number;
};

export function ModelRowActions({
  playerId,
  modelId,
  isActive,
}: {
  playerId: string;
  modelId: string;
  isActive: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const handleTest = () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    testAiPlayerModel(modelId)
      .then((result) => setTestResult(result))
      .catch((e) =>
        setTestError(e instanceof Error ? e.message : String(e))
      )
      .finally(() => setTesting(false));
  };

  const handleDeactivate = () => {
    if (isPending || !isActive) return;
    startTransition(async () => {
      await deactivateAiPlayer(playerId);
    });
  };

  const handleReactivate = () => {
    if (isPending || isActive) return;
    startTransition(async () => {
      await reactivateAiPlayer(playerId);
    });
  };

  const handleTrash = () => {
    if (isPending) return;
    if (!window.confirm("Move this AI player to trash? It can be restored from the Trash page.")) return;
    startTransition(async () => {
      await softDeleteAiPlayer(playerId);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="ops-btn disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test"}
        </button>
        {isActive ? (
          <button
            onClick={handleDeactivate}
            disabled={isPending}
            className="ops-btn disabled:opacity-50"
          >
            {isPending ? "…" : "Deactivate"}
          </button>
        ) : (
          <button
            onClick={handleReactivate}
            disabled={isPending}
            className="ops-btn disabled:opacity-50"
          >
            {isPending ? "…" : "Reactivate"}
          </button>
        )}
        <button
          onClick={handleTrash}
          disabled={isPending}
          className="ops-btn disabled:opacity-50"
          style={{ color: "var(--ops-bad)" }}
        >
          {isPending ? "…" : "Trash"}
        </button>
      </div>
      {testError && (
        <p className="text-xs text-red-500">{testError}</p>
      )}
      {testResult && (
        <div className="text-xs text-gh-text-sec">
          {testResult.ok ? (
            <span>
              OK · {testResult.durationMs}ms · cost{" "}
              {testResult.usage.cost ?? "—"} · tokens{" "}
              {testResult.usage.total_tokens ?? "—"}
            </span>
          ) : (
            <span className="text-red-500">
              Failed: {testResult.error ?? "unknown"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
