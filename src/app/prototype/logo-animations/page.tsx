"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Logo animation alternatives
// Route: /prototype/logo-animations   (direct access, self-contained)
//
// Re-draws the Guess History wordmark (public/brand/gh-wordmark.svg) inline,
// letter by letter, so each letter can be animated on its own. Pure CSS
// animations, no libraries. Does NOT touch any existing page or component.
// ============================================================================

import { useId, useState } from "react";
import styles from "./logo-animations.module.css";
import { LETTERS, OUTLINE } from "./logoData";

const VARIANTS = [
  { id: "drop", label: "A · Letter drop", desc: "Letters fall in one by one and bounce into place.", loop: false },
  { id: "pop", label: "B · Pop & wobble", desc: "Springy scale-pop per letter, then a lazy idle wobble.", loop: false },
  { id: "flip", label: "C · Row flip", desc: "Each line flips up in 3D, like a departure board.", loop: false },
  { id: "rewind", label: "D · Rewind spin", desc: "Letters spin in backwards — a nod to travelling back in time.", loop: false },
  { id: "draw", label: "E · Contour draw", desc: "The white outline is traced first, then the colour floods in.", loop: false },
  { id: "shine", label: "F · Shine sweep", desc: "A glint of light sweeps across the colours, on a loop.", loop: true },
  { id: "wave", label: "G · Wave", desc: "A continuous ripple travels through the letters.", loop: true },
  { id: "glow", label: "H · Glow pulse", desc: "The white contour breathes with a soft halo.", loop: true },
] as const;

type VariantId = (typeof VARIANTS)[number]["id"];

function Logo({ variant }: { variant: VariantId }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `clip-${uid}`;
  const gradId = `grad-${uid}`;
  const cls = `${styles.logo} ${styles[variant]}`;

  return (
    <svg
      className={cls}
      viewBox="-24 -24 688 474"
      role="img"
      aria-label="Back to the Past"
    >
      {variant === "shine" && (
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
      )}

      {/* Layer 1 — white contour (stroke + fill, same as the production SVG) */}
      <g className={styles.outlineLayer}>
        {LETTERS.map((l, i) => (
          <g key={i} className={`${styles.letter} ${styles[`row${l.row}`]}`} style={{ ["--i" as string]: i }}>
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

      {/* Contour trace used only by the "draw" variant */}
      {variant === "draw" && (
        <g className={styles.traceLayer}>
          {LETTERS.map((l, i) => (
            <path
              key={i}
              className={styles.trace}
              style={{ ["--i" as string]: i }}
              transform={l.transform}
              d={l.d}
              pathLength={1}
              fill="none"
              stroke={OUTLINE}
              strokeWidth={l.row === 1 ? 110 : 40}
              strokeLinejoin="round"
            />
          ))}
        </g>
      )}

      {/* Layer 2 — coloured letter fills */}
      <g className={styles.fillLayer}>
        {LETTERS.map((l, i) => (
          <g key={i} className={`${styles.letter} ${styles[`row${l.row}`]}`} style={{ ["--i" as string]: i }}>
            <path transform={l.transform} d={l.d} fill={l.fill} />
          </g>
        ))}
      </g>

      {variant === "shine" && (
        <g clipPath={`url(#${clipId})`}>
          <rect className={styles.shineBar} x="-200" y="-30" width="140" height="500" fill={`url(#${gradId})`} />
        </g>
      )}
    </svg>
  );
}

function Card({ v }: { v: (typeof VARIANTS)[number] }) {
  const [run, setRun] = useState(0);
  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>{v.label}</h2>
          <p className={styles.cardDesc}>{v.desc}</p>
        </div>
        <button type="button" className={styles.replay} onClick={() => setRun((n) => n + 1)}>
          ↻ Replay
        </button>
      </header>
      <div className={styles.stage}>
        <Logo key={run} variant={v.id} />
      </div>
      <p className={styles.tag}>{v.loop ? "loops" : "plays once"}</p>
    </section>
  );
}

export default function LogoAnimationsPrototype() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Logo animation alternatives</h1>
      <p className={styles.sub}>
        Same wordmark, new white contour. Eight pure-CSS options — tap Replay to restart one. Animations are disabled
        for visitors who prefer reduced motion.
      </p>
      <div className={styles.grid}>
        {VARIANTS.map((v) => (
          <Card key={v.id} v={v} />
        ))}
      </div>
    </main>
  );
}
