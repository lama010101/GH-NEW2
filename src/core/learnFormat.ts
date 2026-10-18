// LEARN-BUILD-ABOUTEVENT-RESTRUCTURE-1018-011
// Pure formatter for the About-this-event clue fields. Each clue field is ONE
// string of smaller strings separated by commas (half- or full-width);
// splitClueList turns it into the bullet list the modal renders.

const CLUE_SPLIT_RE = /[,，]/;

/**
 * Splits a comma-separated clue string into trimmed, non-empty items with the
 * first code point uppercased (toLocaleUpperCase — locale + Unicode safe).
 * Returns [] for null/undefined/empty input.
 */
export function splitClueList(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  return raw
    .split(CLUE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const [first] = Array.from(s);
      return first.toLocaleUpperCase() + s.slice(first.length);
    });
}
