"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Progress Card · Sub-Progress Variants
// Route: /prototype/rank-card-concepts   (direct access, self-contained)
//
// 2 alternatives for the WHERE/WHEN sub-progress. Both cards are expandable
// (click the header to show/hide the where/when sections):
//
//   Alt 1 — Vertical "Reputation" card (centered, full-width bars, divided sections)
//   Alt 3 — Dan pips (karate-style ladder of filled/empty pips, no dan text)
//
// All data is MOCK.
// ============================================================================

import React, { useState } from "react";
import { GraduationCap, Globe, Calendar, ChevronDown } from "lucide-react";

// ── Mock player state ────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();

// Alt 1 mock
const A1 = {
  title: "Historian",
  totalXp: 42_870,
  xpToNext: 2_130,
  mainPct: 80,
  nextTitle: "Scholar",
  whereTitle: "Cartographer",
  whereXpToNext: 980,
  wherePct: 70,
  whereNext: "Atlas Keeper",
  whenTitle: "Chronicler",
  whenXpToNext: 1_760,
  whenPct: 45,
  whenNext: "Master Historian",
};

// Alt 3 mock (Voyager card)
const A3 = {
  title: "Voyager",
  totalXp: 32_500,
  xpToNext: 17_500,
  mainPct: 42,
  nextTitle: "Explorer",
  whereDan: 6,
  whenDan: 3,
  danMax: 10,
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function RankCardConceptsPage() {
  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Progress Card · Sub-Progress Variants</span>
        <span className="protoHint">
          Main <b className="mainClr">orange</b> · Where <b className="whereClr">cyan</b> · When <b className="whenClr">pink</b> · tap card to expand
        </span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        <div className="legend">
          2 alternatives for WHERE/WHEN sub-progress. Click a card to expand/collapse.
        </div>

        {/* ── Alt 1 — Vertical Reputation card ────────────────────────────────── */}
        <h2 className="conceptTitle">Alt 1 · Reputation Card</h2>
        <Alt1Card />

        {/* ── Alt 3 — Dan pips (no dan text) ──────────────────────────────────── */}
        <h2 className="conceptTitle">Alt 3 · Dan Pips</h2>
        <Alt3Card />

        <div className="dockSpacer" />
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }

        /* ── Global color tokens ── */
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
        .conceptTitle:first-of-type { margin-top: 0; }
        .dockSpacer { height: 8px; }

        /* ── Shared card ── */
        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }

        /* ── Bars ── */
        .bar { border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .barFill {
          display: block; height: 100%; border-radius: 999px;
          transition: width 0.9s cubic-bezier(0.16,1,0.3,1);
        }
        .mainFill { background: linear-gradient(90deg, var(--main-color), var(--main-dk)); }
        .whereFill { background: var(--where-color); }
        .whenFill { background: var(--when-color); }

        /* ── Dots ── */
        .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .whereDot { background: var(--where-color); box-shadow: 0 0 6px rgba(34,211,238,0.6); }
        .whenDot { background: var(--when-color); box-shadow: 0 0 6px rgba(232,121,249,0.6); }

        /* ── Expand/collapse chevron ── */
        .expandChev {
          transition: transform 0.3s cubic-bezier(0.16,1,0.3,1);
          opacity: 0.5; flex-shrink: 0;
        }
        .expandChevOpen { transform: rotate(180deg); }

        /* ── Collapsible body (shared) ── */
        .collapseBody {
          overflow: hidden;
          transition: max-height 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.3s, margin 0.3s;
        }
        .collapseClosed { max-height: 0; opacity: 0; margin-top: 0; }
        .collapseOpen { max-height: 500px; opacity: 1; }
      `}</style>
    </div>
  );
}

// ── Alt 1 — Vertical Reputation Card ─────────────────────────────────────────
function Alt1Card() {
  const [open, setOpen] = useState(true);
  return (
    <section className="card a1" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0}>
      <div className="a1-main">
        <span className="a1-repLabel">YOUR REPUTATION</span>
        <div className="a1-titleRow">
          <GraduationCap size={22} className="mainClr" strokeWidth={1.8} />
          <h3 className="a1-title">{A1.title}</h3>
        </div>
        <span className="a1-totalXp">{fmt(A1.totalXp)} Total XP</span>

        <div className="bar a1-barMain">
          <span className="barFill mainFill" style={{ width: `${A1.mainPct}%` }} />
        </div>
        <span className="a1-nextLine mainClr">{fmt(A1.xpToNext)} XP to {A1.nextTitle}</span>

        <div className="a1-expandHint">
          <span>{open ? "Hide" : "Show"} mastery</span>
          <ChevronDown size={15} className={`expandChev ${open ? "expandChevOpen" : ""}`} />
        </div>
      </div>

      <div className={`collapseBody ${open ? "collapseOpen" : "collapseClosed"}`}>
        <div className="a1-divider" />

        <div className="a1-section">
          <div className="a1-secHead">
            <Globe size={14} className="whereClr" strokeWidth={2} />
            <span className="a1-secLabel whereClr">WHERE MASTERY</span>
          </div>
          <span className="a1-secTitle">{A1.whereTitle}</span>
          <div className="bar a1-barSub">
            <span className="barFill whereFill" style={{ width: `${A1.wherePct}%` }} />
          </div>
          <span className="a1-secNext whereClr">{fmt(A1.whereXpToNext)} XP to {A1.whereNext}</span>
        </div>

        <div className="a1-section">
          <div className="a1-secHead">
            <Calendar size={14} className="whenClr" strokeWidth={2} />
            <span className="a1-secLabel whenClr">WHEN MASTERY</span>
          </div>
          <span className="a1-secTitle">{A1.whenTitle}</span>
          <div className="bar a1-barSub">
            <span className="barFill whenFill" style={{ width: `${A1.whenPct}%` }} />
          </div>
          <span className="a1-secNext whenClr">{fmt(A1.whenXpToNext)} XP to {A1.whenNext}</span>
        </div>
      </div>

      <style jsx>{`
        .a1 { padding: 20px 18px; cursor: pointer; }
        .a1-main { display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center; }
        .a1-repLabel {
          font-size: 10px; font-weight: 800; letter-spacing: 2px; color: rgba(255,255,255,0.4);
        }
        .a1-titleRow { display: flex; align-items: center; gap: 8px; }
        .a1-title { font-size: 22px; font-weight: 800; margin: 0; line-height: 1.1; }
        .a1-totalXp { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); }
        .a1-barMain { height: 8px; width: 100%; margin-top: 6px; }
        .a1-nextLine { font-size: 12px; font-weight: 700; margin-top: 4px; }
        .a1-expandHint {
          display: flex; align-items: center; gap: 4px; margin-top: 8px;
          font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4);
        }

        .a1-divider {
          height: 1px; background: rgba(255,255,255,0.1); margin: 14px 0;
        }
        .a1-section { display: flex; flex-direction: column; gap: 4px; text-align: center; margin-bottom: 14px; }
        .a1-section:last-child { margin-bottom: 0; }
        .a1-secHead { display: flex; align-items: center; justify-content: center; gap: 6px; }
        .a1-secLabel { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; }
        .a1-secTitle { font-size: 15px; font-weight: 800; }
        .a1-barSub { height: 6px; width: 100%; }
        .a1-secNext { font-size: 11px; font-weight: 700; margin-top: 2px; }
      `}</style>
    </section>
  );
}

// ── Alt 3 — Dan Pips (no dan text) ───────────────────────────────────────────
function Alt3Card() {
  const [open, setOpen] = useState(true);
  return (
    <section className="card a3" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0}>
      <div className="a3-main">
        <div className="medallion med-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/era-region/africa.jpg" alt="Voyager" className="medImg" draggable={false} />
        </div>
        <div className="a3-body">
          <div className="a3-head">
            <div className="a3-titles"><h3 className="a3-title">{A3.title}</h3></div>
            <span className="a3-xp">{fmt(A3.totalXp)}<i>XP</i></span>
          </div>
          <div className="a3-nextLine">
            <span className="a3-nextLabel">Next</span>
            <span className="a3-nextTitle mainClr">{fmt(A3.xpToNext)} XP to {A3.nextTitle}</span>
          </div>
          <div className="bar a3-barMain">
            <span className="barFill mainFill" style={{ width: `${A3.mainPct}%` }} />
          </div>

          <div className="a3-expandHint">
            <span>{open ? "Hide" : "Show"} mastery</span>
            <ChevronDown size={15} className={`expandChev ${open ? "expandChevOpen" : ""}`} />
          </div>
        </div>
      </div>

      <div className={`collapseBody ${open ? "collapseOpen" : "collapseClosed"}`}>
        <div className="a3-divider" />

        <div className="a3-danRow">
          <span className="dot whereDot" />
          <span className="a3-subLabel whereClr">WHERE</span>
          <span className="a3-danPips">
            {Array.from({ length: A3.danMax }).map((_, i) => (
              <span key={i} className={`danPip ${i < A3.whereDan ? "danPipOn wherePipOn" : ""}`} />
            ))}
          </span>
        </div>

        <div className="a3-danRow">
          <span className="dot whenDot" />
          <span className="a3-subLabel whenClr">WHEN</span>
          <span className="a3-danPips">
            {Array.from({ length: A3.danMax }).map((_, i) => (
              <span key={i} className={`danPip ${i < A3.whenDan ? "danPipOn whenPipOn" : ""}`} />
            ))}
          </span>
        </div>
      </div>

      <style jsx>{`
        .a3 { padding: 18px; cursor: pointer; }
        .a3-main { display: flex; align-items: flex-start; gap: 16px; }
        .medallion {
          position: relative; width: 72px; height: 72px; flex-shrink: 0;
          overflow: hidden; border: 2px solid var(--main-color);
          box-shadow: 0 0 22px rgba(251,146,60,0.27); border-radius: 16px;
        }
        .medImg { width: 100%; height: 100%; object-fit: cover; }
        .a3-body { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .a3-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .a3-titles { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .a3-title { font-size: 19px; font-weight: 800; margin: 0; line-height: 1.1; }
        .a3-xp { font-size: 15px; font-weight: 800; color: #ffd54a; white-space: nowrap; flex-shrink: 0; }
        .a3-xp i { font-style: normal; font-size: 10px; font-weight: 700; margin-left: 3px; opacity: 0.7; }
        .a3-nextLine { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
        .a3-nextLabel { color: rgba(255,255,255,0.45); font-weight: 600; }
        .a3-nextTitle { font-weight: 800; }
        .a3-barMain { height: 8px; }
        .a3-expandHint {
          display: flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4);
        }

        .a3-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 14px 0; }
        .a3-danRow { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; }
        .a3-danRow:last-child { margin-bottom: 0; }
        .a3-subLabel { font-size: 9px; font-weight: 800; letter-spacing: 1px; flex-shrink: 0; }
        .a3-danPips { display: flex; gap: 3px; flex: 1; min-width: 0; }
        .danPip {
          width: 100%; height: 6px; border-radius: 2px;
          background: rgba(255,255,255,0.08); transition: background 0.3s;
        }
        .danPipOn { height: 8px; margin-top: -1px; border-radius: 3px; }
        .wherePipOn { background: var(--where-color); box-shadow: 0 0 4px rgba(34,211,238,0.5); }
        .whenPipOn { background: var(--when-color); box-shadow: 0 0 4px rgba(232,121,249,0.5); }
      `}</style>
    </section>
  );
}
