"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Rank Module (horizontal level rail)
// Route: /prototype/rank-title   (direct access, self-contained, UI-only)
//
// Shows the player's level progression as a horizontally scrolling rail:
//   - Current level name + icon (player-facing hierarchy: LEVEL 42 / Steam Adept)
//   - XP progress towards the next level (name + icon)
//   - Sliding the rail reveals future levels, greyed out, each with its XP
//
// Progression model (CTO spec):
//   100 levels -> 20 technology ranks -> 5 titles per rank (I-V)
//   Ranks advance chronologically modern -> ancient.
//   Cumulative XP to reach level L = round(100 * L^1.5 / 100) * 100.
//
// All data is MOCK and held in local state (mock level/XP sliders). No
// Supabase, no WebSocket, no network. Only this file + its CSS module exist.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import styles from "./rank-rail.module.css";

// ── 20 technology ranks (modern -> ancient); icons from the ranks sheet ──
type Rank = { name: string; prefix: string; short: string; icon: string };

const RANKS: Rank[] = [
  { name: "Artificial Intelligence", prefix: "AI", short: "AI", icon: "/icons/ranks/rank-01.png" },
  { name: "Smartphone", prefix: "Smartphone", short: "Smartphone", icon: "/icons/ranks/rank-02.png" },
  { name: "World Wide Web", prefix: "Web", short: "Web", icon: "/icons/ranks/rank-03.png" },
  { name: "Personal Computer", prefix: "Computer", short: "Computer", icon: "/icons/ranks/rank-04.png" },
  { name: "Integrated Circuit", prefix: "Circuit", short: "Circuit", icon: "/icons/ranks/rank-05.png" },
  { name: "Transistor", prefix: "Transistor", short: "Transistor", icon: "/icons/ranks/rank-06.png" },
  { name: "Telephone", prefix: "Telephone", short: "Telephone", icon: "/icons/ranks/rank-07.png" },
  { name: "Telegraph", prefix: "Telegraph", short: "Telegraph", icon: "/icons/ranks/rank-08.png" },
  { name: "Steam Engine", prefix: "Steam", short: "Steam", icon: "/icons/ranks/rank-09.png" },
  { name: "Printing Press", prefix: "Printing", short: "Printing", icon: "/icons/ranks/rank-10.png" },
  { name: "Mechanical Clock", prefix: "Clock", short: "Clock", icon: "/icons/ranks/rank-11.png" },
  { name: "Magnetic Compass", prefix: "Compass", short: "Compass", icon: "/icons/ranks/rank-12.png" },
  { name: "Gunpowder", prefix: "Gunpowder", short: "Gunpowder", icon: "/icons/ranks/rank-13.png" },
  { name: "Paper", prefix: "Paper", short: "Paper", icon: "/icons/ranks/rank-14.png" },
  { name: "Waterwheel", prefix: "Waterwheel", short: "Waterwheel", icon: "/icons/ranks/rank-15.png" },
  { name: "Plow", prefix: "Plow", short: "Plow", icon: "/icons/ranks/rank-16.png" },
  { name: "Sailboat", prefix: "Sailboat", short: "Sailboat", icon: "/icons/ranks/rank-17.png" },
  { name: "Wheel", prefix: "Wheel", short: "Wheel", icon: "/icons/ranks/rank-18.png" },
  { name: "Bronze", prefix: "Bronze", short: "Bronze", icon: "/icons/ranks/rank-19.png" },
  { name: "Writing", prefix: "Writing", short: "Writing", icon: "/icons/ranks/rank-20.png" },
];

const SUB_TITLES = ["Initiate", "Apprentice", "Adept", "Expert", "Pioneer"] as const;
const LEVELS_PER_RANK = 5;
const MAX_LEVEL = LEVELS_PER_RANK * RANKS.length; // 100

// Cumulative XP required to reach `level` (rounded to the closest 100).
function xpForLevel(level: number): number {
  return Math.round((100 * Math.pow(level, 1.5)) / 100) * 100;
}

type LevelEntry = {
  level: number;
  rankIndex: number; // 0-19
  rankName: string;
  rankShort: string;
  icon: string;
  badge: string; // rank.sub, e.g. "36.1"
  name: string; // player-facing title, e.g. "Steam Adept"
  xp: number; // cumulative XP required to reach this level
};

const LEVELS: LevelEntry[] = Array.from({ length: MAX_LEVEL }, (_, i) => {
  const rankIndex = Math.floor(i / LEVELS_PER_RANK);
  const sub = i % LEVELS_PER_RANK;
  const rank = RANKS[rankIndex];
  const firstLevel = rankIndex * LEVELS_PER_RANK + 1;
  return {
    level: i + 1,
    rankIndex,
    rankName: rank.name,
    rankShort: rank.short,
    icon: rank.icon,
    badge: `${firstLevel}.${sub + 1}`,
    name: `${rank.prefix} ${SUB_TITLES[sub]}`,
    xp: xpForLevel(i + 1),
  };
});

const fmt = (n: number) => n.toLocaleString("en-US");

export default function RankModulePage() {
  // ── Mock player state ──
  const [level, setLevel] = useState(42);
  const [xpInto, setXpInto] = useState(300); // XP earned inside the current level segment

  const cur = LEVELS[level - 1];
  const next = level < MAX_LEVEL ? LEVELS[level] : null;
  const segSize = next ? next.xp - cur.xp : 0;
  const segEnd = next ? next.xp : cur.xp;
  const effXpInto = next ? Math.min(xpInto, segSize) : 0;
  const totalXp = cur.xp + effXpInto;
  const progress = next && segSize > 0 ? effXpInto / segSize : 1;

  // Auto-position the rail on the current level (on load + when mock level changes).
  // Desktop: center the current tile so past/current/next are visible.
  // Mobile: align the current tile to the left so the previous tile is off-screen.
  const currentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    const cur = currentRef.current;
    if (!rail || !cur) return;
    if (typeof window !== "undefined" && window.innerWidth <= 640) {
      const pad = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
      rail.scrollLeft = cur.offsetLeft - pad;
    } else {
      cur.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [level]);

  useEffect(() => {
    document.title = "Rank Module — Guess-History Prototype";
  }, []);

  // Drag-to-scroll with the mouse (touch pans natively).
  const railRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !railRef.current) return;
    drag.current = { startX: e.clientX, startScroll: railRef.current.scrollLeft };
    railRef.current.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = railRef.current;
    const d = drag.current;
    if (!el || !d) return;
    el.scrollLeft = d.startScroll - (e.clientX - d.startX);
  };
  const endDrag = () => setDragging(false);

  return (
    <>
      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #080c14; }
      `}</style>
      <main className={styles.screen}>
        {/* Proto bar */}
        <div className={styles.protoBar}>
          <span className={styles.protoTitle}>Rank Module</span>
          <div className={styles.protoLinks}>
            <a href="/prototype/rank-card-concepts" className={styles.protoLink}>Rank Cards</a>
            <a href="/prototype/rank-badge-concepts" className={styles.protoLink}>Rank Badges</a>
            <a href="/prototype/rank-images" className={styles.protoLink}>Rank Images</a>
          </div>
        </div>

        {/* Header */}
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>Rank Module</h1>
          <p className={styles.headerSub}>
            100 levels → 20 technology ranks → 5 titles per rank (I–V) · modern → ancient
          </p>
        </header>

        {/* Current level hero */}
        <section className={styles.hero}>
          <div className={styles.heroIconWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cur.icon} alt={cur.rankName} className={styles.heroIcon} draggable={false} />
            <span className={styles.romanBadge}>{cur.badge}</span>
          </div>
          <div className={styles.heroBody}>
            <span className={styles.heroLevel}>LEVEL {level}</span>
            <h1 className={styles.heroName}>{cur.name}</h1>
            <span className={styles.heroRank}>{cur.rankName} · Rank {cur.rankIndex + 1} of {RANKS.length}</span>
          </div>
          {next ? (
            <div className={styles.heroNext}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={next.icon} alt="" className={styles.heroNextIcon} draggable={false} />
              <div className={styles.heroNextText}>
                <span className={styles.heroNextLabel}>NEXT · LEVEL {next.level}</span>
                <span className={styles.heroNextName}>{next.name}</span>
              </div>
            </div>
          ) : (
            <div className={styles.heroNext}>
              <div className={styles.heroNextText}>
                <span className={styles.heroNextLabel}>MAX LEVEL</span>
                <span className={styles.heroNextName}>100 / 100</span>
              </div>
            </div>
          )}
        </section>

        {/* Mock controls */}
        <section className={styles.controls}>
          <span className={styles.mockTag}>MOCK</span>
          <label className={styles.control}>
            <span className={styles.controlLabel}>Level</span>
            <input
              type="range"
              min={1}
              max={MAX_LEVEL}
              value={level}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLevel(v);
                setXpInto(0);
              }}
            />
            <span className={styles.controlVal}>{level}</span>
          </label>
          <label className={styles.control}>
            <span className={styles.controlLabel}>XP into level</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, segSize)}
              value={effXpInto}
              disabled={!next}
              onChange={(e) => setXpInto(Number(e.target.value))}
            />
            <span className={styles.controlVal}>{fmt(effXpInto)} / {fmt(segSize)}</span>
          </label>
        </section>

        {/* Horizontal scrolling level rail */}
        <div className={styles.railWrap}>
          <div
            ref={railRef}
            className={`${styles.rail} ${dragging ? styles.railDragging : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {LEVELS.map((l) => {
              const state = l.level < level ? "past" : l.level === level ? "current" : "future";
              return (
                <React.Fragment key={l.level}>
                  {l.level % LEVELS_PER_RANK === 1 && (
                    <div className={styles.rankDivider} title={l.rankName}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.icon} alt="" className={styles.dividerIcon} draggable={false} />
                      <span className={styles.dividerName}>{l.rankShort}</span>
                      <span className={styles.dividerRank}>RANK {l.rankIndex + 1}</span>
                    </div>
                  )}
                  <div
                    ref={l.level === level ? currentRef : undefined}
                    className={styles.card}
                    data-state={state}
                  >
                    <div className={styles.cardIconWrap}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.icon} alt={l.rankName} className={styles.cardIcon} draggable={false} />
                      <span className={styles.romanBadge}>{l.badge}</span>
                      {state === "past" && <span className={styles.checkBadge}>✓</span>}
                    </div>
                    <span className={styles.cardLevel}>LEVEL {l.level}</span>
                    <span className={styles.cardName}>{l.name}</span>
                    {state === "current" && (
                      <span className={styles.cardRank}>
                        {l.rankName} · Rank {l.rankIndex + 1} of {RANKS.length}
                      </span>
                    )}
                    <span className={styles.cardXp}>
                      {state === "current" && next ? (
                        <>
                          <span className={styles.cardXpCurrent}>{fmt(totalXp)}</span>
                          <span className={styles.cardXpTarget}> / {fmt(segEnd)} XP</span>
                        </>
                      ) : (
                        `${fmt(l.xp)} XP`
                      )}
                    </span>
                    <div className={styles.cardSegBar}>
                      <div
                        className={styles.cardSegFill}
                        style={{ width: state === "past" ? "100%" : state === "current" ? `${Math.round(progress * 100)}%` : "0%" }}
                      />
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Level progress bar — under the rail */}
        <section className={styles.progressModule}>
          <div className={styles.progressRow}>
            <span className={styles.progressLeft}>
              {next ? (
                <>
                  <span className={styles.progressCurrent}>{fmt(totalXp)}</span>
                  <span className={styles.progressTarget}> / {fmt(segEnd)} XP</span>
                </>
              ) : (
                fmt(totalXp)
              )}
            </span>
            <span className={styles.progressRight}>{next ? next.name : "MAX LEVEL"}</span>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </section>

        <p className={styles.footNote}>
          XP to reach level L = round(100 × L<sup>1.5</sup> / 100) × 100 (cumulative) · drag or scroll the rail ·
          mock controls above move the player marker
        </p>
      </main>
    </>
  );
}
