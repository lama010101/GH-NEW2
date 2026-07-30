"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Home page with user progress indicator
// Route: /prototype/home   (direct access, fully self-contained)
//
// - Visual language follows the prod home page (dark background image + scrim,
//   rounded gradient mode cards, gh-* design tokens) and the profile prototype
//   (glass hero card, SVG accuracy ring, level bar, stat strip, WHERE/WHEN
//   breakdown bars).
// - Adds a prominent PROGRESS HERO above the mode cards: accuracy ring, level
//   badge + level progress bar, 4-stat strip (accuracy/XP/streak/games), and
//   WHERE/WHEN accuracy breakdown bars.
// - The 4 mode cards (compete, daily, levelup, practice) reuse the prod
//   gradients, icons, and vertical-card / desktop-grid layout.
// - All data is MOCK. No Supabase, no auth, no real network.
//
// Does NOT touch or import any existing app files.
// ============================================================================

import { useEffect, useState } from "react";
import styles from "./home.module.css";

// ── Mock profile / progress data ──
const PROFILE = {
  displayName: "Alex Rivera",
  initials: "AR",
  level: 14,
  levelProgress: 0.62, // 62% to next level
  avgAccuracy: 87,
  whereAccuracy: 84,
  whenAccuracy: 90,
  totalXp: 124800,
  gamesPlayed: 138,
  dayStreak: 23,
};

// ── Mode card metadata (mirrors prod home/types.ts) ──
type Mode = "compete" | "daily" | "levelup" | "practice";

const MODE_GRADIENT: Record<Mode, string> = {
  compete:  "linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)",
  daily:    "linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%)",
  levelup:  "linear-gradient(135deg, #2d1060 0%, #5b21b6 50%, #7c3aed 100%)",
  practice: "linear-gradient(135deg, #7c3008 0%, #c05010 50%, #ea6820 100%)",
};

const MODE_TITLE: Record<Mode, string> = {
  compete:  "COMPETE",
  daily:    "DAILY CHALLENGE",
  levelup:  "LEVEL UP",
  practice: "PRACTICE",
};

const MODE_DESC: Record<Mode, string> = {
  compete:  "Play against your friends.\nReal-Time: Up to 5 mins\nTurn-Based: Up to 14 days",
  daily:    "A new challenge every day.\nSame events for everyone\nClimb the leaderboard",
  levelup:  "Progressive runs.\nBeat levels and earn XP.\nUnlock new challenges.",
  practice: "Solo warm-up.\nHone your skills with\nunlimited practice games.",
};

const MODE_ICON: Record<Mode, string> = {
  compete:  "/icons/compete_large.webp",
  daily:    "/icons/daily_large.webp",
  levelup:  "/icons/levels_large.webp",
  practice: "/icons/practice_large.webp",
};

const MODE_ORDER: Mode[] = ["compete", "daily", "levelup", "practice"];

// ── Helpers ──
function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

function formatXp(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toFixed(1)}k`;
  return String(xp);
}

// ── Accuracy ring (SVG, gradient stroke, animated dashoffset) ──
function AccuracyRing({ value }: { value: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className={styles.ringWrap}>
      <svg width="116" height="116" viewBox="0 0 116 116">
        <defs>
          <linearGradient id="homeRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="58" cy="58" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="58"
          cy="58"
          r={r}
          fill="none"
          stroke="url(#homeRingGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 58 58)"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className={styles.ringCenter}>
        <span className={styles.ringValue}>
          {value}
        </span>
        <span className={styles.ringLabel}>overall</span>
      </div>
    </div>
  );
}

// ── Progress hero section ──
function ProgressHero() {
  return (
    <>
      <section className={styles.heroCard}>
        <AccuracyRing value={PROFILE.avgAccuracy} />
        <div className={styles.heroInfo}>
          <div className={styles.heroNameRow}>
            <h1 className={styles.heroName}>{PROFILE.displayName}</h1>
            <span className={styles.heroLevelBadge}>LV {PROFILE.level}</span>
          </div>
          <div className={styles.levelBar}>
            <div
              className={styles.levelBarFill}
              style={{ width: `${PROFILE.levelProgress * 100}%` }}
            />
          </div>
          <span className={styles.levelHint}>
            {Math.round(PROFILE.levelProgress * 100)}% to level {PROFILE.level + 1}
          </span>
          <div className={styles.accBreakdown}>
            <div className={styles.accTile}>
              <span className={styles.accTileLabel} style={{ color: "#22d3ee" }}>WHERE</span>
              <div className={styles.accBar}>
                <div
                  className={styles.accBarFill}
                  style={{ width: `${PROFILE.whereAccuracy}%`, background: "#22d3ee" }}
                />
              </div>
              <span className={styles.accTileVal} style={{ color: accColor(PROFILE.whereAccuracy) }}>
                {PROFILE.whereAccuracy}%
              </span>
            </div>
            <div className={styles.accTile}>
              <span className={styles.accTileLabel} style={{ color: "#8b5cf6" }}>WHEN</span>
              <div className={styles.accBar}>
                <div
                  className={styles.accBarFill}
                  style={{ width: `${PROFILE.whenAccuracy}%`, background: "#8b5cf6" }}
                />
              </div>
              <span className={styles.accTileVal} style={{ color: accColor(PROFILE.whenAccuracy) }}>
                {PROFILE.whenAccuracy}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat strip ── */}
      <div className={styles.statStrip}>
        <div className={styles.statCard}>
          <span className={styles.statVal} style={{ color: accColor(PROFILE.avgAccuracy) }}>
            {PROFILE.avgAccuracy}%
          </span>
          <span className={styles.statLabel}>Accuracy</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statVal} style={{ color: "#ffd54a" }}>
            {formatXp(PROFILE.totalXp)}
          </span>
          <span className={styles.statLabel}>Total XP</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statVal}>{PROFILE.gamesPlayed}</span>
          <span className={styles.statLabel}>Games</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statVal} style={{ color: "#fb923c" }}>
            {PROFILE.dayStreak}
          </span>
          <span className={styles.statLabel}>Day streak</span>
        </div>
      </div>
    </>
  );
}

// ── Daily countdown (mock, updates every minute) ──
function useDailyCountdown(): string {
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      );
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);
  return countdown;
}

// ── Mode card (mirrors prod layout: gradient bg, title, desc, icon, CTA) ──
function ModeCard({ mode }: { mode: Mode }) {
  const countdown = useDailyCountdown();
  const gradient = MODE_GRADIENT[mode];
  const title = MODE_TITLE[mode];
  const desc = MODE_DESC[mode];
  const iconSrc = MODE_ICON[mode];

  return (
    <div className={styles.modeCard}>
      <div className={styles.cardBg} style={{ background: gradient }}>
        <div className={styles.cardInner}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleSection}>
              <h2 className={styles.cardTitle}>{title}</h2>
              <div className={styles.cardDescWrap}>
                <p className={styles.cardDesc}>
                  {desc.split("\n").map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < desc.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          </div>

          {mode === "daily" && (
            <div className={styles.timerBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" />
                <path
                  d="M12 7v5l3 3"
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <span className={styles.timerLabel}>
                New challenge <span className={styles.timerCountdown}>{countdown}</span>
              </span>
            </div>
          )}

          <button className={styles.cardCta} type="button">
            {mode === "compete" && "Create Lobby"}
            {mode === "daily" && "Play Today"}
            {mode === "levelup" && "Start Run"}
            {mode === "practice" && "Start Practice"}
          </button>
        </div>

        <div className={styles.cardIconWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt={title} className={styles.cardIconImg} draggable={false} />
        </div>
      </div>
    </div>
  );
}

export default function HomePrototypePage() {
  return (
    <>
      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #080c14; }
      `}</style>
      <main className={styles.screen}>
        {/* Proto bar */}
        <div className={styles.protoBar}>
          <span className={styles.protoTitle}>Home — Prototype</span>
          <span className={styles.protoHint}>Mock data</span>
        </div>

        {/* Background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home_background.webp" alt="" className={styles.bgImg} draggable={false} />
        <div className={styles.bgScrim} />

        {/* Top bar (inline, simplified) */}
        <div className={styles.topbar}>
          <button className={styles.topbarLogo} type="button">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt="logo" width={120} height={32} className={styles.topbarLogoImg} />
          </button>
          <div className={styles.levelPill}>
            <span className={styles.levelPillBadge}>LV {PROFILE.level}</span>
            <div className={styles.levelPillBar}>
              <div
                className={styles.levelPillBarFill}
                style={{ width: `${PROFILE.levelProgress * 100}%` }}
              />
            </div>
            <span className={styles.levelPillAcc}>
              {PROFILE.avgAccuracy}
              <span className={styles.levelPillAccSuffix}>%</span>
            </span>
          </div>
          <div className={styles.topbarRight}>
            <button className={styles.avatarBtn} type="button">
              <span className={styles.avatarInitials}>{PROFILE.initials}</span>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className={styles.scroll}>
          <div className={styles.content}>
            {/* Tagline */}
            <div className={styles.tagline}>
              Where &amp; When — guess the moment that shaped history.
            </div>

            {/* Progress hero + stat strip */}
            <ProgressHero />

            {/* Mode cards */}
            <div className={styles.cardsStack}>
              {MODE_ORDER.map((mode) => (
                <ModeCard key={mode} mode={mode} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
