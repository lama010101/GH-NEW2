import { describe, expect, it } from "vitest";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_DESCRIPTION_MAX,
  FEEDBACK_FIELDS,
  FEEDBACK_IMAGE_REASONS,
  FEEDBACK_LOCATION_MAX,
  FEEDBACK_TITLE_MAX,
  FEEDBACK_YEAR_MIN,
  feedbackYearMax,
  parseFeedbackYear,
  validateFeedbackItem,
} from "./eventFeedback";

// UX-BUILD-EVENTFEEDBACK-1128-925: shared-contract tests. The route and the
// form both import this module; these tests pin the single ownership of
// fields, image presets, limits, and signed-year parsing.

describe("eventFeedback shared contract", () => {
  it("exposes exactly the five feedback fields and seven image presets", () => {
    expect([...FEEDBACK_FIELDS]).toEqual([
      "title",
      "year",
      "location",
      "description",
      "image",
    ]);
    expect([...FEEDBACK_IMAGE_REASONS]).toEqual([
      "anachronism",
      "wrong_place_culture",
      "wrong_people_objects",
      "does_not_match_description",
      "looks_artificial",
      "offensive_or_inappropriate",
      "other",
    ]);
  });

  it("pins the text and comment limits", () => {
    expect(FEEDBACK_TITLE_MAX).toBe(200);
    expect(FEEDBACK_LOCATION_MAX).toBe(200);
    expect(FEEDBACK_DESCRIPTION_MAX).toBe(1500);
    expect(FEEDBACK_COMMENT_MAX).toBe(1000);
  });

  it("uses the CTO-approved plausibility year bounds", () => {
    expect(FEEDBACK_YEAR_MIN).toBe(-5000);
    expect(feedbackYearMax()).toBe(new Date().getUTCFullYear());
  });

  it("parses signed integer years and accepts year zero", () => {
    expect(parseFeedbackYear("0")).toBe(0);
    expect(parseFeedbackYear(0)).toBe(0);
    expect(parseFeedbackYear("-44")).toBe(-44);
    expect(parseFeedbackYear(" 2026 ")).toBe(2026);
  });

  it("rejects non-integer, non-numeric, and out-of-range years", () => {
    expect(parseFeedbackYear("1.5")).toBeNull();
    expect(parseFeedbackYear(1.5)).toBeNull();
    expect(parseFeedbackYear("abc")).toBeNull();
    expect(parseFeedbackYear(String(FEEDBACK_YEAR_MIN - 1))).toBeNull();
    expect(parseFeedbackYear(String(feedbackYearMax() + 1))).toBeNull();
  });

  it("accepts a valid title item and trims proposed value and comment", () => {
    const result = validateFeedbackItem({
      field: "title",
      proposedValue: "  A better title  ",
      comment: "  source note  ",
    });
    expect(result).toEqual({
      ok: true,
      item: {
        field: "title",
        proposedValue: "A better title",
        comment: "source note",
      },
    });
  });

  it("accepts a valid signed-year item and exposes proposedYear", () => {
    const result = validateFeedbackItem({
      field: "year",
      proposedValue: "-44",
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.item.field === "year") {
      expect(result.item.proposedYear).toBe(-44);
    } else {
      throw new Error("expected a year item");
    }
  });

  it("rejects empty and over-limit text proposals", () => {
    expect(
      validateFeedbackItem({ field: "title", proposedValue: "   " }).ok
    ).toBe(false);
    expect(
      validateFeedbackItem({
        field: "title",
        proposedValue: "x".repeat(FEEDBACK_TITLE_MAX + 1),
      }).ok
    ).toBe(false);
    expect(
      validateFeedbackItem({
        field: "location",
        proposedValue: "x".repeat(FEEDBACK_LOCATION_MAX + 1),
      }).ok
    ).toBe(false);
    expect(
      validateFeedbackItem({
        field: "description",
        proposedValue: "x".repeat(FEEDBACK_DESCRIPTION_MAX + 1),
      }).ok
    ).toBe(false);
  });

  it("rejects an over-limit comment", () => {
    expect(
      validateFeedbackItem({
        field: "title",
        proposedValue: "Title",
        comment: "x".repeat(FEEDBACK_COMMENT_MAX + 1),
      }).ok
    ).toBe(false);
  });

  it("accepts image feedback with one preset and no comment", () => {
    const result = validateFeedbackItem({
      field: "image",
      imageReasons: ["anachronism"],
    });
    expect(result).toEqual({
      ok: true,
      item: { field: "image", imageReasons: ["anachronism"], comment: null },
    });
  });

  it("accepts image feedback with only a comment", () => {
    const result = validateFeedbackItem({
      field: "image",
      comment: "The scene does not fit the text.",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects image feedback with neither a preset nor a comment", () => {
    expect(validateFeedbackItem({ field: "image" }).ok).toBe(false);
    expect(
      validateFeedbackItem({ field: "image", imageReasons: [], comment: "  " }).ok
    ).toBe(false);
  });

  it("rejects unknown image presets and presets on text fields", () => {
    expect(
      validateFeedbackItem({ field: "image", imageReasons: ["bogus"] }).ok
    ).toBe(false);
    expect(
      validateFeedbackItem({
        field: "title",
        proposedValue: "Title",
        imageReasons: ["other"],
      }).ok
    ).toBe(false);
  });
});
