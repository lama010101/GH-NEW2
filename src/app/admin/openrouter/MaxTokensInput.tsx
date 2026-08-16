"use client";

import { useState, useTransition } from "react";
import { updateAiPlayerMaxTokens } from "./actions";

const MIN_MAX_TOKENS = 256;
const MAX_MAX_TOKENS = 8192;

function clampMaxTokens(value: number): number {
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, value));
}

export function MaxTokensInput({
  playerId,
  value,
}: {
  playerId: string;
  value: number;
}) {
  const [tokens, setTokens] = useState(String(value));
  const [isPending, startTransition] = useTransition();

  function saveValue(nextValue: string): void {
    const parsed = Number.parseInt(nextValue, 10);
    if (!Number.isFinite(parsed)) {
      setTokens(String(value));
      return;
    }
    const clamped = clampMaxTokens(parsed);
    setTokens(String(clamped));
    if (clamped === value) return;
    startTransition(() => updateAiPlayerMaxTokens(playerId, clamped));
  }

  return (
    <label className="flex flex-col items-center gap-1 text-xs text-gh-text-sec">
      <span>max tokens</span>
      <input
        aria-label={`Max tokens for ${playerId}`}
        className="w-20 rounded border border-[var(--gh-border-default)] bg-gh-bg-base px-2 py-1 text-center text-gh-text"
        type="number"
        min={MIN_MAX_TOKENS}
        max={MAX_MAX_TOKENS}
        step={1}
        value={tokens}
        disabled={isPending}
        onChange={(event) => setTokens(event.target.value)}
        onBlur={(event) => saveValue(event.target.value)}
      />
    </label>
  );
}
