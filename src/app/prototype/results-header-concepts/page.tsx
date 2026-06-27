"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Results Header Concepts
// Route: /prototype/results-header-concepts   (direct access, self-contained)
//
// 3 ORIGINAL top-section concepts that can sit at the top of BOTH the
// round-results and final-results screens. Each concept shows the same
// information set: overall accuracy ring, XP earned, an achievement badge,
// and the WHERE / WHEN split with the existing icons.
//
// Visual language follows the existing prototypes: dark background image +
// scrim, proto bar, rounded glass cards, cyan (WHERE) + violet (WHEN) accents,
// gold XP, accuracy-driven color scale, smaller % symbol.
//
// All data is MOCK. Does NOT import or touch any existing app files.
// ============================================================================

import React from "react";

// ── Mock data ───────────────────────────────────────────────────────────────
const OVERALL = 85;
const WHERE_ACC = 92;
const WHEN_ACC = 78;
const WHERE_SUB = "120 km away";
const WHEN_SUB = "3 yrs off";
const XP = 4500;
const TITLE = "Great round!";
const SUBTITLE = "Round 3 of 5";
const BADGE = "/badges/year_gold.webp";
const WHERE_ICON = "/badges/where.webp";
const WHEN_ICON = "/badges/when.webp";

const CYAN = "#22d3ee";
const VIOLET = "#8b5cf6";

// ── Helpers ──────────────────────────────────────────────────────────────────
// Accuracy → hue (red → green), matching the existing app color scale.
function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

// Accuracy value with a deliberately smaller % symbol.
function AccValue({ value, size }: { value: number; size: number }) {
  return (
    <span className="accValue" style={{ fontSize: size, color: accColor(value) }}>
      {Math.round(value)}
      <span className="accPct">%</span>
    </span>
  );
}

// Circular accuracy ring with gradient track.
function Ring({
  value,
  size = 120,
  strokeWidth = 11,
  gradientId,
  showValue = true,
  valueSize = 30,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  gradientId: string;
  showValue?: boolean;
  valueSize?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={CYAN} />
            <stop offset="100%" stopColor={VIOLET} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      {showValue && (
        <div className="ringCenter">
          <AccValue value={value} size={valueSize} />
        </div>
      )}
    </div>
  );
}

// Horizontal linear meter for a single dimension.
function Meter({ value }: { value: number }) {
  return (
    <span className="meterTrack">
      <span className="meterFill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: accColor(value) }} />
    </span>
  );
}

export default function ResultsHeaderConceptsPage() {
  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Results Header — Concepts</span>
        <span className="protoHint">For Round &amp; Final · mock data</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        {/* ── Concept A — Hero Spotlight ──────────────────────────────────── */}
        <h2 className="conceptTitle">Concept A · Hero Spotlight</h2>
        <section className="card cA">
          <div className="cA-ringCol">
            <Ring value={OVERALL} size={128} strokeWidth={11} gradientId="gradA" valueSize={34} />
            <span className="cA-ringCap">OVERALL</span>
          </div>
          <div className="cA-info">
            <div className="cA-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BADGE} alt="" className="cA-badge" />
              <div className="cA-headText">
                <h1 className="cA-title">{TITLE}</h1>
                <span className="cA-sub">{SUBTITLE}</span>
              </div>
              <span className="xpPill">+{XP.toLocaleString()} XP</span>
            </div>
            <div className="cA-splits">
              <div className="splitRow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHERE_ICON} alt="" className="dimIcon" />
                <span className="dimLabel" style={{ color: CYAN }}>WHERE</span>
                <Meter value={WHERE_ACC} />
                <AccValue value={WHERE_ACC} size={18} />
              </div>
              <div className="splitRow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHEN_ICON} alt="" className="dimIcon" />
                <span className="dimLabel" style={{ color: VIOLET }}>WHEN</span>
                <Meter value={WHEN_ACC} />
                <AccValue value={WHEN_ACC} size={18} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Concept B — Triple Gauge ────────────────────────────────────── */}
        <h2 className="conceptTitle">Concept B · Triple Gauge</h2>
        <section className="card cB">
          <div className="cB-banner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BADGE} alt="" className="cB-badge" />
            <div className="cB-bannerText">
              <h1 className="cB-title">{TITLE}</h1>
              <span className="cB-sub">{SUBTITLE}</span>
            </div>
            <span className="xpPill">+{XP.toLocaleString()} XP</span>
          </div>
          <div className="cB-gauges">
            <div className="cB-gauge cB-gaugeMain">
              <Ring value={OVERALL} size={92} strokeWidth={9} gradientId="gradB1" valueSize={24} />
              <span className="cB-gaugeCap">OVERALL</span>
            </div>
            <div className="cB-gauge">
              <Ring value={WHERE_ACC} size={72} strokeWidth={8} gradientId="gradB2" showValue={false} />
              <span className="cB-gaugeCenter">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHERE_ICON} alt="" className="cB-gaugeIcon" />
                <AccValue value={WHERE_ACC} size={16} />
              </span>
              <span className="cB-gaugeCap" style={{ color: CYAN }}>WHERE</span>
              <span className="cB-gaugeSub">{WHERE_SUB}</span>
            </div>
            <div className="cB-gauge">
              <Ring value={WHEN_ACC} size={72} strokeWidth={8} gradientId="gradB3" showValue={false} />
              <span className="cB-gaugeCenter">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHEN_ICON} alt="" className="cB-gaugeIcon" />
                <AccValue value={WHEN_ACC} size={16} />
              </span>
              <span className="cB-gaugeCap" style={{ color: VIOLET }}>WHEN</span>
              <span className="cB-gaugeSub">{WHEN_SUB}</span>
            </div>
          </div>
        </section>

        {/* ── Concept C — Compact Strip ───────────────────────────────────── */}
        <h2 className="conceptTitle">Concept C · Compact Strip</h2>
        <section className="card cC">
          <div className="cC-left">
            <Ring value={OVERALL} size={68} strokeWidth={7} gradientId="gradC" valueSize={18} />
          </div>
          <div className="cC-mid">
            <div className="cC-titleRow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BADGE} alt="" className="cC-badge" />
              <h1 className="cC-title">{TITLE}</h1>
            </div>
            <div className="cC-chips">
              <span className="cC-chip">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHERE_ICON} alt="" className="cC-chipIcon" />
                <span className="cC-chipLabel" style={{ color: CYAN }}>WHERE</span>
                <AccValue value={WHERE_ACC} size={16} />
              </span>
              <span className="cC-chip">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHEN_ICON} alt="" className="cC-chipIcon" />
                <span className="cC-chipLabel" style={{ color: VIOLET }}>WHEN</span>
                <AccValue value={WHEN_ACC} size={16} />
              </span>
            </div>
          </div>
          <div className="cC-right">
            <span className="cC-xp">+{XP.toLocaleString()}</span>
            <span className="cC-xpLabel">XP</span>
          </div>
        </section>

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
        .bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,0.85); }

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
        .conceptTitle {
          font-size: 12px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
          color: rgba(255,255,255,0.5); margin: 18px 2px -4px;
        }
        .conceptTitle:first-child { margin-top: 0; }

        /* ── Shared card ── */
        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }

        /* ── Shared ring ── */
        .ring { position: relative; flex-shrink: 0; }
        .ringCenter { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }

        /* ── Shared accuracy value (small % symbol) ── */
        .accValue { font-weight: 800; line-height: 1; display: inline-flex; align-items: baseline; }
        .accPct { font-size: 0.55em; font-weight: 700; margin-left: 1px; opacity: 0.75; }

        /* ── Shared XP pill ── */
        .xpPill {
          font-size: 13px; font-weight: 800; color: #ffd54a;
          background: rgba(255,213,74,0.12); border: 1px solid rgba(255,213,74,0.25);
          padding: 4px 11px; border-radius: 999px; white-space: nowrap;
        }

        /* ── Shared meter ── */
        .meterTrack { flex: 1; height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .meterFill { display: block; height: 100%; border-radius: 999px; transition: width 0.8s cubic-bezier(0.16,1,0.3,1); }

        /* ── Shared dimension icon/label ── */
        .dimIcon { width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; }
        .dimLabel { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; width: 46px; flex-shrink: 0; }

        /* ── Concept A ── */
        .cA { display: flex; align-items: center; gap: 18px; padding: 18px; }
        .cA-ringCol { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .cA-ringCap { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: rgba(255,255,255,0.5); }
        .cA-info { flex: 1; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .cA-head { display: flex; align-items: center; gap: 10px; }
        .cA-badge { width: 34px; height: 34px; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); }
        .cA-headText { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
        .cA-title { font-size: 19px; font-weight: 800; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cA-sub { font-size: 12px; color: rgba(255,255,255,0.55); }
        .cA-splits { display: flex; flex-direction: column; gap: 10px; background: rgba(0,0,0,0.22); padding: 12px; border-radius: 12px; }
        .splitRow { display: flex; align-items: center; gap: 10px; }

        /* ── Concept B ── */
        .cB { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
        .cB-banner { display: flex; align-items: center; gap: 12px; }
        .cB-badge { width: 38px; height: 38px; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); }
        .cB-bannerText { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .cB-title { font-size: 19px; font-weight: 800; margin: 0; }
        .cB-sub { font-size: 12px; color: rgba(255,255,255,0.55); }
        .cB-gauges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .cB-gauge {
          position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 14px 8px; border-radius: 14px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        }
        .cB-gaugeMain { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.16); }
        .cB-gaugeCenter {
          position: absolute; top: 14px; left: 0; right: 0; height: 72px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
        }
        .cB-gaugeIcon { width: 18px; height: 18px; object-fit: contain; }
        .cB-gaugeCap { font-size: 10px; font-weight: 800; letter-spacing: 0.8px; color: rgba(255,255,255,0.6); }
        .cB-gaugeSub { font-size: 10px; color: rgba(255,255,255,0.45); }

        /* ── Concept C ── */
        .cC { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }
        .cC-left { flex-shrink: 0; }
        .cC-mid { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .cC-titleRow { display: flex; align-items: center; gap: 8px; }
        .cC-badge { width: 22px; height: 22px; object-fit: contain; }
        .cC-title { font-size: 16px; font-weight: 800; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cC-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .cC-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 10px; border-radius: 999px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        }
        .cC-chipIcon { width: 16px; height: 16px; object-fit: contain; }
        .cC-chipLabel { font-size: 10px; font-weight: 800; letter-spacing: 0.5px; }
        .cC-right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
        .cC-xp { font-size: 20px; font-weight: 800; color: #ffd54a; line-height: 1; }
        .cC-xpLabel { font-size: 11px; font-weight: 700; color: rgba(255,213,74,0.7); }

        .dockSpacer { height: 8px; }
      `}</style>
    </div>
  );
}
