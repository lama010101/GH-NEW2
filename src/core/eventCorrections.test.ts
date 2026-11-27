// EDQ-BUILD-CORRECTIONLOOP-1126-898
// Unit tests for src/core/eventCorrections.ts — eligibility, diffing,
// family-domain counting, stale-text/hint detection, and apply skip rules.

import { describe, expect, it } from "vitest";
import {
  CORRECTION_YEAR_SHIFT_REVIEW_THRESHOLD,
  applyCorrectionPatch,
  classifyCorrectionCandidate,
  correctionApplySkipReason,
  correctionValuesEqual,
  countIndependentDomains,
  effectiveCorrectionPatch,
  detectStaleHints,
  detectStaleText,
  diffCorrection,
  domainFamily,
  type StoredEventFacts,
} from "./eventCorrections";

const STORED: StoredEventFacts = {
  title: "The 1909 Wellington Ghost Scare",
  description: "Residents reported a ghost in 1909 near Wellington.",
  event_year: 1909,
};

describe("diffCorrection", () => {
  it("returns only title/year/description values that differ from stored facts", () => {
    const diff = diffCorrection(STORED, {
      title: "The 1909 New Zealand Phantom Airship Scare",
      year: 1909,
      description: "Residents reported airships in 1909.",
      note: "not part of the correction",
    });
    expect(diff.changedFields).toEqual(["title", "description"]);
    expect(diff.proposed).toEqual({
      title: "The 1909 New Zealand Phantom Airship Scare",
      description: "Residents reported airships in 1909.",
    });
  });

  it("accepts a strict numeric string year and rejects non-numeric year text", () => {
    expect(diffCorrection(STORED, { year: "1910" }).proposed.year).toBe(1910);
    expect(diffCorrection(STORED, { year: "1909/1910 conflated" }).proposed).toEqual({});
  });
});

describe("classifyCorrectionCandidate eligibility", () => {
  it("opens a retired wrong-year event when a numeric year correction differs", () => {
    const r = classifyCorrectionCandidate({
      verdict: "WRONG_YEAR",
      retired: true,
      stored: STORED,
      corrected: { year: 1908 },
    });
    expect(r).toEqual({ state: "open", proposed: { year: 1908 }, changedFields: ["year"] });
  });

  it("skips NOT_REAL forever even when a correction is present", () => {
    const r = classifyCorrectionCandidate({
      verdict: "NOT_REAL",
      retired: true,
      stored: STORED,
      corrected: { title: "Real title", year: 1908 },
    });
    expect(r).toEqual({ state: "skipped", skip_reason: "not_real" });
  });

  it("skips a correction carrying a different place", () => {
    const r = classifyCorrectionCandidate({
      verdict: "FALSE",
      retired: true,
      stored: STORED,
      storedPlace: { display_name: "Wellington, New Zealand", country: "New Zealand" },
      corrected: { title: "Another title", place: "Auckland, New Zealand" },
    });
    expect(r).toEqual({ state: "skipped", skip_reason: "place_change_unsupported" });
  });

  it("does not skip a place key that exactly restates the stored display name", () => {
    const r = classifyCorrectionCandidate({
      verdict: "WRONG_YEAR",
      retired: true,
      stored: STORED,
      storedPlace: { display_name: "Wellington, New Zealand", country: "New Zealand" },
      corrected: { year: 1908, place: "Wellington, New Zealand" },
    });
    expect(r.state).toBe("open");
  });

  it("skips missing, equal, or non-actionable corrections", () => {
    for (const corrected of [null, {}, { year: 1909 }, { year: "unclear" }, { title: STORED.title }]) {
      const r = classifyCorrectionCandidate({
        verdict: "WRONG_YEAR",
        retired: true,
        stored: STORED,
        corrected,
      });
      expect(r).toEqual({ state: "skipped", skip_reason: "no_actionable_correction" });
    }
  });

  it("skips an event that is not retired", () => {
    const r = classifyCorrectionCandidate({
      verdict: "WRONG_YEAR",
      retired: false,
      stored: STORED,
      corrected: { year: 1908 },
    });
    expect(r).toEqual({ state: "skipped", skip_reason: "no_actionable_correction" });
  });
});

describe("family-domain rule", () => {
  it("treats wikipedia/wikidata/dbpedia/wikimedia hosts and subdomains as one family", () => {
    expect(domainFamily("en.wikipedia.org")).toBe(domainFamily("wikidata.org"));
    expect(domainFamily("dbpedia.org")).toBe(domainFamily("commons.wikimedia.org"));
    expect(countIndependentDomains(["en.wikipedia.org", "wikidata.org", "dbpedia.org"])).toBe(1);
  });

  it("counts non-family domains independently", () => {
    expect(countIndependentDomains(["en.wikipedia.org", "britannica.com", "example.org"])).toBe(3);
    expect(countIndependentDomains(["www.britannica.com", "britannica.com"])).toBe(1);
  });
});

describe("correctionValuesEqual", () => {
  it("accepts normalized title equality and numeric year equality", () => {
    expect(correctionValuesEqual(
      { title: "  The   Correct Title ", year: 1804, description: "Exact text." },
      { title: "the correct title", year: "1804", description: "Exact text." },
    )).toBe(true);
  });

  it("rejects mismatched, missing, or extra authoritative corrected values", () => {
    expect(correctionValuesEqual({ year: 1804 }, { year: 1805 })).toBe(false);
    expect(correctionValuesEqual({ year: 1804 }, {})).toBe(false);
    expect(correctionValuesEqual({ year: 1804 }, { year: 1804, title: "extra" })).toBe(false);
    expect(correctionValuesEqual({ title: "A" }, { title: "B" })).toBe(false);
  });

  it("allows worker-supplied description cleanup and merges it into the effective patch", () => {
    const corrected = { year: 1804, description: "Clean narrative without the stale year." };
    expect(correctionValuesEqual({ year: 1804 }, corrected)).toBe(true);
    expect(effectiveCorrectionPatch({ year: 1804 }, corrected)).toEqual({
      year: 1804,
      description: "Clean narrative without the stale year.",
    });
  });
});

describe("stale text detection", () => {
  const before: StoredEventFacts = {
    title: "The Wellington Ghost Scare",
    description: "Residents reported a ghost in 1909 near Wellington.",
    event_year: 1909,
  };
  const afterYear = { ...before, event_year: 1908 };

  it("detects the old year as a bounded 3-4 digit token after a year correction", () => {
    expect(detectStaleText(before, afterYear, false)).toBe(true);
    expect(detectStaleText(before, { ...afterYear, description: "No year here." }, false)).toBe(false);
    expect(detectStaleText(before, { ...afterYear, description: "Not in 19091 or 21909." }, false)).toBe(false);
  });

  it("does not treat the current year as stale when the year did not change", () => {
    expect(detectStaleText(before, before, false)).toBe(false);
  });

  it("does not run the stale-text check when the worker supplied corrected description text", () => {
    expect(detectStaleText(before, afterYear, true)).toBe(false);
  });

  it("detects the old title only when the title changed", () => {
    const renamed = {
      ...before,
      title: "The Phantom Airship Scare",
      description: "The Wellington Ghost Scare was local folklore.",
    };
    expect(detectStaleText(before, renamed, false)).toBe(true);
    expect(detectStaleText(before, before, false)).toBe(false);
  });

  it("detects old facts inside hint content only for changed fields", () => {
    expect(detectStaleHints(["Witnesses discussed it in 1909."], before, afterYear)).toBe(true);
    expect(detectStaleHints(["Witnesses discussed it in 1909."], before, before)).toBe(false);
    expect(detectStaleHints(["The Wellington Ghost Scare was local folklore."], before, {
      ...before,
      title: "The Phantom Airship Scare",
    })).toBe(true);
  });
});

describe("correctionApplySkipReason", () => {
  const after = applyCorrectionPatch(STORED, { year: 1908 });

  it("reports NOT_REAL before other skip rules", () => {
    expect(correctionApplySkipReason({
      before: STORED,
      after,
      proposed: { year: 1908 },
      sourceCorrected: { year: 1908 },
      sourceVerdict: "NOT_REAL",
      storedPlace: null,
      hintContents: [],
      correctedDescriptionSupplied: false,
    })).toBe("not_real");
  });

  it("enforces the big-year-shift threshold", () => {
    const shift = CORRECTION_YEAR_SHIFT_REVIEW_THRESHOLD + 1;
    expect(correctionApplySkipReason({
      before: STORED,
      after: { ...STORED, event_year: STORED.event_year - shift },
      proposed: { year: STORED.event_year - shift },
      sourceCorrected: { year: STORED.event_year - shift },
      sourceVerdict: "WRONG_YEAR",
      storedPlace: null,
      hintContents: [],
      correctedDescriptionSupplied: true,
    })).toBe("year_shift_needs_image_review");
  });

  it("reports stale text before stale hints", () => {
    expect(correctionApplySkipReason({
      before: STORED,
      after,
      proposed: { year: 1908 },
      sourceCorrected: { year: 1908 },
      sourceVerdict: "WRONG_YEAR",
      storedPlace: null,
      hintContents: ["A hint still says 1909."],
      correctedDescriptionSupplied: false,
    })).toBe("stale_text");
  });
});

describe("applyCorrectionPatch", () => {
  it("changes only provided correction fields", () => {
    expect(applyCorrectionPatch(STORED, { year: 1908 })).toEqual({
      title: STORED.title,
      description: STORED.description,
      event_year: 1908,
    });
  });
});
