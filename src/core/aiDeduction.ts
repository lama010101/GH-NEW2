// Pure text-only deduction benchmark core — T-PLAN-01 of
// AIP-PLAN-DEDUCTDEVIN-1108-012 (AIP-BUILD-DEDUCTCORE-1108-013).
//
// Everything here is deterministic and side-effect free: no DB, no network,
// no fs, no env, no clock. Callers pass data in; the only hashing is
// node:crypto sha256, used solely for stable option ordering.
//
//   scrubDescription      R1-R5 leak scrub for event descriptions (fail closed)
//   renderHint            tier-5 hint content may be a JSON array string
//   buildT1Stimulus       cumulative when/where hints for ladder step 1..5
//   buildT2Prompt         user message for the scrubbed-description task
//   buildT3Item           5-way title multiple choice, sha256-ordered options
//   buildT4Item           pick-real hint variant (variant A only)
//   parseDeductionAnswer  tolerant JSON answer parser (never throws)
//   scoreAnswer           wraps rules.evaluateRound for t1/t2; exact match t3/t4
//   brier                 (confidence - outcome)^2
//   aggregateDeductionScores / summarizeLadder   pure aggregation helpers
//
// Scoring note: for t1/t2 the binary outcome behind `correct`/brier is
// roundAccuracy >= 90 — the same threshold summarizeLadder uses for
// "first step reaching >= 90 round accuracy".

import { createHash } from "node:crypto";
import { evaluateRound } from "./rules";
import { cleanJson } from "./aiEventAudit";
import { balancedSlice } from "./aiHintReview";
import type { EventRecord, GuessState } from "./types";

/** Frozen scoring reference year — the only place this value lives. */
export const DEDUCTION_REFERENCE_YEAR = 2026;

export type DeductionTask = "t1" | "t2" | "t3" | "t4";

/** The answer envelope every deduction task returns. */
export type DeductionAnswer = {
  year: number | null;
  lat: number | null;
  lng: number | null;
  choice: string | null;
  confidence: number | null;
  abstain: boolean;
  reasoning: string | null;
};

// ---------------------------------------------------------------------------
// scrubDescription — R1-R5
// ---------------------------------------------------------------------------

export type DeductionScrubContext = {
  eventYear: number;
  title: string;
  displayName: string | null;
  country: string | null;
  continent: string | null;
};

export type DeductionScrubResult = {
  text: string;
  ok: boolean;
  reasons: string[];
};

/** Placeholders emitted for every removed year / place / title token. */
const YEAR_PLACEHOLDER = "[year]";
const PLACE_PLACEHOLDER = "[place]";
const EVENT_PLACEHOLDER = "[event]";
const PLACEHOLDER_RE = /\[(?:year|place|event)\]/g;
const PLACEHOLDER_MERGE_RE = /\[(year|place|event)\](?:(?:[ \t,]+|\band\b)*\[\1\])+/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Standalone-token match: not preceded/followed by an ASCII letter or digit. */
function tokenRe(body: string, flags = "gi"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, flags);
}

/** R1: the literal eventYear plus "<year> BCE|BC|AD|CE" variants (BCE => abs). */
function eventYearPatterns(eventYear: number): RegExp[] {
  if (!Number.isFinite(eventYear)) return [];
  const y = escapeRegExp(String(Math.abs(eventYear)));
  return [
    new RegExp(`(?<![A-Za-z0-9])${y}\\s*(?:BCE|BC|AD|CE)\\b`, "gi"),
    tokenRe(y, "gi"),
  ];
}

/** Era markers shared by the R2 era rules (B6 numbers, B8 decades, B9 ranges). */
const ERA_SRC = String.raw`(?:B\.C\.E?\.?|BCE|BC|A\.D\.?|AD|CE)`;

// B9 — year ranges "1969/70", "1969-70"; an optional era suffix is consumed too.
function yearRangeRe(flags = "gi"): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9])\\d{4}\\s*[/-]\\s*\\d{2,4}(?:\\s*${ERA_SRC})?(?![A-Za-z0-9])`,
    flags
  );
}

// B6 — era-suffixed numbers of any length 1-4 digits, suffix and AD-prefix forms.
function eraSuffixRe(flags = "gi"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])\\d{1,4}\\s*${ERA_SRC}(?![A-Za-z0-9])`, flags);
}
function eraPrefixRe(flags = "gi"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])(?:A\\.D\\.?|AD)\\s*\\d{1,4}(?![A-Za-z0-9])`, flags);
}

// B8 — 2-3 digit decades only when era-suffixed or preceded by the/early/mid/late.
function precededDecadeRe(flags = "gi"): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9])(?:the|early|mid|late)[-\\s]\\d{1,2}0s(?:\\s*${ERA_SRC})?(?![A-Za-z0-9])`,
    flags
  );
}
function eraDecadeRe(flags = "gi"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])\\d{1,4}0s\\s*${ERA_SRC}(?![A-Za-z0-9])`, flags);
}

// B7 — "(in )?the year <n>": only the number is replaced, the words stay.
function theYearRe(flags = "gi"): RegExp {
  return new RegExp(`(\\b(?:in\\s+)?the\\s+year\\s+)\\d{1,4}\\b`, flags);
}

// B2 — apostrophe years/decades: '69, ’69, '60s (apostrophe ' or ’; not after letter/digit).
function apostropheYearRe(flags = "gi"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])['’]\\d{2}s?(?![A-Za-z0-9])`, flags);
}

// B1 — comma-formatted years: 1,969.
function commaYearRe(flags = "gi"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])\\d{1,3}(?:,\\d{3})+(?![A-Za-z0-9])`, flags);
}

const CENTURY_ORDINAL_SRC = String.raw`(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty[-\s]?first)`;

// B3 — spelled-out centuries, in addition to the digit ordinals in YEAR_LIKE_SRC.
function spelledCenturyRe(flags = "gi"): RegExp {
  return new RegExp(`\\b${CENTURY_ORDINAL_SRC}[-\\s]+century\\b`, flags);
}

const DECADE_WORD_SRC = String.raw`(?:twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)`;

// B4 — spelled-out decades: "the sixties", "early twenties", "mid-twenties", "late the forties".
function spelledDecadeRe(flags = "gi"): RegExp {
  return new RegExp(
    `\\b(?:the\\s+${DECADE_WORD_SRC}|(?:early|mid|late)[-\\s]+(?:the\\s+)?${DECADE_WORD_SRC})\\b`,
    flags
  );
}

const YEAR_PREFIX_SRC = String.raw`(?:eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)`;
const YEAR_TENS_SRC = String.raw`(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)`;
const YEAR_ONES_SRC = String.raw`(?:one|two|three|four|five|six|seven|eight|nine)`;
const YEAR_TEENS_SRC = String.raw`(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)`;
const YEAR_COMPONENT_SRC = String.raw`(?:hundred|oh[-\s]?\w+|${YEAR_TENS_SRC}(?:[-\s]${YEAR_ONES_SRC})?|${YEAR_TEENS_SRC})`;

// B5 — spelled-out years: "nineteen sixty-nine", "eighteen hundred", "twenty twenty-six".
function spelledYearRe(flags = "gi"): RegExp {
  return new RegExp(`\\b${YEAR_PREFIX_SRC}[-\\s]+${YEAR_COMPONENT_SRC}\\b`, flags);
}

/** R2 generic year-like tokens — 4-digit 1000-2099, decades, digit centuries. */
const YEAR_LIKE_SRC = String.raw`\b(?:1\d{3}|20\d{2})\b|\b\d{3,4}0s\b|\b\d{1,2}(?:st|nd|rd|th)[- ]century\b`;

function yearLikeRe(flags = "gi"): RegExp {
  return new RegExp(YEAR_LIKE_SRC, flags);
}

/** Built-in aliases applied only when ctx.country matches exactly. */
const COUNTRY_PLACE_ALIASES: Record<string, readonly string[]> = {
  "United States": ["U.S.", "U.S.A.", "USA", "US"],
  "United Kingdom": ["U.K.", "UK", "Britain", "Great Britain"],
};

/** R3 surface forms, longest first: displayName, its comma components, country, continent, aliases. */
function collectPlaceForms(
  ctx: Pick<DeductionScrubContext, "displayName" | "country" | "continent">
): string[] {
  const forms = new Set<string>();
  const add = (v: string | null | undefined) => {
    const t = typeof v === "string" ? v.trim() : "";
    if (t.length > 0) forms.add(t);
  };
  add(ctx.displayName);
  if (typeof ctx.displayName === "string") {
    for (const part of ctx.displayName.split(",")) add(part);
  }
  add(ctx.country);
  add(ctx.continent);
  const country = typeof ctx.country === "string" ? ctx.country.trim() : "";
  for (const alias of COUNTRY_PLACE_ALIASES[country] ?? []) add(alias);
  return [...forms].sort((a, b) => b.length - a.length || cmpStr(a, b));
}

/** NFD-strip combining marks so e.g. "Kraków" also matches "Krakow". */
function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function capitalized(s: string): string {
  const lower = s.toLowerCase();
  return lower.length === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * R3 matchers for one surface form. Forms longer than 3 chars match
 * case-insensitively on the raw and accent-folded variants; forms of
 * length <= 3 match case-sensitively and only as UPPER or Capitalized
 * tokens, so the pronoun "us" is never removed.
 */
function placeFormRes(form: string, flags = "gi"): RegExp[] {
  const f = form.trim();
  if (f.length === 0) return [];
  const variants = new Set<string>([f]);
  const folded = foldAccents(f);
  if (folded !== f) variants.add(folded);
  if (f.length <= 3) {
    const bodies = new Set<string>();
    for (const v of variants) {
      bodies.add(v.toUpperCase());
      bodies.add(capitalized(v));
    }
    const body = [...bodies]
      .sort((a, b) => b.length - a.length || cmpStr(a, b))
      .map(escapeRegExp)
      .join("|");
    return [new RegExp(`(?<![A-Za-z0-9])(?:${body})(?![A-Za-z0-9])`, flags.replace("i", ""))];
  }
  const body = [...variants]
    .sort((a, b) => b.length - a.length || cmpStr(a, b))
    .map(escapeRegExp)
    .join("|");
  return [tokenRe(`(?:${body})`, flags)];
}

/** Applies R1-R3 removals to `text` (shared by the description and the title variant). */
function applyScrubRules(text: string, eventYear: number, forms: readonly string[]): string {
  let out = text;
  // Era forms run first so "AD 79" / "79 CE" are consumed whole; then ranges,
  // decades, the literal event year, spelled forms, generic year-likes, places.
  out = out.replace(eraPrefixRe(), YEAR_PLACEHOLDER);
  out = out.replace(eraSuffixRe(), YEAR_PLACEHOLDER);
  out = out.replace(precededDecadeRe(), YEAR_PLACEHOLDER);
  out = out.replace(eraDecadeRe(), YEAR_PLACEHOLDER);
  out = out.replace(yearRangeRe(), YEAR_PLACEHOLDER);
  for (const re of eventYearPatterns(eventYear)) out = out.replace(re, YEAR_PLACEHOLDER);
  out = out.replace(theYearRe(), `$1${YEAR_PLACEHOLDER}`);
  out = out.replace(apostropheYearRe(), YEAR_PLACEHOLDER);
  out = out.replace(commaYearRe(), YEAR_PLACEHOLDER);
  out = out.replace(spelledYearRe(), YEAR_PLACEHOLDER);
  out = out.replace(spelledDecadeRe(), YEAR_PLACEHOLDER);
  out = out.replace(spelledCenturyRe(), YEAR_PLACEHOLDER);
  out = out.replace(yearLikeRe(), YEAR_PLACEHOLDER);
  for (const f of forms) {
    for (const re of placeFormRes(f)) out = out.replace(re, PLACE_PLACEHOLDER);
  }
  return out;
}

/** Collapses the whitespace/punctuation residue left by removals. */
function collapseResidue(s: string): string {
  return s
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(PLACEHOLDER_MERGE_RE, "[$1]")
    .replace(/ +([,.;:!?)\]}])/g, "$1")
    .replace(/([(\[]) +/g, "$1")
    .replace(/(^|\n) +/g, "$1")
    .replace(/ +(?=\n|$)/g, "")
    .replace(/^[ \t]*[,.;:!?)\]}]+/gm, "")
    .replace(/,{2,}/g, ",")
    .replace(/,\s*,+/g, ",")
    .replace(/,\s*\./g, ".")
    .trim();
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** R5: residual leaks that R1-R4 failed to remove => ok=false (fail closed). */
function findResidualLeaks(
  text: string,
  ctx: DeductionScrubContext,
  forms: readonly string[]
): string[] {
  const reasons: string[] = [];
  const absYear = Math.abs(ctx.eventYear);
  // Placeholders are scrub artifacts, not leaks — probes ignore them.
  const probe = text.replace(PLACEHOLDER_RE, " ");
  const foldedProbe = foldAccents(probe);

  for (const re of eventYearPatterns(ctx.eventYear)) {
    if (re.test(probe)) {
      reasons.push(`eventYear ${ctx.eventYear}`);
      break;
    }
  }

  if (Number.isFinite(absYear) && absYear >= 10) {
    const decade = `${Math.floor(absYear / 10) * 10}s`;
    if (tokenRe(escapeRegExp(decade), "i").test(probe)) {
      reasons.push(`decade '${decade}'`);
    }
  }

  if (Number.isFinite(absYear) && absYear >= 1) {
    const century = Math.floor((absYear - 1) / 100) + 1;
    const ord = ordinalSuffix(century);
    if (new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(ord)}[- ]century\\b`, "i").test(probe)) {
      reasons.push(`century '${ord} century'`);
    }
  }

  // B1-B5 spelled-out / apostrophe / comma year-like survivors.
  if (commaYearRe("i").test(probe)) reasons.push("comma year");
  if (apostropheYearRe("i").test(probe)) reasons.push("apostrophe year");
  if (spelledCenturyRe("i").test(probe)) reasons.push("spelled century");
  if (spelledDecadeRe("i").test(probe)) reasons.push("spelled decade");
  if (spelledYearRe("i").test(probe)) reasons.push("spelled year");
  // B6 era-suffixed number survivors (suffix, prefix and decade forms).
  if (
    eraSuffixRe("i").test(probe) ||
    eraPrefixRe("i").test(probe) ||
    eraDecadeRe("i").test(probe)
  ) {
    reasons.push("era-suffixed number");
  }

  for (const f of forms) {
    if (f.trim().length < 4) continue;
    if (
      placeFormRes(f, "i").some((re) => re.test(probe)) ||
      placeFormRes(foldAccents(f), "i").some((re) => re.test(foldedProbe))
    ) {
      reasons.push(`place '${f}'`);
    }
  }

  return reasons;
}

/**
 * Scrubs a description for the deduction benchmark.
 * R1 literal eventYear (+ era suffixes) -> R2 all year-like tokens ->
 * R3 place surface forms (longest first) -> R4 the title itself ->
 * R5 fail-closed invariant. Never returns a leaky text with ok=true.
 */
export function scrubDescription(
  text: string,
  ctx: DeductionScrubContext
): DeductionScrubResult {
  const source = typeof text === "string" ? text : "";
  const title = typeof ctx.title === "string" ? ctx.title : "";
  const forms = collectPlaceForms(ctx);

  let out = collapseResidue(applyScrubRules(source, ctx.eventYear, forms));

  // R4 — remove the title (and its post-R1-R3 form) wherever it appears.
  const titleForms = new Set<string>();
  const rawTitle = collapseResidue(title);
  if (rawTitle.length > 0) titleForms.add(rawTitle);
  const scrubbedTitle = collapseResidue(applyScrubRules(title, ctx.eventYear, forms));
  if (scrubbedTitle.replace(PLACEHOLDER_RE, "").trim().length >= 4) {
    titleForms.add(scrubbedTitle);
  }
  for (const t of [...titleForms].sort((a, b) => b.length - a.length || cmpStr(a, b))) {
    out = out.replace(tokenRe(escapeRegExp(t), "gi"), EVENT_PLACEHOLDER);
  }
  out = collapseResidue(out);

  const reasons = findResidualLeaks(out, ctx, forms);
  return { text: out, ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// renderHint / buildT1Stimulus / buildT2Prompt
// ---------------------------------------------------------------------------

/** Tier-5 hint content may be a JSON array string; render it as bullets. */
export function renderHint(content: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
    return (parsed as string[]).map((s) => `- ${s}`).join("\n");
  }
  return content;
}

export type DeductionHintInput = {
  tier: number;
  type: string;
  content: string;
};

const T1_TYPES = new Set(["when", "where"]);

/**
 * Cumulative T1 stimulus: every when/where hint with tier <= step,
 * ordered by (tier, type), rendered as "Tier k when: ..." / "Tier k where: ...".
 * Never includes title, description, year, location or image.
 */
export function buildT1Stimulus(hints: readonly DeductionHintInput[], step: number): string {
  if (!Number.isInteger(step) || step < 1 || step > 5) {
    throw new Error(`buildT1Stimulus: step must be an integer in 1..5, got ${step}`);
  }
  return hints
    .filter((h) => h.tier <= step && T1_TYPES.has(h.type))
    .sort((a, b) => a.tier - b.tier || cmpStr(a.type, b.type))
    .map((h) => `Tier ${h.tier} ${h.type}: ${renderHint(h.content)}`)
    .join("\n");
}

/** User message for T2 — the title is never shown. */
export function buildT2Prompt(scrubbedDescription: string): string {
  return (
    `You are playing a text-only deduction game. The description below is of a ` +
    `historical event with all dates, years, decades, centuries and place names ` +
    `removed; removed items appear as [year] and [place] placeholders. ` +
    `Deduce the event's year and geographic coordinates.\n\n` +
    `Description:\n${scrubbedDescription}\n\n` +
    `Reply with a single JSON object (JSON only, no markdown, no prose) with ` +
    `EXACTLY these keys:\n` +
    `  - year (integer or null): best estimate of the event year\n` +
    `  - lat (number or null): latitude between -90 and 90\n` +
    `  - lng (number or null): longitude between -180 and 180\n` +
    `  - choice (string or null)\n` +
    `  - confidence (number 0-1): confidence in the answer\n` +
    `  - abstain (boolean): true if you cannot make a reliable deduction\n` +
    `  - reasoning (string or null): brief justification`
  );
}

// ---------------------------------------------------------------------------
// buildT3Item — title multiple choice
// ---------------------------------------------------------------------------

export type DeductionEventCore = {
  id: string;
  title: string;
  year: number;
  continent: string | null;
  displayName?: string | null;
  country?: string | null;
};

export type DeductionPoolEvent = DeductionEventCore & {
  hints?: readonly DeductionHintInput[];
};

export type DeductionOption = { id: string; title: string };

export type DeductionT3Result =
  | { ok: true; options: DeductionOption[]; answerId: string }
  | { ok: false; reason: "insufficient_decoys" | "option_title_leak" };

const OPTION_IDS = ["a", "b", "c", "d", "e"] as const;

function orderKey(eventId: string, candidateId: string, salt: string): string {
  return createHash("sha256").update(eventId + candidateId + salt).digest("hex");
}

/** Domain separator for the final option ordering (decoy selection keeps `salt`). */
const ORDER_SALT_SUFFIX = "|order";

/**
 * Scrubs one option title with that option event's OWN context (its own year,
 * displayName, country, continent) and the same rules/placeholders as
 * scrubDescription. R4 title-removal is disabled (title: "") because the text
 * IS the title. Returns null when the residual check still fails.
 */
function scrubOptionTitle(e: DeductionEventCore): string | null {
  const r = scrubDescription(e.title, {
    eventYear: e.year,
    title: "",
    displayName: e.displayName ?? null,
    country: e.country ?? null,
    continent: e.continent ?? null,
  });
  return r.ok ? r.text : null;
}

/**
 * 5 options = the true title + 4 decoys from pool events on the same
 * continent within +-50 years, never the true event or a duplicate title.
 * Decoy SELECTION is ordered by sha256(eventId + candidateId + salt); the
 * final option ORDER uses the domain-separated sha256(eventId + candidateId +
 * salt + "|order") so selection and ordering never share a hash value and the
 * true answer's position is an independent uniform draw.
 * Every option title is scrubbed with its own event context; decoy candidates
 * with displayName === undefined AND country === undefined are skipped because
 * they cannot be scrubbed symmetrically.
 */
export function buildT3Item(
  event: DeductionPoolEvent,
  pool: readonly DeductionEventCore[],
  salt: string
): DeductionT3Result {
  const candidates = pool
    .filter(
      (p) =>
        p.id !== event.id &&
        p.continent === event.continent &&
        Math.abs(p.year - event.year) <= 50 &&
        p.title !== event.title
    )
    .map((p) => ({ p, hash: orderKey(event.id, p.id, salt) }))
    .sort((a, b) => cmpStr(a.hash, b.hash));

  const decoys: { p: DeductionEventCore; hash: string }[] = [];
  const seenTitles = new Set<string>([event.title]);
  for (const c of candidates) {
    if (c.p.displayName === undefined && c.p.country === undefined) continue;
    if (seenTitles.has(c.p.title)) continue;
    seenTitles.add(c.p.title);
    decoys.push(c);
    if (decoys.length === 4) break;
  }
  if (decoys.length < 4) return { ok: false, reason: "insufficient_decoys" };

  const trueTitle = scrubOptionTitle(event);
  if (trueTitle === null) return { ok: false, reason: "option_title_leak" };

  type Entry = { title: string; orderHash: string; isTrue: boolean };
  const all: Entry[] = [
    {
      title: trueTitle,
      orderHash: orderKey(event.id, event.id, salt + ORDER_SALT_SUFFIX),
      isTrue: true,
    },
  ];
  for (const d of decoys) {
    const title = scrubOptionTitle(d.p);
    if (title === null) return { ok: false, reason: "option_title_leak" };
    all.push({
      title,
      orderHash: orderKey(event.id, d.p.id, salt + ORDER_SALT_SUFFIX),
      isTrue: false,
    });
  }
  all.sort((a, b) => cmpStr(a.orderHash, b.orderHash));

  const options = all.map((c, i) => ({ id: OPTION_IDS[i], title: c.title }));
  const answerId = OPTION_IDS[all.findIndex((c) => c.isTrue)];
  return { ok: true, options, answerId };
}

// ---------------------------------------------------------------------------
// buildT4Item — pick-real hint variant (variant A only)
// ---------------------------------------------------------------------------

export type DeductionT4Option = { id: string; content: string };

export type DeductionT4Result =
  | { ok: true; title: string; options: DeductionT4Option[]; answerId: string }
  | { ok: false; reason: "insufficient_decoys" | "missing_real_hint" };

/**
 * Variant A (pick-real): the event title plus 4 hint contents for the SAME
 * (tier,type) slot — the real one plus 3 decoys from the same slot of OTHER
 * pool events on the same continent within +-50 years, never equal to the
 * real content, deterministic by sha256.
 */
export function buildT4Item(
  event: DeductionPoolEvent,
  pool: readonly DeductionPoolEvent[],
  slot: { tier: number; type: string },
  salt: string
): DeductionT4Result {
  const real = (event.hints ?? []).find((h) => h.tier === slot.tier && h.type === slot.type);
  if (!real) return { ok: false, reason: "missing_real_hint" };

  const scored: { key: string; content: string; hash: string }[] = [];
  for (const p of pool) {
    if (p.id === event.id) continue;
    if (p.continent !== event.continent) continue;
    if (Math.abs(p.year - event.year) > 50) continue;
    for (const h of p.hints ?? []) {
      if (h.tier !== slot.tier || h.type !== slot.type) continue;
      if (h.content === real.content) continue;
      const key = `${p.id}:${h.content}`;
      scored.push({ key, content: h.content, hash: orderKey(event.id, key, salt) });
    }
  }
  scored.sort((a, b) => cmpStr(a.hash, b.hash));

  const decoys: { key: string; content: string; hash: string }[] = [];
  const seenContents = new Set<string>();
  for (const c of scored) {
    if (seenContents.has(c.content)) continue;
    seenContents.add(c.content);
    decoys.push(c);
    if (decoys.length === 3) break;
  }
  if (decoys.length < 3) return { ok: false, reason: "insufficient_decoys" };

  const realKey = `${event.id}:${real.content}`;
  type Entry = { content: string; orderHash: string; isReal: boolean };
  const all: Entry[] = [
    {
      content: real.content,
      orderHash: orderKey(event.id, realKey, salt + ORDER_SALT_SUFFIX),
      isReal: true,
    },
    ...decoys.map((d) => ({
      content: d.content,
      orderHash: orderKey(event.id, d.key, salt + ORDER_SALT_SUFFIX),
      isReal: false,
    })),
  ].sort((a, b) => cmpStr(a.orderHash, b.orderHash));

  const options = all.map((c, i) => ({ id: OPTION_IDS[i], content: c.content }));
  const answerId = OPTION_IDS[all.findIndex((c) => c.isReal)];
  return { ok: true, title: event.title, options, answerId };
}

// ---------------------------------------------------------------------------
// parseDeductionAnswer — tolerant JSON extraction, never throws
// ---------------------------------------------------------------------------

export type DeductionParseResult =
  | { ok: true; answer: DeductionAnswer; flags: string[] }
  | { ok: false; error: string; errorClass: "bad_output" };

const KNOWN_ANSWER_KEYS = new Set([
  "year",
  "lat",
  "lng",
  "choice",
  "confidence",
  "abstain",
  "reasoning",
]);

function parseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Fenced/prose-tolerant extraction of the answer object (reuses cleanJson + balancedSlice). */
function extractAnswerObject(raw: string): Record<string, unknown> | null {
  const cleaned = cleanJson(raw);
  const candidates: Record<string, unknown>[] = [];
  const push = (v: unknown) => {
    if (isRecord(v)) candidates.push(v);
  };

  push(parseJsonValue(cleaned));
  for (const source of [cleaned, raw]) {
    let idx = source.indexOf("{");
    while (idx !== -1) {
      const slice = balancedSlice(source, idx, "{", "}");
      if (slice !== null) push(parseJsonValue(slice));
      idx = source.indexOf("{", idx + 1);
    }
  }

  if (candidates.length === 0) return null;
  return (
    candidates.find((c) => Object.keys(c).some((k) => KNOWN_ANSWER_KEYS.has(k))) ??
    candidates[0]
  );
}

function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asIntOrNull(v: unknown): number | null {
  const n = asFiniteNumber(v);
  return n !== null && Number.isInteger(n) ? n : null;
}

function asLatOrNull(v: unknown): number | null {
  const n = asFiniteNumber(v);
  return n !== null && n >= -90 && n <= 90 ? n : null;
}

function asLngOrNull(v: unknown): number | null {
  const n = asFiniteNumber(v);
  return n !== null && n >= -180 && n <= 180 ? n : null;
}

function asConfidenceOrNull(v: unknown): number | null {
  const n = asFiniteNumber(v);
  return n === null ? null : Math.min(1, Math.max(0, n));
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Parses a model reply into the DeductionAnswer envelope.
 * Per-field validation only — a parseable object never throws; choice must
 * be one of `options` else it becomes null and is flagged. Truncated or
 * unparseable replies return {ok:false, errorClass:"bad_output"}.
 */
export function parseDeductionAnswer(
  raw: string | null | undefined,
  opts: { options?: string[] } = {}
): DeductionParseResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      ok: false,
      error: "Failed to parse AI deduction response: empty response",
      errorClass: "bad_output",
    };
  }
  const obj = extractAnswerObject(raw);
  if (obj === null) {
    return {
      ok: false,
      error: "Failed to parse AI deduction response: no JSON object found",
      errorClass: "bad_output",
    };
  }

  const flags: string[] = [];
  let choice: string | null = null;
  const rawChoice = obj.choice;
  if (typeof rawChoice === "string" && rawChoice.length > 0) {
    if (opts.options !== undefined && opts.options.includes(rawChoice)) {
      choice = rawChoice;
    } else {
      flags.push("invalid_choice");
    }
  }

  return {
    ok: true,
    flags,
    answer: {
      year: asIntOrNull(obj.year),
      lat: asLatOrNull(obj.lat),
      lng: asLngOrNull(obj.lng),
      choice,
      confidence: asConfidenceOrNull(obj.confidence),
      abstain: obj.abstain === true,
      reasoning: asStringOrNull(obj.reasoning),
    },
  };
}

// ---------------------------------------------------------------------------
// scoreAnswer / brier / aggregates
// ---------------------------------------------------------------------------

export type DeductionTruth = {
  year: number | null;
  lat: number | null;
  lng: number | null;
  choice?: string | null;
};

export type DeductionScore = {
  /** 0..100 — roundAccuracy for t1/t2, 100/0 for t3/t4. */
  accuracy: number;
  /** t3/t4 exact match; t1/t2 roundAccuracy >= 90. */
  correct: boolean;
  abstained: boolean;
  confidence: number | null;
  brier: number | null;
  error: string | null;
};

const CORRECT_THRESHOLD = 90;

/** Brier score for a probabilistic binary forecast: (confidence - outcome)^2. */
export function brier(confidence: number, outcome: 0 | 1): number {
  return (confidence - outcome) ** 2;
}

/**
 * Scores a parsed deduction answer against frozen truth.
 * t1/t2 delegate to rules.evaluateRound (reference year injected, default
 * DEDUCTION_REFERENCE_YEAR). t3/t4 are exact-match on the option id.
 * Abstain scores 0 accuracy and is flagged via `abstained`.
 */
export function scoreAnswer(
  task: DeductionTask,
  parsed: DeductionParseResult,
  truth: DeductionTruth,
  referenceYear: number = DEDUCTION_REFERENCE_YEAR
): DeductionScore {
  if (!parsed.ok) {
    return {
      accuracy: 0,
      correct: false,
      abstained: false,
      confidence: null,
      brier: null,
      error: parsed.error,
    };
  }
  const answer = parsed.answer;

  if (answer.abstain) {
    return {
      accuracy: 0,
      correct: false,
      abstained: true,
      confidence: answer.confidence,
      brier: answer.confidence === null ? null : brier(answer.confidence, 0),
      error: null,
    };
  }

  if (task === "t3" || task === "t4") {
    const correct = answer.choice !== null && answer.choice === (truth.choice ?? null);
    const outcome: 0 | 1 = correct ? 1 : 0;
    return {
      accuracy: correct ? 100 : 0,
      correct,
      abstained: false,
      confidence: answer.confidence,
      brier: answer.confidence === null ? null : brier(answer.confidence, outcome),
      error: null,
    };
  }

  const event: EventRecord = {
    id: "deduction-truth",
    title: "",
    description: "",
    year: truth.year ?? 0,
    location: {
      id: "deduction-truth",
      name: "",
      lat: truth.lat ?? 0,
      lng: truth.lng ?? 0,
    },
    region: "",
    imageUrl: null,
    thumbUrl: null,
    hints: [],
  };
  const guess: GuessState = {
    year: answer.year,
    location:
      answer.lat !== null && answer.lng !== null
        ? { lat: answer.lat, lng: answer.lng }
        : null,
  };
  const round = evaluateRound(event, guess, 0, false, 0, 0, referenceYear);
  const outcome: 0 | 1 = round.roundAccuracy >= CORRECT_THRESHOLD ? 1 : 0;
  return {
    accuracy: round.roundAccuracy,
    correct: outcome === 1,
    abstained: false,
    confidence: answer.confidence,
    brier: answer.confidence === null ? null : brier(answer.confidence, outcome),
    error: null,
  };
}

export type DeductionScoreAggregate = {
  count: number;
  abstained: number;
  meanAccuracy: number | null;
  meanBrier: number | null;
  correctRate: number | null;
};

/** Pure aggregate over DeductionScore rows. */
export function aggregateDeductionScores(
  scores: readonly DeductionScore[]
): DeductionScoreAggregate {
  if (scores.length === 0) {
    return { count: 0, abstained: 0, meanAccuracy: null, meanBrier: null, correctRate: null };
  }
  const briers = scores.map((s) => s.brier).filter((b): b is number => b !== null);
  return {
    count: scores.length,
    abstained: scores.filter((s) => s.abstained).length,
    meanAccuracy: scores.reduce((a, s) => a + s.accuracy, 0) / scores.length,
    meanBrier: briers.length === 0 ? null : briers.reduce((a, b) => a + b, 0) / briers.length,
    correctRate: scores.filter((s) => s.correct).length / scores.length,
  };
}

// ---------------------------------------------------------------------------
// summarizeLadder — steps 1-2 "deduction" vs 3-5 "extraction"
// ---------------------------------------------------------------------------

export type DeductionLadderStep = {
  step: number;
  roundAccuracy: number;
  brier?: number | null;
};

export type DeductionLadderSummary = {
  /** Mean round accuracy over steps 1-2 (headline). */
  deduction: number | null;
  /** Mean round accuracy over steps 3-5 (reported separately). */
  extraction: number | null;
  /** First step whose mean round accuracy reaches >= 90. */
  firstStepAt90: number | null;
  /** Mean brier over the steps that report one. */
  brier: number | null;
};

/**
 * Splits the hint ladder: steps 1-2 are the deduction headline, steps 3-5
 * are extraction (tier 3 reveals the decade for ~all events) and reported
 * separately. Per-step means are computed first, then averaged per band.
 */
export function summarizeLadder(
  steps: readonly DeductionLadderStep[]
): DeductionLadderSummary {
  const byStep = new Map<number, { acc: number[]; brier: number[] }>();
  for (const s of steps) {
    if (!Number.isInteger(s.step) || s.step < 1 || s.step > 5) continue;
    const e = byStep.get(s.step) ?? { acc: [], brier: [] };
    e.acc.push(s.roundAccuracy);
    if (typeof s.brier === "number" && Number.isFinite(s.brier)) e.brier.push(s.brier);
    byStep.set(s.step, e);
  }

  const stepMeans = [...byStep.entries()]
    .map(([step, e]) => ({
      step,
      roundAccuracy: e.acc.reduce((a, b) => a + b, 0) / e.acc.length,
      brier: e.brier.length === 0 ? null : e.brier.reduce((a, b) => a + b, 0) / e.brier.length,
    }))
    .sort((a, b) => a.step - b.step);

  const bandMean = (lo: number, hi: number): number | null => {
    const xs = stepMeans.filter((s) => s.step >= lo && s.step <= hi).map((s) => s.roundAccuracy);
    return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const briers = stepMeans.map((s) => s.brier).filter((b): b is number => b !== null);

  return {
    deduction: bandMean(1, 2),
    extraction: bandMean(3, 5),
    firstStepAt90: stepMeans.find((s) => s.roundAccuracy >= CORRECT_THRESHOLD)?.step ?? null,
    brier: briers.length === 0 ? null : briers.reduce((a, b) => a + b, 0) / briers.length,
  };
}
