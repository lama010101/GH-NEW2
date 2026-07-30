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
import styles from "./final-results.module.css";

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
    <span className={styles.avatar} style={{ background: gradientFor(id), width: size, height: size, fontSize: size * 0.36 }}>
      {initialsOf(name)}
    </span>
  );
}

function AccuracyRing({ value, label }: { value: number; label: string }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className={styles.ringWrap}>
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
      <div className={styles.ringCenter}>
        <span className={styles.ringValue}>{Math.round(value)}</span>
        <span className={styles.ringLabel}>{label}</span>
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
    <>
      <style jsx global>{`html, body { margin: 0; padding: 0; background: #0a0a0a; }`}</style>
      <main className={styles.screen}>
        <div className={styles.protoBar}>
          <span className={styles.protoTitle}>Final Results — Prototype</span>
          <span className={styles.protoHint}>Mock data · 5 rounds · you = Alex</span>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home_background.webp" alt="" className={styles.bgImg} draggable={false} />
        <div className={styles.bgScrim} />

        <div className={styles.scroll}>
        {/* ── Victory banner ── */}
        <div className={styles.banner}>
          <span className={styles.bannerKicker}>GAME COMPLETE</span>
          <h1 className={styles.bannerTitle}>
            You finished <span className={styles.bannerRank}>{myRank}{rankSuffix(myRank)}</span>
          </h1>
          <div className={styles.bannerStats}>
            <span>{me.totalScore.toLocaleString()} XP</span>
            <span className={styles.bannerDot}>·</span>
            <span>{wonRoundsByMe} round{wonRoundsByMe === 1 ? "" : "s"} won</span>
          </div>
        </div>

        {/* ── Hero accuracy + Where/When ── */}
        <section className={`${styles.card} ${styles.heroCard}`}>
          <AccuracyRing value={me.avgAccuracy} label="overall" />
          <div className={styles.statPair}>
            <div className={styles.statTile}>
              <span className={styles.statTileLabel} style={{ color: "#22d3ee" }}>WHERE</span>
              <span className={styles.statTileVal} style={{ color: accColor(me.avgLocation) }}>{me.avgLocation}%</span>
              <span className={styles.statTileSub}>avg {me.avgDistanceKm} km away</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statTileLabel} style={{ color: "#8b5cf6" }}>WHEN</span>
              <span className={styles.statTileVal} style={{ color: accColor(me.avgTime) }}>{me.avgTime}%</span>
              <span className={styles.statTileSub}>avg {me.avgYearDiff} yrs off</span>
            </div>
          </div>
        </section>

        {/* ── Final rankings ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.accentBar} />
            <h2 className={styles.cardTitle}>Final rankings</h2>
          </div>
          <div className={styles.ranks}>
            {leaderboard.map((p, i) => {
              const wins = [...roundWinner.entries()].filter(([, pid]) => pid === p.id).length;
              return (
                <div key={p.id} className={`${styles.rankRow} ${p.isMe ? styles.rankRowMe : ""}`}>
                  <span className={`${styles.medal} ${i === 0 ? styles.medalGold : i === 1 ? styles.medalSilver : i === 2 ? styles.medalBronze : ""}`}>
                    {i + 1}
                  </span>
                  <Avatar id={p.id} name={p.name} size={38} />
                  <div className={styles.rankMain}>
                    <div className={styles.rankNameLine}>
                      <span className={styles.rankName}>{p.name}</span>
                      {p.isMe && <span className={styles.youTag}>you</span>}
                      {wins > 0 && <span className={styles.winTag}>🏆 {wins}</span>}
                    </div>
                    <div className={styles.bar}>
                      <div className={styles.barFill} style={{ width: `${p.avgAccuracy}%` }} />
                    </div>
                  </div>
                  <div className={styles.rankScore}>
                    <span className={styles.rankAcc} style={{ color: accColor(p.avgAccuracy) }}>{p.avgAccuracy}%</span>
                    <span className={styles.rankXp}>{p.totalScore.toLocaleString()} XP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Round breakdown ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.accentBar} />
            <h2 className={styles.cardTitle}>Round breakdown</h2>
          </div>
          <div className={styles.roundList}>
            {ROUNDS.map((round) => {
              const s = roundStats(round.index);
              const open = expandedRound === round.index;
              const winner = roundWinner.get(round.index);
              const myRow = RESULTS.find((r) => r.playerId === VIEWER_ID && r.roundIndex === round.index)!;
              const myAcc = Math.round((myRow.locationScore + myRow.timeScore) / 2);
              return (
                <div key={round.index} className={`${styles.roundItem} ${open ? styles.roundItemOpen : ""}`}>
                  <button className={styles.roundTop} onClick={() => setExpandedRound(open ? null : round.index)}>
                    <span className={styles.roundNum}>R{round.index + 1}</span>
                    <div className={styles.roundInfo}>
                      <span className={styles.roundTitle}>{round.title}</span>
                      <span className={styles.roundMeta}>{round.year} · {round.location}</span>
                    </div>
                    <span className={styles.roundMyAcc} style={{ color: accColor(myAcc) }}>{myAcc}%</span>
                    <span className={styles.chev} style={{ transform: open ? "rotate(90deg)" : "none" }}>›</span>
                  </button>
                  {open && (
                    <div className={styles.roundDetail}>
                      <div className={styles.miniGrid}>
                        <div className={styles.miniTile}>
                          <span className={styles.miniVal} style={{ color: accColor(s.avgAccuracy) }}>{s.avgAccuracy}%</span>
                          <span className={styles.miniLabel}>Group avg</span>
                          <span className={styles.miniSub}>{s.totalScore.toLocaleString()} pts</span>
                        </div>
                        <div className={styles.miniTile}>
                          <span className={styles.miniVal} style={{ color: accColor(s.avgLocation) }}>{s.avgLocation}%</span>
                          <span className={styles.miniLabel} style={{ color: "#22d3ee" }}>Where</span>
                          <span className={styles.miniSub}>avg {s.avgDistanceKm} km</span>
                        </div>
                        <div className={styles.miniTile}>
                          <span className={styles.miniVal} style={{ color: accColor(s.avgTime) }}>{s.avgTime}%</span>
                          <span className={styles.miniLabel} style={{ color: "#8b5cf6" }}>When</span>
                          <span className={styles.miniSub}>avg {s.avgYearDiff} yrs</span>
                        </div>
                      </div>
                      <div className={styles.bestRow}>
                        <span className={styles.bestLabel}>🏆 Best player</span>
                        <span className={`${styles.bestName} ${winner === VIEWER_ID ? styles.bestNameMe : ""}`}>
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

        <div className={styles.dockSpacer} />
      </div>

      {/* ── Bottom CTA ── */}
      <div className={styles.cta}>
        <button className={styles.homeBtn}>Home</button>
        <button className={styles.playBtn}>Play Again</button>
      </div>
    </main>
    </>
  );
}
