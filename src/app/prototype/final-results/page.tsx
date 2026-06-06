"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Final Results (all 5 rounds completed)
// Route: /prototype/final-results   (direct access, fully self-contained)
//
// - Visual language follows the home / guess-modal / lobby / round-results
//   prototypes: dark background image + scrim, proto bar, rounded glass cards,
//   cyan (WHERE) + violet (WHEN) accents, SVG accuracy ring, self-contained
//   <style jsx>.
// - All data is MOCK. No WebSocket, no Supabase, no real network/map.
//   Aggregates (overall accuracy, per-round breakdown, rankings) are derived
//   from a local mock dataset of 5 rounds × 4 players.
//
// Does NOT touch or import any existing app files.
// ============================================================================

import { useMemo, useState } from "react";

type RoundData = {
  index: number;
  title: string;
  year: number;
  location: string;
};

type PlayerRoundResult = {
  playerId: string;
  roundIndex: number;
  score: number;
  locationScore: number;
  timeScore: number;
  distanceKm: number;
  yearDiff: number;
};

type Player = { id: string; name: string; isMe: boolean };

const VIEWER_ID = "p1";

const PLAYERS: Player[] = [
  { id: "p1", name: "Alex Rivera", isMe: true },
  { id: "p2", name: "Mina Kovač", isMe: false },
  { id: "p3", name: "Theo Lambert", isMe: false },
  { id: "p4", name: "Sara Bianchi", isMe: false },
];

const ROUNDS: RoundData[] = [
  { index: 0, title: "Fall of the Berlin Wall", year: 1989, location: "Berlin, Germany" },
  { index: 1, title: "Apollo 11 Moon Landing", year: 1969, location: "Cape Canaveral, USA" },
  { index: 2, title: "Coronation of Elizabeth II", year: 1953, location: "London, UK" },
  { index: 3, title: "Eiffel Tower Inauguration", year: 1889, location: "Paris, France" },
  { index: 4, title: "Sydney Opera House Opening", year: 1973, location: "Sydney, Australia" },
];

// Deterministic mock per-player, per-round results.
const RESULTS: PlayerRoundResult[] = (() => {
  // base skill per player (higher = better)
  const skill: Record<string, number> = { p1: 88, p2: 95, p3: 72, p4: 83 };
  const out: PlayerRoundResult[] = [];
  for (const p of PLAYERS) {
    for (const r of ROUNDS) {
      // pseudo-random deterministic wobble
      const seed = (p.id.charCodeAt(1) * 13 + r.index * 31) % 17;
      const loc = Math.max(20, Math.min(100, skill[p.id] + (seed - 8)));
      const time = Math.max(20, Math.min(100, skill[p.id] + ((seed * 2) % 17) - 8));
      const score = Math.round((loc + time) * 10);
      const distanceKm = Math.round((100 - loc) * 9);
      const yearDiff = Math.round((100 - time) / 4);
      out.push({ playerId: p.id, roundIndex: r.index, score, locationScore: loc, timeScore: time, distanceKm, yearDiff });
    }
  }
  return out;
})();

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
    <span className="avatar" style={{ background: gradientFor(id), width: size, height: size, fontSize: size * 0.36 }}>
      {initialsOf(name)}
    </span>
  );
}

function AccuracyRing({ value, label }: { value: number; label: string }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="ringWrap">
      <svg width="150" height="150" viewBox="0 0 150 150">
        <defs>
          <linearGradient id="finalGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="75" cy="75" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
        <circle
          cx="75" cy="75" r={r} fill="none" stroke="url(#finalGrad)" strokeWidth="12"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform="rotate(-90 75 75)" style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="ringCenter">
        <span className="ringValue">{Math.round(value)}<span className="ringPct">%</span></span>
        <span className="ringLabel">{label}</span>
      </div>
    </div>
  );
}

export default function FinalResultsPrototypePage() {
  const [expandedRound, setExpandedRound] = useState<number | null>(0);

  // Per-player aggregates
  const playerStats = useMemo(() => {
    return PLAYERS.map((p) => {
      const rows = RESULTS.filter((r) => r.playerId === p.id);
      const n = rows.length;
      const totalScore = rows.reduce((s, r) => s + r.score, 0);
      const avgLocation = Math.round(rows.reduce((s, r) => s + r.locationScore, 0) / n);
      const avgTime = Math.round(rows.reduce((s, r) => s + r.timeScore, 0) / n);
      const avgAccuracy = Math.round((avgLocation + avgTime) / 2);
      const avgDistanceKm = Math.round(rows.reduce((s, r) => s + r.distanceKm, 0) / n);
      const avgYearDiff = Math.round(rows.reduce((s, r) => s + r.yearDiff, 0) / n);
      return { ...p, totalScore, avgLocation, avgTime, avgAccuracy, avgDistanceKm, avgYearDiff };
    });
  }, []);

  // Round winners
  const roundWinner = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of ROUNDS) {
      const rows = RESULTS.filter((x) => x.roundIndex === r.index);
      const best = rows.reduce((b, x) => (x.score > b.score ? x : b), rows[0]);
      map.set(r.index, best.playerId);
    }
    return map;
  }, []);

  const leaderboard = useMemo(
    () =>
      [...playerStats].sort((a, b) =>
        b.avgAccuracy !== a.avgAccuracy ? b.avgAccuracy - a.avgAccuracy : b.totalScore - a.totalScore
      ),
    [playerStats]
  );

  const me = playerStats.find((p) => p.isMe)!;
  const myRank = leaderboard.findIndex((p) => p.isMe) + 1;
  const wonRoundsByMe = [...roundWinner.entries()].filter(([, pid]) => pid === VIEWER_ID).length;

  const rankSuffix = (n: number) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

  const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? id;

  const roundStats = (idx: number) => {
    const rows = RESULTS.filter((r) => r.roundIndex === idx);
    const n = rows.length;
    return {
      avgAccuracy: Math.round(rows.reduce((s, r) => s + (r.locationScore + r.timeScore) / 2, 0) / n),
      avgLocation: Math.round(rows.reduce((s, r) => s + r.locationScore, 0) / n),
      avgTime: Math.round(rows.reduce((s, r) => s + r.timeScore, 0) / n),
      avgDistanceKm: Math.round(rows.reduce((s, r) => s + r.distanceKm, 0) / n),
      avgYearDiff: Math.round(rows.reduce((s, r) => s + r.yearDiff, 0) / n),
      totalScore: rows.reduce((s, r) => s + r.score, 0),
    };
  };

  return (
    <main className="screen">
      <div className="protoBar">
        <span className="protoTitle">Final Results — Prototype</span>
        <span className="protoHint">Mock data · 5 rounds · you = Alex</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        {/* ── Victory banner ── */}
        <div className="banner">
          <span className="bannerKicker">GAME COMPLETE</span>
          <h1 className="bannerTitle">
            You finished <span className="bannerRank">{myRank}{rankSuffix(myRank)}</span>
          </h1>
          <div className="bannerStats">
            <span>{me.totalScore.toLocaleString()} XP</span>
            <span className="bannerDot">·</span>
            <span>{wonRoundsByMe} round{wonRoundsByMe === 1 ? "" : "s"} won</span>
          </div>
        </div>

        {/* ── Hero accuracy + Where/When ── */}
        <section className="card heroCard">
          <AccuracyRing value={me.avgAccuracy} label="overall" />
          <div className="statPair">
            <div className="statTile">
              <span className="statTileLabel" style={{ color: "#22d3ee" }}>WHERE</span>
              <span className="statTileVal" style={{ color: accColor(me.avgLocation) }}>{me.avgLocation}%</span>
              <span className="statTileSub">avg {me.avgDistanceKm} km away</span>
            </div>
            <div className="statTile">
              <span className="statTileLabel" style={{ color: "#8b5cf6" }}>WHEN</span>
              <span className="statTileVal" style={{ color: accColor(me.avgTime) }}>{me.avgTime}%</span>
              <span className="statTileSub">avg {me.avgYearDiff} yrs off</span>
            </div>
          </div>
        </section>

        {/* ── Final rankings ── */}
        <section className="card">
          <div className="cardHead">
            <span className="accentBar" />
            <h2 className="cardTitle">Final rankings</h2>
          </div>
          <div className="ranks">
            {leaderboard.map((p, i) => {
              const wins = [...roundWinner.entries()].filter(([, pid]) => pid === p.id).length;
              return (
                <div key={p.id} className={`rankRow ${p.isMe ? "rankRowMe" : ""}`}>
                  <span className={`medal ${i === 0 ? "medalGold" : i === 1 ? "medalSilver" : i === 2 ? "medalBronze" : ""}`}>
                    {i + 1}
                  </span>
                  <Avatar id={p.id} name={p.name} size={38} />
                  <div className="rankMain">
                    <div className="rankNameLine">
                      <span className="rankName">{p.name}</span>
                      {p.isMe && <span className="youTag">you</span>}
                      {wins > 0 && <span className="winTag">🏆 {wins}</span>}
                    </div>
                    <div className="bar">
                      <div className="barFill" style={{ width: `${p.avgAccuracy}%` }} />
                    </div>
                  </div>
                  <div className="rankScore">
                    <span className="rankAcc" style={{ color: accColor(p.avgAccuracy) }}>{p.avgAccuracy}%</span>
                    <span className="rankXp">{p.totalScore.toLocaleString()} XP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Round breakdown ── */}
        <section className="card">
          <div className="cardHead">
            <span className="accentBar" />
            <h2 className="cardTitle">Round breakdown</h2>
          </div>
          <div className="roundList">
            {ROUNDS.map((round) => {
              const s = roundStats(round.index);
              const open = expandedRound === round.index;
              const winner = roundWinner.get(round.index);
              const myRow = RESULTS.find((r) => r.playerId === VIEWER_ID && r.roundIndex === round.index)!;
              const myAcc = Math.round((myRow.locationScore + myRow.timeScore) / 2);
              return (
                <div key={round.index} className={`roundItem ${open ? "roundItemOpen" : ""}`}>
                  <button className="roundTop" onClick={() => setExpandedRound(open ? null : round.index)}>
                    <span className="roundNum">R{round.index + 1}</span>
                    <div className="roundInfo">
                      <span className="roundTitle">{round.title}</span>
                      <span className="roundMeta">{round.year} · {round.location}</span>
                    </div>
                    <span className="roundMyAcc" style={{ color: accColor(myAcc) }}>{myAcc}%</span>
                    <span className="chev" style={{ transform: open ? "rotate(90deg)" : "none" }}>›</span>
                  </button>
                  {open && (
                    <div className="roundDetail">
                      <div className="miniGrid">
                        <div className="miniTile">
                          <span className="miniVal" style={{ color: accColor(s.avgAccuracy) }}>{s.avgAccuracy}%</span>
                          <span className="miniLabel">Group avg</span>
                          <span className="miniSub">{s.totalScore.toLocaleString()} pts</span>
                        </div>
                        <div className="miniTile">
                          <span className="miniVal" style={{ color: accColor(s.avgLocation) }}>{s.avgLocation}%</span>
                          <span className="miniLabel" style={{ color: "#22d3ee" }}>Where</span>
                          <span className="miniSub">avg {s.avgDistanceKm} km</span>
                        </div>
                        <div className="miniTile">
                          <span className="miniVal" style={{ color: accColor(s.avgTime) }}>{s.avgTime}%</span>
                          <span className="miniLabel" style={{ color: "#8b5cf6" }}>When</span>
                          <span className="miniSub">avg {s.avgYearDiff} yrs</span>
                        </div>
                      </div>
                      <div className="bestRow">
                        <span className="bestLabel">🏆 Best player</span>
                        <span className={`bestName ${winner === VIEWER_ID ? "bestNameMe" : ""}`}>
                          {nameOf(winner ?? "")}{winner === VIEWER_ID ? " (you)" : ""}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="dockSpacer" />
      </div>

      {/* ── Bottom CTA ── */}
      <div className="cta">
        <button className="homeBtn">Home</button>
        <button className="playBtn">Play Again</button>
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
          padding: 56px 16px calc(92px + env(safe-area-inset-bottom));
          display: flex; flex-direction: column; gap: 14px;
          max-width: 560px; margin: 0 auto; box-sizing: border-box;
        }

        /* ── Banner ── */
        .banner { text-align: center; padding: 14px 8px 4px; }
        .bannerKicker {
          font-size: 11px; font-weight: 800; letter-spacing: 2.5px; color: #22d3ee;
        }
        .bannerTitle { font-size: 30px; font-weight: 800; margin: 8px 0 0; letter-spacing: -0.5px; }
        .bannerRank {
          background: linear-gradient(135deg, #22d3ee, #8b5cf6);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        }
        .bannerStats { margin-top: 8px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7); display: flex; gap: 10px; justify-content: center; }
        .bannerDot { color: rgba(255,255,255,0.3); }

        /* ── Cards ── */
        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }
        .cardHead { display: flex; align-items: center; gap: 10px; padding: 16px 18px 10px; }
        .accentBar { width: 4px; height: 18px; border-radius: 999px; background: #22d3ee; }
        .cardTitle { font-size: 16px; font-weight: 700; margin: 0; }

        /* ── Hero ── */
        .heroCard { display: flex; align-items: center; gap: 18px; padding: 20px 18px; }
        .ringWrap { position: relative; flex-shrink: 0; width: 150px; height: 150px; }
        .ringCenter { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .ringValue { font-size: 38px; font-weight: 800; line-height: 1; }
        .ringPct { font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.6); }
        .ringLabel { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 4px; }
        .statPair { flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .statTile {
          display: flex; flex-direction: column; gap: 2px; padding: 12px 14px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
        }
        .statTileLabel { font-size: 11px; font-weight: 800; letter-spacing: 1px; }
        .statTileVal { font-size: 22px; font-weight: 800; }
        .statTileSub { font-size: 12px; color: rgba(255,255,255,0.55); }

        /* ── Avatars ── */
        .avatar {
          flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
          font-weight: 700; color: #fff; text-transform: uppercase; border: 2px solid rgba(255,255,255,0.25);
        }

        /* ── Rankings ── */
        .ranks { display: flex; flex-direction: column; padding: 0 12px 12px; gap: 4px; }
        .rankRow { display: flex; align-items: center; gap: 11px; padding: 10px 8px; border-radius: 12px; }
        .rankRowMe { background: rgba(34,211,238,0.08); }
        .medal {
          width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.6);
          background: rgba(255,255,255,0.08);
        }
        .medalGold { background: rgba(255,190,0,0.2); color: #ffcc44; border: 1px solid rgba(255,190,0,0.5); }
        .medalSilver { background: rgba(180,195,215,0.18); color: #cdd6e3; border: 1px solid rgba(180,195,215,0.45); }
        .medalBronze { background: rgba(180,120,60,0.2); color: #cd9a5a; border: 1px solid rgba(180,120,60,0.45); }
        .rankMain { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .rankNameLine { display: flex; align-items: center; gap: 8px; }
        .rankName { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .youTag { font-size: 10px; font-weight: 700; color: #22d3ee; background: rgba(34,211,238,0.15); padding: 1px 7px; border-radius: 999px; }
        .winTag { font-size: 11px; font-weight: 700; color: #ffd54a; }
        .bar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .barFill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #22d3ee, #8b5cf6); transition: width 0.8s cubic-bezier(0.16,1,0.3,1); }
        .rankScore { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .rankAcc { font-size: 16px; font-weight: 800; }
        .rankXp { font-size: 11px; font-weight: 600; color: #ffd54a; }

        /* ── Round breakdown ── */
        .roundList { display: flex; flex-direction: column; padding: 0 12px 12px; gap: 8px; }
        .roundItem { border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden; background: rgba(255,255,255,0.03); }
        .roundItemOpen { border-color: rgba(34,211,238,0.3); }
        .roundTop {
          width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px;
          background: transparent; border: none; cursor: pointer; color: #fff; text-align: left;
        }
        .roundNum {
          flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; color: #22d3ee;
          background: rgba(34,211,238,0.12); border: 1px solid rgba(34,211,238,0.3);
        }
        .roundInfo { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .roundTitle { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .roundMeta { font-size: 12px; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .roundMyAcc { font-size: 16px; font-weight: 800; }
        .chev { font-size: 18px; color: rgba(255,255,255,0.5); transition: transform 0.18s; display: inline-block; }

        .roundDetail { padding: 0 12px 14px; }
        .miniGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .miniTile {
          display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 6px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
        }
        .miniVal { font-size: 18px; font-weight: 800; }
        .miniLabel { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.7); }
        .miniSub { font-size: 10px; color: rgba(255,255,255,0.45); }
        .bestRow {
          display: flex; align-items: center; justify-content: space-between; margin-top: 10px;
          padding: 9px 12px; border-radius: 10px; background: rgba(255,255,255,0.04);
        }
        .bestLabel { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); }
        .bestName { font-size: 13px; font-weight: 700; }
        .bestNameMe { color: #22d3ee; }

        .dockSpacer { height: 2px; }

        /* ── Bottom CTA ── */
        .cta {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 30;
          display: flex; gap: 12px; align-items: center;
          padding: 12px 16px calc(14px + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(10,10,12,0), rgba(10,10,12,0.92) 45%);
        }
        .homeBtn {
          flex: 0 0 auto; padding: 14px 26px; border-radius: 13px; cursor: pointer;
          font-size: 15px; font-weight: 700; color: #fff;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18);
        }
        .playBtn {
          flex: 1; padding: 14px; border-radius: 13px; border: none; cursor: pointer;
          font-size: 16px; font-weight: 800; color: #06181c;
          background: linear-gradient(135deg, #22d3ee, #8b5cf6);
          box-shadow: 0 6px 22px rgba(34,211,238,0.3);
        }
        .playBtn:hover, .homeBtn:hover { opacity: 0.92; }
      `}</style>
    </main>
  );
}
