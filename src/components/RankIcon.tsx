// Inline SVG icons for the 10 rank tiers.
// Convention matches NavModal.tsx (lines 125-178): 24x24 viewBox,
// stroke="currentColor", strokeWidth ~1.8, fill="none".
// No external .svg files — keeps icons themeable via currentColor.

import type { RankIconName } from '@/core/rank';

interface RankIconProps {
  name: RankIconName;
  size?: number;
  className?: string;
}

const ICONS: Record<RankIconName, JSX.Element> = {
  // Tier 1 — Wanderer: booted footprint
  footprint: (
    <path d="M7 21c-1.5 0-2.5-1-2.5-2.5 0-1 .5-2 1-3 .3-.6.5-1.2.5-2 0-1.2-.8-2-2-2-1.3 0-2.2.8-2.2 2 0 .8.3 1.4.7 2M12 21c0-2 .5-3.5 1.5-5 .8-1.2 2-2 2-3.5 0-1.8-1.2-3-3-3-1.8 0-3 1.2-3 3 0 1 .4 1.8 1 2.5M16.5 21c.5-1.5 1.5-2.5 2.5-3.5 1-1 1.5-2 1.5-3 0-1.5-1-2.5-2.5-2.5-1.3 0-2.2.8-2.2 2 0 .6.2 1.1.5 1.6" />
  ),
  // Tier 2 — Pathfinder: compass rose
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polygon points="12,5 14,12 12,19 10,12" fill="currentColor" stroke="none" />
      <polygon points="5,12 12,10 19,12 12,14" fill="currentColor" stroke="none" opacity="0.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  // Tier 3 — Trailblazer: blazed trail marker (diamond blaze on a tree trunk)
  trail: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <polygon points="12,7 16,12 12,17 8,12" fill="currentColor" stroke="none" />
    </>
  ),
  // Tier 4 — Cartographer: quill over rolled map
  map: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
      <path d="M9 4v16M15 6v16" />
      <path d="M14 3l4 4-7 7-3 .5.5-3 7-7z" fill="currentColor" stroke="none" opacity="0.6" />
    </>
  ),
  // Tier 5 — Explorer: brass telescope
  telescope: (
    <>
      <path d="M3 13l4-2 3 6-4 2z" />
      <path d="M7 11l5-3 3 6-5 3z" />
      <path d="M12 8l5-3 3 6-5 3z" />
      <circle cx="20" cy="11" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  // Tier 6 — Navigator: astrolabe
  astrolabe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="M12 12l3-2" />
    </>
  ),
  // Tier 7 — Chronicler: scroll + inkwell
  scroll: (
    <>
      <path d="M6 4h9a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V4z" />
      <path d="M6 4a2 2 0 0 0-2 2v1h2" />
      <path d="M17 20a2 2 0 0 0 2-2v-1h-2" />
      <path d="M9 9h5M9 13h5" />
    </>
  ),
  // Tier 8 — Historian: open tome
  tome: (
    <>
      <path d="M3 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H3z" />
      <path d="M21 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7z" />
      <path d="M12 7v12" />
    </>
  ),
  // Tier 9 — Scholar: owl + laurel wreath
  owl: (
    <>
      <path d="M12 3a6 6 0 0 0-6 6v5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V9a6 6 0 0 0-6-6z" />
      <circle cx="9.5" cy="10" r="1.8" />
      <circle cx="14.5" cy="10" r="1.8" />
      <circle cx="9.5" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <path d="M11 13l1 1 1-1" />
      <path d="M5 9c-1.5 1-2 3-2 5M19 9c1.5 1 2 3 2 5" />
    </>
  ),
  // Tier 10 — Cartographer Royal: crown over globe
  crown: (
    <>
      <circle cx="12" cy="15" r="6" />
      <path d="M12 9l-1-4-3 3-2-4-2 4 2 3z" fill="currentColor" stroke="none" />
      <path d="M12 9l1-4 3 3 2-4 2 4-2 3z" fill="currentColor" stroke="none" />
      <path d="M8 15c1.5 1 7.5 1 9 0" />
      <path d="M12 9v2" />
    </>
  ),
};

export default function RankIcon({ name, size = 24, className }: RankIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
