"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Home layout #3: Level Up hero first
// Route: /prototype/home-levelup-v2   (direct access, self-contained, UI-only)
//
// Third home layout (after /prototype/home and /prototype/home-levelup).
// The LEVEL UP mode is the first thing on screen as a dark-glass hero card
// that integrates the rank module from /prototype/rank-title (same
// 100-level / 20-rank / 5-titles progression model):
//   - the rail is centered on the current badge (rendered as a wide hero
//     tile with level, title, XP and progress bar)
//   - sliding left/right reveals past/future badges
//   - a prominent orange PLAY CTA closes the card
// The card is capped at 75% of the mobile screen height.
//
// The rest of the page is restructured: compact stat strip, then the other
// modes (COMPETE, DAILY CHALLENGE, PRACTICE) in a swipeable horizontal row
// on mobile / 3-column grid on desktop.
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
  levelProgress: 0.62,
  avgAccuracy: 87,
  totalXp: 124800,
  gamesPlayed: 138,
  dayStreak: 23,
};

// ── Mode card metadata for the remaining modes (mirrors prod home) ──
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
      <span className="hlp-rankFallback" role="img" aria-label={alt || short}>
        {short.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon}
      alt={alt}
      className="hlp-badgeIcon"
      draggable={false}
      onError={() => setFailed(true)}
      loading="lazy"
    />
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

// ── Level Up hero card with the integrated rank module ──
function LevelUpHero() {
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
    <section className="hlp-hero" data-testid="levelup-card">
      <div className="hlp-heroHead">
        <div className="hlp-heroIconWrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/levels_large.webp" alt="Level Up" className="hlp-heroIcon" draggable={false} />
        </div>
        <div className="hlp-heroTitles">
          <h2 className="hlp-heroTitle">LEVEL UP</h2>
          <p className="hlp-heroSub">Progressive runs · beat levels · earn XP</p>
        </div>
        <span className="hlp-heroLvPill">LV {level}</span>
      </div>

      {/* ── Rank module (from /prototype/rank-title, compacted) ──
          Rail centered on the current badge; slide L/R to browse. */}
      <div
        ref={railRef}
        className={`hlp-railWrap ${dragging ? "hlp-railDragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-testid="levelup-rail"
      >
        <div className="hlp-rail">
          {LEVELS.map((l) => {
            const state = l.level < level ? "past" : l.level === level ? "current" : "future";
            const isCurrent = l.level === level;
            return (
              <Fragment key={l.level}>
                {l.level % LEVELS_PER_RANK === 1 && (
                  <div className="hlp-divider" title={l.rankName}>
                    <span className="hlp-dividerIconWrap">
                      <RankIcon icon={l.icon} short={l.rankShort} alt="" />
                    </span>
                    <span className="hlp-dividerRank">R{l.rankIndex + 1}</span>
                  </div>
                )}
                {isCurrent ? (
                  <button
                    type="button"
                    ref={curBadgeRef}
                    className="hlp-badge hlp-badgeCurrent"
                    data-state="current"
                    data-level={l.level}
                    aria-label={`Level ${l.level} — ${l.name}`}
                    onClick={(e) =>
                      e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
                    }
                  >
                    <span className="hlp-curIconWrap">
                      <RankIcon icon={l.icon} short={l.rankShort} alt={l.rankName} />
                      <span className="hlp-roman">{l.badge}</span>
                    </span>
                    <span className="hlp-curBody">
                      <span className="hlp-curLevel">LEVEL {l.level}</span>
                      <span className="hlp-curName">{l.name}</span>
                      <span className="hlp-curXp">
                        {fmt(totalXp)} / {fmt(segEnd)} XP
                      </span>
                      <span className="hlp-curBar">
                        <span className="hlp-curBarFill" style={{ width: `${Math.round(progress * 100)}%` }} />
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="hlp-badge"
                    data-state={state}
                    data-level={l.level}
                    aria-label={`Level ${l.level} — ${l.name}`}
                    onClick={(e) =>
                      e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
                    }
                  >
                    <span className="hlp-badgeIconWrap">
                      <RankIcon icon={l.icon} short={l.rankShort} alt={l.rankName} />
                      <span className="hlp-roman">{l.badge}</span>
                      {state === "past" && <span className="hlp-check">✓</span>}
                    </span>
                    <span className="hlp-badgeLevel">L{l.level}</span>
                    <span className="hlp-badgeName">{l.name}</span>
                  </button>
                )}
              </Fragment>
              );
            })}
          </div>
        </div>

        <div className="hlp-heroFoot">
          <span className="hlp-heroHint">◂ slide the rail to explore all 100 levels ▸</span>
          <span className="hlp-heroRank">
            {cur.rankName} · Rank {cur.rankIndex + 1} of {RANKS.length}
          </span>
        </div>

      {/* ── Play CTA ── */}
      <button type="button" className="hlp-play" data-testid="levelup-play">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        Start Run
      </button>
    </section>
  );
}

// ── Mode card for the remaining modes (compete / daily / practice) ──
function ModeCard({ mode }: { mode: Mode }) {
  const countdown = useDailyCountdown();
  const gradient = MODE_GRADIENT[mode];
  const title = MODE_TITLE[mode];
  const desc = MODE_DESC[mode];
  const iconSrc = MODE_ICON[mode];

  return (
    <div className="hlp-modeCard">
      <div className="hlp-cardBg" style={{ background: gradient }}>
        <div className="hlp-cardInner">
          <h2 className="hlp-cardTitle">{title}</h2>
          <p className="hlp-cardDesc">
            {desc.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i < desc.split("\n").length - 1 && <br />}
              </span>
            ))}
          </p>

          {mode === "daily" && (
            <div className="hlp-timerBox">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" />
                <path d="M12 7v5l3 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="hlp-timerLabel">
                Resets in <span className="hlp-timerCountdown">{countdown}</span>
              </span>
            </div>
          )}

          <button className="hlp-cardCta" type="button">
            {mode === "compete" && "Create Lobby"}
            {mode === "daily" && "Play Today"}
            {mode === "practice" && "Start Practice"}
          </button>
        </div>

        <div className="hlp-cardIconWrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt={title} className="hlp-cardIconImg" draggable={false} />
        </div>
      </div>
    </div>
  );
}

export default function HomeLevelUpAltPrototypePage() {
  useEffect(() => {
    document.title = "Home Level-Up Alt — Guess-History Prototype";
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PROTOTYPE_CSS }} />
      <main className="hlp-screen">
        {/* Proto bar */}
        <div className="hlp-protoBar">
          <span className="hlp-protoTitle">Home — Level Up First (alt layout)</span>
          <span className="hlp-protoHint">Mock data</span>
        </div>

        {/* Background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home_background.webp" alt="" className="hlp-bgImg" draggable={false} />
        <div className="hlp-bgScrim" />

        {/* Top bar (inline, simplified) */}
        <div className="hlp-topbar">
          <button className="hlp-topbarLogo" type="button">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt="logo" width={120} height={32} className="hlp-topbarLogoImg" />
          </button>
          <div className="hlp-levelPill">
            <span className="hlp-levelPillBadge">LV {PROFILE.level}</span>
            <div className="hlp-levelPillBar">
              <div className="hlp-levelPillBarFill" style={{ width: `${PROFILE.levelProgress * 100}%` }} />
            </div>
            <span className="hlp-levelPillAcc">
              {PROFILE.avgAccuracy}
              <span className="hlp-levelPillAccSuffix">%</span>
            </span>
          </div>
          <div className="hlp-topbarRight">
            <button className="hlp-avatarBtn" type="button">
              <span className="hlp-avatarInitials">{PROFILE.initials}</span>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="hlp-scroll">
          <div className="hlp-content">
            {/* Tagline */}
            <div className="hlp-tagline">
              Where &amp; When — guess the moment that shaped history.
            </div>

            {/* Level Up hero FIRST (with integrated rank module) */}
            <LevelUpHero />

            {/* Compact stat strip */}
            <div className="hlp-statStrip">
              <div className="hlp-statCard">
                <span className="hlp-statVal" style={{ color: accColor(PROFILE.avgAccuracy) }}>
                  {PROFILE.avgAccuracy}%
                </span>
                <span className="hlp-statLabel">Accuracy</span>
              </div>
              <div className="hlp-statCard">
                <span className="hlp-statVal" style={{ color: "#ffd54a" }}>{formatXp(PROFILE.totalXp)}</span>
                <span className="hlp-statLabel">Total XP</span>
              </div>
              <div className="hlp-statCard">
                <span className="hlp-statVal">{PROFILE.gamesPlayed}</span>
                <span className="hlp-statLabel">Games</span>
              </div>
              <div className="hlp-statCard">
                <span className="hlp-statVal" style={{ color: "#fb923c" }}>{PROFILE.dayStreak}</span>
                <span className="hlp-statLabel">Day streak</span>
              </div>
            </div>

            {/* Remaining modes — swipeable row on mobile, grid on desktop */}
            <div className="hlp-sectionHead">
              <span className="hlp-sectionBar" />
              <span className="hlp-sectionTitle">More modes</span>
            </div>
            <div className="hlp-cards">
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

  .hlp-screen {
    position: fixed;
    inset: 0;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #fff;
  }

  .hlp-bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  .hlp-bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(8, 12, 20, 0.82); }

  /* ── Proto bar ── */
  .hlp-protoBar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 60;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 14px;
    background: rgba(10, 10, 12, 0.6);
    backdrop-filter: blur(8px);
    flex-wrap: wrap;
  }
  .hlp-protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }
  .hlp-protoHint { font-size: 12px; font-weight: 600; opacity: 0.55; }

  /* ── Scroll container ── */
  .hlp-scroll {
    position: absolute; inset: 0; z-index: 2;
    overflow-y: auto;
    padding: 56px 16px calc(28px + env(safe-area-inset-bottom));
    display: flex; flex-direction: column; align-items: center; gap: 16px;
    box-sizing: border-box;
  }
  .hlp-content {
    width: 100%; max-width: 520px; margin: 0 auto;
    display: flex; flex-direction: column; gap: 14px;
  }

  /* ── Top bar ── */
  .hlp-topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    display: flex; align-items: center; justify-content: space-between;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
    background: var(--gh-bg-base, #0a0e16);
    opacity: 0.92;
  }
  .hlp-topbarLogo { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; }
  .hlp-topbarLogoImg { object-fit: contain; }
  .hlp-levelPill {
    position: absolute; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 8px;
    background: var(--gh-bg-elevated, #121826);
    border: 1px solid var(--gh-border-default, #273043);
    border-radius: 20px; padding: 5px 12px; cursor: default;
  }
  .hlp-levelPillBadge {
    font-size: 10px; font-weight: 800; letter-spacing: 0.4px;
    color: #06181c; background: var(--gh-gold, #fbbf24);
    padding: 2px 7px; border-radius: 999px; white-space: nowrap;
  }
  .hlp-levelPillBar { width: 56px; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
  .hlp-levelPillBarFill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--gh-teal, #2dd4bf), var(--gh-violet, #8b5cf6)); }
  .hlp-levelPillAcc { font-size: 13px; font-weight: 700; color: var(--gh-text-primary, #f1f5f9); }
  .hlp-levelPillAccSuffix { font-size: 11px; color: var(--gh-text-muted, #7d8aa0); margin-left: 1px; }
  .hlp-topbarRight { display: flex; align-items: center; gap: 12px; }
  .hlp-avatarBtn {
    width: 36px; height: 36px; border-radius: 50%; overflow: hidden;
    border: 2px solid var(--gh-border-medium, #3a4560);
    background: linear-gradient(135deg, #22d3ee, #8b5cf6);
    cursor: pointer; padding: 0; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .hlp-avatarInitials { color: var(--gh-text-primary, #f1f5f9); font-size: 12px; font-weight: 700; }

  /* ── Tagline ── */
  .hlp-tagline {
    width: 100%; text-align: center;
    color: var(--gh-text-primary, #f1f5f9);
    font-size: 17px; font-weight: 500; letter-spacing: 0.2px; line-height: 1.4;
    padding: 2px 8px 0;
  }

  /* ============================================================
     LEVEL UP HERO (featured, first) + integrated rank module
     ============================================================ */
  .hlp-hero {
    position: relative;
    display: flex; flex-direction: column; gap: 10px;
    width: 100%;
    padding: 14px 14px 14px;
    border-radius: 20px;
    background:
      radial-gradient(130% 100% at 85% -10%, rgba(124, 58, 237, 0.28), transparent 55%),
      linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
    border: 1px solid rgba(139, 92, 246, 0.35);
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.45), 0 0 24px rgba(124, 58, 237, 0.12);
    overflow: hidden;
    box-sizing: border-box;
    animation: hlpIn 0.5s ease both;
  }
  @keyframes hlpIn {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: none; }
  }

  .hlp-heroHead { display: flex; align-items: center; gap: 12px; }
  .hlp-heroIconWrap { width: 84px; height: 84px; flex-shrink: 0; pointer-events: none; }
  .hlp-heroIcon { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.4)); }
  .hlp-heroTitles { flex: 1; min-width: 0; }
  .hlp-heroTitle {
    font-size: 24px; font-weight: 800; letter-spacing: 1px;
    color: var(--gh-text-primary, #fff);
    text-transform: uppercase; margin: 0;
    font-family: 'Bebas Neue', sans-serif; line-height: 1;
  }
  .hlp-heroSub { font-size: 12px; color: rgba(255,255,255,0.6); margin: 4px 0 0; line-height: 1.4; }
  .hlp-heroLvPill {
    flex-shrink: 0;
    font-size: 10px; font-weight: 800; letter-spacing: 0.4px;
    color: #06181c; background: var(--gh-gold, #fbbf24);
    padding: 3px 9px; border-radius: 999px; white-space: nowrap;
  }

  /* ── Rank rail ── */
  .hlp-railWrap {
    position: relative;
    height: 118px;
    padding: 6px 0 4px;
    overflow-x: auto; overflow-y: hidden;
    touch-action: pan-x pan-y;
    cursor: grab;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.25) transparent;
    -webkit-overflow-scrolling: touch;
  }
  .hlp-railWrap::-webkit-scrollbar { height: 6px; }
  .hlp-railWrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 999px; }
  .hlp-railDragging { cursor: grabbing; scroll-snap-type: none; }

  .hlp-rail {
    position: relative;
    display: flex; align-items: center; gap: 8px;
    width: max-content; min-width: 100%; height: 100%;
    padding: 0 4px;
  }

  /* edge fades + swipe chevrons */
  .hlp-railWrap::before,
  .hlp-railWrap::after {
    content: "";
    position: absolute; top: 0; bottom: 0;
    width: 26px; z-index: 2; pointer-events: none;
  }
  .hlp-railWrap::before { left: 0; background: linear-gradient(90deg, rgba(10,14,22,0.9), transparent); }
  .hlp-railWrap::after { right: 0; background: linear-gradient(270deg, rgba(10,14,22,0.9), transparent); }

  .hlp-badge {
    scroll-snap-align: center;
    flex: none;
    width: 86px; height: 104px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 8px 6px 6px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.12);
    background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
    color: #fff;
    cursor: pointer;
    transition: opacity 0.18s, transform 0.18s, box-shadow 0.18s, border-color 0.18s;
    box-sizing: border-box;
    font-family: inherit;
  }
  .hlp-badge:hover { transform: translateY(-2px); }
  .hlp-badge:active { transform: scale(0.97); }
  .hlp-badge[data-state="past"] { opacity: 0.85; }
  .hlp-badge[data-state="future"] { opacity: 0.45; filter: grayscale(0.9); }

  .hlp-badgeIconWrap { position: relative; width: 42px; height: 42px; flex-shrink: 0; }
  .hlp-badgeIcon { width: 100%; height: 100%; object-fit: contain; }
  .hlp-rankFallback {
    width: 100%; height: 100%; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.65), rgba(6, 182, 212, 0.65));
    font-size: 16px; font-weight: 900; color: #fff;
  }
  .hlp-roman {
    position: absolute; bottom: -3px; right: -3px;
    background: rgba(8, 12, 20, 0.92); border: 1px solid rgba(255,255,255,0.25);
    border-radius: 6px; font-size: 9px; font-weight: 800; padding: 0 4px; line-height: 1.5;
  }
  .hlp-check {
    position: absolute; top: -4px; right: -4px;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--gh-teal, #2dd4bf); color: #04222a;
    font-size: 10px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
  }
  .hlp-badgeLevel { font-size: 9px; font-weight: 800; letter-spacing: 0.6px; color: rgba(255,255,255,0.5); }
  .hlp-badgeName { font-size: 10.5px; font-weight: 700; line-height: 1.15; text-align: center; }

  /* Current badge = wide hero tile inside the rail */
  .hlp-badgeCurrent {
    scroll-snap-align: center;
    flex: none;
    width: min(252px, 72vw);
    height: 104px;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px;
    border-radius: 16px;
    border: 1px solid rgba(251, 146, 60, 0.85);
    background: linear-gradient(180deg, rgba(251, 146, 60, 0.16), rgba(251, 146, 60, 0.05));
    box-shadow: 0 0 0 1px rgba(251, 146, 60, 0.4), 0 8px 26px rgba(251, 146, 60, 0.22);
    color: #fff;
    cursor: pointer;
    text-align: left;
    box-sizing: border-box;
  }
  .hlp-curIconWrap { position: relative; width: 56px; height: 56px; flex-shrink: 0; }
  .hlp-curIconWrap .hlp-roman { bottom: -3px; right: -3px; }
  .hlp-curBody { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .hlp-curLevel { font-size: 9px; font-weight: 800; letter-spacing: 1.2px; color: var(--gh-orange, #fb923c); }
  .hlp-curName {
    font-size: 17px; font-weight: 800; line-height: 1.05;
    font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.8px; text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .hlp-curXp { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.6); font-variant-numeric: tabular-nums; }
  .hlp-curBar { width: 100%; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.14); overflow: hidden; margin-top: 3px; }
  .hlp-curBarFill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, var(--gh-teal, #2dd4bf), var(--gh-orange, #fb923c));
    box-shadow: 0 0 8px rgba(251, 146, 60, 0.5);
    transition: width 0.3s ease;
  }

  .hlp-divider {
    scroll-snap-align: none;
    flex: none;
    width: 32px; height: 56px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    border-radius: 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .hlp-dividerIconWrap { width: 20px; height: 20px; position: relative; }
  .hlp-dividerIconWrap .hlp-rankFallback { border-radius: 6px; font-size: 10px; }
  .hlp-dividerRank { font-size: 8px; font-weight: 800; letter-spacing: 0.5px; color: rgba(255,255,255,0.35); }

  .hlp-heroFoot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .hlp-heroHint { font-size: 10.5px; font-weight: 500; color: rgba(255,255,255,0.5); }
  .hlp-heroRank {
    font-size: 10.5px; font-weight: 700; text-align: right;
    color: rgba(255,255,255,0.65);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Play CTA ── */
  .hlp-play {
    display: flex; align-items: center; justify-content: center; gap: 9px;
    width: 100%;
    padding: 15px 16px;
    border: none; border-radius: 999px;
    background: linear-gradient(135deg, #fb923c 0%, #ea6820 100%);
    color: #fff;
    font-size: 18px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase;
    font-family: 'Bebas Neue', sans-serif;
    cursor: pointer;
    box-shadow: 0 8px 26px rgba(234, 104, 32, 0.45), inset 0 1px 0 rgba(255,255,255,0.35);
    transition: transform 0.12s ease, box-shadow 0.18s ease, filter 0.18s ease;
  }
  .hlp-play:hover { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(234, 104, 32, 0.55), inset 0 1px 0 rgba(255,255,255,0.3); }
  .hlp-play:active { transform: scale(0.98); }

  /* ============================================================
     STAT STRIP (compact)
     ============================================================ */
  .hlp-statStrip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; }
  .hlp-statCard {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 11px 4px;
    background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    backdrop-filter: blur(10px);
  }
  .hlp-statVal { font-size: 18px; font-weight: 800; }
  .hlp-statLabel { font-size: 10.5px; color: rgba(255,255,255,0.5); text-align: center; }

  /* ============================================================
     MORE MODES — swipeable row (mobile) / 3-col grid (desktop)
     ============================================================ */
  .hlp-sectionHead { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .hlp-sectionBar { width: 22px; height: 3px; border-radius: 999px; background: var(--gh-orange, #fb923c); }
  .hlp-sectionTitle {
    font-size: 12px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;
    color: rgba(255,255,255,0.6);
  }

  .hlp-cards {
    display: flex; gap: 12px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding: 2px 2px 6px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .hlp-cards::-webkit-scrollbar { display: none; }
  .hlp-modeCard {
    scroll-snap-align: center;
    flex: 0 0 78%;
    max-width: 300px;
  }
  .hlp-cardBg { width: 100%; border-radius: 16px; position: relative; overflow: hidden; }
  .hlp-cardInner { padding: 16px; display: flex; flex-direction: column; gap: 8px; min-height: 168px; }
  .hlp-cardTitle {
    font-size: 20px; font-weight: 800;
    color: var(--gh-text-primary, #f1f5f9);
    text-transform: uppercase; letter-spacing: 1px; margin: 0;
    font-family: 'Bebas Neue', sans-serif; line-height: 1;
    padding-right: 84px;
  }
  .hlp-cardDesc { font-size: 12.5px; font-weight: 400; color: rgba(255,255,255,0.78); line-height: 1.45; margin: 0; padding: 0; }
  .hlp-cardCta {
    margin-top: auto;
    background: rgba(255,255,255,0.94);
    color: rgba(8, 12, 20, 0.85);
    border: none; border-radius: 10px;
    padding: 11px 14px; font-size: 12.5px; font-weight: 800; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    transition: opacity 0.15s;
    width: 100%;
  }
  .hlp-cardCta:hover { opacity: 0.85; }
  .hlp-cardCta:active { opacity: 0.7; }
  .hlp-cardIconWrap {
    position: absolute; top: 2px; right: 2px;
    width: 92px; height: 92px; pointer-events: none; z-index: 2; flex-shrink: 0;
  }
  .hlp-cardIconImg { object-fit: contain; }
  .hlp-timerBox { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 6px 10px; width: fit-content; }
  .hlp-timerLabel { font-size: 12px; color: var(--gh-text-primary, #f1f5f9); font-weight: 600; }
  .hlp-timerCountdown { color: var(--gh-orange, #fb923c); }

  .hlp-timerBox { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 6px 10px; width: fit-content; }
  .hlp-timerLabel { font-size: 12px; color: var(--gh-text-primary, #f1f5f9); font-weight: 600; }
  .hlp-timerCountdown { color: var(--gh-orange, #fb923c); }

  /* ============================================================
     Responsive
     ============================================================ */
  /* Mobile: the Level Up hero must not exceed 75% of the screen height */
  @media (max-width: 640px) {
    .hlp-hero { max-height: 75vh; max-height: 75dvh; overflow: hidden; }
  }

  /* Short mobile screens: compact the hero further */
  @media (max-width: 640px) and (max-height: 740px) {
    .hlp-heroSub { display: none; }
    .hlp-heroIconWrap { width: 64px; height: 64px; }
    .hlp-heroTitle { font-size: 20px; }
    .hlp-railWrap { height: 94px; }
    .hlp-badge { width: 76px; height: 92px; padding: 6px 4px 4px; }
    .hlp-badgeIconWrap { width: 38px; height: 38px; }
    .hlp-badgeCurrent { height: 96px; }
    .hlp-curIconWrap { width: 48px; height: 48px; }
    .hlp-divider { height: 50px; }
    .hlp-play { padding: 12px 14px; }
    .hlp-heroHint { display: none; }
  }

  @media (min-width: 768px) {
    .hlp-scroll { align-items: center; }
    .hlp-content { max-width: 960px; }
    .hlp-hero { max-width: 960px; }
    .hlp-statStrip { max-width: 960px; }
    .hlp-heroIconWrap { width: 104px; height: 104px; }
    .hlp-heroTitle { font-size: 30px; }
    .hlp-railWrap { height: 118px; }
    .hlp-badge { width: 92px; height: 112px; }
    .hlp-badgeIconWrap { width: 48px; height: 48px; }
    .hlp-badgeCurrent { width: 280px; height: 112px; }
    .hlp-cards { display: grid; grid-template-columns: repeat(3, 1fr); overflow: visible; }
    .hlp-modeCard { flex: none; }
    .hlp-cardIconWrap { width: 120px; height: 120px; }
    .hlp-cardTitle { padding-right: 140px; }
  }

  @media (max-width: 380px) {
    .hlp-heroIconWrap { width: 68px; height: 68px; }
    .hlp-heroTitle { font-size: 21px; }
    .hlp-badgeCurrent { width: min(236px, 76vw); }
  }
`;
