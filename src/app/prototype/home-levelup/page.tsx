"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Home page with Level Up mode first
// Route: /prototype/home-levelup   (direct access, self-contained, UI-only)
//
// Alternative to /prototype/home where the LEVEL UP mode card is the first
// thing on screen. It integrates the rank module from
// /prototype/rank-title (same 100-level / 20-rank / 5-titles progression
// model): the rail is centered on the current badge and lets the user slide
// left/right to browse all badges. Compacted so the whole card stays within
// 75% of the mobile screen height.
//
// All other modes (COMPETE, DAILY CHALLENGE, PRACTICE) and features
// (topbar, tagline, progress hero, stat strip) remain identical to the
// home prototype.
//
// All data is MOCK and held in local state. No Supabase, no auth, no
// network. Only this file is created. No other app files are touched.
// ============================================================================

import { Fragment, useEffect, useRef, useState } from "react";

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
  badge: string; // rank.sub, e.g. "41.2"
  name: string; // player-facing title, e.g. "Steam Apprentice"
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

// ── Mock profile / progress data (same as home prototype) ──
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
type Mode = "compete" | "daily" | "practice";

const MODE_GRADIENT: Record<Mode, string> = {
  compete:  "linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)",
  daily:    "linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%)",
  practice: "linear-gradient(135deg, #7c3008 0%, #c05010 50%, #ea6820 100%)",
};

const MODE_TITLE: Record<Mode, string> = {
  compete:  "COMPETE",
  daily:    "DAILY CHALLENGE",
  practice: "PRACTICE",
};

const MODE_DESC: Record<Mode, string> = {
  compete:  "Play against your friends.\nReal-Time: Up to 5 mins\nTurn-Based: Up to 14 days",
  daily:    "A new challenge every day.\nSame events for everyone\nClimb the leaderboard",
  practice: "Solo warm-up.\nHone your skills with\nunlimited practice games.",
};

const MODE_ICON: Record<Mode, string> = {
  compete:  "/icons/compete_large.webp",
  daily:    "/icons/daily_large.webp",
  practice: "/icons/practice_large.webp",
};

const MODE_ORDER: Mode[] = ["compete", "daily", "practice"];

// ── Helpers ──
function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

function formatXp(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toFixed(1)}k`;
  return String(xp);
}

// ── Rank icon with graceful fallback (rank PNGs live outside public/) ──
function RankIcon({ icon, short, alt }: { icon: string; short: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="hlu-badgeIconFallback" role="img" aria-label={alt || short}>
        {short.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon}
      alt={alt}
      className="hlu-badgeIcon"
      draggable={false}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

// ── Accuracy ring (SVG, gradient stroke, animated dashoffset) ──
function AccuracyRing({ value }: { value: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="hlu-ringWrap">
      <svg width="116" height="116" viewBox="0 0 116 116">
        <defs>
          <linearGradient id="hluRingGrad" x1="0" y1="0" x2="1" y2="1">
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
          stroke="url(#hluRingGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 58 58)"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="hlu-ringCenter">
        <span className="hlu-ringValue">{value}</span>
        <span className="hlu-ringLabel">overall</span>
      </div>
    </div>
  );
}

// ── Progress hero section (same as home prototype) ──
function ProgressHero() {
  return (
    <>
      <section className="hlu-heroCard">
        <AccuracyRing value={PROFILE.avgAccuracy} />
        <div className="hlu-heroInfo">
          <div className="hlu-heroNameRow">
            <h1 className="hlu-heroName">{PROFILE.displayName}</h1>
            <span className="hlu-heroLevelBadge">LV {PROFILE.level}</span>
          </div>
          <div className="hlu-levelBar">
            <div className="hlu-levelBarFill" style={{ width: `${PROFILE.levelProgress * 100}%` }} />
          </div>
          <span className="hlu-levelHint">
            {Math.round(PROFILE.levelProgress * 100)}% to level {PROFILE.level + 1}
          </span>
          <div className="hlu-accBreakdown">
            <div className="hlu-accTile">
              <span className="hlu-accTileLabel" style={{ color: "#22d3ee" }}>WHERE</span>
              <div className="hlu-accBar">
                <div className="hlu-accBarFill" style={{ width: `${PROFILE.whereAccuracy}%`, background: "#22d3ee" }} />
              </div>
              <span className="hlu-accTileVal" style={{ color: accColor(PROFILE.whereAccuracy) }}>
                {PROFILE.whereAccuracy}%
              </span>
            </div>
            <div className="hlu-accTile">
              <span className="hlu-accTileLabel" style={{ color: "#8b5cf6" }}>WHEN</span>
              <div className="hlu-accBar">
                <div className="hlu-accBarFill" style={{ width: `${PROFILE.whenAccuracy}%`, background: "#8b5cf6" }} />
              </div>
              <span className="hlu-accTileVal" style={{ color: accColor(PROFILE.whenAccuracy) }}>
                {PROFILE.whenAccuracy}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat strip ── */}
      <div className="hlu-statStrip">
        <div className="hlu-statCard">
          <span className="hlu-statVal" style={{ color: accColor(PROFILE.avgAccuracy) }}>
            {PROFILE.avgAccuracy}%
          </span>
          <span className="hlu-statLabel">Accuracy</span>
        </div>
        <div className="hlu-statCard">
          <span className="hlu-statVal" style={{ color: "#ffd54a" }}>{formatXp(PROFILE.totalXp)}</span>
          <span className="hlu-statLabel">Total XP</span>
        </div>
        <div className="hlu-statCard">
          <span className="hlu-statVal">{PROFILE.gamesPlayed}</span>
          <span className="hlu-statLabel">Games</span>
        </div>
        <div className="hlu-statCard">
          <span className="hlu-statVal" style={{ color: "#fb923c" }}>{PROFILE.dayStreak}</span>
          <span className="hlu-statLabel">Day streak</span>
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
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
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

// ── Level Up card with the integrated rank module ──
function LevelUpCard() {
  const railRef = useRef<HTMLDivElement>(null);
  const curBadgeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Mock player state (matches rank-title prototype: level 42, 300 XP in)
  const level = 42;
  const xpInto = 300;
  const cur = LEVELS[level - 1];
  const next = level < MAX_LEVEL ? LEVELS[level] : null;
  const segSize = next ? next.xp - cur.xp : 0;
  const segEnd = next ? next.xp : cur.xp;
  const effXpInto = next ? Math.min(xpInto, segSize) : 0;
  const totalXp = cur.xp + effXpInto;
  const progress = next && segSize > 0 ? effXpInto / segSize : 1;

  // Auto-center the rail on the current badge (on mount + after images settle).
  useEffect(() => {
    const center = () => {
      const rail = railRef.current;
      const curEl = curBadgeRef.current;
      if (!rail || !curEl) return;
      rail.scrollLeft = curEl.offsetLeft - (rail.clientWidth - curEl.offsetWidth) / 2;
    };
    center();
    const t = setTimeout(center, 150);
    return () => clearTimeout(t);
  }, []);

  // Drag-to-scroll with the mouse (touch pans natively).
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
    <section className="hlu-levelup" data-testid="levelup-card">
      <div className="hlu-levelupHead">
        <div className="hlu-levelupTitleWrap">
          <h2 className="hlu-levelupTitle">LEVEL UP</h2>
          <p className="hlu-levelupDesc">
            Progressive runs. Beat levels and earn XP. Unlock new challenges.
          </p>
        </div>
        <div className="hlu-levelupIconWrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/levels_large.webp" alt="Level Up" className="hlu-levelupIcon" draggable={false} />
        </div>
      </div>

      {/* ── Rank module (from /prototype/rank-title, compacted) ── */}
      <div className="hlu-rank">
        <div className="hlu-rankReadout">
          <div className="hlu-rankNow">
            <span className="hlu-rankLevel">LEVEL {level}</span>
            <span className="hlu-rankName">{cur.name}</span>
          </div>
          <div className="hlu-rankMeta">
            <span className="hlu-rankXp">
              {fmt(totalXp)} / {fmt(segEnd)} XP
            </span>
            <span className="hlu-rankPos">
              Rank {cur.rankIndex + 1} of {RANKS.length}
            </span>
          </div>
        </div>
        <div className="hlu-rankBar">
          <div className="hlu-rankBarFill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        {/* Horizontal rail — centered on the current badge, slide L/R to browse */}
        <div
          ref={railRef}
          className={`hlu-railWrap ${dragging ? "hlu-railDragging" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-testid="levelup-rail"
        >
          <div className="hlu-rail">
            {LEVELS.map((l) => {
              const state = l.level < level ? "past" : l.level === level ? "current" : "future";
              return (
                <Fragment key={l.level}>
                  {l.level % LEVELS_PER_RANK === 1 && (
                    <div className="hlu-divider" title={l.rankName}>
                      <span className="hlu-dividerIconWrap">
                        <RankIcon icon={l.icon} short={l.rankShort} alt="" />
                      </span>
                      <span className="hlu-dividerRank">R{l.rankIndex + 1}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    ref={l.level === level ? curBadgeRef : undefined}
                    className={`hlu-badge ${state}`}
                    data-state={state}
                    data-level={l.level}
                    aria-label={`Level ${l.level} — ${l.name}`}
                    onClick={(e) =>
                      e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
                    }
                  >
                    <span className="hlu-badgeIconWrap">
                      <RankIcon icon={l.icon} short={l.rankShort} alt={l.rankName} />
                      <span className="hlu-roman">{l.badge}</span>
                      {state === "past" && <span className="hlu-check">✓</span>}
                    </span>
                    <span className="hlu-badgeLevel">L{l.level}</span>
                    <span className="hlu-badgeName">{l.name}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
        <span className="hlu-railHint">Swipe / drag the rail to explore levels — yours is centered</span>
      </div>

      {/* ── Play CTA ── */}
      <button type="button" className="hlu-play" data-testid="levelup-play">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        Start Run
      </button>
    </section>
  );
}

// ── Mode card (compete / daily / practice — mirrors home prototype) ──
function ModeCard({ mode }: { mode: Mode }) {
  const countdown = useDailyCountdown();
  const gradient = MODE_GRADIENT[mode];
  const title = MODE_TITLE[mode];
  const desc = MODE_DESC[mode];
  const iconSrc = MODE_ICON[mode];

  return (
    <div className="hlu-modeCard">
      <div className="hlu-cardBg" style={{ background: gradient }}>
        <div className="hlu-cardInner">
          <div className="hlu-cardHeader">
            <div className="hlu-cardTitleSection">
              <h2 className="hlu-cardTitle">{title}</h2>
              <div className="hlu-cardDescWrap">
                <p className="hlu-cardDesc">
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
            <div className="hlu-timerBox">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" />
                <path d="M12 7v5l3 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="hlu-timerLabel">
                New challenge <span className="hlu-timerCountdown">{countdown}</span>
              </span>
            </div>
          )}

          <button className="hlu-cardCta" type="button">
            {mode === "compete" && "Create Lobby"}
            {mode === "daily" && "Play Today"}
            {mode === "practice" && "Start Practice"}
          </button>
        </div>

        <div className="hlu-cardIconWrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt={title} className="hlu-cardIconImg" draggable={false} />
        </div>
      </div>
    </div>
  );
}

export default function HomeLevelUpPrototypePage() {
  useEffect(() => {
    document.title = "Home Level-Up — Guess-History Prototype";
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PROTOTYPE_CSS }} />
      <main className="hlu-screen">
        {/* Proto bar */}
        <div className="hlu-protoBar">
          <span className="hlu-protoTitle">Home — Level Up First</span>
          <span className="hlu-protoHint">Mock data</span>
        </div>

        {/* Background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home_background.webp" alt="" className="hlu-bgImg" draggable={false} />
        <div className="hlu-bgScrim" />

        {/* Top bar (inline, simplified) */}
        <div className="hlu-topbar">
          <button className="hlu-topbarLogo" type="button">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt="logo" width={120} height={32} className="hlu-topbarLogoImg" />
          </button>
          <div className="hlu-levelPill">
            <span className="hlu-levelPillBadge">LV {PROFILE.level}</span>
            <div className="hlu-levelPillBar">
              <div className="hlu-levelPillBarFill" style={{ width: `${PROFILE.levelProgress * 100}%` }} />
            </div>
            <span className="hlu-levelPillAcc">
              {PROFILE.avgAccuracy}
              <span className="hlu-levelPillAccSuffix">%</span>
            </span>
          </div>
          <div className="hlu-topbarRight">
            <button className="hlu-avatarBtn" type="button">
              <span className="hlu-avatarInitials">{PROFILE.initials}</span>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="hlu-scroll">
          <div className="hlu-content">
            {/* Tagline */}
            <div className="hlu-tagline">
              Where &amp; When — guess the moment that shaped history.
            </div>

            {/* Level Up card FIRST (with integrated rank module) */}
            <LevelUpCard />

            {/* Progress hero + stat strip (same as home prototype) */}
            <ProgressHero />

            {/* Remaining mode cards */}
            <div className="hlu-cards">
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

// ============================================================================
// PROTOTYPE CSS — all styles inline in this file (no CSS module touched)
// ============================================================================
const PROTOTYPE_CSS = `
  html, body { margin: 0; padding: 0; background: #080c14; }

  .hlu-screen {
    position: fixed;
    inset: 0;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #fff;
  }

  .hlu-bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  .hlu-bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(8, 12, 20, 0.82); }

  /* ── Proto bar ── */
  .hlu-protoBar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 60;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 14px;
    background: rgba(10, 10, 12, 0.6);
    backdrop-filter: blur(8px);
    flex-wrap: wrap;
  }
  .hlu-protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }
  .hlu-protoHint { font-size: 12px; font-weight: 600; opacity: 0.55; }

  /* ── Scroll container ── */
  .hlu-scroll {
    position: absolute; inset: 0; z-index: 2;
    overflow-y: auto;
    padding: 56px 16px calc(28px + env(safe-area-inset-bottom));
    display: flex; flex-direction: column; align-items: center; gap: 16px;
    box-sizing: border-box;
  }
  .hlu-content {
    width: 100%; max-width: 480px; margin: 0 auto;
    display: flex; flex-direction: column; gap: 16px;
  }

  /* ── Top bar ── */
  .hlu-topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    display: flex; align-items: center; justify-content: space-between;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
    background: var(--gh-bg-base, #0a0e16);
    opacity: 0.92;
  }
  .hlu-topbarLogo { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; }
  .hlu-topbarLogoImg { object-fit: contain; }
  .hlu-levelPill {
    position: absolute; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 8px;
    background: var(--gh-bg-elevated, #121826);
    border: 1px solid var(--gh-border-default, #273043);
    border-radius: 20px; padding: 5px 12px; cursor: default;
  }
  .hlu-levelPillBadge {
    font-size: 10px; font-weight: 800; letter-spacing: 0.4px;
    color: #06181c; background: var(--gh-gold, #fbbf24);
    padding: 2px 7px; border-radius: 999px; white-space: nowrap;
  }
  .hlu-levelPillBar { width: 56px; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
  .hlu-levelPillBarFill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--gh-teal, #2dd4bf), var(--gh-violet, #8b5cf6)); }
  .hlu-levelPillAcc { font-size: 13px; font-weight: 700; color: var(--gh-text-primary, #f1f5f9); }
  .hlu-levelPillAccSuffix { font-size: 11px; color: var(--gh-text-muted, #7d8aa0); margin-left: 1px; }
  .hlu-topbarRight { display: flex; align-items: center; gap: 12px; }
  .hlu-avatarBtn {
    width: 36px; height: 36px; border-radius: 50%; overflow: hidden;
    border: 2px solid var(--gh-border-medium, #3a4560);
    background: linear-gradient(135deg, #22d3ee, #8b5cf6);
    cursor: pointer; padding: 0; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .hlu-avatarInitials { color: var(--gh-text-primary, #f1f5f9); font-size: 12px; font-weight: 700; }

  /* ── Tagline ── */
  .hlu-tagline {
    width: 100%; text-align: center;
    color: var(--gh-text-primary, #f1f5f9);
    font-size: 18px; font-weight: 500; letter-spacing: 0.2px; line-height: 1.4;
    padding: 4px 8px 0;
  }

  /* ============================================================
     LEVEL UP CARD (featured, first) + integrated rank module
     ============================================================ */
  .hlu-levelup {
    position: relative;
    display: flex; flex-direction: column; gap: 12px;
    width: 100%;
    padding: 18px 16px 16px;
    border-radius: 20px;
    background: linear-gradient(160deg, #2d1060 0%, #5b21b6 55%, #7c3aed 100%);
    box-shadow: 0 10px 34px rgba(91, 33, 182, 0.4);
    overflow: hidden;
    box-sizing: border-box;
  }

  /* soft sheen over the violet gradient */
  .hlu-levelup::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(120% 90% at 85% -10%, rgba(255,255,255,0.16), transparent 55%);
    pointer-events: none;
  }
  .hlu-levelup > * { position: relative; }

  .hlu-levelupHead { display: flex; align-items: flex-start; gap: 12px; }
  .hlu-levelupTitleWrap { flex: 1; min-width: 0; }
  .hlu-levelupTitle {
    font-size: 26px; font-weight: 800; letter-spacing: 1px;
    color: var(--gh-text-primary, #fff);
    text-transform: uppercase; margin: 0;
    font-family: 'Bebas Neue', sans-serif; line-height: 1;
    padding-right: 96px;
  }
  .hlu-levelupDesc {
    font-size: 12.5px; color: rgba(255,255,255,0.72); line-height: 1.45;
    margin: 6px 0 0; padding: 0;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .hlu-levelupIconWrap {
    position: absolute; top: 8px; right: 8px;
    width: 92px; height: 92px; pointer-events: none; z-index: 2;
  }
  .hlu-levelupIcon { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.4)); }

  /* ── Rank module: readout ── */
  .hlu-rank {
    display: flex; flex-direction: column; gap: 8px;
    padding: 12px;
    border-radius: 16px;
    background: rgba(8, 12, 20, 0.42);
    border: 1px solid rgba(255,255,255,0.12);
  }
  .hlu-rankReadout {
    display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  }
  .hlu-rankNow { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .hlu-rankLevel {
    font-size: 10px; font-weight: 800; letter-spacing: 1.5px;
    color: var(--gh-orange, #fb923c);
  }
  .hlu-rankName {
    font-size: 17px; font-weight: 800; line-height: 1.1;
    font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.8px; text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .hlu-rankMeta {
    display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
    font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.6);
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }
  .hlu-rankXp { color: var(--gh-orange, #fb923c); font-weight: 700; }

  .hlu-rankBar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
  .hlu-rankBarFill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, var(--gh-teal, #2dd4bf), var(--gh-orange, #fb923c));
    box-shadow: 0 0 10px rgba(251, 146, 60, 0.5);
    transition: width 0.3s ease;
  }

  /* ── Rank module: rail ── */
  .hlu-railWrap {
    position: relative;
    height: 128px;
    padding: 6px 0 4px;
    overflow-x: auto; overflow-y: hidden;
    touch-action: pan-x pan-y;
    cursor: grab;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.25) transparent;
    -webkit-overflow-scrolling: touch;
  }
  .hlu-railWrap::-webkit-scrollbar { height: 6px; }
  .hlu-railWrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 999px; }
  .hlu-railDragging { cursor: grabbing; scroll-snap-type: none; }

  .hlu-rail {
    position: relative;
    display: flex; align-items: center; gap: 8px;
    width: max-content; min-width: 100%; height: 100%;
  }

  /* swipe hint chevrons (rail edges) */
  .hlu-railWrap::before,
  .hlu-railWrap::after {
    content: "";
    position: absolute; top: 50%;
    width: 10px; height: 10px;
    border-style: solid; border-width: 2px 2px 0 0;
    border-color: rgba(255,255,255,0.5);
    z-index: 3; pointer-events: none;
  }
  .hlu-railWrap::before { left: 6px; transform: translateY(-50%) rotate(225deg); }
  .hlu-railWrap::after { right: 6px; transform: translateY(-50%) rotate(45deg); }

  .hlu-badge {
    scroll-snap-align: center;
    flex: none;
    width: 92px; height: 116px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 8px 6px 6px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.12);
    background: linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04));
    color: #fff;
    cursor: pointer;
    transition: opacity 0.18s, transform 0.18s, box-shadow 0.18s, border-color 0.18s;
    box-sizing: border-box;
  }
  .hlu-badge:hover { transform: translateY(-2px); }
  .hlu-badge:active { transform: scale(0.97); }
  .hlu-badge[data-state="past"] { opacity: 0.85; }
  .hlu-badge[data-state="current"] {
    border-color: rgba(251, 146, 60, 0.85);
    box-shadow: 0 0 0 1px rgba(251, 146, 60, 0.4), 0 8px 26px rgba(251, 146, 60, 0.25);
    background: linear-gradient(180deg, rgba(251, 146, 60, 0.18), rgba(251, 146, 60, 0.06));
  }
  .hlu-badge[data-state="future"] { opacity: 0.45; filter: grayscale(0.9); }

  .hlu-badgeIconWrap { position: relative; width: 46px; height: 46px; flex-shrink: 0; }
  .hlu-badgeIcon { width: 100%; height: 100%; object-fit: contain; }
  .hlu-badgeIconFallback {
    width: 100%; height: 100%; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.65), rgba(6, 182, 212, 0.65));
    font-size: 18px; font-weight: 900; color: #fff;
  }
  .hlu-roman {
    position: absolute; bottom: -3px; right: -3px;
    background: rgba(8, 12, 20, 0.92); border: 1px solid rgba(255,255,255,0.25);
    border-radius: 6px; font-size: 9px; font-weight: 800; padding: 0 4px; line-height: 1.5;
  }
  .hlu-check {
    position: absolute; top: -4px; right: -4px;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--gh-teal, #2dd4bf); color: #04222a;
    font-size: 10px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
  }
  .hlu-badgeLevel { font-size: 9px; font-weight: 800; letter-spacing: 0.6px; color: rgba(255,255,255,0.5); }
  .hlu-badge[data-state="current"] .hlu-badgeLevel { color: var(--gh-orange, #fb923c); }
  .hlu-badgeName { font-size: 10.5px; font-weight: 700; line-height: 1.15; text-align: center; }

  .hlu-divider {
    scroll-snap-align: none;
    flex: none;
    width: 34px; height: 62px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    border-radius: 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .hlu-dividerIconWrap { width: 22px; height: 22px; position: relative; }
  .hlu-dividerIconWrap .hlu-badgeIcon { width: 100%; height: 100%; }
  .hlu-dividerIconWrap .hlu-badgeIconFallback {
    border-radius: 7px; font-size: 11px;
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.5), rgba(6, 182, 212, 0.5));
  }
  .hlu-dividerRank { font-size: 8px; font-weight: 800; letter-spacing: 0.5px; color: rgba(255,255,255,0.35); }

  .hlu-railHint {
    font-size: 10.5px; font-weight: 500; text-align: center;
    color: rgba(255,255,255,0.55);
  }

  /* ── Play CTA ── */
  .hlu-play {
    display: flex; align-items: center; justify-content: center; gap: 9px;
    width: 100%;
    padding: 14px 16px;
    border: none; border-radius: 14px;
    background: #fff;
    color: #5b21b6;
    font-size: 17px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase;
    font-family: 'Bebas Neue', sans-serif;
    cursor: pointer;
    box-shadow: 0 6px 22px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.2);
    transition: transform 0.12s ease, box-shadow 0.18s ease;
  }
  .hlu-play:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(124, 58, 237, 0.5), 0 0 0 1px rgba(255,255,255,0.3); }
  .hlu-play:active { transform: scale(0.98); }

  /* ============================================================
     PROGRESS HERO + STAT STRIP (same as home prototype)
     ============================================================ */
  .hlu-heroCard {
    display: flex; align-items: center; gap: 18px;
    padding: 20px 18px;
    background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 18px;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 30px rgba(0,0,0,0.35);
  }
  .hlu-ringWrap { position: relative; flex-shrink: 0; width: 116px; height: 116px; }
  .hlu-ringCenter {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .hlu-ringValue { font-size: 30px; font-weight: 800; line-height: 1; }
  .hlu-ringLabel { font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 3px; }
  .hlu-heroInfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .hlu-heroNameRow { display: flex; align-items: center; gap: 8px; }
  .hlu-heroName {
    font-size: 20px; font-weight: 800; margin: 0; letter-spacing: -0.3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .hlu-heroLevelBadge {
    font-size: 10px; font-weight: 800; letter-spacing: 0.4px;
    color: #06181c; background: var(--gh-gold, #fbbf24);
    padding: 2px 8px; border-radius: 999px; white-space: nowrap; flex-shrink: 0;
  }
  .hlu-levelBar { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
  .hlu-levelBarFill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--gh-teal, #2dd4bf), var(--gh-violet, #8b5cf6)); transition: width 0.8s cubic-bezier(0.16,1,0.3,1); }
  .hlu-levelHint { font-size: 11px; color: rgba(255,255,255,0.45); }
  .hlu-accBreakdown { display: flex; flex-direction: column; gap: 8px; }
  .hlu-accTile { display: grid; grid-template-columns: 52px 1fr 44px; align-items: center; gap: 10px; }
  .hlu-accTileLabel { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; }
  .hlu-accBar { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
  .hlu-accBarFill { height: 100%; border-radius: 999px; transition: width 0.8s cubic-bezier(0.16,1,0.3,1); }
  .hlu-accTileVal { font-size: 14px; font-weight: 800; text-align: right; }

  .hlu-statStrip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; }
  .hlu-statCard {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 14px 6px;
    background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    backdrop-filter: blur(10px);
  }
  .hlu-statVal { font-size: 20px; font-weight: 800; }
  .hlu-statLabel { font-size: 11px; color: rgba(255,255,255,0.5); text-align: center; }

  /* ============================================================
     MODE CARDS (compete / daily / practice — same as home prototype)
     ============================================================ */
  .hlu-cards { display: flex; flex-direction: column; gap: 16px; width: 100%; }
  .hlu-modeCard { width: 100%; position: relative; }
  .hlu-cardBg { width: 100%; border-radius: 16px; position: relative; overflow: hidden; }
  .hlu-cardInner { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .hlu-cardHeader { position: relative; }
  .hlu-cardTitleSection { display: flex; flex-direction: column; gap: 6px; }
  .hlu-cardTitle {
    font-size: 22px; font-weight: 800;
    color: var(--gh-text-primary, #f1f5f9);
    text-transform: uppercase; letter-spacing: 1px; margin: 0;
    font-family: 'Bebas Neue', sans-serif; line-height: 1;
    padding-right: 190px;
  }
  .hlu-cardDesc { font-size: 15px; font-weight: 400; color: var(--gh-text-secondary, #b6c2d4); line-height: 1.5; margin: 6px 0 0 0; padding: 0; }
  .hlu-cardDescWrap { width: 100%; padding-right: 0; margin-top: 8px; }
  .hlu-cardIconWrap {
    position: absolute; top: 4px; right: 4px;
    width: 180px; height: 180px; pointer-events: none; z-index: 2; flex-shrink: 0;
  }
  .hlu-cardIconImg { object-fit: contain; }
  .hlu-cardCta {
    background: var(--gh-text-primary, #f1f5f9);
    color: var(--gh-teal, #0e7490);
    border: none; border-radius: 12px;
    padding: 14px 16px; font-size: 13px; font-weight: 800; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    transition: opacity 0.15s;
    width: 100%;
  }
  .hlu-cardCta:hover { opacity: 0.85; }
  .hlu-cardCta:active { opacity: 0.7; }
  .hlu-timerBox { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 7px 12px; }
  .hlu-timerLabel { font-size: 13px; color: var(--gh-text-primary, #f1f5f9); font-weight: 600; }
  .hlu-timerCountdown { color: var(--gh-orange, #fb923c); }

  /* ============================================================
     Responsive
     ============================================================ */
  /* Mobile: the Level Up card must not exceed 75% of the screen height */
  @media (max-width: 640px) {
    .hlu-levelup { max-height: 75vh; max-height: 75dvh; overflow: hidden; }
  }

  /* Short mobile screens: compact the Level Up card further */
  @media (max-width: 640px) and (max-height: 740px) {
    .hlu-levelup { gap: 8px; padding: 12px 14px; }
    .hlu-levelupDesc { display: none; }
    .hlu-levelupIconWrap { width: 72px; height: 72px; }
    .hlu-levelupTitle { font-size: 22px; padding-right: 76px; }
    .hlu-rank { padding: 10px; gap: 6px; }
    .hlu-rankName { font-size: 15px; }
    .hlu-railWrap { height: 106px; }
    .hlu-badge { width: 82px; height: 96px; padding: 6px 4px 4px; }
    .hlu-badgeIconWrap { width: 40px; height: 40px; }
    .hlu-divider { height: 52px; }
    .hlu-play { padding: 12px 14px; border-radius: 12px; }
    .hlu-railHint { display: none; }
  }

  @media (min-width: 768px) {
    .hlu-scroll { align-items: center; }
    .hlu-content { max-width: 960px; }
    .hlu-levelup { max-width: 960px; }
    .hlu-heroCard { max-width: 960px; width: 100%; }
    .hlu-statStrip { max-width: 960px; }
    .hlu-levelupIconWrap { width: 120px; height: 120px; }
    .hlu-levelupTitle { font-size: 32px; padding-right: 130px; }
    .hlu-railWrap { height: 140px; }
    .hlu-badge { width: 100px; height: 126px; }
    .hlu-badgeIconWrap { width: 52px; height: 52px; }
    .hlu-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: start; }
    .hlu-cardIconWrap { width: 140px; height: 140px; top: 4px; right: 4px; }
    .hlu-cardTitle { padding-right: 150px; }
  }

  @media (max-width: 380px) {
    .hlu-cardIconWrap { width: 120px; height: 120px; }
    .hlu-cardTitle { padding-right: 130px; }
    .hlu-heroCard { flex-direction: column; text-align: center; }
    .hlu-heroNameRow { justify-content: center; }
    .hlu-accTile { grid-template-columns: 48px 1fr 40px; }
    .hlu-levelupIconWrap { width: 76px; height: 76px; }
    .hlu-levelupTitle { padding-right: 80px; }
  }
`;
