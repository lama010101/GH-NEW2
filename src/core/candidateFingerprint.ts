// GEN-BUILD-DISCOVER-1028-001
// Dedupe fingerprint for generation candidates. Pure, no I/O.
// This is the ONLY fingerprint implementation — later pipeline phases
// (narrate/check/publish) import these helpers, never reimplement them.

import { normalizeText } from "./wikidataMatch";

/**
 * normalizeTitle — lowercase, diacritics stripped, non-alphanumerics
 * removed (treated as word separators), spaces collapsed. Delegates to
 * normalizeText (src/core/wikidataMatch.ts) so title normalization has
 * exactly one implementation in the codebase.
 */
export function normalizeTitle(s: string): string {
  return normalizeText(s);
}

/**
 * buildDedupeFingerprint — stable dedupe key for a candidate or an
 * existing event:
 *   `${normalizedTitle}|${year ?? 'na'}|${lat?.toFixed(1) ?? 'na'}|${lon?.toFixed(1) ?? 'na'}`
 * Coordinates are rounded to 0.1 degree (~11 km) so near-identical places
 * collide; missing year/coords degrade to 'na'.
 */
export function buildDedupeFingerprint(input: {
  title: string;
  year: number | null;
  lat: number | null;
  lon: number | null;
}): string {
  const t = normalizeTitle(input.title);
  const y = input.year == null ? "na" : String(input.year);
  const la = input.lat == null ? "na" : input.lat.toFixed(1);
  const lo = input.lon == null ? "na" : input.lon.toFixed(1);
  return `${t}|${y}|${la}|${lo}`;
}
