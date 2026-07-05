"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Progress Card · Dan Pips with Title Ladder
// Route: /prototype/rank-card-concepts   (direct access, self-contained)
//
// Single expandable card (Voyager) with:
//   • MAIN progress bar (orange) — overall XP progression
//   • WHERE/WHEN sub-progress: dan pips + bar with Current → Next titles
//   • Medallion image from Unsplash
//
// Below the card: full list of all 10 titles, each with an Unsplash icon image.
//
// All data is MOCK.
// ============================================================================

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

// ── Mock player state ────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();

const PLAYER = {
  title: "Voyager",
  totalXp: 32_500,
  xpToNext: 17_500,
  mainPct: 42,
  nextTitle: "Explorer",
  medallionImg: "https://images.unsplash.com/photo-1524661135-423995f22d80?w=200&h=200&fit=crop&auto=format",
  where: { current: "Scout", next: "Pathfinder", dan: 6, pct: 65, danMax: 10 },
  when: { current: "Novice", next: "Adept", dan: 3, pct: 28, danMax: 10 },
};

// ── All 10 titles with Unsplash icon images ──────────────────────────────────
const ALL_TITLES: { title: string; img: string; threshold: string }[] = [
  { title: "Wanderer",          threshold: "0 XP",         img: "https://images.unsplash.com/photo-1551632811-561ee280da53?w=80&h=80&fit=crop&auto=format" },
  { title: "Pathfinder",        threshold: "1,000 XP",     img: "https://images.unsplash.com/photo-1566939836438-8388ee6b29ae?w=80&h=80&fit=crop&auto=format" },
  { title: "Trailblazer",       threshold: "5,000 XP",     img: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=80&h=80&fit=crop&auto=format" },
  { title: "Cartographer",      threshold: "20,000 XP",    img: "https://images.unsplash.com/photo-1582058016430-7863e8656231?w=80&h=80&fit=crop&auto=format" },
  { title: "Explorer",          threshold: "50,000 XP",    img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=80&h=80&fit=crop&auto=format" },
  { title: "Navigator",         threshold: "125,000 XP",   img: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=80&h=80&fit=crop&auto=format" },
  { title: "Chronicler",        threshold: "300,000 XP",   img: "https://images.unsplash.com/photo-1568667256549-0947932f0f33?w=80&h=80&fit=crop&auto=format" },
  { title: "Historian",         threshold: "600,000 XP",   img: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=80&h=80&fit=crop&auto=format" },
  { title: "Scholar",           threshold: "1,200,000 XP", img: "https://images.unsplash.com/photo-1532012197267-da84d127e450?w=80&h=80&fit=crop&auto=format" },
  { title: "Cartographer Royal", threshold: "2,500,000 XP", img: "https://images.unsplash.com/photo-1606107557195-0e88e5d3ebbe?w=80&h=80&fit=crop&auto=format" },
];

// ── Page ─────────────────────────────────────────────────────────────────────
export default function RankCardConceptsPage() {
  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Progress Card · Dan Pips</span>
        <span className="protoHint">
          Main <b className="mainClr">orange</b> · Where <b className="whereClr">cyan</b> · When <b className="whenClr">pink</b>
        </span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        <div className="legend">
          Expandable card with dan pips + title progression. Images from Unsplash.
        </div>

        <ProgressCard />

        <h2 className="conceptTitle">All Titles</h2>
        <TitleLadder />

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
        .mainFill { background: linear-gradient(90deg, var(--main-color), var(--main-dk)); }
        .whereFill { background: var(--where-color); }
        .whenFill { background: var(--when-color); }

        .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .whereDot { background: var(--where-color); box-shadow: 0 0 6px rgba(34,211,238,0.6); }
        .whenDot { background: var(--when-color); box-shadow: 0 0 6px rgba(232,121,249,0.6); }

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
        .collapseOpen { max-height: 600px; opacity: 1; }
      `}</style>
    </div>
  );
}

// ── Progress Card (Alt 3 — Dan Pips) ─────────────────────────────────────────
function ProgressCard() {
  const [open, setOpen] = useState(true);
  return (
    <section className="card pc">
      <div className="pc-main">
        <div className="medallion">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PLAYER.medallionImg} alt={PLAYER.title} className="medImg" draggable={false} />
        </div>
        <div className="pc-body">
          <div className="pc-head">
            <div className="pc-titles"><h3 className="pc-title">{PLAYER.title}</h3></div>
            <span className="pc-xp">{fmt(PLAYER.totalXp)}<i>XP</i></span>
          </div>
          <div className="pc-nextLine">
            <span className="pc-nextLabel">Next</span>
            <span className="pc-nextTitle mainClr">{fmt(PLAYER.xpToNext)} XP to {PLAYER.nextTitle}</span>
          </div>
          <div className="bar pc-barMain">
            <span className="barFill mainFill" style={{ width: `${PLAYER.mainPct}%` }} />
          </div>
          <div className="pc-expandRow" onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={18} className={`expandChev ${open ? "expandChevOpen" : ""}`} />
          </div>
        </div>
      </div>

      <div className={`collapseBody ${open ? "collapseOpen" : "collapseClosed"}`}>
        <div className="pc-divider" />

        {/* WHERE — dan pips + bar with Current → Next */}
        <div className="pc-sub">
          <div className="pc-subHead">
            <span className="dot whereDot" />
            <span className="pc-subLabel whereClr">WHERE</span>
            <span className="pc-subTitles whereClr">
              {PLAYER.where.current} <span className="pc-arrow">→</span> {PLAYER.where.next}
            </span>
          </div>
          <div className="bar pc-barSub">
            <span className="barFill whereFill" style={{ width: `${PLAYER.where.pct}%` }} />
          </div>
          <div className="pc-danPips">
            {Array.from({ length: PLAYER.where.danMax }).map((_, i) => (
              <span key={i} className={`danPip ${i < PLAYER.where.dan ? "danPipOn wherePipOn" : ""}`} />
            ))}
          </div>
        </div>

        {/* WHEN — dan pips + bar with Current → Next */}
        <div className="pc-sub">
          <div className="pc-subHead">
            <span className="dot whenDot" />
            <span className="pc-subLabel whenClr">WHEN</span>
            <span className="pc-subTitles whenClr">
              {PLAYER.when.current} <span className="pc-arrow">→</span> {PLAYER.when.next}
            </span>
          </div>
          <div className="bar pc-barSub">
            <span className="barFill whenFill" style={{ width: `${PLAYER.when.pct}%` }} />
          </div>
          <div className="pc-danPips">
            {Array.from({ length: PLAYER.when.danMax }).map((_, i) => (
              <span key={i} className={`danPip ${i < PLAYER.when.dan ? "danPipOn whenPipOn" : ""}`} />
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .pc { padding: 18px; }
        .pc-main { display: flex; align-items: flex-start; gap: 16px; }
        .medallion {
          position: relative; width: 72px; height: 72px; flex-shrink: 0;
          overflow: hidden; border: 2px solid var(--main-color);
          box-shadow: 0 0 22px rgba(251,146,60,0.27); border-radius: 16px;
        }
        .medImg { width: 100%; height: 100%; object-fit: cover; }
        .pc-body { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .pc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .pc-titles { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .pc-title { font-size: 19px; font-weight: 800; margin: 0; line-height: 1.1; }
        .pc-xp { font-size: 15px; font-weight: 800; color: #ffd54a; white-space: nowrap; flex-shrink: 0; }
        .pc-xp i { font-style: normal; font-size: 10px; font-weight: 700; margin-left: 3px; opacity: 0.7; }
        .pc-nextLine { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
        .pc-nextLabel { color: rgba(255,255,255,0.45); font-weight: 600; }
        .pc-nextTitle { font-weight: 800; }
        .pc-barMain { height: 8px; }
        .pc-expandRow { display: flex; justify-content: center; margin-top: 2px; }

        .pc-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 14px 0; }
        .pc-sub { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .pc-sub:last-child { margin-bottom: 0; }
        .pc-subHead { display: flex; align-items: center; gap: 7px; }
        .pc-subLabel { font-size: 9px; font-weight: 800; letter-spacing: 1px; flex-shrink: 0; }
        .pc-subTitles { font-size: 10px; font-weight: 700; white-space: nowrap; }
        .pc-subTitles .pc-arrow { opacity: 0.5; font-weight: 600; }
        .pc-barSub { height: 5px; }
        .pc-danPips { display: flex; gap: 3px; }
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

// ── Title Ladder (all 10 titles with Unsplash images) ────────────────────────
function TitleLadder() {
  const currentIdx = 3; // Cartographer = tier 4 (index 3) — mock
  return (
    <div className="ladder">
      {ALL_TITLES.map((t, i) => {
        const isCurrent = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <div key={t.title} className={`ladderRow ${isCurrent ? "ladderCur" : ""} ${isPast ? "ladderPast" : ""}`}>
            <div className={`ladderImgWrap ${isCurrent ? "ladderImgCur" : ""} ${isPast ? "ladderImgPast" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.img} alt={t.title} className="ladderImg" draggable={false} />
            </div>
            <div className="ladderInfo">
              <span className="ladderTitle">{t.title}</span>
              <span className="ladderThreshold">{t.threshold}</span>
            </div>
            {isCurrent && <span className="ladderBadge mainClr">YOU</span>}
          </div>
        );
      })}

      <style jsx>{`
        .ladder { display: flex; flex-direction: column; gap: 2px; }
        .ladderRow {
          display: flex; align-items: center; gap: 12px; padding: 8px 10px;
          border-radius: 12px; transition: background 0.2s;
        }
        .ladderCur { background: rgba(251,146,60,0.1); border: 1px solid rgba(251,146,60,0.25); }
        .ladderImgWrap {
          width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px;
          overflow: hidden; border: 1px solid rgba(255,255,255,0.1);
          opacity: 0.35; filter: grayscale(0.7);
        }
        .ladderImgPast { opacity: 0.6; filter: grayscale(0.3); }
        .ladderImgCur {
          opacity: 1; filter: none; border-color: var(--main-color);
          box-shadow: 0 0 12px rgba(251,146,60,0.3); width: 48px; height: 48px;
        }
        .ladderImg { width: 100%; height: 100%; object-fit: cover; }
        .ladderInfo { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .ladderTitle { font-size: 14px; font-weight: 800; line-height: 1.1; }
        .ladderPast .ladderTitle { color: rgba(255,255,255,0.5); }
        .ladderThreshold { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.35); }
        .ladderBadge {
          font-size: 9px; font-weight: 800; letter-spacing: 1px;
          padding: 2px 8px; border-radius: 999px;
          background: rgba(251,146,60,0.15); border: 1px solid rgba(251,146,60,0.3);
        }
      `}</style>
    </div>
  );
}
