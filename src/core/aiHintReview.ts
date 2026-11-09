// Pure hint-review parsing + trust aggregation — decision D5 of
// AIP-BUILD-FLEETFINAL-1103-060 (fleet-design-060.md).
//
// The structured review call (turn 3) returns, besides the existing critique
// keys, a `hintReviews` array:
//   [{hintId, verdict: 'correct'|'incorrect'|'unverifiable'|'partially_correct',
//     confidence: 0..1, explanation, suggestedCorrection|null}]
//
// parseHintReviews validates that output against the event's known hints:
//   - rows for unknown hintIds are dropped (the model may hallucinate ids)
//   - invalid verdicts are dropped
//   - confidence is clamped to 0..1 (non-numeric -> 0; only unknown ids and
//     invalid verdicts cause a row to be dropped)
//   - hint_kind is the hint's DB `type` ('when'/'where'/'what'/other)
//   - hint_text_hash = sha256 hex of the hint content (node:crypto) — the
//     DB-side identity join key for ai_hint_reviews
//
// Parsing tolerates markdown fences and surrounding prose: whole-text JSON
// first, then a balanced-bracket slice starting at the "hintReviews" key,
// then a balanced object slice, then a bare array.
//
// aggregateHintTrust mirrors the ai_event_hint_trust view: hint_trust is the
// share of 'correct' verdicts ONLY (partially_correct does not count), and an
// event is flagged at >= 2 'incorrect' verdicts.

import { createHash } from "node:crypto";

export const HINT_VERDICTS = [
  "correct",
  "incorrect",
  "unverifiable",
  "partially_correct",
] as const;
export type HintVerdict = (typeof HINT_VERDICTS)[number];

/** The event's hints as the caller knows them (DB hints rows). */
export type KnownHint = {
  id: string | number;
  type: string;
  content: string;
};

/** One validated review row — matches ai_hint_reviews columns. */
export type HintReviewRow = {
  hintId: string;
  hint_kind: string;
  hint_text_hash: string;
  verdict: HintVerdict;
  /** Clamped to [0,1]; non-numeric input collapses to 0. */
  confidence: number;
  explanation: string | null;
  suggestedCorrection: string | null;
};

export type HintTrust = {
  reviews: number;
  correct: number;
  incorrect: number;
  /** correct / reviews (0 when there are no reviews). */
  hint_trust: number;
  /** true when incorrect verdicts reach the flag threshold (>= 2). */
  flagged: boolean;
};

export const HINT_FLAG_INCORRECT_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// JSON extraction (fences + prose tolerant)
// ---------------------------------------------------------------------------

function stripFences(text: string): string {
  return text
    .replace(/```(?:json)?/gi, "")
    .trim();
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Returns text[start..end] spanning a balanced open/close pair (string-aware). */
export function balancedSlice(text: string, start: number, open: string, close: string): string | null {
  if (start < 0 || text[start] !== open) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function arrayFromParsed(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null) {
    const v = (parsed as Record<string, unknown>).hintReviews;
    if (Array.isArray(v)) return v;
  }
  return null;
}

function extractReviewItems(responseText: string): unknown[] {
  if (typeof responseText !== "string" || responseText.trim().length === 0) return [];
  const cleaned = stripFences(responseText);

  // 1. Whole text parses: object with hintReviews, or a bare array.
  const direct = arrayFromParsed(tryParse(cleaned));
  if (direct !== null) return direct;

  // 2. "hintReviews" key -> balanced array slice.
  const keyMatch = /"hintReviews"\s*:/i.exec(cleaned);
  if (keyMatch) {
    const bracket = cleaned.indexOf("[", keyMatch.index + keyMatch[0].length);
    if (bracket >= 0) {
      const slice = balancedSlice(cleaned, bracket, "[", "]");
      const parsed = slice === null ? null : tryParse(slice);
      if (Array.isArray(parsed)) return parsed;
    }
  }

  // 3. First balanced object -> its hintReviews member.
  const objStart = cleaned.indexOf("{");
  if (objStart >= 0) {
    const slice = balancedSlice(cleaned, objStart, "{", "}");
    const fromObj = slice === null ? null : arrayFromParsed(tryParse(slice));
    if (fromObj !== null) return fromObj;
  }

  // 4. First balanced array anywhere (bare-array fallback).
  const arrStart = cleaned.indexOf("[");
  if (arrStart >= 0) {
    const slice = balancedSlice(cleaned, arrStart, "[", "]");
    const parsed = slice === null ? null : tryParse(slice);
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

const VERDICT_SET = new Set<string>(HINT_VERDICTS);

function clamp01(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseHintReviews(
  responseText: string,
  knownHints: readonly KnownHint[]
): HintReviewRow[] {
  const byId = new Map<string, KnownHint>();
  for (const h of knownHints) byId.set(String(h.id), h);

  const rows: HintReviewRow[] = [];
  for (const item of extractReviewItems(responseText)) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;

    const rawId = obj.hintId;
    const hintId =
      typeof rawId === "string" ? rawId : typeof rawId === "number" ? String(rawId) : null;
    if (hintId === null) continue;
    const known = byId.get(hintId);
    if (known === undefined) continue; // unknown hintId — drop

    const verdict = typeof obj.verdict === "string" && VERDICT_SET.has(obj.verdict)
      ? (obj.verdict as HintVerdict)
      : null;
    if (verdict === null) continue; // invalid verdict — drop

    const correction = asString(obj.suggestedCorrection);
    rows.push({
      hintId,
      hint_kind: known.type,
      hint_text_hash: createHash("sha256").update(known.content).digest("hex"),
      verdict,
      confidence: clamp01(obj.confidence),
      explanation: asString(obj.explanation),
      suggestedCorrection: correction,
    });
  }
  return rows;
}

/**
 * Aggregates validated rows into the ai_event_hint_trust shape:
 * hint_trust = correct / reviews ('partially_correct' does NOT count as
 * correct), flagged = incorrect >= 2.
 */
export function aggregateHintTrust(rows: readonly HintReviewRow[]): HintTrust {
  let correct = 0;
  let incorrect = 0;
  for (const r of rows) {
    if (r.verdict === "correct") correct++;
    else if (r.verdict === "incorrect") incorrect++;
  }
  const reviews = rows.length;
  return {
    reviews,
    correct,
    incorrect,
    hint_trust: reviews === 0 ? 0 : correct / reviews,
    flagged: incorrect >= HINT_FLAG_INCORRECT_THRESHOLD,
  };
}
