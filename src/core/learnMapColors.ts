// Per-entry colors for the "Related location" card: the list dots and the map
// pins must use the same color so each entry can be matched at a glance.
// The current event is always green; the others cycle through distinct hues.

export const CURRENT_POINT_COLOR = "#22C55E";

const NEAR_POINT_COLORS = [
  "#3B82F6", // blue
  "#F97316", // orange
  "#A855F7", // purple
  "#EC4899", // pink
  "#EAB308", // yellow
] as const;

/** `nearIndex` = position among the non-current points (0-based). */
export function pointColor(isCurrent: boolean, nearIndex: number): string {
  if (isCurrent) return CURRENT_POINT_COLOR;
  return NEAR_POINT_COLORS[nearIndex % NEAR_POINT_COLORS.length];
}
