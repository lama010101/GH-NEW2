"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Detail = {
  id: string;
  model_name: string;
  model_id: string;
  event_title: string;
  mode: string;
  guess_lat: number | null;
  guess_lng: number | null;
  guess_year: number | null;
  distance_km: number | null;
  year_diff: number | null;
  error: string | null;
  reasoning: string | null;
  hints_requested: number | null;
  hint_penalty_applied: number | null;
  time_to_guess_ms: number | null;
  image_quality_score: number | null;
  image_quality_notes: string | null;
  raw_llm_response: unknown;
  created_at: string;
};

export function ResultsModal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const detailId = searchParams.get("detail");
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detailId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/ai-answer-bank/${detailId}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load detail: ${res.status}`);
        }
        return res.json() as Promise<Detail>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  if (!detailId) return null;

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("detail");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface p-6 text-gh-text shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Activity results</h2>
          <button
            onClick={close}
            className="text-gh-text-sec hover:text-gh-text"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {loading && <p className="text-gh-text-sec">Loading…</p>}
        {error && <p className="text-red-500">{error}</p>}
        {!loading && !error && data && <DetailContent data={data} />}
      </div>
    </div>
  );
}

function DetailContent({ data }: { data: Detail }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-3 text-sm">
      <p>
        <span className="text-gh-text-sec">Model:</span> {data.model_name}{" "}
        <span className="text-gh-text-sec">({data.model_id})</span>
      </p>
      <p>
        <span className="text-gh-text-sec">Event:</span> {data.event_title}
      </p>
      <p>
        <span className="text-gh-text-sec">Mode:</span> {data.mode}
      </p>
      <p>
        <span className="text-gh-text-sec">Created:</span>{" "}
        {new Date(data.created_at).toLocaleString("en-US", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </p>
      <p>
        <span className="text-gh-text-sec">Guess lat/lng:</span> {" "}
        {data.guess_lat ?? "—"}, {data.guess_lng ?? "—"}
      </p>
      <p>
        <span className="text-gh-text-sec">Guess year:</span> {" "}
        {data.guess_year ?? "—"}
      </p>
      <p>
        <span className="text-gh-text-sec">Distance km:</span> {" "}
        {data.distance_km ?? "—"}
      </p>
      <p>
        <span className="text-gh-text-sec">Year diff:</span> {" "}
        {data.year_diff ?? "—"}
      </p>
      <p>
        <span className="text-gh-text-sec">Time to guess ms:</span> {" "}
        {data.time_to_guess_ms ?? "—"}
      </p>
      <div>
        <span className="text-gh-text-sec">Hints requested:</span>
        <pre className="mt-1 whitespace-pre-wrap rounded border border-[var(--gh-border-default)] bg-gh-bg-base p-2 text-xs text-gh-text">
          {data.hints_requested ? JSON.stringify(data.hints_requested, null, 2) : "—"}
        </pre>
      </div>
      <div>
        <span className="text-gh-text-sec">Hint penalty applied:</span>
        <pre className="mt-1 whitespace-pre-wrap rounded border border-[var(--gh-border-default)] bg-gh-bg-base p-2 text-xs text-gh-text">
          {data.hint_penalty_applied ? JSON.stringify(data.hint_penalty_applied, null, 2) : "—"}
        </pre>
      </div>
      <p>
        <span className="text-gh-text-sec">Image quality score:</span> {" "}
        {data.image_quality_score ?? "—"}
      </p>
      <p>
        <span className="text-gh-text-sec">Image quality notes:</span> {" "}
        {data.image_quality_notes || "—"}
      </p>
      <div>
        <span className="text-gh-text-sec">Error:</span>
        <pre className="mt-1 whitespace-pre-wrap rounded border border-[var(--gh-border-default)] bg-gh-bg-base p-2 text-xs text-gh-text">
          {typeof data.error === "string" ? data.error : data.error ? JSON.stringify(data.error, null, 2) : "—"}
        </pre>
      </div>
      <div>
        <span className="text-gh-text-sec">Reasoning:</span>
        <pre className="mt-1 whitespace-pre-wrap rounded border border-[var(--gh-border-default)] bg-gh-bg-base p-2 text-xs text-gh-text">
          {typeof data.reasoning === "string" ? data.reasoning : data.reasoning ? JSON.stringify(data.reasoning, null, 2) : "—"}
        </pre>
      </div>
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="mb-1 font-semibold text-gh-text hover:underline"
        >
          raw_llm_response {expanded ? "[-]" : "[+]"}
        </button>
        {expanded && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-[var(--gh-border-default)] bg-gh-bg-base p-2 text-xs text-gh-text">
            {JSON.stringify(data.raw_llm_response, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
