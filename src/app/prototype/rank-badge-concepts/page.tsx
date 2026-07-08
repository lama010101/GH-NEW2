"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Rank Progress · Tier Badges (no image, no "T1" text)
// Route: /prototype/rank-badge-concepts   (direct access, self-contained)
//
// Replaces the medallion image + "T1" text with a BADGE PER TIER (10 badges).
// Shows GLOBAL, WHERE and WHEN XP each as TIER PROGRESS (position in the
// 10-tier ladder), not just a single bar.
//
// Three alternative card layouts:
//   Alt 1 — Horizontal Badge Ladder + 3 stacked progress sections
//   Alt 2 — Compact Badge Grid + 3 ring/donut progress indicators
//   Alt 3 — Three connected tier tracks (stepper style)
//
// All data is MOCK. Tier icons mirror src/core/rank.ts RANKS.iconName.
// ============================================================================

import React, { useState } from "react";
import {
  Footprints,
  Compass,
  Route,
  Map,
  Telescope,
  Orbit,
  Scroll,
  BookOpen,
  Bird,
  Crown,
  ChevronDown,
  Globe,
  MapPin,
  Clock,
  type LucideIcon,
} from "lucide-react";

// ── Tier model (mirrors src/core/rank.ts) ────────────────────────────────────
type TierIcon =
  | "footprint" | "compass" | "trail" | "map" | "telescope"
  | "astrolabe" | "scroll" | "tome" | "owl" | "crown";

const TIER_ICONS: Record<TierIcon, LucideIcon> = {
  footprint: Footprints,
  compass: Compass,
  trail: Route,
  map: Map,
  telescope: Telescope,
  astrolabe: Orbit,
  scroll: Scroll,
  tome: BookOpen,
  owl: Bird,
  crown: Crown,
};

interface TierDef { tier: number; title: string; icon: TierIcon; threshold: number; }

const GLOBAL_TIERS: TierDef[] = [
  { tier: 1, title: "Wanderer",          icon: "footprint",  threshold: 0 },
  { tier: 2, title: "Pathfinder",        icon: "compass",    threshold: 1_000 },
  { tier: 3, title: "Trailblazer",       icon: "trail",      threshold: 5_000 },
  { tier: 4, title: "Cartographer",      icon: "map",        threshold: 20_000 },
  { tier: 5, title: "Explorer",          icon: "telescope",  threshold: 50_000 },
  { tier: 6, title: "Navigator",         icon: "astrolabe",  threshold: 125_000 },
  { tier: 7, title: "Chronicler",        icon: "scroll",     threshold: 300_000 },
  { tier: 8, title: "Historian",         icon: "tome",       threshold: 600_000 },
  { tier: 9, title: "Scholar",           icon: "owl",        threshold: 1_200_000 },
  { tier: 10, title: "Cartographer Royal", icon: "crown",    threshold: 2_500_000 },
];

// Where / When share the same 10-tier ladder shape but with their own titles.
const WHERE_TIERS: TierDef[] = [
  { tier: 1, title: "Drifter",   icon: "footprint",  threshold: 0 },
  { tier: 2, title: "Scout",     icon: "compass",    threshold: 800 },
  { tier: 3, title: "Tracker",   icon: "trail",      threshold: 4_000 },
  { tier: 4, title: "Guide",     icon: "map",        threshold: 16_000 },
  { tier: 5, title: "Surveyor",  icon: "telescope",  threshold: 40_000 },
  { tier: 6, title: "Ranger",    icon: "astrolabe",  threshold: 100_000 },
  { tier: 7, title: "Cartographer", icon: "scroll",  threshold: 240_000 },
  { tier: 8, title: "Pathmaster", icon: "tome",      threshold: 480_000 },
  { tier: 9, title: "Wayfinder", icon: "owl",        threshold: 960_000 },
  { tier: 10, title: "Atlas",    icon: "crown",      threshold: 2_000_000 },
];

const WHEN_TIERS: TierDef[] = [
  { tier: 1, title: "Novice",     icon: "footprint",  threshold: 0 },
  { tier: 2, title: "Apprentice", icon: "compass",    threshold: 800 },
  { tier: 3, title: "Adept",      icon: "trail",      threshold: 4_000 },
  { tier: 4, title: "Chronicler", icon: "map",        threshold: 16_000 },
  { tier: 5, title: "Antiquary",  icon: "telescope",  threshold: 40_000 },
  { tier: 6, title: "Sage",       icon: "astrolabe",  threshold: 100_000 },
  { tier: 7, title: "Oracle",     icon: "scroll",     threshold: 240_000 },
  { tier: 8, title: "Seer",       icon: "tome",       threshold: 480_000 },
  { tier: 9, title: "Chronarch",  icon: "owl",        threshold: 960_000 },
  { tier: 10, title: "Eternal",   icon: "crown",      threshold: 2_000_000 },
];

// ── Mock player state ────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();

interface AxisState {
  tiers: TierDef[];
  currentTier: number;   // 1..10
  pct: number;           // 0..100 progress within current tier
  xp: number;
  xpToNext: number;
  color: string;
  colorDk: string;
  glow: string;
}

const GLOBAL: AxisState = {
  tiers: GLOBAL_TIERS, currentTier: 4, pct: 42, xp: 32_500, xpToNext: 17_500,
  color: "#fb923c", colorDk: "#f97316", glow: "rgba(251,146,60,0.5)",
};
const WHERE: AxisState = {
  tiers: WHERE_TIERS, currentTier: 6, pct: 65, xp: 108_000, xpToNext: 32_000,
  color: "#22d3ee", colorDk: "#0891b2", glow: "rgba(34,211,238,0.5)",
};
const WHEN: AxisState = {
  tiers: WHEN_TIERS, currentTier: 3, pct: 28, xp: 5_120, xpToNext: 2_880,
  color: "#e879f9", colorDk: "#c026d3", glow: "rgba(232,121,249,0.5)",
};

const AXES = [
  { key: "global", label: "GLOBAL", icon: Globe, state: GLOBAL },
  { key: "where", label: "WHERE", icon: MapPin, state: WHERE },
  { key: "when", label: "WHEN", icon: Clock, state: WHEN },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────
export default function RankBadgeConceptsPage() {
  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Rank Progress · Tier Badges</span>
        <span className="protoHint">
          Global <b className="mainClr">orange</b> · Where <b className="whereClr">cyan</b> · When <b className="whenClr">pink</b>
        </span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        <div className="legend">
          No medallion image, no &quot;T1&quot; text. One badge per tier (10 total).
          Global / Where / When each shown as tier-progress.
        </div>

        <h2 className="conceptTitle">Alt 1 — Horizontal Badge Ladder</h2>
        <Alt1Ladder />

        <h2 className="conceptTitle">Alt 2 — Badge Grid + Rings</h2>
        <Alt2GridRings />

        <h2 className="conceptTitle">Alt 3 — Three Tier Tracks</h2>
        <Alt3Tracks />

        <div className="dockSpacer" />
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }

        :root {
          --main-color: #fb923c;
          --main-dk: #f97316;
          --where-color: #22d3ee;
          --when-color: #e879f9;
        }

        .mainClr { color: var(--main-color); }
        .whereClr { color: var(--where-color); }
        .whenClr { color: var(--when-color); }

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
        .protoHint { font-size: 12px; font-weight: 600; opacity: 0.75; }
        .protoHint b { font-weight: 800; }

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

        .bar { border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .barFill {
          display: block; height: 100%; border-radius: 999px;
          transition: width 0.9s cubic-bezier(0.16,1,0.3,1);
        }

        .expandChev {
          transition: transform 0.3s cubic-bezier(0.16,1,0.3,1);
          opacity: 0.4; flex-shrink: 0; cursor: pointer;
        }
        .expandChevOpen { transform: rotate(180deg); }

        .collapseBody {
          overflow: hidden;
          transition: max-height 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.3s, margin 0.3s;
        }
        .collapseClosed { max-height: 0; opacity: 0; margin-top: 0; }
        .collapseOpen { max-height: 900px; opacity: 1; }
      `}</style>
    </div>
  );
}

// ── Shared badge atom ────────────────────────────────────────────────────────
function TierBadge({
  tier,
  icon,
  state,
  size = 28,
}: {
  tier: number;
  icon: TierIcon;
  state: AxisState;
  size?: number;
}) {
  const Icon = TIER_ICONS[icon];
  const isCurrent = tier === state.currentTier;
  const isPast = tier < state.currentTier;
  const isMax = state.currentTier === 10 && tier === 10;

  const dim = isPast ? 0.55 : isCurrent ? 1 : 0.22;
  const bg = isPast
    ? `rgba(255,255,255,0.10)`
    : isCurrent
      ? state.color
      : "rgba(255,255,255,0.05)";
  const fg = isPast ? state.color : isCurrent ? "#0a0a0a" : "rgba(255,255,255,0.35)";
  const ring = isCurrent ? `2px solid ${state.color}` : "1px solid rgba(255,255,255,0.08)";
  const shadow = isCurrent ? `0 0 14px ${state.glow}` : "none";

  return (
    <div
      className="tierBadge"
      style={{
        width: size, height: size, borderRadius: size * 0.32,
        background: bg, color: fg, border: ring, boxShadow: shadow, opacity: dim,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
      title={`T${tier}${isMax ? " (max)" : ""}`}
    >
      <Icon size={size * 0.5} strokeWidth={2.2} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ALT 1 — Horizontal Badge Ladder + 3 stacked progress sections
// ════════════════════════════════════════════════════════════════════════════
function Alt1Ladder() {
  const [open, setOpen] = useState(true);
  const g = GLOBAL;
  const cur = g.tiers[g.currentTier - 1];
  const next = g.tiers[g.currentTier] ?? null;

  return (
    <section className="card a1">
      {/* Header */}
      <div className="a1-head">
        <div className="a1-titles">
          <h3 className="a1-title">{cur.title}</h3>
          <span className="a1-sub">Tier {g.currentTier} / 10</span>
        </div>
        <span className="a1-xp">{fmt(g.xp)}<i>XP</i></span>
      </div>

      {/* Global badge ladder — 10 badges in a row */}
      <div className="a1-ladder">
        {g.tiers.map((t) => (
          <TierBadge key={t.tier} tier={t.tier} icon={t.icon} state={g} size={30} />
        ))}
      </div>

      {/* Global progress bar */}
      <div className="a1-gprogress">
        <div className="a1-gline">
          <span className="a1-glabel">GLOBAL</span>
          <span className="a1-gnext mainClr">
            {next ? `${fmt(g.xpToNext)} XP to ${next.title}` : "Max rank"}
          </span>
        </div>
        <div className="bar a1-barMain">
          <span className="barFill" style={{ width: `${g.pct}%`, background: `linear-gradient(90deg, ${g.color}, ${g.colorDk})` }} />
        </div>
      </div>

      <div className="a1-expandRow" onClick={() => setOpen((v) => !v)}>
        <ChevronDown size={18} className={`expandChev ${open ? "expandChevOpen" : ""}`} />
      </div>

      <div className={`collapseBody ${open ? "collapseOpen" : "collapseClosed"}`}>
        <div className="a1-divider" />
        {AXES.filter((a) => a.key !== "global").map(({ key, label, icon: Icon, state }) => {
          const c = state.tiers[state.currentTier - 1];
          const n = state.tiers[state.currentTier] ?? null;
          return (
            <div className="a1-sub" key={key}>
              <div className="a1-subHead">
                <Icon size={12} strokeWidth={2.5} style={{ color: state.color }} />
                <span className="a1-subLabel" style={{ color: state.color }}>{label}</span>
                <span className="a1-subTitles" style={{ color: state.color }}>
                  {c.title} <span className="a1-arrow">→</span> {n ? n.title : "Max"}
                </span>
              </div>
              {/* mini badge row */}
              <div className="a1-miniLadder">
                {state.tiers.map((t) => (
                  <TierBadge key={t.tier} tier={t.tier} icon={t.icon} state={state} size={20} />
                ))}
              </div>
              <div className="bar a1-barSub">
                <span className="barFill" style={{ width: `${state.pct}%`, background: state.color }} />
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .a1 { padding: 18px; }
        .a1-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .a1-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .a1-title { font-size: 19px; font-weight: 800; margin: 0; line-height: 1.1; }
        .a1-sub { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.45); }
        .a1-xp { font-size: 15px; font-weight: 800; color: #ffd54a; white-space: nowrap; flex-shrink: 0; }
        .a1-xp i { font-style: normal; font-size: 10px; font-weight: 700; margin-left: 3px; opacity: 0.7; }

        .a1-ladder {
          display: flex; align-items: center; justify-content: space-between; gap: 4px;
          margin: 14px 0 10px;
        }

        .a1-gprogress { display: flex; flex-direction: column; gap: 6px; }
        .a1-gline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .a1-glabel { font-size: 9px; font-weight: 800; letter-spacing: 1px; color: rgba(255,255,255,0.5); }
        .a1-gnext { font-size: 11px; font-weight: 800; }
        .a1-barMain { height: 8px; }
        .a1-expandRow { display: flex; justify-content: center; margin-top: 4px; }

        .a1-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 14px 0; }
        .a1-sub { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
        .a1-sub:last-child { margin-bottom: 0; }
        .a1-subHead { display: flex; align-items: center; gap: 6px; }
        .a1-subLabel { font-size: 9px; font-weight: 800; letter-spacing: 1px; flex-shrink: 0; }
        .a1-subTitles { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .a1-arrow { opacity: 0.5; font-weight: 600; }
        .a1-miniLadder { display: flex; align-items: center; justify-content: space-between; gap: 3px; }
        .a1-barSub { height: 5px; }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ALT 2 — Badge Grid + 3 ring/donut progress indicators
// ════════════════════════════════════════════════════════════════════════════
function Ring({ pct, color, colorDk, size = 64, strokeWidth = 6, tier }: {
  pct: number; color: string; colorDk: string; size?: number; strokeWidth?: number; tier: number;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="a2-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`rg-${tier}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={colorDk} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#rg-${tier})`} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <span className="a2-ringPct" style={{ color }}>{Math.round(pct)}%</span>
    </div>
  );
}

function Alt2GridRings() {
  const [open, setOpen] = useState(true);
  const g = GLOBAL;
  const cur = g.tiers[g.currentTier - 1];
  const next = g.tiers[g.currentTier] ?? null;

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

      {/* Badge grid 5x2 */}
      <div className="a2-grid">
        {g.tiers.map((t) => {
          const isCurrent = t.tier === g.currentTier;
          const isPast = t.tier < g.currentTier;
          return (
            <div
              key={t.tier}
              className={`a2-cell ${isCurrent ? "a2-cellCur" : ""} ${isPast ? "a2-cellPast" : ""}`}
              style={isCurrent ? { borderColor: g.color, boxShadow: `0 0 16px ${g.glow}` } : undefined}
            >
              <TierBadge tier={t.tier} icon={t.icon} state={g} size={isCurrent ? 40 : 32} />
              <span className="a2-cellTier" style={isCurrent ? { color: g.color } : undefined}>T{t.tier}</span>
            </div>
          );
        })}
      </div>

      <div className={`collapseBody ${open ? "collapseOpen" : "collapseClosed"}`}>
        <div className="a2-divider" />
        <div className="a2-nextLine">
          <span className="a2-nextLabel">Next</span>
          <span className="a2-nextTitle mainClr">
            {next ? `${fmt(g.xpToNext)} XP to ${next.title}` : "Max rank"}
          </span>
        </div>

        {/* 3 rings: Global / Where / When */}
        <div className="a2-rings">
          {AXES.map(({ key, label, state }) => {
            const c = state.tiers[state.currentTier - 1];
            const n = state.tiers[state.currentTier] ?? null;
            return (
              <div className="a2-ringCol" key={key}>
                <Ring pct={state.pct} color={state.color} colorDk={state.colorDk} tier={state.currentTier} />
                <span className="a2-ringLabel" style={{ color: state.color }}>{label}</span>
                <span className="a2-ringTier">T{state.currentTier}</span>
                <span className="a2-ringTitles">{c.title}{n ? ` → ${n.title}` : ""}</span>
              </div>
            );
          })}
        </div>
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
        .a2-cellTier { font-size: 9px; font-weight: 800; letter-spacing: 0.5px; color: rgba(255,255,255,0.4); }

        .a2-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 14px 0; }
        .a2-nextLine { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; margin-bottom: 14px; }
        .a2-nextLabel { color: rgba(255,255,255,0.45); font-weight: 600; }
        .a2-nextTitle { font-weight: 800; }

        .a2-rings { display: flex; justify-content: space-between; gap: 10px; }
        .a2-ringCol {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
          text-align: center; min-width: 0;
        }
        .a2-ring { position: relative; display: flex; align-items: center; justify-content: center; }
        .a2-ringPct {
          position: absolute; font-size: 13px; font-weight: 800;
        }
        .a2-ringLabel { font-size: 9px; font-weight: 800; letter-spacing: 1px; margin-top: 2px; }
        .a2-ringTier { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.6); }
        .a2-ringTitles {
          font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.45);
          line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 100%;
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ALT 3 — Three connected tier tracks (stepper style)
// ════════════════════════════════════════════════════════════════════════════
function Track({ axis }: { axis: typeof AXES[number] }) {
  const { state, label, icon: Icon } = axis;
  const cur = state.tiers[state.currentTier - 1];
  const next = state.tiers[state.currentTier] ?? null;

  return (
    <div className="a3-track">
      <div className="a3-trackHead">
        <Icon size={13} strokeWidth={2.5} style={{ color: state.color }} />
        <span className="a3-trackLabel" style={{ color: state.color }}>{label}</span>
        <span className="a3-trackXp">{fmt(state.xp)} XP</span>
      </div>

      {/* Connected stepper: 10 nodes joined by a line, fill up to current */}
      <div className="a3-stepper">
        {/* track background */}
        <div className="a3-trackLine" />
        {/* track fill — spans up to current node center */}
        <div
          className="a3-trackFill"
          style={{
            width: `calc(${((state.currentTier - 1) / 9) * 100}% + ${(state.pct / 100) * (100 / 9)}%)`,
            background: `linear-gradient(90deg, ${state.color}, ${state.colorDk})`,
          }}
        />
        {state.tiers.map((t) => {
          const isCurrent = t.tier === state.currentTier;
          const isPast = t.tier < state.currentTier;
          return (
            <div
              key={t.tier}
              className={`a3-node ${isCurrent ? "a3-nodeCur" : ""} ${isPast ? "a3-nodePast" : ""}`}
              style={isCurrent ? { borderColor: state.color, boxShadow: `0 0 12px ${state.glow}` } : undefined}
            >
              <TierBadge tier={t.tier} icon={t.icon} state={state} size={isCurrent ? 30 : 22} />
            </div>
          );
        })}
      </div>

      <div className="a3-trackFoot">
        <span className="a3-cur" style={{ color: state.color }}>{cur.title}</span>
        <span className="a3-arrow">→</span>
        <span className="a3-next">{next ? `${next.title} · ${fmt(state.xpToNext)} XP` : "Max rank"}</span>
      </div>

      <style jsx>{`
        .a3-track { display: flex; flex-direction: column; gap: 8px; }
        .a3-trackHead { display: flex; align-items: center; gap: 6px; }
        .a3-trackLabel { font-size: 10px; font-weight: 800; letter-spacing: 1px; flex: 1; }
        .a3-trackXp { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); }

        .a3-stepper {
          position: relative; display: flex; align-items: center; justify-content: space-between;
          height: 34px; padding: 0 2px;
        }
        .a3-trackLine {
          position: absolute; left: 6px; right: 6px; top: 50%; height: 3px;
          transform: translateY(-50%); border-radius: 999px;
          background: rgba(255,255,255,0.08); z-index: 0;
        }
        .a3-trackFill {
          position: absolute; left: 6px; top: 50%; height: 3px;
          transform: translateY(-50%); border-radius: 999px;
          z-index: 1; transition: width 0.9s cubic-bezier(0.16,1,0.3,1);
        }
        .a3-node {
          position: relative; z-index: 2; display: flex; align-items: center; justify-content: center;
          border-radius: 10px; background: #0a0a0a;
        }

        .a3-trackFoot { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; }
        .a3-cur { font-weight: 800; }
        .a3-arrow { opacity: 0.4; font-weight: 600; }
        .a3-next { color: rgba(255,255,255,0.5); font-weight: 600; }
      `}</style>
    </div>
  );
}

function Alt3Tracks() {
  const g = GLOBAL;
  const cur = g.tiers[g.currentTier - 1];

  return (
    <section className="card a3">
      <div className="a3-head">
        <div className="a3-titles">
          <h3 className="a3-title">{cur.title}</h3>
          <span className="a3-sub">Tier {g.currentTier} / 10 · {fmt(g.xp)} XP</span>
        </div>
      </div>

      <div className="a3-tracks">
        {AXES.map((a) => <Track key={a.key} axis={a} />)}
      </div>

      <style jsx>{`
        .a3 { padding: 18px; }
        .a3-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 16px; }
        .a3-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .a3-title { font-size: 19px; font-weight: 800; margin: 0; line-height: 1.1; }
        .a3-sub { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.45); }
        .a3-tracks { display: flex; flex-direction: column; gap: 18px; }
      `}</style>
    </section>
  );
}
