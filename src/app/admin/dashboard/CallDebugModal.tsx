"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type CallRow = {
  id: string;
  turn_index: number;
  request_payload: unknown;
  response_payload: unknown;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

export function CallDebugModal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const callsId = searchParams.get("calls");
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callsId) {
      setCalls([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/ai-answer-bank/${callsId}/calls`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load calls: ${res.status}`);
        return res.json() as Promise<{ calls: CallRow[] }>;
      })
      .then((data) => {
        if (!cancelled) setCalls(data.calls ?? []);
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
  }, [callsId]);

  if (!callsId) return null;

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("calls");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface p-6 text-gh-text shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Call-level debug</h2>
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
        {!loading && !error && calls.length === 0 && (
          <p className="text-gh-text-sec">No call records found for this answer.</p>
        )}
        {!loading && !error && calls.length > 0 && (
          <div className="space-y-4">
            {calls.map((call) => (
              <CallEntry key={call.id} call={call} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CallEntry({ call }: { call: CallRow }) {
  const [reqExpanded, setReqExpanded] = useState(false);
  const [resExpanded, setResExpanded] = useState(false);

  return (
    <div className="rounded border border-[var(--gh-border-default)] bg-gh-bg-base p-3">
      <div className="mb-2 flex items-center gap-3 text-sm">
        <span className="font-semibold">Turn {call.turn_index}</span>
        <span className="text-gh-text-sec">
          {call.duration_ms != null ? `${call.duration_ms}ms` : "—"}
        </span>
        <span className="text-gh-text-sec">
          {new Date(call.created_at).toLocaleString("en-US", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
        {call.error && (
          <span className="text-red-500 text-xs">error: {call.error}</span>
        )}
      </div>

      <div className="mb-2">
        <button
          onClick={() => setReqExpanded(!reqExpanded)}
          className="mb-1 text-xs font-semibold text-gh-text-sec hover:text-gh-text"
        >
          request_payload {reqExpanded ? "[-]" : "[+]"}
        </button>
        {reqExpanded && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-[var(--gh-border-default)] bg-gh-bg-surface p-2 text-xs text-gh-text">
            {JSON.stringify(call.request_payload, null, 2)}
          </pre>
        )}
      </div>

      <div>
        <button
          onClick={() => setResExpanded(!resExpanded)}
          className="mb-1 text-xs font-semibold text-gh-text-sec hover:text-gh-text"
        >
          response_payload {resExpanded ? "[-]" : "[+]"}
        </button>
        {resExpanded && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-[var(--gh-border-default)] bg-gh-bg-surface p-2 text-xs text-gh-text">
            {JSON.stringify(call.response_payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
