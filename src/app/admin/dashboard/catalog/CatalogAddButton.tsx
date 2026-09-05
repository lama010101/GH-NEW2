"use client";

import { useState } from "react";
import { addAiPlayer } from "../models/actions";

// Adds a catalog model as an AI player via the existing admin-gated
// addAiPlayer server action. Name defaults to the catalog display name;
// provider is derived from the model-id prefix (same rule as AddModelModal).

export function CatalogAddButton({
  modelId,
  name,
  provider,
}: {
  modelId: string;
  name: string;
  provider: string;
}) {
  const [state, setState] = useState<"idle" | "adding" | "added" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (state === "adding" || state === "added") return;
    setState("adding");
    setError(null);
    try {
      await addAiPlayer({ name, provider, model_id: modelId });
      setState("added");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col">
      <button
        onClick={handleAdd}
        disabled={state === "adding" || state === "added"}
        className="rounded border border-[var(--gh-border-default)] px-2 py-1 text-xs text-gh-text hover:bg-gh-bg-elevated disabled:opacity-50"
      >
        {state === "adding"
          ? "Adding…"
          : state === "added"
            ? "Added ✓"
            : "Add"}
      </button>
      {state === "error" && (
        <span className="mt-1 text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
