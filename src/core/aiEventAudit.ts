// Pure text-only event-audit helpers — decision D8 of
// AIP-BUILD-FLEETFINAL-1103-060 (fleet-design-060.md).
//
// Auditors are the non-vision roster models: one text-only call per event
// with everything we know EXCEPT the image — title, description, year,
// location name, lat/lng, hint contents, and the vision models' existing
// image_quality/difficulty notes. The reply is a single JSON object stored
// in ai_event_audits; it never writes events.
//
//   parseEventAudit(text)    validate the reply into the ai_event_audits
//                            column shape; malformed JSON -> {error: ...}
//   buildAuditMessages(ev)   system+user messages for the audit prompt
//
// Validation rules (mirroring the table's CHECK constraints):
//   is_real_event / year_check / location_check invalid or missing -> 'unknown'
//   difficulty_estimate_* clamped to 1..5 (non-numeric -> null)
//   confidence clamped to 0..1 (non-numeric -> null)
//   proposed_lat/lng must be finite and in range else null
//   *_issues / improvement_suggestions are string[] (non-strings filtered out)

export const AUDIT_IS_REAL_EVENT = ["real", "likely_real", "doubtful", "fabricated", "unknown"] as const;
export type AuditIsRealEvent = (typeof AUDIT_IS_REAL_EVENT)[number];

export const AUDIT_YEAR_CHECK = ["ok", "off_by_n", "unknown"] as const;
export type AuditYearCheck = (typeof AUDIT_YEAR_CHECK)[number];

export const AUDIT_LOCATION_CHECK = ["ok", "off", "unknown"] as const;
export type AuditLocationCheck = (typeof AUDIT_LOCATION_CHECK)[number];

/** Validated audit — one field per ai_event_audits data column. */
export type EventAuditResult = {
  is_real_event: AuditIsRealEvent;
  year_check: AuditYearCheck;
  proposed_year: number | null;
  location_check: AuditLocationCheck;
  proposed_location: string | null;
  proposed_lat: number | null;
  proposed_lng: number | null;
  description_issues: string[];
  hint_issues: string[];
  difficulty_estimate_year: number | null;
  difficulty_estimate_location: number | null;
  improvement_suggestions: string[];
  confidence: number | null;
  reasoning: string | null;
  /** Set when the reply could not be parsed at all. */
  error: string | null;
};

export type AuditHint = { tier?: number | null; type: string; content: string };

/** Everything the text-only auditor sees about the event. */
export type AuditEventInput = {
  title: string | null;
  description: string | null;
  year: number | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  hints: readonly AuditHint[];
  /** Existing vision-model notes surfaced for cross-checking. */
  imageQualityScore?: number | null;
  imageQualityNotes?: string | null;
  difficultyScore?: number | null;
  difficultyNotes?: string | null;
};

export type AuditMessage = { role: "system" | "user"; content: string };

// ---------------------------------------------------------------------------
// parseEventAudit
// ---------------------------------------------------------------------------

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asIntOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) ? n : null;
}

function clampRange(value: unknown, lo: number, hi: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

function asLat(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= -90 && n <= 90 ? n : null;
}

function asLng(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= -180 && n <= 180 ? n : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export function cleanJson(text: string): string {
  const trimmed = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? match[0].trim() : trimmed;
  }
}

const EMPTY_AUDIT: Omit<EventAuditResult, "error"> = {
  is_real_event: "unknown",
  year_check: "unknown",
  proposed_year: null,
  location_check: "unknown",
  proposed_location: null,
  proposed_lat: null,
  proposed_lng: null,
  description_issues: [],
  hint_issues: [],
  difficulty_estimate_year: null,
  difficulty_estimate_location: null,
  improvement_suggestions: [],
  confidence: null,
  reasoning: null,
};

/**
 * Parses the auditor reply into the ai_event_audits shape.
 * A reply that is not JSON or not an object yields {error, ...defaults} —
 * the caller stores the error and moves on (an audit failure is data, not a
 * crash). Field-level problems degrade to 'unknown'/null per-field.
 */
export function parseEventAudit(responseText: string | null | undefined): EventAuditResult {
  if (typeof responseText !== "string" || responseText.trim().length === 0) {
    return { ...EMPTY_AUDIT, error: "empty audit response" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson(responseText));
  } catch (err) {
    return {
      ...EMPTY_AUDIT,
      error: `Failed to parse audit response: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...EMPTY_AUDIT, error: "Audit response is not a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;
  return {
    is_real_event: asEnum(obj.is_real_event, AUDIT_IS_REAL_EVENT, "unknown"),
    year_check: asEnum(obj.year_check, AUDIT_YEAR_CHECK, "unknown"),
    proposed_year: asIntOrNull(obj.proposed_year),
    location_check: asEnum(obj.location_check, AUDIT_LOCATION_CHECK, "unknown"),
    proposed_location: asStringOrNull(obj.proposed_location),
    proposed_lat: asLat(obj.proposed_lat),
    proposed_lng: asLng(obj.proposed_lng),
    description_issues: asStringArray(obj.description_issues),
    hint_issues: asStringArray(obj.hint_issues),
    difficulty_estimate_year: clampRange(obj.difficulty_estimate_year, 1, 5),
    difficulty_estimate_location: clampRange(obj.difficulty_estimate_location, 1, 5),
    improvement_suggestions: asStringArray(obj.improvement_suggestions),
    confidence: clampRange(obj.confidence, 0, 1),
    reasoning: asStringOrNull(obj.reasoning),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// buildAuditMessages — TEXT-ONLY audit prompt (D8)
// ---------------------------------------------------------------------------

/**
 * System + user messages for the audit call. No image, no guess context —
 * the model audits our event record against its own knowledge and replies
 * with a single JSON object using EXACTLY the ai_event_audits keys.
 */
export function buildAuditMessages(event: AuditEventInput): AuditMessage[] {
  const systemPrompt =
    `You are auditing a historical event record in a geography-history game ` +
    `database. You cannot see the event image; audit the TEXT record against ` +
    `your own knowledge. Reply with a single JSON object (JSON only, no ` +
    `markdown, no prose) with EXACTLY these keys:\n` +
    `  - is_real_event ("real" | "likely_real" | "doubtful" | "fabricated" | "unknown"): is the described event a real historical event?\n` +
    `  - year_check ("ok" | "off_by_n" | "unknown"): is the stated year correct?\n` +
    `  - proposed_year (integer or null): the correct year when year_check is "off_by_n", else null.\n` +
    `  - location_check ("ok" | "off" | "unknown"): is the stated location correct?\n` +
    `  - proposed_location (string or null), proposed_lat (number or null), proposed_lng (number or null): correction when location_check is "off", else null.\n` +
    `  - description_issues (array of strings): factual problems in the description, [] if none.\n` +
    `  - hint_issues (array of strings): hints that are wrong or misleading, [] if none.\n` +
    `  - difficulty_estimate_year (integer 1-5 or null): how hard the year is to guess.\n` +
    `  - difficulty_estimate_location (integer 1-5 or null): how hard the location is to guess.\n` +
    `  - improvement_suggestions (array of strings): suggested record improvements, [] if none.\n` +
    `  - confidence (number 0-1): your overall confidence in this audit.\n` +
    `  - reasoning (string): brief justification.`;

  const hintLines =
    event.hints.length === 0
      ? "  (none)"
      : event.hints
          .map((h) => `  - ${h.tier !== null && h.tier !== undefined ? `tier ${h.tier} ` : ""}${h.type}: "${h.content}"`)
          .join("\n");

  const priorNotes: string[] = [];
  if (event.imageQualityScore !== null && event.imageQualityScore !== undefined) {
    priorNotes.push(`  - image quality score: ${event.imageQualityScore}/10`);
  }
  if (event.imageQualityNotes) priorNotes.push(`  - image quality notes: "${event.imageQualityNotes}"`);
  if (event.difficultyScore !== null && event.difficultyScore !== undefined) {
    priorNotes.push(`  - difficulty score: ${event.difficultyScore}/10`);
  }
  if (event.difficultyNotes) priorNotes.push(`  - difficulty notes: "${event.difficultyNotes}"`);

  const userPrompt =
    `Audit this event record:\n` +
    `Title: "${event.title ?? "unknown"}"\n` +
    `Description: "${event.description ?? "none"}"\n` +
    `Stated year: ${event.year ?? "unknown"}\n` +
    `Stated location: "${event.locationName ?? "unknown"}"` +
    ` (lat ${event.lat ?? "?"}, lng ${event.lng ?? "?"})\n` +
    `Hints shown to players:\n${hintLines}\n` +
    `Existing vision-model notes:\n${priorNotes.length === 0 ? "  (none)" : priorNotes.join("\n")}\n\n` +
    `Reply with the JSON object only.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}
