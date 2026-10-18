// WHEN timeline layout — pure math, no React. Extracted from WhenCard.tsx
// (MP-FIX-HUD-LEFT-TIMELINE-DUP-001) so marker/label collision behavior is
// unit-testable.

export interface WhenTimelineRow {
  playerId: string;
  guessYear: number | null;
  isMe?: boolean;
  /** false mirrors the old `!hasSubmitted(row)` skip — the marker is not drawn. */
  submitted?: boolean;
}

export interface WhenTimelineTick {
  year: number;
  isMajor: boolean;
  xPercent: number;
  /** false when a marker/correct label occupies this x — the label is deduped. */
  showLabel: boolean;
}

export interface WhenTimelineMarker {
  playerId: string;
  guessYear: number;
  isMe: boolean;
  xPercent: number;
  /** px the marker is lifted above the bar (same-year stack + correct-year lift). */
  offsetPx: number;
}

export interface WhenTimelineLayout {
  timelineMin: number;
  timelineMax: number;
  correctXPercent: number;
  ticks: WhenTimelineTick[];
  markers: WhenTimelineMarker[];
}

/**
 * Vertical pitch between markers stacked on the same guess year. A marker's
 * label sits ~+30px below its origin and its avatar spans ±11px, so a pitch of
 * 56 keeps each stacked label fully clear of the marker below it.
 */
export const WHEN_MARKER_STACK_PX = 56;

/**
 * Extra lift for a marker whose x collides with the correct-year marker. One
 * avatar height clears the correct bar and drops the marker's label into the
 * gap between the bar and the correctYear text instead of overprinting it.
 */
export const WHEN_CORRECT_LIFT_PX = 26;

/**
 * Half-width of a year label expressed as % of the timeline width. Two
 * center-anchored labels overlap when their centers sit closer than this.
 */
export const WHEN_LABEL_COLLISION_PCT = 6;

export function layoutWhenTimeline(
  correctYear: number,
  rows: WhenTimelineRow[],
): WhenTimelineLayout {
  const visible = rows.filter((r) => r.guessYear != null && r.submitted !== false);

  const allYears = [correctYear, ...visible.map((r) => r.guessYear as number)];
  const maxDelta = allYears.reduce((m, y) => Math.max(m, Math.abs(y - correctYear)), 0);
  const minSpread = maxDelta === 0 ? 20 : maxDelta;
  const padding = Math.max(10, Math.ceil(minSpread / 10) * 10 - minSpread + 10);
  const timelineMin = Math.floor((Math.min(...allYears) - padding) / 10) * 10;
  const timelineMax = Math.ceil((Math.max(...allYears) + padding) / 10) * 10;
  const timelineRange = timelineMax - timelineMin;
  const correctXPercent = ((correctYear - timelineMin) / timelineRange) * 100;

  // Markers on the same guess year stack upward; a marker within the collision
  // window of the correct-year marker gets one avatar-height lift so its label
  // never overprints the correctYear text.
  const markers: WhenTimelineMarker[] = [];
  for (const row of visible) {
    const guessYear = row.guessYear as number;
    const xPercent = Math.max(
      4,
      Math.min(96, ((guessYear - timelineMin) / timelineRange) * 100),
    );
    const stackIndex = markers.filter((m) => m.guessYear === guessYear).length;
    const nearCorrect =
      Math.abs(xPercent - correctXPercent) < WHEN_LABEL_COLLISION_PCT;
    markers.push({
      playerId: row.playerId,
      guessYear,
      isMe: row.isMe === true,
      xPercent,
      offsetPx:
        stackIndex * WHEN_MARKER_STACK_PX +
        (nearCorrect ? WHEN_CORRECT_LIFT_PX : 0),
    });
  }

  // A decade tick's label is suppressed whenever any rendered label (the
  // correct year or a player guess) occupies the same x — one label per spot.
  const occupied = [correctXPercent, ...markers.map((m) => m.xPercent)];
  const ticks: WhenTimelineTick[] = [];
  for (let year = timelineMin; year <= timelineMax; year += 10) {
    const xPercent = ((year - timelineMin) / timelineRange) * 100;
    const isMajor = year % 50 === 0;
    ticks.push({
      year,
      isMajor,
      xPercent,
      showLabel:
        isMajor &&
        !occupied.some((x) => Math.abs(x - xPercent) < WHEN_LABEL_COLLISION_PCT),
    });
  }

  return { timelineMin, timelineMax, correctXPercent, ticks, markers };
}
