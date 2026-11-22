// Pure helpers for the image chrono-anachronism audit —
// EDQ-BUILD-IMGCHRONO-1122-810.
//
// Vision roster models (free/cheap tier per src/core/aiEligibility.ts) audit
// every image of playable events for scene-content anachronisms — objects,
// clothing, architecture, vehicles, technology or writing/signage that could
// not exist at the event's stated year and place. One OpenRouter vision call
// per (event, image, model); findings land in ai_image_chrono_flags and the
// corroboration view ai_image_chrono_holds derives holds (>= 2 DISTINCT
// players flagging the same element_category on the current primary image).
//
//   CHRONO_CATEGORIES / CHRONO_CATEGORY_DEFINITIONS  fixed taxonomy (also the
//                                                     migration CHECK list)
//   normalizeText           lowercase alnum-only normalization for keys
//   anachronismKey          sha256(category|normalized).slice(0,16)
//   buildChronoAuditMessages system+user vision prompt (image_url + text)
//   parseChronoAudit        strict reply -> {findings, reasoning, error}
//   decideHold              per-(event,image,category) corroboration rollup
//
// No I/O, no clock — every input is injected (same posture as aiEventAudit).

import { createHash } from "node:crypto";
import { cleanJson } from "./aiEventAudit";

export const CHRONO_CATEGORIES = [
  "attire",
  "technology",
  "vehicles",
  "architecture",
  "weapons_military",
  "signage_text",
  "lighting_photo",
  "food_objects",
  "other",
] as const;

export type ChronoCategory = (typeof CHRONO_CATEGORIES)[number];

/** One-line definition per category — inlined into the audit prompt. */
export const CHRONO_CATEGORY_DEFINITIONS: Record<ChronoCategory, string> = {
  attire:
    "clothing and wearables, including modern items like watches or glasses",
  technology: "electronics, modern devices, machinery",
  vehicles: "cars, aircraft, ships, trains and other vehicles",
  architecture: "buildings, construction styles, infrastructure",
  weapons_military: "weapons, armor, military equipment, fortifications",
  signage_text:
    "writing, logos, flags or symbols that belong to the wrong era or language",
  lighting_photo:
    "electric lighting, flash photography and other modern photographic artifacts",
  food_objects: "food, drink, tableware and household items",
  other: "any other scene-content anachronism not covered above",
};

/**
 * Normalizes finding text for anachronism_key: lowercase, diacritics stripped,
 * every non-alphanumeric run collapsed to a single space. Two wordings that
 * normalize identically produce the same key; the corroboration hold itself
 * groups on element_category, not on the key.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** sha256(`${category}|${normalizeText(text)}`).slice(0,16) — the dedupe key. */
export function anachronismKey(category: string, anachronismText: string): string {
  return createHash("sha256")
    .update(`${category}|${normalizeText(anachronismText)}`)
    .digest("hex")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// parseChronoAudit — strict reply -> ai_image_chrono_flags finding shape
// ---------------------------------------------------------------------------

export type ChronoFinding = {
  anachronism_text: string;
  element_category: ChronoCategory;
  confidence: number | null;
};

export type ChronoAuditResult = {
  findings: ChronoFinding[];
  reasoning: string | null;
  /** Set when the reply could not be parsed at all. */
  error: string | null;
};

function asConfidence(value: unknown): number | null {
  const n =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

/**
 * Category coercion: a value outside CHRONO_CATEGORIES degrades to 'other' —
 * the finding is preserved (it is still signal) and the migration CHECK is
 * always satisfied. Non-string/missing likewise -> 'other'.
 */
function asChronoCategory(value: unknown): ChronoCategory {
  return typeof value === "string" &&
    (CHRONO_CATEGORIES as readonly string[]).includes(value)
    ? (value as ChronoCategory)
    : "other";
}

/**
 * Parses the auditor reply into findings. A reply that is not JSON or not an
 * object yields {error, findings: []} — the caller stores the error and moves
 * on. Field-level problems degrade per-field: findings without a non-empty
 * anachronism_text are dropped, unknown categories become 'other', confidence
 * is clamped to 0..1 (non-numeric -> null).
 */
export function parseChronoAudit(
  responseText: string | null | undefined
): ChronoAuditResult {
  if (typeof responseText !== "string" || responseText.trim().length === 0) {
    return { findings: [], reasoning: null, error: "empty chrono response" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson(responseText));
  } catch (err) {
    return {
      findings: [],
      reasoning: null,
      error: `Failed to parse chrono response: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { findings: [], reasoning: null, error: "Chrono response is not a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;
  const rawFindings = Array.isArray(obj.findings) ? obj.findings : [];
  const findings: ChronoFinding[] = [];
  for (const raw of rawFindings) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const f = raw as Record<string, unknown>;
    const text =
      typeof f.anachronism_text === "string" ? f.anachronism_text.trim() : "";
    if (text.length === 0) continue;
    findings.push({
      anachronism_text: text,
      element_category: asChronoCategory(f.element_category),
      confidence: asConfidence(f.confidence),
    });
  }
  const reasoning =
    typeof obj.reasoning === "string" && obj.reasoning.length > 0
      ? obj.reasoning
      : null;
  return { findings, reasoning, error: null };
}

// ---------------------------------------------------------------------------
// buildChronoAuditMessages — vision prompt (image_url + text parts)
// ---------------------------------------------------------------------------

export type ChronoAuditInput = {
  imageUrl: string;
  year: number | null;
  locationName: string | null;
  title?: string | null;
  description?: string | null;
};

export type ChronoMessage = { role: "system" | "user"; content: unknown };

const CATEGORY_LIST = CHRONO_CATEGORIES.map(
  (c) => `  - ${c}: ${CHRONO_CATEGORY_DEFINITIONS[c]}`
).join("\n");

/**
 * System + user messages for the chrono audit call. The user turn carries the
 * image (image_url part, detail "auto" — same as generate-answers-v3) plus
 * the event year/place context. The prompt flags ONLY scene-content
 * anachronisms and explicitly excludes photographic look, art style, image
 * quality and generic AI artifacts.
 */
export function buildChronoAuditMessages(input: ChronoAuditInput): ChronoMessage[] {
  const systemPrompt =
    `You are auditing a historical image for chrono-anachronisms: objects, ` +
    `clothing, architecture, vehicles, technology, or writing/signage visible ` +
    `in the scene that could not exist at the event's stated year and place.\n\n` +
    `Flag ONLY scene-content anachronisms relative to the event year and ` +
    `place. Do NOT flag:\n` +
    `- the photographic look of the image (for example a painting or engraving ` +
    `presented as a photograph, or a photographic style before photography existed)\n` +
    `- art style, medium, or image quality\n` +
    `- generic AI artifacts (distorted hands, faces, textures)\n\n` +
    `For each anachronism give:\n` +
    `- anachronism_text: a short description of the anachronistic element\n` +
    `- element_category: exactly one of:\n${CATEGORY_LIST}\n` +
    `- confidence: number 0-1\n\n` +
    `Reply with a single JSON object (JSON only, no markdown, no prose):\n` +
    `{"findings":[{"anachronism_text":"...","element_category":"attire","confidence":0.8}],"reasoning":"..."}\n` +
    `If nothing in the scene is anachronistic, reply {"findings":[]}.`;

  const contextLines = [
    `Event year: ${input.year ?? "unknown"}`,
    `Event place: "${input.locationName ?? "unknown"}"`,
  ];
  if (input.title) contextLines.push(`Event title: "${input.title}"`);
  if (input.description) {
    contextLines.push(`Event description: "${input.description}"`);
  }
  const userPrompt =
    `${contextLines.join("\n")}\n\n` +
    `Audit the attached image for scene-content anachronisms relative to this ` +
    `year and place. Reply with the JSON object only.`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: input.imageUrl, detail: "auto" } },
        { type: "text", text: userPrompt },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// decideHold — corroboration rollup (mirrors ai_image_chrono_holds)
// ---------------------------------------------------------------------------

/** One ai_image_chrono_flags row as decideHold consumes it. */
export type ChronoFlagRow = {
  event_id: string;
  image_id: string;
  ai_player_id: string;
  flagged: boolean;
  element_category: string | null;
};

export type ChronoHold = {
  event_id: string;
  image_id: string;
  element_category: string;
  flagger_count: number;
  held: boolean;
};

/** A (event,image,category) group is held at >= 2 DISTINCT flagging players. */
export const CHRONO_HOLD_MIN_FLAGGERS = 2;

/**
 * Groups flagged rows by (event_id, image_id, element_category) and counts
 * DISTINCT ai_player_id per group — the same corroboration rule as the
 * ai_image_chrono_holds view. flagged=false rows and null categories never
 * hold; different categories never merge; one player flagging twice (even
 * with different wording/keys) counts once. Returns every group, sorted by
 * (event_id, image_id, element_category); `held` marks count >= 2.
 */
export function decideHold(rows: readonly ChronoFlagRow[]): ChronoHold[] {
  const groups = new Map<
    string,
    { event_id: string; image_id: string; element_category: string; players: Set<string> }
  >();
  for (const row of rows) {
    if (!row.flagged) continue;
    if (row.element_category === null || row.element_category === undefined) continue;
    if (row.element_category.length === 0) continue;
    const key = `${row.event_id}${row.image_id}${row.element_category}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        event_id: row.event_id,
        image_id: row.image_id,
        element_category: row.element_category,
        players: new Set<string>(),
      };
      groups.set(key, group);
    }
    group.players.add(row.ai_player_id);
  }
  return [...groups.values()]
    .map((g) => ({
      event_id: g.event_id,
      image_id: g.image_id,
      element_category: g.element_category,
      flagger_count: g.players.size,
      held: g.players.size >= CHRONO_HOLD_MIN_FLAGGERS,
    }))
    .sort(
      (a, b) =>
        a.event_id.localeCompare(b.event_id) ||
        a.image_id.localeCompare(b.image_id) ||
        a.element_category.localeCompare(b.element_category)
    );
}
