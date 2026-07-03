"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Rank Title Progress Card Concepts
// Route: /prototype/rank-card-concepts   (direct access, self-contained)
//
// 4 visual variants of the rank title progress card. All 4 render the SAME
// mock player state (tier 4 "Cartographer", 32,500 XP, 42% to next tier) so
// the designs are directly comparable.
//
// Icons: lucide-react (ISC license, free). One icon per rank tier, mirroring
// the theme of the inline SVGs in src/components/RankIcon.tsx:
//   footprint→Footprints, compass→Compass, trail→Route, map→Map,
//   telescope→Telescope, astrolabe→Orbit, scroll→Scroll, tome→BookOpen,
//   owl→Bird, crown→Crown.
//
// Rank thresholds/titles mirror src/core/rank.ts (single source of truth for
// the real app). All data here is MOCK — does not import or touch app files.
// ============================================================================

import React from "react";
import {
  Footprints,
  Compass,
  Route,
  Map as MapIcon,
  Telescope,
  Orbit,
  Scroll as ScrollIcon,
  BookOpen,
  Bird,
  Crown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

// ── Rank model (mock copy of src/core/rank.ts) ───────────────────────────────
interface Tier {
  tier: number;
  title: string;
  threshold: number;
  icon: LucideIcon;
  accent: string; // per-tier accent color
}

const TIERS: Tier[] = [
  { tier: 1,  title: "Wanderer",          threshold: 0,         icon: Footprints,  accent: "#9ca3af" },
  { tier: 2,  title: "Pathfinder",        threshold: 1_000,     icon: Compass,     accent: "#34d399" },
  { tier: 3,  title: "Trailblazer",       threshold: 5_000,     icon: Route,       accent: "#22d3ee" },
  { tier: 4,  title: "Cartographer",      threshold: 20_000,    icon: MapIcon,     accent: "#60a5fa" },
  { tier: 5,  title: "Explorer",          threshold: 50_000,    icon: Telescope,   accent: "#a78bfa" },
  { tier: 6,  title: "Navigator",         threshold: 125_000,   icon: Orbit,       accent: "#c084fc" },
  { tier: 7,  title: "Chronicler",        threshold: 300_000,   icon: ScrollIcon,  accent: "#f472b6" },
  { tier: 8,  title: "Historian",         threshold: 600_000,   icon: BookOpen,    accent: "#fb923c" },
  { tier: 9,  title: "Scholar",           threshold: 1_200_000, icon: Bird,        accent: "#facc15" },
  { tier: 10, title: "Cartographer Royal", threshold: 2_500_000, icon: Crown,      accent: "#ffd54a" },
];

// ── Mock player state ────────────────────────────────────────────────────────
const TOTAL_XP = 32_500;
// → tier 4 (Cartographer), xpIntoTier = 12,500, xpToNext = 17,500, pct = 42.

function derive() {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (TOTAL_XP >= TIERS[i].threshold) idx = i;
    else break;
  }
  const cur = TIERS[idx];
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  const xpIntoTier = TOTAL_XP - cur.threshold;
  const xpToNext = next ? next.threshold - TOTAL_XP : 0;
  const span = next ? next.threshold - cur.threshold : 1;
  const pct = next ? Math.round((xpIntoTier / span) * 100) : 100;
  return { cur, next, xpIntoTier, xpToNext, pct, isMax: next === null };
}

const D = derive();
const fmt = (n: number) => n.toLocaleString();

// ── Concept A — Crest Banner ─────────────────────────────────────────────────
// Large circular medallion (icon + tier number) on the left, title + tier
// badge + segmented progress bar with one pip per tier on the right.
function ConceptA() {
  const Icon = D.cur.icon;
  return (
    <section className="card cA">
      <div className="cA-medallion" style={{ borderColor: D.cur.accent, boxShadow: `0 0 24px ${D.cur.accent}55` }}>
        <Icon size={30} color={D.cur.accent} strokeWidth={1.8} />
        <span className="cA-tierNum" style={{ color: D.cur.accent }}>{D.cur.tier}</span>
      </div>
      <div className="cA-body">
        <div className="cA-head">
          <div className="cA-titles">
            <span className="cA-tierTag" style={{ color: D.cur.accent, borderColor: `${D.cur.accent}55` }}>
              TIER {D.cur.tier} / 10
            </span>
            <h3 className="cA-title">{D.cur.title}</h3>
          </div>
          <span className="cA-xp">{fmt(TOTAL_XP)}<i>XP</i></span>
        </div>
        <div className="cA-pips">
          {TIERS.map((t) => {
            const done = t.tier <= D.cur.tier;
            const isCur = t.tier === D.cur.tier;
            return (
              <span
                key={t.tier}
                className={`pip ${done ? "pipDone" : ""} ${isCur ? "pipCur" : ""}`}
                style={isCur ? { background: D.cur.accent, borderColor: D.cur.accent } : done ? { background: `${t.accent}66`, borderColor: `${t.accent}88` } : undefined}
              />
            );
          })}
        </div>
        <div className="cA-bar">
          <span className="cA-barFill" style={{ width: `${D.pct}%`, background: `linear-gradient(90deg, ${D.cur.accent}, ${D.next?.accent ?? D.cur.accent})` }} />
        </div>
        <div className="cA-foot">
          <span>{fmt(D.xpIntoTier)} XP in tier</span>
          <span className="cA-next">
            {D.isMax ? "Max rank" : <>Next: {D.next!.title} · {fmt(D.xpToNext)} XP <ChevronRight size={13} /></>}
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Concept B — Ring Medallion ───────────────────────────────────────────────
// Centered circular progress ring around the rank icon. Title + tier below,
// then XP into tier / XP to next. Vertical, ceremonial.
function ConceptB() {
  const Icon = D.cur.icon;
  const size = 132;
  const sw = 10;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - D.pct / 100);
  return (
    <section className="card cB">
      <div className="cB-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={D.cur.accent} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)", filter: `drop-shadow(0 0 6px ${D.cur.accent}88)` }}
          />
        </svg>
        <div className="cB-ringCenter">
          <Icon size={34} color={D.cur.accent} strokeWidth={1.8} />
          <span className="cB-pct" style={{ color: D.cur.accent }}>{D.pct}%</span>
        </div>
      </div>
      <div className="cB-titles">
        <span className="cB-tierTag" style={{ color: D.cur.accent, borderColor: `${D.cur.accent}55` }}>
          TIER {D.cur.tier}
        </span>
        <h3 className="cB-title">{D.cur.title}</h3>
      </div>
      <div className="cB-stats">
        <div className="cB-stat">
          <span className="cB-statVal">{fmt(TOTAL_XP)}</span>
          <span className="cB-statLabel">TOTAL XP</span>
        </div>
        <div className="cB-statDiv" />
        <div className="cB-stat">
          <span className="cB-statVal">{fmt(D.xpIntoTier)}</span>
          <span className="cB-statLabel">XP IN TIER</span>
        </div>
        <div className="cB-statDiv" />
        <div className="cB-stat">
          <span className="cB-statVal">{D.isMax ? "—" : fmt(D.xpToNext)}</span>
          <span className="cB-statLabel">XP TO NEXT</span>
        </div>
      </div>
      {!D.isMax && (() => {
        const NextIcon = D.next!.icon;
        return (
          <div className="cB-nextLine">
            <span>Next rank</span>
            <NextIcon size={14} color={D.next!.accent} strokeWidth={1.8} />
            <span style={{ color: D.next!.accent }}>{D.next!.title}</span>
          </div>
        );
      })()}
    </section>
  );
}

// ── Concept C — Compact Pill ─────────────────────────────────────────────────
// Slim horizontal strip: small icon chip, title + tier chip, thin progress
// bar, inline "X XP to [next]". Minimal, fits in a top bar / header.
function ConceptC() {
  const Icon = D.cur.icon;
  return (
    <section className="card cC">
      <div className="cC-iconChip" style={{ background: `${D.cur.accent}1f`, borderColor: `${D.cur.accent}55` }}>
        <Icon size={18} color={D.cur.accent} strokeWidth={1.9} />
      </div>
      <div className="cC-body">
        <div className="cC-titleRow">
          <span className="cC-title">{D.cur.title}</span>
          <span className="cC-tierChip" style={{ color: D.cur.accent, background: `${D.cur.accent}1a`, borderColor: `${D.cur.accent}40` }}>
            T{D.cur.tier}
          </span>
        </div>
        <div className="cC-bar">
          <span className="cC-barFill" style={{ width: `${D.pct}%`, background: D.cur.accent }} />
        </div>
      </div>
      <div className="cC-right">
        <span className="cC-xp">{fmt(TOTAL_XP)}</span>
        <span className="cC-xpLabel">XP</span>
      </div>
      <div className="cC-next">
        {D.isMax ? "MAX" : (
          <>
            <span className="cC-nextNum">{fmt(D.xpToNext)}</span>
            <span className="cC-nextTxt">to {D.next!.title}</span>
          </>
        )}
      </div>
    </section>
  );
}

// ── Concept D — Tier Ladder ──────────────────────────────────────────────────
// Horizontal ladder of all 10 tier icons; current tier glows + is labeled.
// Below: title, XP, progress bar to next tier with milestone markers.
function ConceptD() {
  const Icon = D.cur.icon;
  return (
    <section className="card cD">
      <div className="cD-ladder">
        {TIERS.map((t) => {
          const done = t.tier < D.cur.tier;
          const isCur = t.tier === D.cur.tier;
          const TIcon = t.icon;
          return (
            <div key={t.tier} className={`cD-rung ${done ? "cD-done" : ""} ${isCur ? "cD-cur" : ""}`}>
              <div
                className="cD-rungDot"
                style={
                  isCur
                    ? { background: `${t.accent}22`, borderColor: t.accent, boxShadow: `0 0 14px ${t.accent}aa` }
                    : done
                      ? { background: `${t.accent}18`, borderColor: `${t.accent}66` }
                      : undefined
                }
              >
                <TIcon size={isCur ? 18 : 14} color={isCur || done ? t.accent : "rgba(255,255,255,0.35)"} strokeWidth={1.9} />
              </div>
              <span className="cD-rungNum" style={{ color: isCur || done ? t.accent : "rgba(255,255,255,0.3)" }}>
                {t.tier}
              </span>
            </div>
          );
        })}
      </div>

      <div className="cD-main">
        <div className="cD-iconWrap" style={{ background: `${D.cur.accent}1f`, borderColor: `${D.cur.accent}55` }}>
          <Icon size={26} color={D.cur.accent} strokeWidth={1.8} />
        </div>
        <div className="cD-info">
          <div className="cD-titleRow">
            <h3 className="cD-title">{D.cur.title}</h3>
            <span className="cD-tierTag" style={{ color: D.cur.accent, borderColor: `${D.cur.accent}55` }}>
              TIER {D.cur.tier} / 10
            </span>
          </div>
          <div className="cD-bar">
            <span className="cD-barFill" style={{ width: `${D.pct}%`, background: `linear-gradient(90deg, ${D.cur.accent}, ${D.next?.accent ?? D.cur.accent})` }} />
            <span className="cD-barMilestone" style={{ left: "100%" }} />
          </div>
          <div className="cD-foot">
            <span className="cD-xp">{fmt(TOTAL_XP)} XP</span>
            <span className="cD-next">
              {D.isMax ? "Max rank reached" : (
                <>
                  <span className="cD-nextNum">{fmt(D.xpToNext)} XP</span> to <span style={{ color: D.next!.accent }}>{D.next!.title}</span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function RankCardConceptsPage() {
  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Rank Title Progress — 4 Concepts</span>
        <span className="protoHint">Mock: {fmt(TOTAL_XP)} XP · Tier {D.cur.tier} · {D.pct}% to next</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        <div className="legend">
          Icons via <code>lucide-react</code> (ISC, free). Same mock state rendered 4 ways.
        </div>

        <h2 className="conceptTitle">Concept A · Crest Banner</h2>
        <ConceptA />

        <h2 className="conceptTitle">Concept B · Ring Medallion</h2>
        <ConceptB />

        <h2 className="conceptTitle">Concept C · Compact Pill</h2>
        <ConceptC />

        <h2 className="conceptTitle">Concept D · Tier Ladder</h2>
        <ConceptD />

        <div className="dockSpacer" />
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }
      `}</style>

      <style jsx>{`
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
        .protoHint { font-size: 12px; font-weight: 600; opacity: 0.55; }

        .scroll {
          position: absolute; inset: 0; z-index: 2; overflow-y: auto;
          padding: 56px 16px 40px; display: flex; flex-direction: column; gap: 14px;
          max-width: 560px; margin: 0 auto; box-sizing: border-box;
        }
        .legend {
          font-size: 11px; color: rgba(255,255,255,0.45); padding: 0 2px;
        }
        .legend code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; color: #c4b5fd;
        }
        .conceptTitle {
          font-size: 12px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
          color: rgba(255,255,255,0.5); margin: 18px 2px -4px;
        }
        .conceptTitle:first-of-type { margin-top: 0; }

        /* ── Shared card ── */
        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }

        /* ── Concept A — Crest Banner ── */
        .cA { display: flex; align-items: center; gap: 16px; padding: 18px; }
        .cA-medallion {
          position: relative; width: 72px; height: 72px; flex-shrink: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
          border-radius: 50%; border: 2px solid; background: rgba(0,0,0,0.3);
        }
        .cA-tierNum { font-size: 11px; font-weight: 800; line-height: 1; letter-spacing: 0.5px; }
        .cA-body { flex: 1; display: flex; flex-direction: column; gap: 9px; min-width: 0; }
        .cA-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .cA-titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .cA-tierTag {
          font-size: 9px; font-weight: 800; letter-spacing: 1px; white-space: nowrap;
          padding: 2px 7px; border-radius: 999px; border: 1px solid; align-self: flex-start;
        }
        .cA-title { font-size: 19px; font-weight: 800; margin: 0; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cA-xp { font-size: 15px; font-weight: 800; color: #ffd54a; white-space: nowrap; flex-shrink: 0; }
        .cA-xp i { font-style: normal; font-size: 10px; font-weight: 700; margin-left: 3px; opacity: 0.7; }
        .cA-pips { display: flex; gap: 5px; }
        .pip { width: 100%; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.1); border: 1px solid transparent; transition: all 0.3s; }
        .pipCur { height: 7px; margin-top: -1px; }
        .cA-bar { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .cA-barFill { display: block; height: 100%; border-radius: 999px; transition: width 0.9s cubic-bezier(0.16,1,0.3,1); }
        .cA-foot { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,0.6); gap: 8px; }
        .cA-next { display: inline-flex; align-items: center; gap: 3px; font-weight: 700; color: rgba(255,255,255,0.85); }

        /* ── Concept B — Ring Medallion ── */
        .cB { padding: 22px 18px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
        .cB-ring { position: relative; flex-shrink: 0; }
        .cB-ringCenter {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 2px;
        }
        .cB-pct { font-size: 13px; font-weight: 800; line-height: 1; }
        .cB-titles { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .cB-tierTag {
          font-size: 9px; font-weight: 800; letter-spacing: 1.2px;
          padding: 2px 9px; border-radius: 999px; border: 1px solid;
        }
        .cB-title { font-size: 20px; font-weight: 800; margin: 0; line-height: 1.1; text-align: center; }
        .cB-stats { display: flex; align-items: stretch; gap: 10px; width: 100%; }
        .cB-stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .cB-statVal { font-size: 15px; font-weight: 800; color: #fff; line-height: 1; }
        .cB-statLabel { font-size: 9px; font-weight: 700; letter-spacing: 0.8px; color: rgba(255,255,255,0.45); }
        .cB-statDiv { width: 1px; background: rgba(255,255,255,0.12); }
        .cB-nextLine {
          display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700;
          padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.7);
        }

        /* ── Concept C — Compact Pill ── */
        .cC { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
        .cC-iconChip {
          width: 38px; height: 38px; flex-shrink: 0; border-radius: 11px; border: 1px solid;
          display: flex; align-items: center; justify-content: center;
        }
        .cC-body { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .cC-titleRow { display: flex; align-items: center; gap: 8px; }
        .cC-title { font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cC-tierChip {
          font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 999px; border: 1px solid; flex-shrink: 0;
        }
        .cC-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .cC-barFill { display: block; height: 100%; border-radius: 999px; transition: width 0.9s cubic-bezier(0.16,1,0.3,1); }
        .cC-right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; line-height: 1; }
        .cC-xp { font-size: 16px; font-weight: 800; color: #ffd54a; }
        .cC-xpLabel { font-size: 9px; font-weight: 700; color: rgba(255,213,74,0.7); margin-top: 2px; }
        .cC-next { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; padding-left: 10px; border-left: 1px solid rgba(255,255,255,0.1); line-height: 1.1; }
        .cC-nextNum { font-size: 13px; font-weight: 800; color: #fff; }
        .cC-nextTxt { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.5); margin-top: 2px; white-space: nowrap; }

        /* ── Concept D — Tier Ladder ── */
        .cD { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
        .cD-ladder { display: flex; align-items: flex-start; justify-content: space-between; gap: 2px; }
        .cD-rung { display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1; }
        .cD-rungDot {
          width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center;
          transition: all 0.3s;
        }
        .cD-rungNum { font-size: 9px; font-weight: 800; letter-spacing: 0.3px; }
        .cD-main { display: flex; align-items: center; gap: 14px; }
        .cD-iconWrap {
          width: 52px; height: 52px; flex-shrink: 0; border-radius: 14px; border: 1px solid;
          display: flex; align-items: center; justify-content: center;
        }
        .cD-info { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .cD-titleRow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .cD-title { font-size: 17px; font-weight: 800; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cD-tierTag {
          font-size: 9px; font-weight: 800; letter-spacing: 1px; white-space: nowrap;
          padding: 2px 7px; border-radius: 999px; border: 1px solid;
        }
        .cD-bar { position: relative; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .cD-barFill { display: block; height: 100%; border-radius: 999px; transition: width 0.9s cubic-bezier(0.16,1,0.3,1); }
        .cD-barMilestone { position: absolute; top: -2px; width: 2px; height: 12px; background: rgba(255,255,255,0.5); transform: translateX(-1px); }
        .cD-foot { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,0.6); gap: 8px; }
        .cD-xp { font-weight: 700; color: #ffd54a; }
        .cD-next { font-weight: 600; }
        .cD-nextNum { font-weight: 800; color: #fff; }

        .dockSpacer { height: 8px; }
      `}</style>
    </div>
  );
}
