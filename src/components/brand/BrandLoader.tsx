import { BRAND_ACCENT_HEX } from "@/core/brand";
import styles from "./brand.module.css";

export interface BrandLoaderProps {
  size?: number;
  label?: string;
}

/**
 * BrandLoader — FULL brand symbol where only the clock-hand group rotates
 * forever (1.6s spin). Under prefers-reduced-motion it is the static symbol.
 * The hand group contains both hand polygons AND the counterweight circle;
 * the centre hub stays outside, static.
 */
export default function BrandLoader({ size = 64, label = "Loading" }: BrandLoaderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="status"
      aria-label={label}
    >
      <circle cx="256" cy="256" r="112" fill="none" stroke="#fff" strokeWidth="30" />
      <polygon points="256,44 290,106 222,106" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
      <polygon points="468,256 406,290 406,222" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
      <polygon points="256,468 222,406 290,406" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
      <polygon points="44,256 106,222 106,290" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
      <line x1="373" y1="139" x2="399" y2="113" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
      <line x1="373" y1="373" x2="399" y2="399" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
      <line x1="139" y1="373" x2="113" y2="399" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
      <line x1="139" y1="139" x2="113" y2="113" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
      <g className={styles.hand}>
        <polygon points="255,267 297,240 291,228 246,251" fill="#fff" stroke="#fff" strokeWidth="8" strokeLinejoin="round" />
        <polygon points="296,240 334,215 330,209 290,229" fill={BRAND_ACCENT_HEX} stroke={BRAND_ACCENT_HEX} strokeWidth="8" strokeLinejoin="round" />
        <circle cx="233" cy="269" r="8" fill="#fff" />
      </g>
      <circle cx="256" cy="256" r="17" fill="#fff" />
    </svg>
  );
}
