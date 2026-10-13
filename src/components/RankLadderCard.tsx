'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { RANKS, rankForXp } from '@/core/rank';
import styles from './RankLadderCard.module.css';

// 10-tier horizontal swipe rail of animated SVG tier shields, ported from
// src/app/prototype/profile-v2 (which mirrors /prototype/rank-badges-svg).
// Tiers/thresholds come ONLY from src/core/rank.ts (RANKS / rankForXp) —
// no second tier table here. Tier titles via useTranslations('rank').

const SHIELD_PATH =
  "M30,22 H130 Q136,22 136,28 V95 Q136,135 80,168 Q24,135 24,95 V28 Q24,22 30,22 Z";

const STAR_PATH = "M0,-6 L1.5,-1.8 L6,-1.8 L2.3,1 L3.7,5.4 L0,2.8 L-3.7,5.4 L-2.3,1 L-6,-1.8 L-1.5,-1.8 Z";

const IVORY = "#f5ecd7";
const IVORY_DARK = "#b8a887";

interface Palette {
  rimLight: string;
  rimDark: string;
  fieldLight: string;
  fieldDark: string;
  accent: string;
}

const PALETTES: Record<"bronze" | "silver" | "gold" | "royal", Palette> = {
  bronze: { rimLight: "#c77b3a", rimDark: "#5a2f12", fieldLight: "#3b2a1d", fieldDark: "#1a120b", accent: "#e0a060" },
  silver: { rimLight: "#e6edf3", rimDark: "#5e6b78", fieldLight: "#2b3440", fieldDark: "#141a22", accent: "#a8c4e0" },
  gold:   { rimLight: "#fde68a", rimDark: "#92400e", fieldLight: "#3a2b0f", fieldDark: "#1a1306", accent: "#fbbf24" },
  royal:  { rimLight: "#fde68a", rimDark: "#b45309", fieldLight: "#4c1d95", fieldDark: "#1e0b3a", accent: "#c084fc" },
};

function paletteFor(tier: number): Palette {
  if (tier <= 3) return PALETTES.bronze;
  if (tier <= 6) return PALETTES.silver;
  if (tier <= 9) return PALETTES.gold;
  return PALETTES.royal;
}

function starCount(tier: number): number {
  if (tier <= 3) return 1;
  if (tier <= 6) return 2;
  if (tier <= 9) return 3;
  return 5;
}

function starPositions(count: number): { x: number; y: number }[] {
  if (count === 1) return [{ x: 80, y: 142 }];
  if (count === 2) return [{ x: 70, y: 142 }, { x: 90, y: 142 }];
  if (count === 3) return [{ x: 62, y: 143 }, { x: 80, y: 139 }, { x: 98, y: 143 }];
  return [
    { x: 52, y: 146 },
    { x: 66, y: 140 },
    { x: 80, y: 137 },
    { x: 94, y: 140 },
    { x: 108, y: 146 },
  ];
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

const xpShort = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
    : `${n}`;

// Per-tier emblems (drawn centred around 80,85, ~60px wide)
function Emblem({ tier, accent }: { tier: number; accent: string }) {
  const stroke = IVORY_DARK;
  switch (tier) {
    case 1: // footprint: two offset footprints (marching step)
      return (
        <g fill={IVORY} stroke={stroke} strokeWidth="1.2">
          <g className={styles.animStep}>
            <ellipse cx="68" cy="82" rx="9" ry="13" transform="rotate(-14 68 82)" />
            <circle cx="60" cy="66" r="2.4" />
            <circle cx="65" cy="63" r="2.4" />
            <circle cx="70" cy="63" r="2.4" />
            <circle cx="75" cy="66" r="2.4" />
          </g>
          <g className={styles.animStep} style={{ animationDelay: "0.9s" }}>
            <ellipse cx="93" cy="92" rx="9" ry="13" transform="rotate(-14 93 92)" />
            <circle cx="85" cy="76" r="2.4" />
            <circle cx="90" cy="73" r="2.4" />
            <circle cx="95" cy="73" r="2.4" />
            <circle cx="100" cy="76" r="2.4" />
          </g>
        </g>
      );
    case 2: // compass: ring + 4-point rose, N spike in accent (needle swings)
      return (
        <g stroke={IVORY} fill="none" strokeWidth="2.4">
          <circle cx="80" cy="85" r="26" />
          <g className={styles.animNeedle}>
            <path d="M80,59 L85,85 L80,111 L75,85 Z" fill={accent} stroke={stroke} strokeWidth="1.2" />
            <path d="M54,85 L80,80 L106,85 L80,90 Z" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
            <circle cx="80" cy="85" r="4" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
          </g>
        </g>
      );
    case 3: // trail: dashed winding path ending in a flag (ants march, flag waves)
      return (
        <g>
          <path
            className={styles.animDash}
            d="M52,108 C62,96 58,90 70,84 C84,76 78,68 92,62 C98,59 104,60 106,58"
            fill="none"
            stroke={IVORY}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="6 6"
          />
          <path className={styles.animFlag} d="M106,56 L106,42 L122,47 L106,52" fill={accent} stroke={stroke} strokeWidth="1.2" />
          <line x1="106" y1="56" x2="106" y2="68" stroke={IVORY} strokeWidth="2.4" />
        </g>
      );
    case 4: // map: unrolled scroll with dashed route + X, rolled edges (route marches, X pulses)
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <rect x="50" y="66" width="60" height="40" fill={IVORY} />
          <ellipse cx="50" cy="86" rx="5" ry="20" fill="#e6d8b8" />
          <ellipse cx="110" cy="86" rx="5" ry="20" fill="#e6d8b8" />
          <path
            className={styles.animDash}
            d="M58,98 C66,86 74,94 84,80 C90,72 96,78 100,72"
            fill="none"
            stroke="#8a6f4a"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <path className={styles.animPulseMark} d="M94,92 L104,102 M104,92 L94,102" stroke="#a33" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 5: // telescope: tilted tube on tripod + small stars (stars twinkle)
      return (
        <g>
          <g transform="rotate(-35 80 74)">
            <rect x="56" y="70" width="34" height="8" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
            <rect x="90" y="68" width="12" height="12" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
            <rect x="46" y="72" width="10" height="4" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
          </g>
          <path d="M80,80 L80,104 M80,82 L64,110 M80,82 L96,110" stroke={IVORY} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path className={styles.animTwinkle} d={STAR_PATH} transform="translate(58 58) scale(.9)" fill={accent} />
          <path className={styles.animTwinkle} style={{ animationDelay: "0.7s" }} d={STAR_PATH} transform="translate(104 52) scale(.7)" fill={accent} />
        </g>
      );
    case 6: // astrolabe: rings + rule bar + hub + ticks (rule spins)
      return (
        <g fill="none" stroke={IVORY} strokeWidth="2.2">
          <circle cx="80" cy="85" r="27" />
          <circle cx="80" cy="85" r="17" strokeWidth="1.4" />
          <g className={styles.animSpin}>
            <line x1="66" y1="71" x2="94" y2="99" strokeWidth="2.6" />
          </g>
          <circle cx="80" cy="85" r="3.5" fill={IVORY} stroke={stroke} strokeWidth="1" />
          <path d="M80,56 v6 M80,108 v6 M51,85 h6 M103,85 h6" stroke={accent} strokeWidth="2.6" />
          <path d="M60,65 l4,4 M100,101 l4,4" stroke={IVORY} strokeWidth="1.6" />
        </g>
      );
    case 7: // scroll: rolled parchment + quill over it (quill bobs)
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <rect x="54" y="74" width="48" height="28" fill={IVORY} />
          <ellipse cx="54" cy="88" rx="4.5" ry="14" fill="#e6d8b8" />
          <ellipse cx="102" cy="88" rx="4.5" ry="14" fill="#e6d8b8" />
          <path d="M62,82 h28 M62,88 h34 M62,94 h24" stroke="#c4b294" strokeWidth="1.6" />
          <g className={styles.animBob}>
            <path
              d="M96,98 C96,76 86,60 70,52 C84,58 94,70 98,84 C100,90 99,95 96,98 Z"
              fill={accent}
            />
            <line x1="96" y1="98" x2="74" y2="58" stroke={stroke} strokeWidth="1.2" />
          </g>
        </g>
      );
    case 8: // tome: closed book, spine band, clasp, emblem circle (sigil pulses)
      return (
        <g stroke={stroke} strokeWidth="1.4">
          <rect x="52" y="60" width="56" height="48" rx="4" fill={IVORY} />
          <rect x="52" y="60" width="12" height="48" rx="4" fill={accent} />
          <line x1="70" y1="62" x2="102" y2="62" stroke={stroke} strokeWidth="1.2" />
          <circle className={styles.animPulseMark} cx="86" cy="84" r="9" fill="none" stroke={accent} strokeWidth="2.4" />
          <rect x="104" y="80" width="8" height="8" rx="1.5" fill={accent} />
          <line x1="52" y1="102" x2="108" y2="102" stroke={stroke} strokeWidth="1.2" />
        </g>
      );
    case 9: // mortarboard: cap band, board, button + tassel (tassel sways)
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <path d="M64,84 v12 q16,10 32,0 v-12 q-16,8 -32,0 Z" fill={IVORY} />
          <path d="M80,58 L114,72 L80,86 L46,72 Z" fill={IVORY} />
          <circle cx="80" cy="72" r="2.6" fill={accent} />
          <g className={styles.animSway}>
            <path d="M114,72 v20" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
            <path d="M110.5,91 h7 l-1.5,13 h-4 Z" fill={accent} />
          </g>
        </g>
      );
    case 10: // crown + globe (crown bobs, jewels twinkle)
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <circle cx="80" cy="96" r="18" fill={IVORY} />
          <ellipse cx="80" cy="96" rx="8" ry="18" fill="none" stroke={stroke} strokeWidth="1.4" />
          <line x1="62" y1="96" x2="98" y2="96" stroke={stroke} strokeWidth="1.4" />
          <g className={styles.animBob}>
            <path
              d="M66,64 L70,48 L78,58 L80,44 L82,58 L90,48 L94,64 Z"
              fill={accent}
            />
            <circle className={styles.animTwinkle} cx="70" cy="46" r="2.4" fill={accent} />
            <circle className={styles.animTwinkle} style={{ animationDelay: "0.5s" }} cx="80" cy="42" r="2.4" fill={accent} />
            <circle className={styles.animTwinkle} style={{ animationDelay: "1s" }} cx="90" cy="46" r="2.4" fill={accent} />
          </g>
        </g>
      );
    default:
      return null;
  }
}

function RankBadge({ tier, size, ariaLabel }: { tier: number; size: number; ariaLabel: string }) {
  const p = paletteFor(tier);
  const id = `rb${tier}-${useId()}`;
  const stars = starPositions(starCount(tier));

  return (
    <svg
      viewBox="0 0 160 190"
      width={size}
      height={(size * 190) / 160}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.rimLight} />
          <stop offset="1" stopColor={p.rimDark} />
        </linearGradient>
        <linearGradient id={`${id}-field`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.fieldLight} />
          <stop offset="1" stopColor={p.fieldDark} />
        </linearGradient>
        <linearGradient id={`${id}-acc`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={p.accent} />
          <stop offset="1" stopColor={p.rimLight} />
        </linearGradient>
        <filter id={`${id}-blur`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id={`${id}-clip`}>
          <path d={SHIELD_PATH} />
        </clipPath>
        <clipPath id={`${id}-ribbon`}>
          <rect x="34" y="150" width="92" height="20" />
        </clipPath>
      </defs>

      {/* a. soft glow */}
      <ellipse className={styles.animGlow} cx="80" cy="92" rx="62" ry="66" fill={p.accent} opacity="0.25" filter={`url(#${id}-blur)`} />

      {/* royal crown on top of the shield edge */}
      {tier === 10 && (
        <g className={styles.animBob} style={{ animationDelay: ".4s" }} fill={p.accent} stroke={p.rimDark} strokeWidth="1">
          <path d="M62,24 L66,10 L74,18 L80,6 L86,18 L94,10 L98,24 Z" />
          <circle cx="66" cy="8" r="2.4" />
          <circle cx="80" cy="4" r="2.4" />
          <circle cx="94" cy="8" r="2.4" />
        </g>
      )}

      {/* b. shield rim */}
      <path d={SHIELD_PATH} fill={`url(#${id}-rim)`} />

      {/* c. inner field */}
      <path
        d={SHIELD_PATH}
        transform="translate(80 95) scale(.86) translate(-80 -95)"
        fill={`url(#${id}-field)`}
        stroke={p.rimLight}
        strokeWidth="1"
        opacity="0.98"
      />

      {/* d. diagonal sheen (sweeps left → right, clipped to the shield) */}
      <g clipPath={`url(#${id}-clip)`}>
        <polygon className={styles.animSheen} points="34,30 78,30 44,120 30,120" fill="#fff" opacity="0.12" />
      </g>

      {/* e. emblem */}
      <Emblem tier={tier} accent={p.accent} />

      {/* g. stars above the ribbon */}
      {stars.map((s, i) => (
        <path key={i} className={styles.animTwinkle} style={{ animationDelay: `${i * 0.35}s` }} d={STAR_PATH} transform={`translate(${s.x} ${s.y}) scale(.85)`} fill={IVORY} />
      ))}

      {/* f. ribbon banner */}
      <g>
        <path d="M34,152 L14,160 L24,164 L14,172 L40,170 Z" fill={p.rimDark} />
        <path d="M126,152 L146,160 L136,164 L146,172 L120,170 Z" fill={p.rimDark} />
        <rect x="34" y="150" width="92" height="20" fill={`url(#${id}-acc)`} stroke={p.rimDark} strokeWidth="0.8" />
        <g clipPath={`url(#${id}-ribbon)`}>
          <polygon className={styles.animSheen} style={{ animationDelay: ".9s" }} points="40,150 62,150 48,170 26,170" fill="#fff" opacity="0.3" />
        </g>
        <text
          x="80"
          y="165"
          textAnchor="middle"
          fontFamily="'Bebas Neue', sans-serif"
          fontSize="15"
          letterSpacing="2"
          fontWeight="700"
          fill={p.rimDark}
        >
          {ROMAN[tier - 1]}
        </text>
      </g>
    </svg>
  );
}

interface RankLadderCardProps {
  totalXp: number;
  /** Optional override for the rail hint text (defaults to the 'swipe' i18n string). */
  hint?: string;
}

// Swipe rail of all 10 tiers, centred on the current badge (hidden scrollbar).
export default function RankLadderCard({ totalXp, hint }: RankLadderCardProps) {
  const t = useTranslations('rank');
  const tGame = useTranslations('game');
  const railRef = useRef<HTMLDivElement | null>(null);
  const centered = useRef(false);
  const centeredTier = useRef<number | null>(null);
  const drag = useRef({ on: false, x: 0, left: 0 });
  const info = rankForXp(totalXp);

  // Instant-scrolls the rail so the [data-cur='1'] cell sits at its centre.
  const centerCurrentCell = useCallback((el: HTMLDivElement) => {
    const cell = el.querySelector<HTMLElement>("[data-cur='1']");
    if (!cell) return;
    const rr = el.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    el.scrollLeft += cr.left + cr.width / 2 - (rr.left + el.clientWidth / 2);
  }, []);

  // Callback ref: runs pre-paint on mount → centre the current cell with no flash.
  const onRail = (el: HTMLDivElement | null) => {
    railRef.current = el;
    if (!el || centered.current) return;
    centered.current = true;
    centeredTier.current = info.tier;
    centerCurrentCell(el);
  };

  // Async XP can move data-cur to a different tier after mount: re-centre
  // instantly, but only on a real tier change — never on unrelated re-renders
  // or after the user's own scrolling.
  useEffect(() => {
    const el = railRef.current;
    if (!el || centeredTier.current === info.tier) return;
    centeredTier.current = info.tier;
    centerCurrentCell(el);
  }, [info.tier, centerCurrentCell]);

  // Mouse drag-to-scroll (touch swipes use native overflow scrolling).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (e.pointerType !== "mouse" || !rail) return;
    drag.current = { on: true, x: e.clientX, left: rail.scrollLeft };
    rail.setPointerCapture(e.pointerId);
    rail.style.cursor = "grabbing";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!drag.current.on || !rail) return;
    rail.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endDrag = () => {
    drag.current.on = false;
    if (railRef.current) railRef.current.style.cursor = "";
  };

  return (
    <section className={styles.rankL}>
      <div className={styles.lcHead}>
        <div className={styles.lcTitles}>
          <h3 className={styles.lcTitle}>{t(info.titleKey)}</h3>
          <span className={styles.lcSub}>
            {t('tier_of_10', { tier: info.tier })} · {Math.floor(totalXp).toLocaleString()}{tGame('xp_unit')} · {info.progressPct}%
          </span>
        </div>
        <span className={styles.lcHint}>{hint ?? t('rail_hint_swipe')}</span>
      </div>

      <div
        className={styles.lcRail}
        ref={onRail}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {RANKS.map((r) => {
          const isCurrent = r.tier === info.tier;
          const isPast = r.tier < info.tier;
          const p = paletteFor(r.tier);
          const pct = isPast ? 100 : isCurrent ? clampPct(info.progressPct) : 0;
          const title = t(r.titleKey);
          return (
            <div
              key={r.tier}
              data-cur={isCurrent ? "1" : undefined}
              className={`${styles.lcCell} ${isCurrent ? styles.lcCellCur : ""} ${isPast ? styles.lcCellPast : ""}`}
              style={isCurrent ? { borderColor: p.accent, boxShadow: `0 0 16px ${p.accent}55` } : undefined}
            >
              <div
                className={styles.lcBadge}
                style={{ opacity: isPast || isCurrent ? 1 : 0.22 }}
                title={`${t('tier_prefix')}${r.tier} — ${title}`}
              >
                <RankBadge tier={r.tier} size={isCurrent ? 72 : 56} ariaLabel={t('badge_aria', { tier: r.tier })} />
              </div>
              <span className={styles.lcName} style={isCurrent ? { color: p.accent } : undefined}>
                {title}
              </span>
              <span className={styles.lcXpBar}>
                <span
                  className={styles.lcXpFill}
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${p.accent}, ${p.rimLight})`,
                  }}
                />
              </span>
              <span className={styles.lcXpNeed}>{xpShort(r.threshold)}{tGame('xp_unit')}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
