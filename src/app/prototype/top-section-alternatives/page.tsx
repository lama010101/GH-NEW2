"use client";
import React from "react";

// Mock Data
const ACCURACY = 85;
const WHERE_ACC = 92;
const WHEN_ACC = 78;
const WHERE_DIST = 120;
const WHEN_DIFF = 3;
const XP = 4500;
const TITLE = "Great round!";
const BADGE = "/badges/calendar_gold.webp";
const WHERE_ICON = "/badges/where.webp";
const WHEN_ICON = "/badges/when.webp";

// Colors
function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

// Reusable Ring Component
function Ring({ value, size = 110, strokeWidth = 10 }: { value: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  
  return (
    <div className="ringContainer" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#ringGrad)" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="ringCenter">
        <span className="ringValue" style={{ color: accColor(value) }}>
          {Math.round(value)}<span className="ringPct">%</span>
        </span>
      </div>
    </div>
  );
}

export default function TopSectionAlternatives() {
  return (
    <div className="container">
      <div className="protoBar">
        <span className="protoTitle">Top Section Alternatives</span>
        <span className="protoHint">For Round & Final Results</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        
        <h2 className="sectionTitle">Alternative 1: Unified Horizontal</h2>
        <div className="card alt1">
          <Ring value={ACCURACY} size={100} strokeWidth={8} />
          <div className="alt1-content">
            <div className="alt1-header">
              <div className="alt1-badge">
                <img src={BADGE} alt="Badge" />
                <span>ROUND 1</span>
              </div>
              <h1 className="alt1-title">{TITLE}</h1>
              <div className="alt1-xp">+{XP.toLocaleString()} XP</div>
            </div>
            
            <div className="alt1-stats">
              <div className="statBlock">
                <span className="statLabel" style={{ color: "#22d3ee" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={WHERE_ICON} alt="" className="statIcon" />WHERE
                </span>
                <span className="statVal" style={{ color: accColor(WHERE_ACC) }}>
                  {WHERE_ACC}<span className="smallPct">%</span>
                </span>
                <span className="statSub">{WHERE_DIST} km away</span>
              </div>
              <div className="statDivider" />
              <div className="statBlock">
                <span className="statLabel" style={{ color: "#8b5cf6" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={WHEN_ICON} alt="" className="statIcon" />WHEN
                </span>
                <span className="statVal" style={{ color: accColor(WHEN_ACC) }}>
                  {WHEN_ACC}<span className="smallPct">%</span>
                </span>
                <span className="statSub">{WHEN_DIFF} yrs off</span>
              </div>
            </div>
          </div>
        </div>

        <h2 className="sectionTitle">Alternative 2: Stacked Focus</h2>
        <div className="card alt2">
          <div className="alt2-header">
            <img src={BADGE} alt="Badge" className="alt2-badgeImg" />
            <h1 className="alt2-title">{TITLE}</h1>
            <div className="alt2-xp">+{XP.toLocaleString()} XP</div>
          </div>
          
          <div className="alt2-body">
            <div className="statBlock leftAlign">
              <span className="statLabel" style={{ color: "#22d3ee" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHERE_ICON} alt="" className="statIcon" />WHERE
              </span>
              <span className="statVal" style={{ color: accColor(WHERE_ACC) }}>
                {WHERE_ACC}<span className="smallPct">%</span>
              </span>
              <span className="statSub">{WHERE_DIST} km away</span>
            </div>
            
            <div className="alt2-ringWrap">
              <Ring value={ACCURACY} size={120} strokeWidth={10} />
              <span className="alt2-ringLabel">OVERALL</span>
            </div>
            
            <div className="statBlock rightAlign">
              <span className="statLabel" style={{ color: "#8b5cf6" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHEN_ICON} alt="" className="statIcon" />WHEN
              </span>
              <span className="statVal" style={{ color: accColor(WHEN_ACC) }}>
                {WHEN_ACC}<span className="smallPct">%</span>
              </span>
              <span className="statSub">{WHEN_DIFF} yrs off</span>
            </div>
          </div>
        </div>

        <h2 className="sectionTitle">Alternative 3: Three-Card Dashboard</h2>
        <div className="alt3">
          <div className="alt3-header">
            <div className="alt3-badge">
              <img src={BADGE} alt="Badge" />
            </div>
            <div className="alt3-headerText">
              <h1 className="alt3-title">{TITLE}</h1>
              <div className="alt3-xp">+{XP.toLocaleString()} XP</div>
            </div>
          </div>
          
          <div className="alt3-cards">
            <div className="card alt3-card alt3-mainCard">
              <Ring value={ACCURACY} size={80} strokeWidth={8} />
              <span className="alt3-cardLabel">OVERALL</span>
            </div>
            
            <div className="card alt3-card">
              <span className="statLabel" style={{ color: "#22d3ee" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHERE_ICON} alt="" className="statIcon" />WHERE
              </span>
              <span className="statVal" style={{ color: accColor(WHERE_ACC) }}>
                {WHERE_ACC}<span className="smallPct">%</span>
              </span>
              <span className="statSub">{WHERE_DIST} km away</span>
            </div>
            
            <div className="card alt3-card">
              <span className="statLabel" style={{ color: "#8b5cf6" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WHEN_ICON} alt="" className="statIcon" />WHEN
              </span>
              <span className="statVal" style={{ color: accColor(WHEN_ACC) }}>
                {WHEN_ACC}<span className="smallPct">%</span>
              </span>
              <span className="statSub">{WHEN_DIFF} yrs off</span>
            </div>
          </div>
        </div>

      </div>

      <style jsx>{`
        .container {
          position: fixed; inset: 0; overflow: hidden; background: #0a0a0c;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #fff;
        }
        .bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,0.85); }
        
        .protoBar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 60;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; background: rgba(10,10,12,0.6); backdrop-filter: blur(8px);
        }
        .protoTitle { font-size: 13px; font-weight: 600; opacity: 0.85; }
        .protoHint { font-size: 12px; font-weight: 600; opacity: 0.55; }
        
        .scroll {
          position: absolute; inset: 0; z-index: 2; overflow-y: auto;
          padding: 56px 16px 40px; display: flex; flex-direction: column; gap: 40px;
          max-width: 500px; margin: 0 auto; box-sizing: border-box;
        }

        .sectionTitle {
          font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.5);
          text-transform: uppercase; letter-spacing: 1px; margin: 0 0 -24px 0;
        }

        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }

        /* Reusable Ring Styles */
        .ringContainer { position: relative; flex-shrink: 0; }
        .ringCenter {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .ringValue { font-size: 28px; font-weight: 800; line-height: 1; display: flex; align-items: baseline; justify-content: center; }
        .ringPct { font-size: 14px; margin-left: 2px; opacity: 0.8; }
        
        /* Shared Stat Block */
        .statBlock { display: flex; flex-direction: column; justify-content: center; }
        .statLabel { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; opacity: 0.9; margin-bottom: 2px; display: inline-flex; align-items: center; gap: 5px; }
        .statIcon { width: 16px; height: 16px; object-fit: contain; }
        .statVal { font-size: 24px; font-weight: 800; display: flex; align-items: baseline; line-height: 1; margin-bottom: 2px; }
        .smallPct { font-size: 0.6em; margin-left: 2px; opacity: 0.8; }
        .statSub { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.5); }
        .leftAlign { align-items: flex-end; text-align: right; }
        .rightAlign { align-items: flex-start; text-align: left; }

        /* Alternative 1 */
        .alt1 { display: flex; align-items: center; gap: 20px; padding: 20px; }
        .alt1-content { flex: 1; display: flex; flex-direction: column; gap: 16px; }
        .alt1-header { display: flex; flex-direction: column; gap: 4px; }
        .alt1-badge { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.7); }
        .alt1-badge img { width: 16px; height: 16px; }
        .alt1-title { font-size: 20px; font-weight: 800; margin: 0; }
        .alt1-xp { font-size: 14px; font-weight: 700; color: #ffd54a; }
        .alt1-stats { display: flex; align-items: center; gap: 16px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px; }
        .statDivider { width: 1px; height: 30px; background: rgba(255,255,255,0.1); }

        /* Alternative 2 */
        .alt2 { padding: 24px; display: flex; flex-direction: column; gap: 24px; align-items: center; }
        .alt2-header { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
        .alt2-badgeImg { width: 40px; height: 40px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); }
        .alt2-title { font-size: 24px; font-weight: 800; margin: 0; }
        .alt2-xp { font-size: 15px; font-weight: 700; color: #ffd54a; background: rgba(255,213,74,0.1); padding: 4px 12px; border-radius: 999px; }
        .alt2-body { display: flex; align-items: center; justify-content: center; gap: 24px; width: 100%; }
        .alt2-ringWrap { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .alt2-ringLabel { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); letter-spacing: 1px; }

        /* Alternative 3 */
        .alt3 { display: flex; flex-direction: column; gap: 16px; }
        .alt3-header { display: flex; align-items: center; gap: 14px; padding: 0 4px; }
        .alt3-badge { width: 48px; height: 48px; background: rgba(255,255,255,0.05); border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1); }
        .alt3-badge img { width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
        .alt3-headerText { display: flex; flex-direction: column; gap: 2px; }
        .alt3-title { font-size: 22px; font-weight: 800; margin: 0; }
        .alt3-xp { font-size: 14px; font-weight: 700; color: #ffd54a; }
        
        .alt3-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .alt3-card { padding: 16px 12px; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: center; gap: 4px; }
        .alt3-mainCard { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); }
        .alt3-cardLabel { font-size: 10px; font-weight: 800; letter-spacing: 0.5px; opacity: 0.7; margin-top: 4px; }

      `}</style>
    </div>
  );
}
