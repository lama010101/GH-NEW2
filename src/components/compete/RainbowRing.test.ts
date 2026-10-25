import { describe, expect, it } from "vitest";
import { journeyResultDisplay } from "./RainbowRing";

// HJ-UI-POLISH-STAGELIST-RESULT-035 — the journey result screen shows every
// user-facing number as a WHOLE INTEGER. The pass/fail verdict is computed
// server-side on the RAW accuracy, so the shown numbers must never
// contradict it: a raw 49.6 that FAILS a 50 mark must not display as "50".
// This helper is the single rounding rule for the ring number, the pass-mark
// flag, and the "N pts above/short" status line — marginPts is derived from
// the SHOWN values so all three always agree.
describe("journeyResultDisplay — journey result display invariant (integer)", () => {
  it("accuracy 49.6 vs mark 50 → shows 49, failed, 1 pt short", () => {
    expect(journeyResultDisplay(49.6, 50, false)).toEqual({
      accuracyPct: 49,
      markPct: 50,
      marginPts: 1,
    });
  });

  it("accuracy 70.9 vs mark 50 → shows 71, passed, 21 pts above", () => {
    expect(journeyResultDisplay(70.9, 50, true)).toEqual({
      accuracyPct: 71,
      markPct: 50,
      marginPts: 21,
    });
  });

  it("accuracy 50.0 vs mark 50 → shows 50, passed, 0 pts above", () => {
    const { accuracyPct, markPct, marginPts } = journeyResultDisplay(50.0, 50, true);
    expect(accuracyPct).toBe(50);
    expect(markPct).toBe(50);
    expect(accuracyPct).toBeGreaterThanOrEqual(markPct);
    expect(marginPts).toBe(0);
  });

  it("failed verdict: rounding up across the mark still shows below it (49.96 vs 50)", () => {
    const { accuracyPct, markPct, marginPts } = journeyResultDisplay(49.96, 50, false);
    expect(accuracyPct).toBe(49);
    expect(accuracyPct).toBeLessThan(markPct);
    expect(marginPts).toBeGreaterThanOrEqual(1);
  });

  it("failed verdict: 49.95 vs 50.0 stays visually below the mark", () => {
    const { accuracyPct, markPct } = journeyResultDisplay(49.95, 50, false);
    expect(accuracyPct).toBeLessThan(markPct);
  });

  it("failed verdict: raw 50.3 failing a 50.4 mark → shows 50 vs 51", () => {
    const { accuracyPct, markPct, marginPts } = journeyResultDisplay(50.3, 50.4, false);
    expect(markPct).toBe(50);
    expect(accuracyPct).toBeLessThan(markPct);
    expect(marginPts).toBeGreaterThanOrEqual(1);
  });

  it("passed verdict: shown accuracy is never below the shown mark (50.04 vs 50)", () => {
    const { accuracyPct, markPct } = journeyResultDisplay(50.04, 50, true);
    expect(accuracyPct).toBeGreaterThanOrEqual(markPct);
  });

  it("passed verdict: raw just over a fractional mark (49.6 vs 49.55 → 50/50, 0 pts)", () => {
    const { accuracyPct, markPct, marginPts } = journeyResultDisplay(49.6, 49.55, true);
    expect(accuracyPct).toBeGreaterThanOrEqual(markPct);
    expect(marginPts).toBe(accuracyPct - markPct);
  });

  it("mark display rounds to whole integer (50.6 → 51)", () => {
    expect(journeyResultDisplay(60, 50.6, true).markPct).toBe(51);
    expect(journeyResultDisplay(60, 50, true).markPct).toBe(50);
  });

  it("margin always equals the shown difference (consistency of ring, flag, and status line)", () => {
    for (const [acc, mark, passed] of [
      [70.9, 50, true],
      [45.6, 50, false],
      [49.6, 50, false],
      [51.9, 51.9, true],
      [88.2, 75, true],
      [30.4, 51.3, false],
    ] as const) {
      const d = journeyResultDisplay(acc, mark, passed);
      expect(d.marginPts).toBe(Math.abs(d.accuracyPct - d.markPct));
      if (passed) expect(d.accuracyPct).toBeGreaterThanOrEqual(d.markPct);
      else expect(d.accuracyPct).toBeLessThan(d.markPct);
    }
  });
});
