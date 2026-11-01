"use client";

import { useTransition, useState } from "react";
import { Toggle } from "@/components/home/Toggle";
import { toggleAiPlayerMode } from "../actions";
import {
  testAiPlayerModel,
  deactivateAiPlayer,
  reactivateAiPlayer,
  softDeleteAiPlayer,
} from "./actions";

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

// ModelControls — single Controls cell for the Models tab
// (ADMIN-BUILD-FLEETTRUTH-1101-031): ONE "Enabled" master switch
// (= is_active, via the unchanged deactivate/reactivate server actions),
// Practice + Daily as checkboxes that are disabled and greyed while the
// master switch is off, Test, and Trash inside a ⋯ overflow menu.
export function ModelControls({
  playerId,
  modelId,
  isActive,
  isPractice,
  isDaily,
}: {
  playerId: string;
  modelId: string;
  isActive: boolean;
  isPractice: boolean;
  isDaily: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const handleEnabled = () => {
    if (isPending) return;
    startTransition(async () => {
      if (isActive) await deactivateAiPlayer(playerId);
      else await reactivateAiPlayer(playerId);
    });
  };

  const handleMode = (mode: "practice" | "daily", value: boolean) => {
    if (isPending || !isActive) return;
    startTransition(async () => {
      await toggleAiPlayerMode(playerId, mode, value);
    });
  };

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

  const handleTrash = () => {
    if (isPending) return;
    if (
      !window.confirm(
        "Move this AI player to trash? It can be restored from the Trash page."
      )
    )
      return;
    startTransition(async () => {
      await softDeleteAiPlayer(playerId);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex flex-wrap items-center gap-3"
        style={{ opacity: isPending ? 0.5 : 1 }}
      >
        <span className="flex items-center gap-1" title="Master switch — when off, the model cannot run regardless of mode flags">
          <span className="text-xs text-gh-text-sec">Enabled</span>
          <Toggle on={isActive} onClick={handleEnabled} />
        </span>
        <label
          className="flex items-center gap-1 text-xs text-gh-text-sec"
          style={{ opacity: isActive ? 1 : 0.4 }}
          title={isActive ? "Practice mode flag" : "Disabled while Enabled is off"}
        >
          <input
            type="checkbox"
            checked={isActive && isPractice}
            disabled={!isActive || isPending}
            onChange={(e) => handleMode("practice", e.target.checked)}
          />
          Practice
        </label>
        <label
          className="flex items-center gap-1 text-xs text-gh-text-sec"
          style={{ opacity: isActive ? 1 : 0.4 }}
          title={isActive ? "Daily mode flag" : "Disabled while Enabled is off"}
        >
          <input
            type="checkbox"
            checked={isActive && isDaily}
            disabled={!isActive || isPending}
            onChange={(e) => handleMode("daily", e.target.checked)}
          />
          Daily
        </label>
        <button
          onClick={handleTest}
          disabled={testing}
          className="ops-btn disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test"}
        </button>
        <details className="relative">
          <summary className="ops-btn" style={{ listStyle: "none" }}>
            ⋯
          </summary>
          <div
            className="ops-panel ops-panel-pad"
            style={{
              position: "absolute",
              right: 0,
              zIndex: 20,
              marginTop: 4,
              minWidth: 96,
            }}
          >
            <button
              onClick={handleTrash}
              disabled={isPending}
              className="ops-btn disabled:opacity-50"
              style={{ color: "var(--ops-bad)" }}
            >
              {isPending ? "…" : "Trash"}
            </button>
          </div>
        </details>
      </div>
      {testError && <p className="text-xs text-red-500">{testError}</p>}
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
