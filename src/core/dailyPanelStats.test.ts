import { describe, it, expect } from "vitest";
import { bucketizeAccuracy, summarizeDailyPanelRows } from "./dailyPanelStats";

describe("bucketizeAccuracy", () => {
  it("returns ten zero buckets for an empty input", () => {
    expect(bucketizeAccuracy([])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("places 0 and 9.99 in bucket 0", () => {
    expect(bucketizeAccuracy([0])).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(bucketizeAccuracy([9.99])).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("places 10 in bucket 1", () => {
    expect(bucketizeAccuracy([10])).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("places 99.9 in bucket 9", () => {
    expect(bucketizeAccuracy([99.9])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("places 100 in bucket 9, never bucket 10", () => {
    const buckets = bucketizeAccuracy([100]);
    expect(buckets).toHaveLength(10);
    expect(buckets[9]).toBe(1);
    expect(buckets.reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it("skips NaN and null values", () => {
    expect(bucketizeAccuracy([NaN, null, undefined, 50])).toEqual([
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
    ]);
  });

  it("counts multiple values per bucket", () => {
    expect(bucketizeAccuracy([0, 9.99, 10, 99.9, 100])).toEqual([
      2, 1, 0, 0, 0, 0, 0, 0, 0, 2,
    ]);
  });
});

describe("summarizeDailyPanelRows", () => {
  it("counts humans and AI and averages accuracy across the set", () => {
    expect(
      summarizeDailyPanelRows([
        { is_ai: false, avg_accuracy: 80 },
        { is_ai: true, avg_accuracy: 90 },
        { is_ai: false, avg_accuracy: 85 },
      ])
    ).toEqual({ totalPlayers: 3, aiPlayers: 1, globalAvgAccuracy: 85 });
  });

  it("returns null globalAvgAccuracy and zero counts for an empty set", () => {
    expect(summarizeDailyPanelRows([])).toEqual({
      totalPlayers: 0,
      aiPlayers: 0,
      globalAvgAccuracy: null,
    });
  });
});
