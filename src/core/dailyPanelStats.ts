// DLY-BUILD-PANELAPI-1111-106
// Pure helpers for GET /api/daily/panel (DAILY_MODE_SPEC.md §10):
// 10-bucket accuracy histogram and humans+AI panel totals computed in JS
// from the ranked rows returned by loadDailyRankedRows.

export const PANEL_HISTOGRAM_BUCKETS = 10;

/**
 * bucketizeAccuracy — histogram of accuracy values into 10 buckets of 10
 * points each. bucket = min(9, max(0, floor(v / 10))), so 100 lands in
 * bucket 9 and never in bucket 10. null/NaN/non-finite values are skipped.
 */
export function bucketizeAccuracy(
  values: ReadonlyArray<number | null | undefined>
): number[] {
  const buckets = Array.from({ length: PANEL_HISTOGRAM_BUCKETS }, () => 0);
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const bucket = Math.min(
      PANEL_HISTOGRAM_BUCKETS - 1,
      Math.max(0, Math.floor(value / 10))
    );
    buckets[bucket] += 1;
  }
  return buckets;
}

export type DailyPanelSummary = {
  totalPlayers: number;
  aiPlayers: number;
  globalAvgAccuracy: number | null;
};

/**
 * summarizeDailyPanelRows — totals over the humans+AI ranked row set.
 * globalAvgAccuracy is the mean avg_accuracy across all rows, or null
 * when the set is empty.
 */
export function summarizeDailyPanelRows(
  rows: ReadonlyArray<{ is_ai: boolean; avg_accuracy: number }>
): DailyPanelSummary {
  const totalPlayers = rows.length;
  const aiPlayers = rows.reduce((count, row) => count + (row.is_ai ? 1 : 0), 0);
  const globalAvgAccuracy =
    totalPlayers === 0
      ? null
      : rows.reduce((sum, row) => sum + row.avg_accuracy, 0) / totalPlayers;
  return { totalPlayers, aiPlayers, globalAvgAccuracy };
}
