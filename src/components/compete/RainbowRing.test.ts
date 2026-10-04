import { describe, expect, it } from "vitest";
import { journeyResultDisplay } from "./RainbowRing";

// HJ-FIX-RESULTRING-033 — the journey result ring shows accuracy to ONE
// decimal and the pass mark to one decimal (when not an integer). The shown
// numbers must never contradict the server-computed pass/fail verdict, which
// is computed on the RAW accuracy. This helper is the single rounding rule.
describe("journeyResultDisplay — journey ring display invariant", () => {
  it("accuracy 49.6 vs mark 50 → shows 49.6, failed", () => {
    expect(journeyResultDisplay(49.6, 50, false)).toEqual({
      accuracyPct: 49.6,
      markPct: 50,
    });
  });

  it("accuracy 50.0 vs mark 50 → shows 50.0, passed", () => {
    const { accuracyPct, markPct } = journeyResultDisplay(50.0, 50, true);
    expect(accuracyPct).toBe(50);
    expect(markPct).toBe(50);
    expect(accuracyPct).toBeGreaterThanOrEqual(markPct);
  });

  it("accuracy 50.2 vs mark 50 → shows 50.2, passed (margin 0.2)", () => {
    const { accuracyPct, markPct } = journeyResultDisplay(50.2, 50, true);
    expect(accuracyPct).toBe(50.2);
    expect(markPct).toBe(50);
    expect(accuracyPct - markPct).toBeCloseTo(0.2, 10);
  });

  it("accuracy 50.8 vs mark 50.6 → shows 50.8 / 50.6, passed", () => {
    expect(journeyResultDisplay(50.8, 50.6, true)).toEqual({
      accuracyPct: 50.8,
      markPct: 50.6,
    });
  });

  it("accuracy 50.5 vs mark 50.6 → shows 50.5 / 50.6, failed", () => {
    expect(journeyResultDisplay(50.5, 50.6, false)).toEqual({
      accuracyPct: 50.5,
      markPct: 50.6,
    });
  });

  it("failed verdict: rounding up across the mark still shows below it (49.96 vs 50)", () => {
    const { accuracyPct, markPct } = journeyResultDisplay(49.96, 50, false);
    expect(accuracyPct).toBe(49.9);
    expect(accuracyPct).toBeLessThan(markPct);
  });

  it("failed verdict: 49.95 vs 50.0 stays visually below the mark", () => {
    const { accuracyPct, markPct } = journeyResultDisplay(49.95, 50, false);
    expect(accuracyPct).toBeLessThan(markPct);
  });

  it("passed verdict: shown accuracy is never below the shown mark", () => {
    const { accuracyPct, markPct } = journeyResultDisplay(50.04, 50, true);
    expect(accuracyPct).toBeGreaterThanOrEqual(markPct);
  });

  it("mark display rounds to one decimal when not an integer", () => {
    expect(journeyResultDisplay(60, 50.64, true).markPct).toBe(50.6);
    expect(journeyResultDisplay(60, 50, true).markPct).toBe(50);
  });
});
