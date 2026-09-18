import styles from './SplashScreen.module.css'

/**
 * App splash overlay — plays the glossy compass emblem build animation
 * (docs/ui/logo/Glossy Compass Emblem Animation Storyboard.png) on every cold
 * page load, then fades out and removes itself from the hit-testing tree via
 * CSS `visibility: hidden` (animation-fill-mode: forwards). Pure SVG + CSS:
 * no hooks, no JS timeline — server-rendered with the initial HTML so the
 * first frame paints immediately.
 *
 * Emblem geometry measured from docs/ui/logo/white on purple.png (1536px,
 * center 768,758) and scaled to a 512 viewBox (÷3):
 *   dot r=113→38; ring r=218→73, stroke 58→19; rays span r=310-471→103-157.
 *
 * Timeline (per storyboard):
 *   0.00-0.25s  center dot pops in with purple halo
 *   0.20-0.55s  ring draws on (stroke-dashoffset); 2 purple arcs orbit it
 *   0.45-0.85s  4 cardinal triangles pop in (staggered)
 *   0.65-1.05s  8 radial pill rays pop in (staggered)
 *   0.90-1.60s  purple gloss arc sweeps one full turn around the ring
 *   1.60-1.80s  glows settle -> static white emblem
 *   ~2.05s      overlay fades to transparent + visibility:hidden
 */

const C = 256

const TRIANGLE_ANGLES = [0, 90, 180, 270]
const PILL_ANGLES = [30, 60, 120, 150, 210, 240, 300, 330]

export default function SplashScreen() {
  return (
    <div className={styles.splash} aria-hidden="true">
      <div className={styles.bloom} />
      <svg className={styles.emblem} viewBox="0 0 512 512">
        {/* Orbiting purple arcs — phase 2/3, fade out as rays finish */}
        <g className={styles.orbitSpin}>
          <circle
            className={styles.orbitArcs}
            cx={C}
            cy={C}
            r={92}
            fill="none"
            stroke="#7c3aed"
            strokeWidth={7}
            strokeLinecap="round"
          />
        </g>

        {/* Gloss sweep — one purple arc travels the ring, 0.90-1.60s */}
        <g className={styles.glossSpin}>
          <circle
            className={styles.glossArc}
            cx={C}
            cy={C}
            r={73}
            fill="none"
            stroke="#b7a3ff"
            strokeWidth={20}
            strokeLinecap="round"
          />
        </g>

        <g className={styles.emblemBody}>
          <circle className={styles.dot} cx={C} cy={C} r={38} fill="#f4f1fc" />
          <circle
            className={styles.ring}
            cx={C}
            cy={C}
            r={73}
            fill="none"
            stroke="#f4f1fc"
            strokeWidth={19}
          />
          {TRIANGLE_ANGLES.map((deg, i) => (
            <g key={`t${deg}`} transform={`rotate(${deg} ${C} ${C})`}>
              <polygon
                className={styles.ray}
                style={{ animationDelay: `${0.48 + i * 0.09}s` }}
                points="256,99 232,153 280,153"
                fill="#f4f1fc"
                stroke="#f4f1fc"
                strokeWidth={10}
                strokeLinejoin="round"
              />
            </g>
          ))}
          {PILL_ANGLES.map((deg, i) => (
            <g key={`p${deg}`} transform={`rotate(${deg} ${C} ${C})`}>
              <rect
                className={styles.ray}
                style={{ animationDelay: `${0.68 + i * 0.05}s` }}
                x={249.5}
                y={107}
                width={13}
                height={46}
                rx={6.5}
                fill="#f4f1fc"
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
