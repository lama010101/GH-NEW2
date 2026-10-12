"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Rank Progress · Tier Badges (no image, no "T1" text)
// Route: /prototype/rank-badge-concepts   (direct access, self-contained)
//
// Replaces the medallion image + "T1" text with a BADGE PER TIER (10 badges).
// Shows GLOBAL XP as TIER PROGRESS (position in the 10-tier ladder).
//
// Single card layout:
//   Alt 2 — Collapsed badge grid (first row visible; chevron expands all 10)
//
// Grid badges are the animated hand-drawn SVG shields from
// /prototype/rank-badges-svg (component copied below — page files can't
// export components, and this prototype is self-contained by convention).
// Earned tiers render in full colour; locked tiers stay dimmed.
// All data is MOCK. Tiers mirror src/core/rank.ts RANKS.
// ============================================================================

import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

// ── Tier model (mirrors src/core/rank.ts) ────────────────────────────────────
interface TierDef { tier: number; title: string; threshold: number; }

const GLOBAL_TIERS: TierDef[] = [
  { tier: 1, title: "Wanderer",          threshold: 0 },
  { tier: 2, title: "Pathfinder",        threshold: 1_000 },
  { tier: 3, title: "Trailblazer",       threshold: 5_000 },
  { tier: 4, title: "Cartographer",      threshold: 20_000 },
  { tier: 5, title: "Explorer",          threshold: 50_000 },
  { tier: 6, title: "Navigator",         threshold: 125_000 },
  { tier: 7, title: "Chronicler",        threshold: 300_000 },
  { tier: 8, title: "Historian",         threshold: 600_000 },
  { tier: 9, title: "Scholar",           threshold: 1_200_000 },
  { tier: 10, title: "Cartographer Royal", threshold: 2_500_000 },
];

// ── Mock player state ────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();

interface AxisState {
  tiers: TierDef[];
  currentTier: number;   // 1..10
  xp: number;
  color: string;
  glow: string;
}

const GLOBAL: AxisState = {
  tiers: GLOBAL_TIERS, currentTier: 4, xp: 32_500,
  color: "#fb923c", glow: "rgba(251,146,60,0.5)",
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function RankBadgeConceptsPage() {
  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Rank Progress · Tier Badges</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        <div className="legend">
          Animated SVG shield per tier. First row always visible — chevron expands
          the full ladder. Earned badges in full colour, locked badges dimmed.
        </div>

        <h2 className="conceptTitle">Alt 2 — Badge Grid (expandable)</h2>
        <Alt2GridRings />

        <div className="dockSpacer" />
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }

        .screen {
          position: fixed; inset: 0; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #fff;
        }
        .bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,0.86); }

        .protoBar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 60;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; background: rgba(10,10,12,0.6); backdrop-filter: blur(8px); flex-wrap: wrap;
        }
        .protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }

        .scroll {
          position: absolute; inset: 0; z-index: 2; overflow-y: auto;
          padding: 56px 16px 40px; display: flex; flex-direction: column; gap: 14px;
          max-width: 560px; margin: 0 auto; box-sizing: border-box;
        }
        .legend { font-size: 11px; color: rgba(255,255,255,0.45); padding: 0 2px; }
        .conceptTitle {
          font-size: 12px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
          color: rgba(255,255,255,0.5); margin: 18px 2px -4px;
        }
        .dockSpacer { height: 8px; }

        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }

        .expandChev {
          transition: transform 0.3s cubic-bezier(0.16,1,0.3,1);
          opacity: 0.4; flex-shrink: 0; cursor: pointer;
        }
        .expandChevOpen { transform: rotate(180deg); }

        /* ── SVG badge animations (mirrors rank-badges-svg.module.css) ── */
        @keyframes rbGlowPulse { 0%,100% { opacity: 0.16; } 50% { opacity: 0.38; } }
        @keyframes rbSheen { 0% { transform: translateX(-60px); } 45%,100% { transform: translateX(120px); } }
        @keyframes rbTwinkle { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes rbStep { 0%,100% { transform: translateY(0); } 30% { transform: translateY(-3px); } 60% { transform: translateY(0); } }
        @keyframes rbNeedle { 0%,100% { transform: rotate(-11deg); } 50% { transform: rotate(14deg); } }
        /* -24 = lcm of both dash periods (6+6 and 4+4) → seamless loop */
        @keyframes rbDash { to { stroke-dashoffset: -24; } }
        @keyframes rbFlag { 0%,100% { transform: skewY(0deg); } 50% { transform: skewY(7deg); } }
        @keyframes rbSpin { to { transform: rotate(360deg); } }
        @keyframes rbBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes rbSway { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
        @keyframes rbPulseMark { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.18); } }

        @media (prefers-reduced-motion: no-preference) {
          .animGlow { animation: rbGlowPulse 3.4s ease-in-out infinite; }
          .animSheen { animation: rbSheen 4.8s ease-in-out infinite; }
          .animTwinkle { animation: rbTwinkle 2.2s ease-in-out infinite; }
          .animStep { animation: rbStep 1.8s ease-in-out infinite; }
          .animDash { animation: rbDash 1.4s linear infinite; }
          .animBob { animation: rbBob 2.6s ease-in-out infinite; }
          .animNeedle { animation: rbNeedle 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
          .animFlag { animation: rbFlag 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }
          .animSpin { animation: rbSpin 9s linear infinite; transform-box: fill-box; transform-origin: center; }
          .animSway { animation: rbSway 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 0; }
          .animPulseMark { animation: rbPulseMark 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        }
      `}</style>
    </div>
  );
}

// ── SVG rank badge (copied from /prototype/rank-badges-svg) ──────────────────
// Hand-drawn shield: metal rim, field, emblem, stars, roman-numeral ribbon.
// Animation classes (animGlow/animSheen/...) are plain globals — their
// keyframes live in the page's <style jsx global> block below.
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

// Per-tier emblems (drawn centred around 80,85, ~60px wide)
function Emblem({ tier, accent }: { tier: number; accent: string }) {
  const stroke = IVORY_DARK;
  switch (tier) {
    case 1: // footprint: two offset footprints (marching step)
      return (
        <g fill={IVORY} stroke={stroke} strokeWidth="1.2">
          <g className="animStep">
            <ellipse cx="68" cy="82" rx="9" ry="13" transform="rotate(-14 68 82)" />
            <circle cx="60" cy="66" r="2.4" />
            <circle cx="65" cy="63" r="2.4" />
            <circle cx="70" cy="63" r="2.4" />
            <circle cx="75" cy="66" r="2.4" />
          </g>
          <g className="animStep" style={{ animationDelay: "0.9s" }}>
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
          <g className="animNeedle">
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
            className="animDash"
            d="M52,108 C62,96 58,90 70,84 C84,76 78,68 92,62 C98,59 104,60 106,58"
            fill="none"
            stroke={IVORY}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="6 6"
          />
          <path className="animFlag" d="M106,56 L106,42 L122,47 L106,52" fill={accent} stroke={stroke} strokeWidth="1.2" />
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
            className="animDash"
            d="M58,98 C66,86 74,94 84,80 C90,72 96,78 100,72"
            fill="none"
            stroke="#8a6f4a"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <path className="animPulseMark" d="M94,92 L104,102 M104,92 L94,102" stroke="#a33" strokeWidth="3" strokeLinecap="round" />
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
          <path className="animTwinkle" d={STAR_PATH} transform="translate(58 58) scale(.9)" fill={accent} />
          <path className="animTwinkle" style={{ animationDelay: "0.7s" }} d={STAR_PATH} transform="translate(104 52) scale(.7)" fill={accent} />
        </g>
      );
    case 6: // astrolabe: rings + rule bar + hub + ticks (rule spins)
      return (
        <g fill="none" stroke={IVORY} strokeWidth="2.2">
          <circle cx="80" cy="85" r="27" />
          <circle cx="80" cy="85" r="17" strokeWidth="1.4" />
          <g className="animSpin">
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
          <g className="animBob">
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
          <circle className="animPulseMark" cx="86" cy="84" r="9" fill="none" stroke={accent} strokeWidth="2.4" />
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
          <g className="animSway">
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
          <g className="animBob">
            <path
              d="M66,64 L70,48 L78,58 L80,44 L82,58 L90,48 L94,64 Z"
              fill={accent}
            />
            <circle className="animTwinkle" cx="70" cy="46" r="2.4" fill={accent} />
            <circle className="animTwinkle" style={{ animationDelay: "0.5s" }} cx="80" cy="42" r="2.4" fill={accent} />
            <circle className="animTwinkle" style={{ animationDelay: "1s" }} cx="90" cy="46" r="2.4" fill={accent} />
          </g>
        </g>
      );
    default:
      return null;
  }
}

function RankBadge({ tier, size }: { tier: number; size: number }) {
  const p = paletteFor(tier);
  const id = `rb${tier}-${useId()}`;
  const stars = starPositions(starCount(tier));

  return (
    <svg
      viewBox="0 0 160 190"
      width={size}
      height={(size * 190) / 160}
      role="img"
      aria-label={`Rank ${tier} badge`}
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
      <ellipse className="animGlow" cx="80" cy="92" rx="62" ry="66" fill={p.accent} opacity="0.25" filter={`url(#${id}-blur)`} />

      {/* royal crown on top of the shield edge */}
      {tier === 10 && (
        <g className="animBob" style={{ animationDelay: ".4s" }} fill={p.accent} stroke={p.rimDark} strokeWidth="1">
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
        <polygon className="animSheen" points="34,30 78,30 44,120 30,120" fill="#fff" opacity="0.12" />
      </g>

      {/* e. emblem */}
      <Emblem tier={tier} accent={p.accent} />

      {/* g. stars above the ribbon */}
      {stars.map((s, i) => (
        <path key={i} className="animTwinkle" style={{ animationDelay: `${i * 0.35}s` }} d={STAR_PATH} transform={`translate(${s.x} ${s.y}) scale(.85)`} fill={IVORY} />
      ))}

      {/* f. ribbon banner */}
      <g>
        <path d="M34,152 L14,160 L24,164 L14,172 L40,170 Z" fill={p.rimDark} />
        <path d="M126,152 L146,160 L136,164 L146,172 L120,170 Z" fill={p.rimDark} />
        <rect x="34" y="150" width="92" height="20" fill={`url(#${id}-acc)`} stroke={p.rimDark} strokeWidth="0.8" />
        <g clipPath={`url(#${id}-ribbon)`}>
          <polygon className="animSheen" style={{ animationDelay: ".9s" }} points="40,150 62,150 48,170 26,170" fill="#fff" opacity="0.3" />
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

// ════════════════════════════════════════════════════════════════════════════
// ALT 2 — Badge Grid (first row visible; chevron expands the full ladder)
// ════════════════════════════════════════════════════════════════════════════
function Alt2GridRings() {
  const [open, setOpen] = useState(false);
  const g = GLOBAL;
  const cur = g.tiers[g.currentTier - 1];

  return (
    <section className="card a2">
      <div className="a2-head">
        <div className="a2-titles">
          <h3 className="a2-title">{cur.title}</h3>
          <span className="a2-sub">Tier {g.currentTier} / 10 · {fmt(g.xp)} XP</span>
        </div>
        <div className="a2-expandRow" onClick={() => setOpen((v) => !v)}>
          <ChevronDown size={18} className={`expandChev ${open ? "expandChevOpen" : ""}`} />
        </div>
      </div>

      {/* Badge grid 5x2 — row 1 always visible; row 2 hidden until expanded.
          Earned tiers (past + current) render in full colour; locked dimmed. */}
      <div className="a2-grid">
        {g.tiers.map((t) => {
          const isCurrent = t.tier === g.currentTier;
          const isPast = t.tier < g.currentTier;
          return (
            <div
              key={t.tier}
              className={`a2-cell ${isCurrent ? "a2-cellCur" : ""} ${isPast ? "a2-cellPast" : ""} ${!open && t.tier > 5 ? "a2-cellExtra" : ""}`}
              style={isCurrent ? { borderColor: g.color, boxShadow: `0 0 16px ${g.glow}` } : undefined}
            >
              <div className="a2-badge" style={{ opacity: isPast || isCurrent ? 1 : 0.22 }} title={`T${t.tier} — ${t.title}`}>
                <RankBadge tier={t.tier} size={isCurrent ? 46 : 36} />
              </div>
              <span className="a2-cellTier" style={isCurrent ? { color: g.color } : undefined}>T{t.tier}</span>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .a2 { padding: 18px; }
        .a2-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .a2-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .a2-title { font-size: 19px; font-weight: 800; margin: 0; line-height: 1.1; }
        .a2-sub { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.45); }
        .a2-expandRow { display: flex; cursor: pointer; }

        .a2-grid {
          display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
          margin: 14px 0 4px;
        }
        .a2-cell {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 8px 4px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02);
          transition: all 0.25s;
        }
        .a2-cellPast { background: rgba(255,255,255,0.04); }
        .a2-cellCur { background: rgba(251,146,60,0.10); }
        .a2-cellExtra { display: none; }
        .a2-badge { display: flex; }
        .a2-cellTier { font-size: 9px; font-weight: 800; letter-spacing: 0.5px; color: rgba(255,255,255,0.4); }
      `}</style>
    </section>
  );
}

