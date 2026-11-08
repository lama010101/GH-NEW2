// Landing hero wordmark, drawn inline so each letter can be animated.
// Sequence (see heroLogo.module.css): B pop & wobble -> G wave -> H glow pulse -> F shine sweep.
// F is the only animation that keeps running afterwards.
import { useId } from "react";
import styles from "./heroLogo.module.css";
import { LETTERS, OUTLINE } from "../logo-animations/logoData";

export default function HeroLogo({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `hl-clip-${uid}`;
  const gradId = `hl-grad-${uid}`;

  return (
    <svg
      className={`${styles.logo} ${className ?? ""}`}
      viewBox="-24 -24 688 474"
      width={688}
      height={474}
      role="img"
      aria-label="Guess History"
    >
      <defs>
        <clipPath id={clipId}>
          {LETTERS.map((l, i) => (
            <path key={i} transform={l.transform} d={l.d} />
          ))}
        </clipPath>
        <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g>
        {LETTERS.map((l, i) => (
          <g key={i} className={styles.letter} style={{ ["--i" as string]: i }}>
            <path
              transform={l.transform}
              d={l.d}
              fill={OUTLINE}
              stroke={OUTLINE}
              strokeWidth={l.sw}
              strokeLinejoin="round"
            />
          </g>
        ))}
      </g>

      <g>
        {LETTERS.map((l, i) => (
          <g key={i} className={styles.letter} style={{ ["--i" as string]: i }}>
            <path transform={l.transform} d={l.d} fill={l.fill} />
          </g>
        ))}
      </g>

      <g clipPath={`url(#${clipId})`} aria-hidden="true">
        <rect className={styles.shineBar} x="-200" y="-30" width="140" height="500" fill={`url(#${gradId})`} />
      </g>
    </svg>
  );
}
