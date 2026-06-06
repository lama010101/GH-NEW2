"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Round Results (improved UI)
// Route: /prototype/round-results   (direct access, fully self-contained)
//
// - Visual language follows the home page + guess-modal + lobby prototypes:
//   dark background image + scrim, proto bar, rounded glass cards, cyan
//   (WHERE) and violet (WHEN) accents, self-contained <style jsx>.
// - All data is MOCK and held in local constants/state. No WebSocket, no
//   Supabase, no real network, no map library. The WHERE map and WHEN
//   timeline are stylised CSS renderings so the layout can be reviewed in
//   isolation.
//
// Does NOT touch or import any existing app files.
// ============================================================================

import { useState } from "react";

type Badge = { dimension: "year" | "location" | "combo"; tier: "gold" | "silver" | "bronze" } | null;

type Result = {
  id: string;
  name: string;
  score: number;        // round XP
  accuracy: number;     // combo accuracy %
  locationScore: number;
  timeScore: number;
  guessYear: number;
  distanceKm: number;
  badge: Badge;
  isMe: boolean;
};

const CORRECT_YEAR = 1989;
const CORRECT_LOCATION = "Berlin, Germany";
const EVENT_TITLE = "Fall of the Berlin Wall";
const EVENT_DESC =
  "Crowds gather at the Brandenburg Gate as the barrier dividing East and West Berlin is opened, a turning point that hastened German reunification.";
const TOTAL_ROUNDS = 5;
const CURRENT_ROUND = 3; // 0-indexed -> round 4 of 5 display below uses +1

const RESULTS: Result[] = [
  { id: "p1", name: "Alex Rivera", score: 1840, accuracy: 94, locationScore: 96, timeScore: 92, guessYear: 1991, distanceKm: 42, badge: { dimension: "combo", tier: "silver" }, isMe: true },
  { id: "p2", name: "Mina Kovač", score: 1980, accuracy: 99, locationScore: 100, timeScore: 98, guessYear: 1989, distanceKm: 6, badge: { dimension: "combo", tier: "gold" }, isMe: false },
  { id: "p3", name: "Theo Lambert", score: 1210, accuracy: 71, locationScore: 64, timeScore: 78, guessYear: 1978, distanceKm: 410, badge: null, isMe: false },
  { id: "p4", name: "Sara Bianchi", score: 1530, accuracy: 83, locationScore: 88, timeScore: 78, guessYear: 1994, distanceKm: 120, badge: null, isMe: false },
];

const TIER_STYLE: Record<string, { bg: string; border: string; color: string; label: string }> = {
  gold: { bg: "rgba(255,190,0,0.15)", border: "rgba(255,190,0,0.45)", color: "#ffcc44", label: "Gold" },
  silver: { bg: "rgba(180,195,215,0.14)", border: "rgba(180,195,215,0.45)", color: "#cdd6e3", label: "Silver" },
  bronze: { bg: "rgba(180,120,60,0.15)", border: "rgba(180,120,60,0.45)", color: "#cd9a5a", label: "Bronze" },
};

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const h1 = hash % 360;
  return `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${(h1 + 48) % 360} 70% 42%))`;
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}
function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ background: gradientFor(id), width: size, height: size, fontSize: size * 0.36 }}
    >
      {initialsOf(name)}
    </span>
  );
}

// Animated SVG accuracy ring.
function AccuracyRing({ value }: { value: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="ringWrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <defs>
          <linearGradient id="accGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke="url(#accGrad)" strokeWidth="11"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform="rotate(-90 70 70)" style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="ringCenter">
        <span className="ringValue">{Math.round(value)}</span>
        <span className="ringPct">%</span>
      </div>
    </div>
  );
}

// WHEN timeline (mock) — ticks + correct marker + player markers.
function WhenTimeline({ rows }: { rows: Result[] }) {
  const years = [CORRECT_YEAR, ...rows.map((r) => r.guessYear)];
  const minY = Math.floor((Math.min(...years) - 10) / 10) * 10;
  const maxY = Math.ceil((Math.max(...years) + 10) / 10) * 10;
  const range = maxY - minY || 1;
  const pct = (y: number) => ((y - minY) / range) * 100;
  const ticks: number[] = [];
  for (let y = minY; y <= maxY; y += 10) ticks.push(y);

  return (
    <div className="timeline">
      <div className="timelineBar" />
      {ticks.map((y) => (
        <div key={y} className="tick" style={{ left: `${pct(y)}%` }}>
          {y % 20 === 0 && <span className="tickLabel">{y}</span>}
        </div>
      ))}
      <div className="correctMarker" style={{ left: `${pct(CORRECT_YEAR)}%` }}>
        <span className="correctFlag">Correct</span>
        <span className="correctYearTl">{CORRECT_YEAR}</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className="tlPlayer"
          style={{ left: `${Math.max(4, Math.min(96, pct(r.guessYear)))}%`, transform: `translate(-50%, ${-(i % 2) * 26}px)` }}
        >
          <Avatar id={r.id} name={r.name} size={24} />
          <span className="tlYear" style={{ fontWeight: r.isMe ? 700 : 400 }}>{r.guessYear}</span>
        </div>
      ))}
    </div>
  );
}

// WHERE stylised map (mock) — gradient "map" with positioned markers.
function WhereMap({ rows }: { rows: Result[] }) {
  // Hard-coded relative positions for a believable layout (no real geo).
  const pos: Record<string, { x: number; y: number }> = {
    correct: { x: 52, y: 40 },
    p1: { x: 58, y: 47 },
    p2: { x: 53, y: 41 },
    p3: { x: 30, y: 66 },
    p4: { x: 64, y: 33 },
  };
  return (
    <div className="map">
      <div className="mapGrid" />
      {/* correct location */}
      <div className="mapPin mapPinCorrect" style={{ left: `${pos.correct.x}%`, top: `${pos.correct.y}%` }}>
        <span className="mapPinDot mapPinDotCorrect" />
        <span className="mapPinLabel mapPinLabelCorrect">{CORRECT_LOCATION}</span>
      </div>
      {rows.map((r) => {
        const p = pos[r.id] ?? { x: 50, y: 50 };
        return (
          <div key={r.id} className="mapPin" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <span className="mapAvatarRing" style={{ borderColor: r.isMe ? "#22d3ee" : "rgba(255,255,255,0.6)" }}>
              <Avatar id={r.id} name={r.name} size={26} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function RoundResultsPrototypePage() {
  const [tab, setTab] = useState<"where" | "when">("where");
  const [lbOpen, setLbOpen] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);

  const me = RESULTS.find((r) => r.isMe)!;
  const ranked = [...RESULTS].sort((a, b) => b.score - a.score);
  const myRank = ranked.findIndex((r) => r.isMe) + 1;

  const whereRows = [...RESULTS].sort((a, b) => b.locationScore - a.locationScore);
  const whenRows = [...RESULTS].sort((a, b) => b.timeScore - a.timeScore);
  const panelRows = tab === "where" ? whereRows : whenRows;
  const accent = tab === "where" ? "#22d3ee" : "#8b5cf6";

  const WHERE_HINTS = [
    { label: "Continent", text: "Europe" },
    { label: "Region", text: "Central Europe, German-speaking" },
    { label: "Nearby Landmark", text: "Brandenburg Gate — 0.4 km away" },
  ];
  const WHEN_HINTS = [
    { label: "Century", text: "20th century" },
    { label: "Decade", text: "Late 1980s" },
    { label: "Contemporary Event", text: "End of the Cold War — 2 years off" },
  ];
  const hints = tab === "where" ? WHERE_HINTS : WHEN_HINTS;

  return (
    <main className="screen">
      <div className="protoBar">
        <span className="protoTitle">Round Results — Prototype</span>
        <span className="protoHint">Mock data · you = Alex</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        {/* ── Round banner ── */}
        <div className="roundBanner">
          <span className="roundChip">ROUND {CURRENT_ROUND + 1} / {TOTAL_ROUNDS}</span>
          <span className="rankChip">
            <span className="rankBig">#{myRank}</span> this round
          </span>
        </div>

        {/* ── Event card ── */}
        <section className="card eventCard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home_background.webp" alt={EVENT_TITLE} className="eventImg" />
          <div className="eventGradient" />
          <div className="eventOverlay">
            <span className="eventMeta">{CORRECT_YEAR} · {CORRECT_LOCATION}</span>
            <h1 className="eventTitle">{EVENT_TITLE}</h1>
          </div>
        </section>
        <p className="eventDesc">{EVENT_DESC}</p>

        {/* ── Score hero card ── */}
        <section className="card heroCard">
          <AccuracyRing value={me.accuracy} />
          <div className="heroSide">
            <div className="xpBlock">
              <span className="xpValue">+{me.score.toLocaleString()}</span>
              <span className="xpLabel">XP earned</span>
            </div>
            {me.badge && (
              <span
                className="comboBadge"
                style={{
                  background: TIER_STYLE[me.badge.tier].bg,
                  border: `1px solid ${TIER_STYLE[me.badge.tier].border}`,
                  color: TIER_STYLE[me.badge.tier].color,
                }}
              >
                ★ {TIER_STYLE[me.badge.tier].label} combo
              </span>
            )}
            <div className="splitRow">
              <div className="splitItem">
                <span className="splitDot" style={{ background: "#22d3ee" }} />
                <span className="splitLabel">Where</span>
                <span className="splitVal" style={{ color: accColor(me.locationScore) }}>{me.locationScore}%</span>
              </div>
              <div className="splitItem">
                <span className="splitDot" style={{ background: "#8b5cf6" }} />
                <span className="splitLabel">When</span>
                <span className="splitVal" style={{ color: accColor(me.timeScore) }}>{me.timeScore}%</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Round leaderboard ── */}
        <section className="card">
          <div className="cardHead">
            <span className="accentBar" />
            <h2 className="cardTitle">Round leaderboard</h2>
          </div>
          <div className="lbList">
            {ranked.map((r, i) => (
              <div key={r.id} className={`lbRow ${r.isMe ? "lbRowMe" : ""}`}>
                <span className={`lbRank ${i === 0 ? "lbRankGold" : ""}`}>{i + 1}</span>
                <Avatar id={r.id} name={r.name} size={32} />
                <span className="lbName">
                  {r.name}
                  {r.isMe && <span className="youTag">you</span>}
                </span>
                <span className="lbXp">+{r.score.toLocaleString()}</span>
                <span className="lbAcc" style={{ color: accColor(r.accuracy) }}>{r.accuracy}%</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Where / When breakdown (tabbed) ── */}
        <section className="card">
          <div className="tabs">
            <button
              className={`tab ${tab === "where" ? "tabActive" : ""}`}
              style={tab === "where" ? { color: "#22d3ee", borderColor: "#22d3ee" } : undefined}
              onClick={() => { setTab("where"); setLbOpen(false); setHintsOpen(false); }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/where.webp" alt="" className="tabIcon" />
              Where
            </button>
            <button
              className={`tab ${tab === "when" ? "tabActive" : ""}`}
              style={tab === "when" ? { color: "#8b5cf6", borderColor: "#8b5cf6" } : undefined}
              onClick={() => { setTab("when"); setLbOpen(false); setHintsOpen(false); }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/when.webp" alt="" className="tabIcon" />
              When
            </button>
          </div>

          <div className="breakHead">
            <span className="breakCorrect">
              Correct: <strong style={{ color: accent }}>{tab === "where" ? CORRECT_LOCATION : CORRECT_YEAR}</strong>
            </span>
            <span className="breakScore" style={{ color: accColor(tab === "where" ? me.locationScore : me.timeScore) }}>
              {tab === "where" ? me.locationScore : me.timeScore}%
            </span>
          </div>
          <span className="breakSub">
            {tab === "where"
              ? `You were ${me.distanceKm} km away`
              : `You guessed ${me.guessYear} · ${Math.abs(me.guessYear - CORRECT_YEAR)} yrs off`}
          </span>

          {tab === "where" ? <WhereMap rows={whereRows} /> : <WhenTimeline rows={whenRows} />}

          {/* Expandable leaderboard */}
          <div className="expand">
            <button className="expandHead" onClick={() => setLbOpen((v) => !v)}>
              <span className="chev" style={{ transform: lbOpen ? "rotate(90deg)" : "none" }}>›</span>
              Leaderboard
              <span className="expandRank" style={{ color: accent }}>#{myRank}</span>
            </button>
            {lbOpen && (
              <div className="subLb">
                {panelRows.map((r) => {
                  const val = tab === "where" ? r.locationScore : r.timeScore;
                  const detail = tab === "where" ? `${r.distanceKm} km` : `${Math.abs(r.guessYear - CORRECT_YEAR)} yrs off`;
                  return (
                    <div key={r.id} className={`subLbRow ${r.isMe ? "lbRowMe" : ""}`}>
                      <Avatar id={r.id} name={r.name} size={26} />
                      <span className="subLbName">{r.name}</span>
                      <span className="subLbDetail">{detail}</span>
                      <span className="subLbAcc" style={{ color: accColor(val) }}>{val}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Expandable hints */}
          <div className="expand">
            <button className="expandHead" onClick={() => setHintsOpen((v) => !v)}>
              <span className="chev" style={{ transform: hintsOpen ? "rotate(90deg)" : "none", color: accent }}>›</span>
              <span style={{ color: accent }}>Hints</span>
            </button>
            {hintsOpen && (
              <div className="hintsList">
                {hints.map((h) => (
                  <div key={h.label} className="hintRow">
                    <span className="hintLabel">{h.label}</span>
                    <span className="hintText">{h.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Countdown ── */}
        <div className="countdown">
          <span className="countdownText">Auto-advancing in <strong>8s</strong></span>
          <span className="readyNames">
            <span style={{ color: "#4ade80" }}>Mina ✓</span>
            <span style={{ color: "#4ade80" }}>Sara ✓</span>
          </span>
        </div>

        <div className="dockSpacer" />
      </div>

      {/* ── Bottom bar ── */}
      <div className="bottomBar">
        <button className="iconBtn" aria-label="Home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
            <polyline points="9 21 9 12 15 12 15 21" />
          </svg>
        </button>
        <div className="progress">
          {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
            <span
              key={i}
              className="dot"
              style={{ background: i < CURRENT_ROUND ? "#22d3ee" : i === CURRENT_ROUND ? "#fff" : "rgba(255,255,255,0.2)" }}
            />
          ))}
        </div>
        <button className="nextBtn">Next →</button>
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
          padding: 56px 16px calc(96px + env(safe-area-inset-bottom));
          display: flex; flex-direction: column; gap: 14px;
          max-width: 560px; margin: 0 auto; box-sizing: border-box;
        }

        /* ── Round banner ── */
        .roundBanner { display: flex; align-items: center; justify-content: space-between; padding: 6px 2px 0; }
        .roundChip {
          font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: rgba(255,255,255,0.7);
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          padding: 4px 11px; border-radius: 999px;
        }
        .rankChip { font-size: 13px; color: rgba(255,255,255,0.7); display: inline-flex; align-items: baseline; gap: 6px; }
        .rankBig { font-size: 22px; font-weight: 800; color: #fff; }

        /* ── Cards ── */
        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }
        .cardHead { display: flex; align-items: center; gap: 10px; padding: 16px 18px 10px; }
        .accentBar { width: 4px; height: 18px; border-radius: 999px; background: #22d3ee; }
        .cardTitle { font-size: 16px; font-weight: 700; margin: 0; }

        /* ── Event card ── */
        .eventCard { position: relative; padding: 0; overflow: hidden; }
        .eventImg { width: 100%; height: 200px; object-fit: cover; display: block; }
        .eventGradient { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85)); }
        .eventOverlay { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px; }
        .eventMeta { font-size: 13px; font-weight: 700; color: #22d3ee; }
        .eventTitle { font-size: 24px; font-weight: 800; margin: 4px 0 0; letter-spacing: -0.3px; }
        .eventDesc { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.78); margin: -4px 4px 2px; }

        /* ── Hero score ── */
        .heroCard { display: flex; align-items: center; gap: 18px; padding: 18px; }
        .ringWrap { position: relative; flex-shrink: 0; width: 140px; height: 140px; }
        .ringCenter { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .ringValue { font-size: 38px; font-weight: 800; }
        .ringPct { font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.6); margin-left: 2px; }
        .heroSide { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        .xpBlock { display: flex; flex-direction: column; }
        .xpValue { font-size: 26px; font-weight: 800; color: #ffd54a; line-height: 1; }
        .xpLabel { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 3px; }
        .comboBadge { align-self: flex-start; font-size: 12px; font-weight: 700; padding: 4px 11px; border-radius: 999px; }
        .splitRow { display: flex; gap: 18px; }
        .splitItem { display: flex; align-items: center; gap: 6px; }
        .splitDot { width: 9px; height: 9px; border-radius: 50%; }
        .splitLabel { font-size: 13px; color: rgba(255,255,255,0.65); }
        .splitVal { font-size: 14px; font-weight: 700; }

        /* ── Avatars ── */
        .avatar {
          flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
          font-weight: 700; color: #fff; text-transform: uppercase; border: 2px solid rgba(255,255,255,0.25);
        }

        /* ── Round leaderboard ── */
        .lbList { display: flex; flex-direction: column; padding: 0 12px 12px; }
        .lbRow {
          display: flex; align-items: center; gap: 11px; padding: 9px 8px; border-radius: 10px;
        }
        .lbRow + .lbRow { border-top: 1px solid rgba(255,255,255,0.06); }
        .lbRowMe { background: rgba(34,211,238,0.08); }
        .lbRank { width: 22px; text-align: center; font-size: 15px; font-weight: 800; color: rgba(255,255,255,0.6); }
        .lbRankGold { color: #ffd54a; }
        .lbName { flex: 1; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 7px; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .youTag { font-size: 10px; font-weight: 700; color: #22d3ee; background: rgba(34,211,238,0.15); padding: 1px 7px; border-radius: 999px; }
        .lbXp { font-size: 13px; font-weight: 700; color: #ffd54a; }
        .lbAcc { font-size: 14px; font-weight: 800; width: 44px; text-align: right; }

        /* ── Tabs ── */
        .tabs { display: flex; gap: 8px; padding: 14px 14px 0; }
        .tab {
          flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px; border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 700;
          background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.6); transition: all 0.18s;
        }
        .tabActive { background: rgba(255,255,255,0.1); }
        .tabIcon { width: 22px; height: 22px; object-fit: contain; }

        .breakHead { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px 0; }
        .breakCorrect { font-size: 14px; color: rgba(255,255,255,0.7); }
        .breakScore { font-size: 22px; font-weight: 800; }
        .breakSub { display: block; font-size: 12px; color: rgba(255,255,255,0.5); padding: 2px 18px 0; }

        /* ── WHEN timeline ── */
        .timeline { position: relative; height: 110px; margin: 28px 18px 8px; }
        .timelineBar { position: absolute; left: 0; right: 0; top: 62px; height: 3px; border-radius: 999px; background: rgba(255,255,255,0.18); }
        .tick { position: absolute; top: 58px; width: 1px; height: 10px; background: rgba(255,255,255,0.25); transform: translateX(-50%); }
        .tickLabel { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); font-size: 10px; color: rgba(255,255,255,0.4); white-space: nowrap; }
        .correctMarker { position: absolute; top: 40px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; z-index: 3; }
        .correctFlag { font-size: 9px; font-weight: 800; letter-spacing: 0.5px; color: #4ade80; background: rgba(74,222,128,0.15); padding: 2px 6px; border-radius: 6px; }
        .correctYearTl { font-size: 12px; font-weight: 700; color: #4ade80; margin-top: 2px; }
        .correctMarker::after { content: ""; width: 2px; height: 20px; background: #4ade80; margin-top: 2px; }
        .tlPlayer { position: absolute; top: 30px; display: flex; flex-direction: column; align-items: center; gap: 2px; z-index: 2; }
        .tlYear { font-size: 11px; color: rgba(255,255,255,0.8); }

        /* ── WHERE map ── */
        .map {
          position: relative; height: 220px; margin: 14px 14px 4px; border-radius: 14px; overflow: hidden;
          background: radial-gradient(circle at 50% 40%, #16384a, #0c1a24 70%);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .mapGrid {
          position: absolute; inset: 0; opacity: 0.25;
          background-image: linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px);
          background-size: 32px 32px;
        }
        .mapPin { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; }
        .mapPinDot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; }
        .mapPinDotCorrect { background: #4ade80; box-shadow: 0 0 0 6px rgba(74,222,128,0.25); }
        .mapPinLabel { font-size: 11px; font-weight: 700; margin-top: 4px; white-space: nowrap; }
        .mapPinLabelCorrect { color: #4ade80; }
        .mapPinCorrect { z-index: 4; }
        .mapAvatarRing { border-radius: 50%; border: 2px solid; display: inline-flex; }

        /* ── Expandables ── */
        .expand { border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0 0; }
        .expandHead {
          width: 100%; display: flex; align-items: center; gap: 8px; padding: 13px 18px;
          background: transparent; border: none; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .chev { font-size: 18px; line-height: 1; color: rgba(255,255,255,0.5); transition: transform 0.18s; display: inline-block; }
        .expandRank { margin-left: auto; font-weight: 800; }
        .subLb { padding: 0 14px 12px; display: flex; flex-direction: column; }
        .subLbRow { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 9px; }
        .subLbRow + .subLbRow { border-top: 1px solid rgba(255,255,255,0.06); }
        .subLbName { flex: 1; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .subLbDetail { font-size: 12px; color: rgba(255,255,255,0.5); }
        .subLbAcc { font-size: 14px; font-weight: 800; width: 42px; text-align: right; }
        .hintsList { padding: 0 18px 14px; display: flex; flex-direction: column; gap: 10px; }
        .hintRow { display: flex; flex-direction: column; gap: 2px; }
        .hintLabel { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: rgba(255,255,255,0.5); text-transform: uppercase; }
        .hintText { font-size: 14px; color: rgba(255,255,255,0.85); }

        /* ── Countdown ── */
        .countdown {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 12px 16px; border-radius: 14px; flex-wrap: wrap;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        }
        .countdownText { font-size: 13px; color: rgba(255,255,255,0.7); }
        .readyNames { display: flex; gap: 12px; font-size: 13px; font-weight: 600; }

        .dockSpacer { height: 2px; }

        /* ── Bottom bar ── */
        .bottomBar {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 30;
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(10,10,12,0), rgba(10,10,12,0.92) 45%);
        }
        .iconBtn {
          width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; cursor: pointer;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center;
        }
        .progress { flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .nextBtn {
          flex-shrink: 0; padding: 12px 26px; border-radius: 12px; border: none; cursor: pointer;
          font-size: 15px; font-weight: 800; color: #06181c; background: #22d3ee;
          box-shadow: 0 6px 22px rgba(34,211,238,0.35);
        }
        .nextBtn:hover { opacity: 0.95; }
      `}</style>
    </main>
  );
}
