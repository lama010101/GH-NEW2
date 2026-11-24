// EDQ-BUILD-REVIEWQUEUE-1124-872
// Single owner of the event fact-check reliability rule. Deterministic —
// derived only from the verdict + structured check flags + source counts.
// Never an LLM confidence score. Used by scripts/factcheck/review-cli.ts
// (worker records) and the one-time ledger backfill.
//
// Rule (CTO spec):
//   WRONG verdicts (FALSE, WRONG_YEAR, WRONG_PLACE, MISNAMED, NOT_REAL):
//     n_sources >= 2 -> reliability 0; otherwise 20 + needs_recheck.
//     (Any single-source "wrong" is therefore capped well under 40.)
//   SOFT verdicts (GENERIC, UNVERIFIABLE, AMBIGUOUS): reliability <= 50
//     -> fixed 50 (the spec gives only an upper bound; 50 is the
//     deterministic maximal compliant value).
//   TRUE: title_ok AND year_ok AND place_ok must all be === true, else the
//     verdict is downgraded to the matching wrong verdict (title ->
//     MISNAMED, year -> WRONG_YEAR, place -> WRONG_PLACE; first failure in
//     title/year/place order wins) and scored by the wrong-verdict rule.
//     TRUE then scores: 70 when n_sources < 2 or independentDomains < 2;
//     100 when n_sources >= 3 AND independentDomains >= 3; else 95.
//     (The "each with a quote" precondition is enforced upstream — the CLI
//     rejects records whose sources lack quotes.)
//   No asterisked/qualified TRUE exists.

export const RELIABILITY_PLAY_MIN = 95;

export const FACT_CHECK_VERDICTS = [
  "TRUE",
  "FALSE",
  "WRONG_YEAR",
  "WRONG_PLACE",
  "MISNAMED",
  "NOT_REAL",
  "GENERIC",
  "UNVERIFIABLE",
  "AMBIGUOUS",
] as const;
export type FactCheckVerdict = (typeof FACT_CHECK_VERDICTS)[number];

export type ReliabilityInput = {
  verdict: FactCheckVerdict;
  title_ok: boolean | null;
  year_ok: boolean | null;
  place_ok: boolean | null;
  n_sources: number;
  independentDomains: number;
};

export type ReliabilityResult = {
  /** Effective verdict after any TRUE downgrade. */
  verdict: FactCheckVerdict;
  /** 0..100 deterministic reliability. */
  reliability: number;
  needs_recheck: boolean;
};

const WRONG_VERDICTS: ReadonlySet<FactCheckVerdict> = new Set([
  "FALSE",
  "WRONG_YEAR",
  "WRONG_PLACE",
  "MISNAMED",
  "NOT_REAL",
]);

const SOFT_VERDICTS: ReadonlySet<FactCheckVerdict> = new Set([
  "GENERIC",
  "UNVERIFIABLE",
  "AMBIGUOUS",
]);

function count(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

export function computeReliability(input: ReliabilityInput): ReliabilityResult {
  let verdict = input.verdict;

  if (verdict === "TRUE") {
    if (input.title_ok !== true) verdict = "MISNAMED";
    else if (input.year_ok !== true) verdict = "WRONG_YEAR";
    else if (input.place_ok !== true) verdict = "WRONG_PLACE";
  }

  const n = count(input.n_sources);
  const d = count(input.independentDomains);

  if (WRONG_VERDICTS.has(verdict)) {
    if (n >= 2) return { verdict, reliability: 0, needs_recheck: false };
    return { verdict, reliability: 20, needs_recheck: true };
  }

  if (SOFT_VERDICTS.has(verdict)) {
    return { verdict, reliability: 50, needs_recheck: false };
  }

  // verdict === "TRUE" here (downgraded verdicts returned above).
  if (n < 2 || d < 2) return { verdict, reliability: 70, needs_recheck: false };
  if (n >= 3 && d >= 3) return { verdict, reliability: 100, needs_recheck: false };
  return { verdict, reliability: 95, needs_recheck: false };
}
