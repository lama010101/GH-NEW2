import { describe, expect, it } from "vitest";
import {
  layoutWhenTimeline,
  WHEN_CORRECT_LIFT_PX,
  WHEN_MARKER_STACK_PX,
} from "./whenTimeline";

const row = (playerId: string, guessYear: number | null, isMe = false) => ({
  playerId,
  guessYear,
  isMe,
  submitted: true,
});

describe("layoutWhenTimeline — WHEN timeline label dedupe (MP-FIX-HUD-LEFT-TIMELINE-DUP-001)", () => {
  it("suppresses the decade tick label a player marker sits on (ghost + bold dup)", () => {
    // The reported bug: guess 2000 on the major 2000 tick → "2000" drawn twice,
    // muted tickLabel under the bold marker label.
    const { ticks, markers } = layoutWhenTimeline(1980, [
      row("me", 2000, true),
      row("other", 1900),
    ]);
    expect(markers).toHaveLength(2);
    const tick2000 = ticks.find((t) => t.year === 2000)!;
    expect(tick2000.isMajor).toBe(true);
    expect(tick2000.showLabel).toBe(false);
    // The other marker's tick dedupes too; free decades keep their labels.
    expect(ticks.find((t) => t.year === 1900)!.showLabel).toBe(false);
    expect(ticks.find((t) => t.year === 1950)!.showLabel).toBe(true);
  });

  it("suppresses the tick label colliding with the correct-year label", () => {
    // correctYear on a major decade: its own label already prints the year.
    const { ticks } = layoutWhenTimeline(2000, [row("me", 2100, true)]);
    const tick2000 = ticks.find((t) => t.year === 2000)!;
    expect(tick2000.isMajor).toBe(true);
    expect(tick2000.showLabel).toBe(false);
  });

  it("each marker still renders its year exactly once", () => {
    const { markers } = layoutWhenTimeline(1980, [
      row("a", 2000),
      row("b", 1900),
      row("me", 1940, true),
    ]);
    expect(markers.map((m) => m.guessYear).sort()).toEqual([1900, 1940, 2000]);
    // One label slot per marker — the renderer prints marker.guessYear once.
    for (const m of markers) expect(typeof m.guessYear).toBe("number");
  });

  it("stacks same-year markers far enough apart that labels cannot overlap", () => {
    const { markers } = layoutWhenTimeline(1980, [
      row("a", 2000),
      row("b", 2000),
      row("me", 2000, true),
    ]);
    expect(markers).toHaveLength(3);
    const offsets = markers.map((m) => m.offsetPx).sort((x, y) => x - y);
    expect(offsets).toEqual([0, WHEN_MARKER_STACK_PX, 2 * WHEN_MARKER_STACK_PX]);
    // A marker's label starts +30px below its origin; pitch must exceed that
    // plus the avatar's 11px half-height or labels sit on the avatar below.
    expect(WHEN_MARKER_STACK_PX).toBeGreaterThanOrEqual(41);
  });

  it("lifts a marker colliding with the correct-year marker clear of its label", () => {
    // Guess exactly on the correct year: without the lift the marker's bold
    // label overprints the correctYear text at the same x.
    const { markers, correctXPercent } = layoutWhenTimeline(2000, [
      row("me", 2000, true),
      row("far", 2500),
    ]);
    const me = markers.find((m) => m.playerId === "me")!;
    expect(Math.abs(me.xPercent - correctXPercent)).toBeLessThan(6);
    expect(me.offsetPx).toBe(WHEN_CORRECT_LIFT_PX);
    // The far marker is untouched.
    expect(markers.find((m) => m.playerId === "far")!.offsetPx).toBe(0);
  });

  it("stacks a same-year group sitting on the correct year above the bar", () => {
    const { markers } = layoutWhenTimeline(2000, [row("a", 2000), row("b", 2000)]);
    const offsets = markers.map((m) => m.offsetPx).sort((x, y) => x - y);
    expect(offsets).toEqual([
      WHEN_CORRECT_LIFT_PX,
      WHEN_CORRECT_LIFT_PX + WHEN_MARKER_STACK_PX,
    ]);
  });

  it("skips rows with no guess or no submission", () => {
    const { markers } = layoutWhenTimeline(1980, [
      row("nogues", null),
      { playerId: "unsub", guessYear: 1990, submitted: false },
      row("me", 1950, true),
    ]);
    expect(markers.map((m) => m.playerId)).toEqual(["me"]);
  });
});
