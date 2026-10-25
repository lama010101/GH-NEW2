import { BRAND_ACCENT_HEX } from "@/core/brand";

export interface BrandMarkProps {
  size?: number;
  variant?: "full" | "micro";
  title?: string;
}

/**
 * Flat vector brand symbol: ring + 12 marks (compass cardinals + clock ticks)
 * + a clock hand with an orange tip. Inline SVG — no external requests.
 * Shapes mirror docs/ui/assets/gh-symbol.svg (full) and
 * docs/ui/assets/gh-symbol-micro.svg (micro) exactly.
 */
export default function BrandMark({ size = 32, variant, title }: BrandMarkProps) {
  const v = variant ?? (size <= 40 ? "micro" : "full");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {v === "micro" ? (
        <>
          <circle cx="256" cy="256" r="118" fill="none" stroke="#fff" strokeWidth="40" />
          <polygon points="256,42 296,98 216,98" fill="#fff" stroke="#fff" strokeWidth="16" strokeLinejoin="round" />
          <polygon points="470,256 414,296 414,216" fill="#fff" stroke="#fff" strokeWidth="16" strokeLinejoin="round" />
          <polygon points="256,470 216,414 296,414" fill="#fff" stroke="#fff" strokeWidth="16" strokeLinejoin="round" />
          <polygon points="42,256 98,216 98,296" fill="#fff" stroke="#fff" strokeWidth="16" strokeLinejoin="round" />
          <polygon points="259,273 302,244 290,222 243,245" fill="#fff" stroke="#fff" strokeWidth="10" strokeLinejoin="round" />
          <polygon points="301,244 340,218 331,202 289,223" fill={BRAND_ACCENT_HEX} stroke={BRAND_ACCENT_HEX} strokeWidth="10" strokeLinejoin="round" />
          <circle cx="228" cy="272" r="12" fill="#fff" />
          <circle cx="256" cy="256" r="24" fill="#fff" />
        </>
      ) : (
        <>
          <circle cx="256" cy="256" r="112" fill="none" stroke="#fff" strokeWidth="30" />
          <polygon points="256,44 290,106 222,106" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
          <polygon points="468,256 406,290 406,222" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
          <polygon points="256,468 222,406 290,406" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
          <polygon points="44,256 106,222 106,290" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
          <line x1="373" y1="139" x2="399" y2="113" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
          <line x1="373" y1="373" x2="399" y2="399" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
          <line x1="139" y1="373" x2="113" y2="399" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
          <line x1="139" y1="139" x2="113" y2="113" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
          <polygon points="255,267 297,240 291,228 246,251" fill="#fff" stroke="#fff" strokeWidth="8" strokeLinejoin="round" />
          <polygon points="296,240 334,215 330,209 290,229" fill={BRAND_ACCENT_HEX} stroke={BRAND_ACCENT_HEX} strokeWidth="8" strokeLinejoin="round" />
          <circle cx="233" cy="269" r="8" fill="#fff" />
          <circle cx="256" cy="256" r="17" fill="#fff" />
        </>
      )}
    </svg>
  );
}
