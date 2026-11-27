// EDQ-BUILD-CORRECTIONLOOP-1126-898
// Pure correction-loop rules. No I/O: every decision is derived only from the
// facts passed in by the CLI. A correction is a claim until an independent
// corr-v1 TRUE verification satisfies the play threshold.

import { RELIABILITY_PLAY_MIN } from "./eventReliability";

export const CORRECTION_PROTOCOL = "corr-v1";
export const CORRECTION_RELIABILITY_MIN = RELIABILITY_PLAY_MIN;
export const CORRECTION_MIN_SOURCES = 2;
export const CORRECTION_MIN_INDEPENDENT_DOMAINS = 2;
export const CORRECTION_YEAR_SHIFT_REVIEW_THRESHOLD = 10;
export const CORRECTION_REVIEW_PRIORITY = 12;
export const CORRECTION_CANDIDATE_PRIORITY_MULTI_SOURCE = 2;
export const CORRECTION_CANDIDATE_PRIORITY_SINGLE_SOURCE = 1;

export const CORRECTABLE_WRONG_VERDICTS = ["FALSE", "WRONG_YEAR", "WRONG_PLACE", "MISNAMED"] as const;
export const WRONG_EVENT_VERDICTS = [...CORRECTABLE_WRONG_VERDICTS, "NOT_REAL"] as const;
export const SOFT_REVIEW_VERDICTS = ["GENERIC", "UNVERIFIABLE", "AMBIGUOUS"] as const;

export type CorrectionPatch = {
  title?: string;
  year?: number;
  description?: string;
};

export type StoredEventFacts = {
  title: string;
  description: string | null;
  event_year: number;
};

export type StoredPlaceFacts = {
  display_name?: string | null;
  country?: string | null;
};

export type CandidateSkipReason = "no_actionable_correction" | "place_change_unsupported" | "not_real";
export type ApplySkipReason = CandidateSkipReason | "year_shift_needs_image_review" | "stale_text" | "stale_hints";

export type CandidateClassification =
  | { state: "open"; proposed: CorrectionPatch; changedFields: Array<keyof CorrectionPatch> }
  | { state: "skipped"; skip_reason: CandidateSkipReason };

const CORRECTION_FIELDS = ["title", "year", "description"] as const;
const WIKI_FAMILY_SUFFIXES = ["wikipedia.org", "wikidata.org", "dbpedia.org", "wikimedia.org"] as const;
const WIKI_FAMILY_KEY = "wikimedia-family";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTitle(value: string): string {
  return normalizeSpaces(value).toLowerCase();
}

export function parseCorrectionYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (Number.isSafeInteger(n)) return n;
  }
  return null;
}

export function diffCorrection(
  stored: StoredEventFacts,
  corrected: unknown,
): { proposed: CorrectionPatch; changedFields: Array<keyof CorrectionPatch> } {
  const proposed: CorrectionPatch = {};
  const changedFields: Array<keyof CorrectionPatch> = [];
  if (!isRecord(corrected)) return { proposed, changedFields };

  if (typeof corrected.title === "string" && corrected.title.trim() !== "") {
    if (normalizeSpaces(corrected.title) !== normalizeSpaces(stored.title)) {
      proposed.title = normalizeSpaces(corrected.title);
      changedFields.push("title");
    }
  }

  if (corrected.year !== undefined) {
    const year = parseCorrectionYear(corrected.year);
    if (year !== null && year !== stored.event_year) {
      proposed.year = year;
      changedFields.push("year");
    }
  }

  if (typeof corrected.description === "string") {
    if (normalizeSpaces(corrected.description) !== normalizeSpaces(stored.description ?? "")) {
      proposed.description = normalizeSpaces(corrected.description);
      changedFields.push("description");
    }
  }

  return { proposed, changedFields };
}

export function placeValueDiffers(place: unknown, storedPlace?: StoredPlaceFacts | null): boolean {
  if (place == null || place === "") return false;
  if (typeof place !== "string") return true;
  const proposed = normalizeTitle(place);
  if (proposed === "") return false;
  const display = storedPlace?.display_name ?? null;
  const country = storedPlace?.country ?? null;
  const same = new Set<string>();
  for (const value of [display, country]) {
    if (typeof value === "string" && value.trim() !== "") same.add(normalizeTitle(value));
  }
  if (display?.trim() && country?.trim()) {
    same.add(normalizeTitle(`${display}, ${country}`));
    same.add(normalizeTitle(`${country}, ${display}`));
  }
  return !same.has(proposed);
}

export function classifyCorrectionCandidate(input: {
  verdict: string;
  retired: boolean;
  stored: StoredEventFacts;
  corrected: unknown;
  storedPlace?: StoredPlaceFacts | null;
}): CandidateClassification {
  if (input.verdict === "NOT_REAL") return { state: "skipped", skip_reason: "not_real" };
  if (!(CORRECTABLE_WRONG_VERDICTS as readonly string[]).includes(input.verdict) || !input.retired) {
    return { state: "skipped", skip_reason: "no_actionable_correction" };
  }
  if (isRecord(input.corrected) && Object.prototype.hasOwnProperty.call(input.corrected, "place")) {
    if (placeValueDiffers(input.corrected.place, input.storedPlace)) {
      return { state: "skipped", skip_reason: "place_change_unsupported" };
    }
  }
  const diff = diffCorrection(input.stored, input.corrected);
  if (diff.changedFields.length === 0) return { state: "skipped", skip_reason: "no_actionable_correction" };
  return { state: "open", proposed: diff.proposed, changedFields: diff.changedFields };
}

export function domainFamily(domain: string): string {
  const d = domain.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (d === "") return "";
  for (const suffix of WIKI_FAMILY_SUFFIXES) {
    if (d === suffix || d.endsWith(`.${suffix}`)) return WIKI_FAMILY_KEY;
  }
  return d;
}

export function countIndependentDomains(domains: string[]): number {
  return new Set(domains.map(domainFamily).filter((d) => d !== "")).size;
}

export function correctionValuesEqual(proposed: CorrectionPatch, corrected: unknown): boolean {
  if (!isRecord(corrected)) return false;
  const proposedKeys = CORRECTION_FIELDS.filter((key) => proposed[key] !== undefined);
  if (proposedKeys.length === 0) return false;

  // Title/year are authoritative correction claims: the second worker may not
  // add or alter one that the first worker did not propose. Description is the
  // one permitted addition because it is the cleanup mechanism for stale text
  // embedding the old year/title inside a longer narrative.
  if (corrected.title !== undefined && proposed.title === undefined) return false;
  if (corrected.year !== undefined && proposed.year === undefined) return false;

  for (const key of proposedKeys) {
    if (corrected[key] === undefined) return false;
    if (key === "year") {
      const a = parseCorrectionYear(proposed.year);
      const b = parseCorrectionYear(corrected.year);
      if (a === null || b === null || a !== b) return false;
    } else if (key === "title") {
      if (typeof corrected.title !== "string" || typeof proposed.title !== "string") return false;
      if (normalizeTitle(corrected.title) !== normalizeTitle(proposed.title)) return false;
    } else {
      if (typeof corrected.description !== "string" || typeof proposed.description !== "string") return false;
      if (normalizeSpaces(corrected.description) !== normalizeSpaces(proposed.description)) return false;
    }
  }
  return true;
}

export function effectiveCorrectionPatch(proposed: CorrectionPatch, corrected: unknown): CorrectionPatch {
  const out: CorrectionPatch = { ...proposed };
  if (out.description === undefined && isRecord(corrected) && typeof corrected.description === "string" && corrected.description.trim() !== "") {
    out.description = normalizeSpaces(corrected.description);
  }
  return out;
}

export function applyCorrectionPatch(stored: StoredEventFacts, patch: CorrectionPatch): StoredEventFacts {
  return {
    title: patch.title ?? stored.title,
    description: patch.description ?? stored.description,
    event_year: patch.year ?? stored.event_year,
  };
}

export function containsYearToken(text: string, year: number): boolean {
  const digits = String(Math.abs(Math.trunc(year)));
  if (digits.length < 3 || digits.length > 4) return false;
  return new RegExp(`(^|[^0-9])${digits}([^0-9]|$)`).test(text);
}

function normalizedIncludesTitle(text: string, title: string): boolean {
  const needle = normalizeTitle(title);
  return needle !== "" && normalizeTitle(text).includes(needle);
}

export function detectStaleText(
  before: StoredEventFacts,
  after: StoredEventFacts,
  correctedDescriptionSupplied: boolean,
): boolean {
  if (correctedDescriptionSupplied) return false;
  const finalText = `${after.title}\n${after.description ?? ""}`;
  if (before.event_year !== after.event_year && containsYearToken(finalText, before.event_year)) return true;
  if (normalizeTitle(before.title) !== normalizeTitle(after.title) && normalizedIncludesTitle(finalText, before.title)) return true;
  return false;
}

export function detectStaleHints(
  hintContents: string[],
  before: StoredEventFacts,
  after: StoredEventFacts,
): boolean {
  for (const content of hintContents) {
    if (before.event_year !== after.event_year && containsYearToken(content, before.event_year)) return true;
    if (normalizeTitle(before.title) !== normalizeTitle(after.title) && normalizedIncludesTitle(content, before.title)) return true;
  }
  return false;
}

export function correctionApplySkipReason(input: {
  before: StoredEventFacts;
  after: StoredEventFacts;
  proposed: Record<string, unknown>;
  sourceCorrected: unknown;
  sourceVerdict: string;
  storedPlace?: StoredPlaceFacts | null;
  hintContents: string[];
  correctedDescriptionSupplied: boolean;
}): ApplySkipReason | null {
  if (input.sourceVerdict === "NOT_REAL") return "not_real";
  if (placeValueDiffers(input.proposed.place, input.storedPlace)) return "place_change_unsupported";
  if (isRecord(input.sourceCorrected) && placeValueDiffers(input.sourceCorrected.place, input.storedPlace)) {
    return "place_change_unsupported";
  }
  const proposedYear = parseCorrectionYear(input.proposed.year);
  if (proposedYear !== null && Math.abs(proposedYear - input.before.event_year) > CORRECTION_YEAR_SHIFT_REVIEW_THRESHOLD) {
    return "year_shift_needs_image_review";
  }
  if (detectStaleText(input.before, input.after, input.correctedDescriptionSupplied)) return "stale_text";
  if (detectStaleHints(input.hintContents, input.before, input.after)) return "stale_hints";
  return null;
}
