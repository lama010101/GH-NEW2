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

import { useState, useEffect } from "react";
import styles from "./round-results.module.css";

type Badge = { dimension: "year" | "location" | "combo"; tier: "gold" | "silver" | "bronze" } | null;

type CategoryBadges = { tier: "gold" | "silver" | "bronze"; count: number } | null;

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
  whereBadges?: CategoryBadges;
  whenBadges?: CategoryBadges;
  whereXp?: number;
  whenXp?: number;
};

const CORRECT_YEAR = 1989;
const CORRECT_LOCATION = "Berlin, Germany";
const EVENT_TITLE = "Fall of the Berlin Wall";
const EVENT_DESC =
  "Crowds gather at the Brandenburg Gate as the barrier dividing East and West Berlin is opened, a turning point that hastened German reunification.";
const TOTAL_ROUNDS = 5;
const CURRENT_ROUND = 3; // 0-indexed -> round 4 of 5 display below uses +1

const RESULTS: Result[] = [
  { id: "p1", name: "Alex Rivera", score: 1840, accuracy: 94, locationScore: 96, timeScore: 92, guessYear: 1991, distanceKm: 42, badge: { dimension: "combo", tier: "silver" }, isMe: true, whereBadges: { tier: "gold", count: 2 }, whenBadges: { tier: "gold", count: 1 }, whereXp: 960, whenXp: 880 },
  { id: "p2", name: "Mina Kovač", score: 1980, accuracy: 99, locationScore: 100, timeScore: 98, guessYear: 1989, distanceKm: 6, badge: { dimension: "combo", tier: "gold" }, isMe: false },
  { id: "p3", name: "Theo Lambert", score: 1210, accuracy: 71, locationScore: 64, timeScore: 78, guessYear: 1978, distanceKm: 410, badge: null, isMe: false },
  { id: "p4", name: "Sara Bianchi", score: 1530, accuracy: 83, locationScore: 88, timeScore: 78, guessYear: 1994, distanceKm: 120, badge: null, isMe: false },
];

const ALL_ROUNDS_RESULTS: Result[] = [
  { id: "p1", name: "Alex Rivera", score: 7240, accuracy: 89, locationScore: 91, timeScore: 87, guessYear: 1991, distanceKm: 42, badge: { dimension: "combo", tier: "gold" }, isMe: true, whereBadges: { tier: "gold", count: 3 }, whenBadges: { tier: "gold", count: 2 }, whereXp: 3620, whenXp: 3620 },
  { id: "p2", name: "Mina Kovač", score: 8150, accuracy: 94, locationScore: 96, timeScore: 92, guessYear: 1989, distanceKm: 6, badge: { dimension: "combo", tier: "gold" }, isMe: false },
  { id: "p3", name: "Theo Lambert", score: 5230, accuracy: 68, locationScore: 62, timeScore: 74, guessYear: 1978, distanceKm: 410, badge: null, isMe: false },
  { id: "p4", name: "Sara Bianchi", score: 7300, accuracy: 79, locationScore: 84, timeScore: 74, guessYear: 1994, distanceKm: 120, badge: { dimension: "location", tier: "silver" }, isMe: false },
];

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
      className={styles.avatar}
      style={{ background: gradientFor(id), width: size, height: size, fontSize: size * 0.36 }}
    >
      {initialsOf(name)}
    </span>
  );
}

// Animated SVG accuracy ring — mirrors prod RainbowRing visual:
// single hue-based stroke (red→green), dark gray track, % rendered inside.
function AccuracyRing({ value }: { value: number }) {
  const r = 80;
  const cx = 100;
  const cy = 100;
  const strokeWidth = 15;
  const circumference = 2 * Math.PI * r;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (value <= 0) return;
    const steps = Math.round(value);
    if (steps <= 0) return;
    const totalDuration = 900;
    const stepDuration = totalDuration / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setDisplayed(current);
      if (current >= steps) clearInterval(interval);
    }, stepDuration);
    return () => clearInterval(interval);
  }, [value]);

  const clamped = Math.max(0, Math.min(100, displayed));
  const offset = circumference * (1 - clamped / 100);
  const hue = Math.round((clamped / 100) * 120);
  const color = `hsl(${hue}, 100%, 50%)`;

  return (
    <div className={styles.ringWrap}>
      <svg viewBox="0 0 200 200" style={{ width: 150, height: 150, display: "block" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3f3f46" strokeWidth={strokeWidth} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={52} fontWeight="bold">
          {clamped}
        </text>
      </svg>
    </div>
  );
}

// Small % ring for Where/When mini cards — colored stroke + value text.
function MiniRing({ value, color }: { value: number; color: string }) {
  const size = 56;
  const sw = 5;
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className={styles.miniRingWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.miniRingVal} style={{ color }}>{Math.round(value)}</span>
    </div>
  );
}

// Badge with zoom + sound + haptic reveal animation.
// Mirrors prod InlineImageBadge: starts hidden, zooms in with glow, plays sound.
function BadgeWithEffect({
  dimension,
  tier,
  revealed,
  delay = 0,
  className,
}: {
  dimension: "combo" | "location" | "year";
  tier: "gold" | "silver" | "bronze";
  revealed: boolean;
  delay?: number;
  className?: string;
}) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => {
      setAnimated(true);
      // Play badge sound
      const isCombo = dimension === "combo";
      const soundPath = isCombo
        ? tier === "gold" ? "/sounds/badges/perfect-combo.mp3"
          : tier === "silver" ? "/sounds/badges/amazing-combo.mp3"
          : "/sounds/badges/great-combo.mp3"
        : tier === "gold" ? "/sounds/badges/perfect.mp3"
          : tier === "silver" ? "/sounds/badges/amazing.mp3"
          : "/sounds/badges/great.mp3";
      const audio = new Audio(soundPath);
      audio.volume = 1.0;
      audio.play().catch(() => { /* autoplay block — silent fail */ });
      // Haptic feedback
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([50, 50, 100]);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [revealed, delay, dimension, tier]);

  const prefix = dimension;
  const imagePath = `/badges/${prefix}_${tier}.webp`;
  const cls = !animated
    ? `${styles.badgeHidden} ${className ?? ""}`
    : `${styles.badgeAnimated} ${className ?? ""}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imagePath} alt={`${tier} ${dimension} badge`} className={cls} />
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
    <div className={styles.timeline}>
      <div className={styles.timelineBar} />
      {ticks.map((y) => (
        <div key={y} className={styles.tick} style={{ left: `${pct(y)}%` }}>
          {y % 20 === 0 && <span className={styles.tickLabel}>{y}</span>}
        </div>
      ))}
      <div className={styles.correctMarker} style={{ left: `${pct(CORRECT_YEAR)}%` }}>
        <span className={styles.correctFlag}>Correct</span>
        <span className={styles.correctYearTl}>{CORRECT_YEAR}</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className={styles.tlPlayer}
          style={{ left: `${Math.max(4, Math.min(96, pct(r.guessYear)))}%`, transform: `translate(-50%, ${-(i % 2) * 26}px)` }}
        >
          <Avatar id={r.id} name={r.name} size={24} />
          <span className={styles.tlYear} style={{ fontWeight: r.isMe ? 700 : 400 }}>{r.guessYear}</span>
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
    <div className={styles.map}>
      <div className={styles.mapGrid} />
      {/* correct location */}
      <div className={`${styles.mapPin} ${styles.mapPinCorrect}`} style={{ left: `${pos.correct.x}%`, top: `${pos.correct.y}%` }}>
        <span className={`${styles.mapPinDot} ${styles.mapPinDotCorrect}`} />
        <span className={`${styles.mapPinLabel} ${styles.mapPinLabelCorrect}`}>{CORRECT_LOCATION}</span>
      </div>
      {rows.map((r) => {
        const p = pos[r.id] ?? { x: 50, y: 50 };
        return (
          <div key={r.id} className={styles.mapPin} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <span className={styles.mapAvatarRing} style={{ borderColor: r.isMe ? "#22d3ee" : "rgba(255,255,255,0.6)" }}>
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
  const [lbTab, setLbTab] = useState<"thisRound" | "allRounds">("thisRound");
  const [lbOpen, setLbOpen] = useState(true);
  const [hintsOpen, setHintsOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [badgesRevealed, setBadgesRevealed] = useState(false);

  // Reveal badges after the ring animation finishes (~1.2s)
  useEffect(() => {
    const timer = setTimeout(() => setBadgesRevealed(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const currentResults = lbTab === "thisRound" ? RESULTS : ALL_ROUNDS_RESULTS;
  const me = currentResults.find((r) => r.isMe)!;
  const ranked = [...currentResults].sort((a, b) => b.score - a.score);
  const myRank = ranked.findIndex((r) => r.isMe) + 1;
  const rankSuffix = (n: number) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

  const whereRows = [...RESULTS].sort((a, b) => b.locationScore - a.locationScore);
  const whenRows = [...RESULTS].sort((a, b) => b.timeScore - a.timeScore);
  const panelRows = tab === "where" ? whereRows : whenRows;
  const accent = tab === "where" ? "#22d3ee" : "#e879f9";

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
    <>
      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }
      `}</style>
      <main className={styles.screen}>
        <div className={styles.protoBar}>
          <span className={styles.protoTitle}>Round Results — Prototype</span>
          <span className={styles.protoHint}>Mock data · you = Alex</span>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home_background.webp" alt="" className={styles.bgImg} draggable={false} />
        <div className={styles.bgScrim} />

        <div className={styles.scroll}>
        {/* ── Event card (prod-style) ── */}
        <section className={`${styles.card} ${styles.eventCard}`}>
          <div className={styles.eventTitle}>{EVENT_TITLE}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home_background.webp" alt={EVENT_TITLE} className={styles.eventImg} />
          <div className={styles.eventMeta}>{CORRECT_YEAR} · {CORRECT_LOCATION}</div>
          <button className={styles.histContextTrigger} onClick={() => setDescOpen(!descOpen)} aria-expanded={descOpen}>
            <span className={styles.histContextIcon}>📖</span>
            <span className={styles.histContextLabel}>Historical Context</span>
            <span className={`${styles.histContextArrow} ${descOpen ? styles.histContextArrowExpanded : ""}`}>›</span>
          </button>
          <div className={`${styles.histInlineBody} ${descOpen ? styles.histInlineBodyExpanded : ""}`}>
            {EVENT_DESC}
          </div>
        </section>

        {/* ── Score hero card ── */}
        <section className={`${styles.card} ${styles.heroCard}`}>
          <div className={styles.heroTop}>
            <AccuracyRing value={me.accuracy} />
            <div className={styles.totalXpRow}>
              <span className={styles.totalXpVal}>{me.score.toLocaleString()} XP</span>
              {me.badge && (
                <BadgeWithEffect
                  dimension="combo"
                  tier={me.badge.tier}
                  revealed={badgesRevealed}
                  delay={0}
                  className={styles.comboBadgeImg}
                />
              )}
            </div>
          </div>

          <div className={styles.miniCardsRow}>
            {/* ── Where mini card ── */}
            <div className={styles.miniCard}>
              <div className={styles.miniCardHead}>
                <span className={styles.miniCardDot} style={{ background: "#22d3ee" }} />
                <span className={styles.miniCardTitle}>Where</span>
              </div>
              <MiniRing value={me.locationScore} color={accColor(me.locationScore)} />
              <div className={styles.miniXp}>
                <span className={styles.miniXpVal}>+{me.whereXp ?? 0}</span>
                <span className={styles.miniXpLabel}>XP</span>
              </div>
              <div className={styles.miniBadges}>
                {me.whereBadges && (
                  <BadgeWithEffect
                    dimension="location"
                    tier={me.whereBadges.tier}
                    revealed={badgesRevealed}
                    delay={300}
                    className={styles.miniBadgeImg}
                  />
                )}
              </div>
            </div>

            {/* ── When mini card ── */}
            <div className={styles.miniCard}>
              <div className={styles.miniCardHead}>
                <span className={styles.miniCardDot} style={{ background: "#e879f9" }} />
                <span className={styles.miniCardTitle}>When</span>
              </div>
              <MiniRing value={me.timeScore} color={accColor(me.timeScore)} />
              <div className={styles.miniXp}>
                <span className={styles.miniXpVal}>+{me.whenXp ?? 0}</span>
                <span className={styles.miniXpLabel}>XP</span>
              </div>
              <div className={styles.miniBadges}>
                {me.whenBadges && (
                  <BadgeWithEffect
                    dimension="year"
                    tier={me.whenBadges.tier}
                    revealed={badgesRevealed}
                    delay={600}
                    className={styles.miniBadgeImg}
                  />
                )}
                {me.whenBadges && me.whenBadges.count > 1 && (
                  <span className={styles.miniBadgeCount}>×{me.whenBadges.count}</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Round leaderboard ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.accentBar} />
            <h2 className={styles.cardTitle}>Leaderboard</h2>
            <span className={styles.cardHeadRank}>#{myRank}{rankSuffix(myRank)}</span>
          </div>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${lbTab === "thisRound" ? styles.tabActive : ""}`}
              style={lbTab === "thisRound" ? { color: "#fb923c", borderColor: "#fb923c" } : undefined}
              onClick={() => setLbTab("thisRound")}
            >
              This Round
            </button>
            <button
              className={`${styles.tab} ${lbTab === "allRounds" ? styles.tabActive : ""}`}
              style={lbTab === "allRounds" ? { color: "#fb923c", borderColor: "#fb923c" } : undefined}
              onClick={() => setLbTab("allRounds")}
            >
              All Rounds
            </button>
          </div>
          <div className={styles.lbList}>
            {ranked.map((r, i) => (
              <div key={r.id} className={`${styles.lbRow} ${r.isMe ? styles.lbRowMe : ""}`}>
                <span className={styles.lbRank}>{i + 1}</span>
                <Avatar id={r.id} name={r.name} size={32} />
                <span className={styles.lbName}>
                  {r.name}
                  {r.isMe && <span className={styles.youTag}>you</span>}
                </span>
                <span className={styles.lbAcc} style={{ color: accColor(r.accuracy) }}>{r.accuracy}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Where / When breakdown (tabbed) ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.accentBar} style={{ background: tab === "where" ? "#22d3ee" : "#e879f9" }} />
            <h2 className={styles.cardTitle}>Breakdown</h2>
          </div>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === "where" ? styles.tabActive : ""}`}
              style={tab === "where" ? { color: "#22d3ee", borderColor: "#22d3ee" } : undefined}
              onClick={() => { setTab("where"); setLbOpen(true); setHintsOpen(false); }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/where.webp" alt="" width={22} height={22} className={styles.tabIcon} />
              Where
            </button>
            <button
              className={`${styles.tab} ${tab === "when" ? styles.tabActive : ""}`}
              style={tab === "when" ? { color: "#e879f9", borderColor: "#e879f9" } : undefined}
              onClick={() => { setTab("when"); setLbOpen(true); setHintsOpen(false); }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/when.webp" alt="" width={28} height={28} className={styles.tabIconWhen} />
              When
            </button>
          </div>

          <div className={styles.breakHead}>
            <div className={styles.breakCorrectCol}>
              <span className={styles.breakCorrectLabel}>Correct answer</span>
              <span className={styles.breakCorrectValue} style={{ color: accent }}>
                {tab === "where" ? CORRECT_LOCATION : CORRECT_YEAR}
              </span>
            </div>
            <span className={styles.breakScore} style={{ color: accColor(tab === "where" ? me.locationScore : me.timeScore) }}>
              {tab === "where" ? me.locationScore : me.timeScore}
            </span>
          </div>
          <span className={styles.breakSub}>
            {tab === "where"
              ? `You were ${me.distanceKm} km away`
              : `You guessed ${me.guessYear} · ${Math.abs(me.guessYear - CORRECT_YEAR)} yrs off`}
          </span>

          {tab === "where" ? <WhereMap rows={whereRows} /> : <WhenTimeline rows={whenRows} />}

          {/* Expandable leaderboard — expanded by default */}
          <div className={styles.expand}>
            <button className={styles.expandHead} onClick={() => setLbOpen((v) => !v)}>
              <span className={styles.chev} style={{ transform: lbOpen ? "rotate(90deg)" : "none" }}>›</span>
              Leaderboard
              <span className={styles.expandRank} style={{ color: accent }}>#{myRank}</span>
            </button>
            {lbOpen && (
              <div className={styles.subLb}>
                {panelRows.map((r, i) => {
                  const val = tab === "where" ? r.locationScore : r.timeScore;
                  const detail = tab === "where" ? `${r.distanceKm} km` : `${Math.abs(r.guessYear - CORRECT_YEAR)} yrs off`;
                  return (
                    <div key={r.id} className={`${styles.subLbRow} ${r.isMe ? styles.lbRowMe : ""}`}>
                      <span className={styles.subLbRank}>{i + 1}</span>
                      <Avatar id={r.id} name={r.name} size={26} />
                      <span className={styles.subLbName}>{r.name}</span>
                      <span className={styles.subLbDetail}>{detail}</span>
                      <span className={styles.subLbAcc} style={{ color: accColor(val) }}>{val}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Expandable hints */}
          <div className={styles.expand}>
            <button className={styles.expandHead} onClick={() => setHintsOpen((v) => !v)}>
              <span className={styles.chev} style={{ transform: hintsOpen ? "rotate(90deg)" : "none" }}>›</span>
              Hints
            </button>
            {hintsOpen && (
              <div className={styles.hintsList}>
                {hints.map((h) => (
                  <div key={h.label} className={styles.hintRow}>
                    <span className={styles.hintLabel}>{h.label}</span>
                    <span className={styles.hintText}>{h.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className={styles.dockSpacer} />
      </div>

      {/* ── Bottom bar (countdown + nav) ── */}
      <div className={styles.bottomBarWrap}>
        {/* Auto-advancing countdown — above nav, always visible */}
        <div className={styles.countdown}>
          <span className={styles.countdownText}>Auto-advancing in <strong>8s</strong></span>
          <span className={styles.readyNames}>
            <span style={{ color: "#4ade80" }}>Mina ✓</span>
            <span style={{ color: "#4ade80" }}>Sara ✓</span>
          </span>
        </div>
        <div className={styles.bottomBar}>
          <button className={styles.iconBtn} aria-label="Home">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
              <polyline points="9 21 9 12 15 12 15 21" />
            </svg>
          </button>
          <div className={styles.progress}>
            <span className={styles.roundLabel}>Round {CURRENT_ROUND + 1}/{TOTAL_ROUNDS}</span>
            <div className={styles.dotsRow}>
              {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
                <span
                  key={i}
                  className={styles.dot}
                  style={{ background: i < CURRENT_ROUND ? "#fb923c" : i === CURRENT_ROUND ? "#fff" : "rgba(255,255,255,0.2)" }}
                />
              ))}
            </div>
          </div>
          <button className={styles.nextBtn}>Next →</button>
        </div>
      </div>
    </main>
    </>
  );
}
