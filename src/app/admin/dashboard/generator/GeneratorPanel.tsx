"use client";

// EDQ-BUILD-ADMINGEN-1122-815 — admin image generator panel.
// Model selector (hasKey computed server-side), template-prefilled
// prompt + negative prompt, Generate -> preview -> Accept/Reject, plus the
// chrono-hold list. All writes go through /api/admin/generator/generate
// and the accept/reject server actions — no direct DB access here.

import { useMemo, useState, useTransition } from "react";
import {
  buildGeneratorPrompt,
  buildGeneratorNegativePrompt,
} from "@/core/imageGen/promptTemplate";
import { acceptGeneratedImage, rejectGeneratedImage } from "./actions";

export type PanelModel = {
  id: string;
  label: string;
  price_usd_est: number | null;
  enabled: boolean;
  hasKey: boolean;
  notes: string | null;
};

export type HeldRow = {
  event_id: string;
  image_id: string;
  element_category: string;
  flagger_count: number;
  title: string | null;
  slug: string | null;
};

type GenResult = {
  logId: string;
  imageUrl: string;
  storagePath: string;
  costUsd: number | null;
  durationMs: number;
};

const CONFIRM_PRICE_THRESHOLD_USD = 0.1;

export function GeneratorPanel({
  models,
  holds,
}: {
  models: PanelModel[];
  holds: HeldRow[];
}) {
  const enabledModels = models.filter((m) => m.enabled);
  const [modelId, setModelId] = useState(enabledModels[0]?.id ?? "");
  const [eventId, setEventId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [location, setLocation] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState(
    buildGeneratorNegativePrompt()
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = models.find((m) => m.id === modelId) ?? null;
  const needsConfirm =
    selected !== null &&
    (selected.price_usd_est ?? 0) > CONFIRM_PRICE_THRESHOLD_USD;

  const templatePrompt = useMemo(
    () =>
      buildGeneratorPrompt({
        title: title || null,
        year: year.trim() === "" ? null : parseInt(year, 10),
        location: location || null,
      }),
    [title, year, location]
  );

  function applyTemplate() {
    setPrompt(templatePrompt);
    setPromptTouched(true);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    setReviewMsg(null);
    try {
      const res = await fetch("/api/admin/generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId.trim() || undefined,
          candidate_id: candidateId.trim() || undefined,
          model_id: modelId,
          prompt,
          negative_prompt: negativePrompt,
          confirm: needsConfirm ? confirm : undefined,
        }),
      });
      const j = (await res.json()) as Record<string, unknown>;
      if (!res.ok || j.ok !== true) {
        setError(
          typeof j.message === "string"
            ? j.message
            : typeof j.error === "string"
              ? j.error
              : `HTTP ${res.status}`
        );
        return;
      }
      setResult(j as unknown as GenResult);
    } catch {
      setError("network error");
    } finally {
      setBusy(false);
    }
  }

  function review(action: "accept" | "reject") {
    if (!result) return;
    startTransition(async () => {
      setReviewMsg(null);
      try {
        if (action === "accept") {
          await acceptGeneratedImage(result.logId);
          setReviewMsg("accepted — image is now primary");
        } else {
          await rejectGeneratedImage(result.logId);
          setReviewMsg("rejected — nothing was inserted");
        }
        setResult(null);
      } catch (e) {
        setReviewMsg(e instanceof Error ? e.message : "action failed");
      }
    });
  }

  return (
    <div className="ops-panel ops-panel-pad">
      <div className="ops-panel-title">Image generator</div>
      <div className="ops-panel-sub">
        Runware text-to-image, Supabase Storage, admin accept/reject.
      </div>

      <div className="ops-fields">
        <label className="ops-field">
          <span className="ops-field-label">Event ID</span>
          <input
            className="ops-input"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="uuid (or use candidate id)"
          />
        </label>
        <label className="ops-field">
          <span className="ops-field-label">Candidate ID</span>
          <input
            className="ops-input"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            placeholder="uuid"
          />
        </label>
        <label className="ops-field">
          <span className="ops-field-label">Model</span>
          <select
            className="ops-input"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.enabled || !m.hasKey}>
                {m.label}
                {m.price_usd_est !== null ? ` — $${m.price_usd_est}` : ""}
                {!m.enabled
                  ? " (disabled)"
                  : !m.hasKey
                    ? " (key not configured)"
                    : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="ops-field">
          <span className="ops-field-label">Title</span>
          <input
            className="ops-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="ops-field">
          <span className="ops-field-label">Year</span>
          <input
            className="ops-input"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="signed int, e.g. -44 or 1969"
          />
        </label>
        <label className="ops-field">
          <span className="ops-field-label">Location</span>
          <input
            className="ops-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
      </div>

      <div className="ops-field" style={{ marginTop: 12 }}>
        <span className="ops-field-label">Prompt</span>
        <textarea
          className="ops-input"
          rows={5}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setPromptTouched(true);
          }}
          placeholder={templatePrompt}
        />
        <div className="ops-toolbar" style={{ marginTop: 4 }}>
          <button type="button" className="ops-btn" onClick={applyTemplate}>
            Fill from template
          </button>
          {!promptTouched && (
            <span style={{ color: "var(--ops-mute)" }}>
              template ready — edit or fill
            </span>
          )}
        </div>
      </div>

      <div className="ops-field" style={{ marginTop: 12 }}>
        <span className="ops-field-label">Negative prompt</span>
        <textarea
          className="ops-input"
          rows={3}
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
        />
      </div>

      {needsConfirm && (
        <label className="ops-field" style={{ marginTop: 8 }}>
          <span className="ops-field-label">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />{" "}
            Confirm spend (model est &gt; $0.10)
          </span>
        </label>
      )}

      <div className="ops-toolbar" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="ops-btn ops-btn-primary"
          disabled={
            busy ||
            !modelId ||
            (!eventId.trim() && !candidateId.trim()) ||
            !prompt.trim() ||
            (needsConfirm && !confirm) ||
            (selected !== null && (!selected.enabled || !selected.hasKey))
          }
          onClick={generate}
        >
          {busy ? "Generating…" : "Generate"}
        </button>
        {error && <span className="ops-chip ops-chip-bad">{error}</span>}
        {reviewMsg && <span className="ops-chip ops-chip-ok">{reviewMsg}</span>}
      </div>

      {result && (
        <div style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.imageUrl}
            alt="generated preview"
            style={{ maxWidth: 320, maxHeight: 320, borderRadius: 8 }}
          />
          <div className="ops-mono" style={{ marginTop: 4 }}>
            {result.storagePath} · ${result.costUsd ?? "?"} ·{" "}
            {result.durationMs}ms · log {result.logId.slice(0, 8)}
          </div>
          <div className="ops-toolbar" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="ops-btn ops-btn-primary"
              disabled={isPending}
              onClick={() => review("accept")}
            >
              Accept
            </button>
            <button
              type="button"
              className="ops-btn"
              disabled={isPending}
              onClick={() => review("reject")}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="ops-panel-title" style={{ marginTop: 20 }}>
        Chrono holds
      </div>
      {holds.length === 0 ? (
        <div className="ops-empty">No active image holds.</div>
      ) : (
        <table className="ops-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Category</th>
              <th className="num">Flaggers</th>
            </tr>
          </thead>
          <tbody>
            {holds.map((h) => (
              <tr key={`${h.event_id}-${h.image_id}-${h.element_category}`}>
                <td data-label="Event">
                  {h.slug ? (
                    <a
                      className="ops-celllink"
                      href={`/events/${h.slug}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {h.title ?? h.event_id.slice(0, 8)}
                    </a>
                  ) : (
                    (h.title ?? h.event_id.slice(0, 8))
                  )}
                </td>
                <td data-label="Category">{h.element_category}</td>
                <td className="num" data-label="Flaggers">
                  {h.flagger_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
