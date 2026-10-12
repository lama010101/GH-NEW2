"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Final Results V2 (session-complete UX rethink)
// Route: /prototype/final-results-v2   (direct access, self-contained)
//
// Improvements over the prod SessionComplete flow:
//   Hero      — "result moment": placement headline, count-up accuracy ring,
//               delta vs personal average, WHERE/WHEN tiles with error units
//   Leaderboard — rankings + per-round accuracy pips + round-winner crowns
//   Rank      — swipe-rail ladder of the 10 animated SVG tier shields,
//               centred on the current tier (ported from /prototype/profile-v2)
//   Highlights— where/when/combo best-score tiles (prod parity) +
//               closest/sharpest/toughest round chips
//   Badges    — earned badge tiles with per-tier counts
//   Rounds    — snap carousel of photo cards (replaces the accordion)
//   Dock      — sticky bottom bar: Home · Share · Play again
//
// All data is MOCK. Compete | Practice toggle in the proto bar.
// ============================================================================

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Clock,
  Crown,
  Trophy,
  Crosshair,
  Timer,
  Flame,
  Home,
  Medal,
  Share2,
  type LucideIcon,
} from "lucide-react";
import WhereIcon from "@/components/icons/WhereIcon";
import WhenIcon from "@/components/icons/WhenIcon";
import AccuracySuffix from "@/components/AccuracySuffix";
import { getAccuracyColor } from "@/core/accuracyColor";

// ── Mock session (mirrors src/app/prototype/final-results/page.tsx) ──────────
const VIEWER_ID = "p1";
const MY_AVG_ACCURACY = 78;    // mock lifetime average for the delta chip
const XP_BEFORE = 31_264;      // global XP before this session
const TIER_FLOOR = 20_000;     // T4 threshold (Cartographer)
const TIER_NEXT = 50_000;      // T5 threshold (Explorer)
const CURRENT_TIER = 4;        // current mock tier — Cartographer (20k ≤ XP < 50k)

type MockPlayer = { id: string; name: string; isHost: boolean };

const PLAYERS: MockPlayer[] = [
  { id: "p1", name: "Alex Rivera", isHost: true },
  { id: "p2", name: "Mina Kovač", isHost: false },
  { id: "p3", name: "Theo Lambert", isHost: false },
  { id: "p4", name: "Sara Bianchi", isHost: false },
];

type MockRound = {
  title: string;
  year: number;
  locationName: string;
  imageUrl: string;
};

const ROUNDS: MockRound[] = [
  { title: "Fall of the Berlin Wall", year: 1989, locationName: "Berlin, Germany", imageUrl: "/prototype/landing/hero/hero-1.webp" },
  { title: "Apollo 11 Moon Landing", year: 1969, locationName: "Cape Canaveral, USA", imageUrl: "/prototype/landing/hero/hero-2.webp" },
  { title: "Coronation of Elizabeth II", year: 1953, locationName: "London, UK", imageUrl: "/prototype/landing/hero/hero-3.webp" },
  { title: "Eiffel Tower Inauguration", year: 1889, locationName: "Paris, France", imageUrl: "/prototype/landing/hero/hero-5.webp" },
  { title: "Sydney Opera House Opening", year: 1973, locationName: "Sydney, Australia", imageUrl: "/prototype/landing/hero/hero-7.webp" },
];

type Result = {
  playerId: string;
  roundIndex: number;
  score: number;
  locationScore: number;
  timeScore: number;
  distanceKm: number;
  yearDiff: number;
};

// Explicit per-round (locationScore, timeScore) — viewer finishes 2nd, wins R1+R4.
const ROUND_SCORES: Record<string, [number, number][]> = {
  p1: [[92, 88], [70, 81], [84, 60], [97, 95], [78, 86]],
  p2: [[85, 80], [93, 90], [90, 88], [88, 84], [95, 91]],
  p3: [[60, 72], [75, 68], [88, 70], [55, 62], [66, 74]],
  p4: [[80, 70], [72, 85], [65, 77], [82, 74], [70, 69]],
};

const RESULTS: Result[] = (() => {
  const out: Result[] = [];
  for (const p of PLAYERS) {
    for (let ri = 0; ri < ROUNDS.length; ri++) {
      const [loc, time] = ROUND_SCORES[p.id][ri];
      const score = loc + time;
      const distanceKm = Math.round((100 - loc) * 9);
      const yearDiff = Math.round((100 - time) / 4);
      out.push({ playerId: p.id, roundIndex: ri, score, locationScore: loc, timeScore: time, distanceKm, yearDiff });
    }
  }
  return out;
})();

// Session XP = the viewer's summed round scores.
const SESSION_XP = RESULTS.filter((r) => r.playerId === VIEWER_ID).reduce((s, r) => s + r.score, 0);

// ── Derived helpers ──────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();
const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const avatarHue = (playerId: string) => (playerId.charCodeAt(1) * 67) % 360;
const clampPct = (n: number) => Math.max(0, Math.min(100, n));
const xpShort = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
    : `${n}`;

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

const MEDAL_COLORS = ["#f0c060", "#cbd5e1", "#d97706"];

// Count-up hook: 0 → target over `ms` with easeOutCubic.
// Skips the animation when prefers-reduced-motion is set.
function useCountUp(target: number, ms = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setVal(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

// ── Ring atoms ───────────────────────────────────────────────────────────────
function BigRing({ pct }: { pct: number }) {
  const size = 128;
  const sw = 10;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const shown = useCountUp(pct, 900);
  const offset = c - (shown / 100) * c;
  return (
    <div className="bigRing" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="fr2-accGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#f0c060" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#fr2-accGrad)" strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="bigRingCenter">
        <span className="bigRingNum">{Math.round(shown)}</span>
        <span className="bigRingUnit">%</span>
      </div>
    </div>
  );
}

function MiniRing({ pct, color, size = 52 }: { pct: number; color: string; size?: number }) {
  const sw = 5;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="miniRing" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="miniRingVal" style={{ color }}>{Math.round(pct)}</span>
    </div>
  );
}

function Avatar({ name, playerId, size = 34 }: { name: string; playerId: string; size?: number }) {
  const hue = avatarHue(playerId);
  return (
    <span
      className="avatar"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${hue} 60% 45%), hsl(${(hue + 40) % 360} 60% 30%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function FinalResultsV2Page() {
  const [mode, setMode] = useState<"compete" | "practice">("compete");
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-player aggregates (same math as the old prototype)
  const playerStats = useMemo(() => {
    return PLAYERS.map((p) => {
      const rows = RESULTS.filter((r) => r.playerId === p.id);
      const n = rows.length;
      const totalScore = rows.reduce((s, r) => s + r.score, 0);
      const avgLocation = Math.round(rows.reduce((s, r) => s + r.locationScore, 0) / n);
      const avgTime = Math.round(rows.reduce((s, r) => s + r.timeScore, 0) / n);
      const avgAccuracy = Math.round((avgLocation + avgTime) / 2);
      const avgDistanceKm = rows.reduce((s, r) => s + r.distanceKm, 0) / n;
      const avgYearDiff = rows.reduce((s, r) => s + r.yearDiff, 0) / n;
      return { ...p, isMe: p.id === VIEWER_ID, totalScore, avgLocation, avgTime, avgAccuracy, avgDistanceKm, avgYearDiff, rows };
    });
  }, []);

  const roundWinner = useMemo(() => {
    const map = new Map<number, string>();
    for (let i = 0; i < ROUNDS.length; i++) {
      const rows = RESULTS.filter((r) => r.roundIndex === i);
      const best = rows.reduce((b, r) => (r.score > b.score ? r : b), rows[0]);
      map.set(i, best.playerId);
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
  const wonRoundsByMe = [...roundWinner.values()].filter((pid) => pid === VIEWER_ID).length;
  const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? id;

  // Badges — local thresholds: gold ≥95, silver ≥85, bronze ≥75
  const badgeTiles = useMemo(() => {
    const dims = [
      { key: "combo", label: "Combo", get: (r: Result) => (r.locationScore + r.timeScore) / 2 },
      { key: "year", label: "When", get: (r: Result) => r.timeScore },
      { key: "location", label: "Where", get: (r: Result) => r.locationScore },
    ] as const;
    const tiers = [
      { key: "gold", min: 95 },
      { key: "silver", min: 85 },
      { key: "bronze", min: 75 },
    ] as const;
    const myRows = RESULTS.filter((r) => r.playerId === VIEWER_ID);
    const tiles: { src: string; label: string; tier: string; count: number }[] = [];
    let total = 0;
    for (const d of dims) {
      for (const t of tiers) {
        const count = myRows.filter((r) => {
          const v = d.get(r);
          const nextMin = tiers[tiers.findIndex((x) => x.key === t.key) - 1]?.min ?? 101;
          return v >= t.min && v < nextMin;
        }).length;
        if (count > 0) {
          tiles.push({ src: `/badges/${d.key}_${t.key}.webp`, label: d.label, tier: t.key, count });
          total += count;
        }
      }
    }
    return { tiles, total };
  }, []);

  const xpDelta = me.avgAccuracy - MY_AVG_ACCURACY;

  const onShare = () => {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 1500);
  };

  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Final Results · V2</span>
        <div className="modeToggle">
          {(["compete", "practice"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`modeBtn ${mode === m ? "modeBtnOn" : ""}`}
              onClick={() => setMode(m)}
            >
              {m === "compete" ? "Compete" : "Practice"}
            </button>
          ))}
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        <HeroCard
          mode={mode}
          me={me}
          myRank={myRank}
          wonRounds={wonRoundsByMe}
          totalRounds={ROUNDS.length}
          badgeTotal={badgeTiles.total}
          xpDelta={xpDelta}
        />

        {mode === "compete" && (
          <LeaderboardCard leaderboard={leaderboard} roundWinner={roundWinner} />
        )}

        <RankLadderCard />

        <HighlightsCard rows={me.rows} />

        <BadgesCard tiles={badgeTiles.tiles} total={badgeTiles.total} />

        <RoundsCard mode={mode} me={me} roundWinner={roundWinner} nameOf={nameOf} />

        <div className="dockSpacer" />
      </div>

      <div className="dock">
        <button type="button" className="dockIcon" aria-label="Home">
          <Home size={19} />
        </button>
        <button type="button" className="dockShare" onClick={onShare}>
          <Share2 size={15} /> Share
        </button>
        <button type="button" className="dockPlay">Play again</button>
      </div>

      {toast && <div className="toast">Result link copied</div>}

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }

        :root {
          --gh-success: #22c55e;
          --gh-gold: #f0c060;
          --gh-orange: #fb923c;
          --gh-danger: #ef4444;
          --gh-text-muted: rgba(255,255,255,0.5);
          --main-color: #fb923c;
          --main-dk: #f97316;
          --where-color: #22d3ee;
          --when-color: #8b5cf6;
        }

        .screen {
          position: fixed; inset: 0; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #fff;
        }
        .bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,0.86); }

        .protoBar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 60;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; background: rgba(10,10,12,0.6); backdrop-filter: blur(8px);
        }
        .protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }
        .modeToggle {
          display: flex; gap: 2px; padding: 2px; border-radius: 999px;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
        }
        .modeBtn {
          border: 0; padding: 4px 12px; border-radius: 999px; cursor: pointer;
          font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.6); background: transparent;
        }
        .modeBtnOn { background: linear-gradient(135deg, #fb923c, #f97316); color: #1a0d02; }

        .scroll {
          position: absolute; inset: 0; z-index: 2; overflow-y: auto;
          padding: 56px 16px 40px; display: flex; flex-direction: column; gap: 14px;
          max-width: 560px; margin: 0 auto; box-sizing: border-box;
        }
        .dockSpacer { flex-shrink: 0; height: calc(120px + env(safe-area-inset-bottom, 0px)); }

        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
          flex-shrink: 0;
        }

        .avatar {
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 999px; font-weight: 800; color: #fff; flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.2);
        }

        .bigRing, .miniRing {
          position: relative; display: flex; align-items: center; justify-content: center;
        }
        .bigRingCenter {
          position: absolute; display: flex; align-items: baseline; gap: 1px;
        }
        .bigRingNum { font-size: 34px; font-weight: 900; }
        .bigRingUnit { font-size: 15px; font-weight: 800; color: rgba(255,255,255,0.55); }
        .miniRingVal { position: absolute; font-size: 13px; font-weight: 800; }

        .dock {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 50;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
          background: rgba(10,10,12,0.72); backdrop-filter: blur(12px);
          border-top: 1px solid rgba(255,255,255,0.08);
          max-width: 560px; margin: 0 auto; box-sizing: border-box;
        }
        .dockIcon {
          width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: #fff; cursor: pointer;
        }
        .dockShare {
          display: inline-flex; align-items: center; gap: 6px;
          height: 44px; padding: 0 16px; border-radius: 14px;
          background: transparent; border: 1px solid rgba(251,146,60,0.5);
          color: var(--main-color); font-size: 13px; font-weight: 800; cursor: pointer;
        }
        .dockPlay {
          flex: 1; height: 44px; border-radius: 14px; border: 0; cursor: pointer;
          background: linear-gradient(135deg, #fb923c, #f97316);
          color: #1a0d02; font-size: 14px; font-weight: 900; letter-spacing: 0.4px;
          box-shadow: 0 6px 20px rgba(249,115,22,0.35);
        }

        .toast {
          position: absolute; bottom: 84px; left: 50%; transform: translateX(-50%);
          z-index: 70; padding: 8px 16px; border-radius: 999px;
          background: rgba(20,20,24,0.95); border: 1px solid rgba(34,197,94,0.5);
          color: #22c55e; font-size: 12px; font-weight: 700;
          animation: toastIn 0.25s ease;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        /* ── SVG badge animations (mirrors rank-badges-svg.module.css) ── */
        @keyframes rbGlowPulse { 0%,100% { opacity: 0.16; } 50% { opacity: 0.38; } }
        @keyframes rbSheen { 0% { transform: translateX(-60px); } 45%,100% { transform: translateX(120px); } }
        @keyframes rbTwinkle { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes rbStep { 0%,100% { transform: translateY(0); } 30% { transform: translateY(-3px); } 60% { transform: translateY(0); } }
        @keyframes rbNeedle { 0%,100% { transform: rotate(-11deg); } 50% { transform: rotate(14deg); } }
        /* -24 = lcm of both dash periods (6+6 and 4+4) → seamless loop */
        @keyframes rbDash { to { stroke-dashoffset: -24; } }
        @keyframes rbFlag { 0%,100% { transform: skewY(0deg); } 50% { transform: skewY(7deg); } }
        @keyframes rbSpin { to { transform: rotate(360deg); } }
        @keyframes rbBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes rbSway { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
        @keyframes rbPulseMark { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.18); } }

        @media (prefers-reduced-motion: no-preference) {
          .animGlow { animation: rbGlowPulse 3.4s ease-in-out infinite; }
          .animSheen { animation: rbSheen 4.8s ease-in-out infinite; }
          .animTwinkle { animation: rbTwinkle 2.2s ease-in-out infinite; }
          .animStep { animation: rbStep 1.8s ease-in-out infinite; }
          .animDash { animation: rbDash 1.4s linear infinite; }
          .animBob { animation: rbBob 2.6s ease-in-out infinite; }
          .animNeedle { animation: rbNeedle 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
          .animFlag { animation: rbFlag 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }
          .animSpin { animation: rbSpin 9s linear infinite; transform-box: fill-box; transform-origin: center; }
          .animSway { animation: rbSway 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 0; }
          .animPulseMark { animation: rbPulseMark 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        }

        /* ── Tablet: widen the single column a little ── */
        @media (min-width: 720px) and (max-width: 1023px) {
          .scroll, .dock { max-width: 640px; }
        }

        /* ── Desktop: 12-col grid layout + floating dock ── */
        @media (min-width: 1024px) {
          .scroll {
            max-width: 1120px;
            display: grid;
            grid-template-columns: repeat(12, 1fr);
            align-items: start;
            gap: 18px;
            padding: 72px 32px 56px;
          }
          .scroll::-webkit-scrollbar { width: 8px; }
          .scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 999px; }
          .scroll > .hero { grid-column: 1 / span 5; align-self: center; }
          .scroll > .heroSolo { grid-column: 1 / -1; }
          .scroll > .leaderboard { grid-column: 6 / span 7; align-self: center; }
          .scroll > .rankL { grid-column: 1 / -1; }
          .scroll > .hl { grid-column: 1 / span 7; align-self: stretch; }
          .scroll > .badges { grid-column: 8 / span 5; align-self: stretch; }
          .scroll > .rounds { grid-column: 1 / -1; }
          .scroll > .dockSpacer { grid-column: 1 / -1; }
          .bgScrim { background: rgba(0,0,0,0.8); box-shadow: inset 0 0 260px rgba(0,0,0,0.75); }
          .protoBar { padding: 12px 24px; }
          .dock {
            left: 50%; right: auto; transform: translateX(-50%);
            bottom: 24px; width: min(560px, 92vw);
            border-radius: 18px; border: 1px solid rgba(255,255,255,0.14);
            box-shadow: 0 14px 44px rgba(0,0,0,0.55);
          }
          .toast { bottom: 104px; }
        }

        /* ── Pointer affordances (non-touch) ── */
        @media (hover: hover) {
          .modeBtn { transition: color 0.15s; }
          .modeBtn:not(.modeBtnOn):hover { color: #fff; }
          .dockIcon, .dockShare, .dockPlay { transition: all 0.15s; }
          .dockIcon:hover { background: rgba(255,255,255,0.12); }
          .dockShare:hover { background: rgba(251,146,60,0.12); }
          .dockPlay:hover { filter: brightness(1.08); }
        }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HERO — the result moment
// ════════════════════════════════════════════════════════════════════════════
type PlayerStats = {
  id: string; name: string; isHost: boolean; isMe: boolean;
  totalScore: number; avgLocation: number; avgTime: number; avgAccuracy: number;
  avgDistanceKm: number; avgYearDiff: number; rows: Result[];
};

function HeroCard({
  mode, me, myRank, wonRounds, totalRounds, badgeTotal, xpDelta,
}: {
  mode: "compete" | "practice";
  me: PlayerStats;
  myRank: number;
  wonRounds: number;
  totalRounds: number;
  badgeTotal: number;
  xpDelta: number;
}) {
  const xpShown = useCountUp(SESSION_XP, 900);
  const medalColor = MEDAL_COLORS[myRank - 1] ?? "rgba(255,255,255,0.5)";

  return (
    <section className={`card hero ${mode === "practice" ? "heroSolo" : ""}`}>
      <span className="heroKicker">GAME COMPLETE</span>

      {mode === "compete" ? (
        <div className="heroPlaceRow">
          <span className="heroPlace">{ordinal(myRank)}</span>
          <div className="heroPlaceMeta">
            <span className="heroOf">of {PLAYERS.length} players</span>
            {myRank <= 3 && (
              <span
                className="heroMedal"
                style={{
                  color: medalColor,
                  background: `${medalColor}26`,
                  borderColor: `${medalColor}80`,
                }}
              >
                <Medal size={12} strokeWidth={2.4} />
                {["GOLD", "SILVER", "BRONZE"][myRank - 1]}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="heroPlaceRow">
          <span className="heroPlace">Great run</span>
        </div>
      )}
      <span className="heroSub">
        {mode === "compete"
          ? `Won ${wonRounds} of ${totalRounds} rounds · ${badgeTotal} badges`
          : `Solo practice · ${totalRounds} rounds`}
      </span>

      <div className="heroRingWrap">
        <BigRing pct={me.avgAccuracy} />
      </div>

      <span className="heroXpChip">+{fmt(Math.round(xpShown))} XP</span>
      <span
        className="heroDelta"
        style={{ color: xpDelta >= 0 ? "#22c55e" : "#ef4444" }}
      >
        {xpDelta >= 0 ? "▲" : "▼"} {xpDelta >= 0 ? "+" : ""}{xpDelta}% vs your average ({MY_AVG_ACCURACY}%)
      </span>

      <div className="heroMinis">
        <div className="heroMini">
          <div className="heroMiniHead">
            <MapPin size={13} strokeWidth={2.5} style={{ color: "var(--where-color)" }} />
            <span style={{ color: "var(--where-color)" }}>WHERE</span>
          </div>
          <MiniRing pct={me.avgLocation} color="#22d3ee" />
          <span className="heroMiniErr">avg {Math.round(me.avgDistanceKm)} km off</span>
        </div>
        <div className="heroMini">
          <div className="heroMiniHead">
            <Clock size={13} strokeWidth={2.5} style={{ color: "var(--when-color)" }} />
            <span style={{ color: "var(--when-color)" }}>WHEN</span>
          </div>
          <MiniRing pct={me.avgTime} color="#8b5cf6" />
          <span className="heroMiniErr">avg {Math.round(me.avgYearDiff)} yrs off</span>
        </div>
      </div>

      <style jsx>{`
        .hero { padding: 22px 18px 18px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .heroKicker { font-size: 10px; font-weight: 800; letter-spacing: 2px; color: rgba(255,255,255,0.5); }
        .heroPlaceRow { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
        .heroPlace { font-size: 44px; font-weight: 900; line-height: 1; }
        .heroPlaceMeta { display: flex; align-items: center; gap: 8px; }
        .heroOf { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.55); }
        .heroMedal {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 9px; border-radius: 999px; border: 1px solid;
          font-size: 9px; font-weight: 800; letter-spacing: 1px;
        }
        .heroSub { margin-top: 6px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.55); }
        .heroRingWrap { margin: 16px 0 10px; }
        .heroXpChip {
          padding: 4px 14px; border-radius: 999px;
          background: rgba(240,192,96,0.12); border: 1px solid rgba(240,192,96,0.4);
          color: #f0c060; font-size: 14px; font-weight: 800;
        }
        .heroDelta { margin-top: 8px; font-size: 12px; font-weight: 700; }
        .heroMinis { display: flex; gap: 12px; margin-top: 16px; width: 100%; }
        .heroMini {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 12px 8px; border-radius: 14px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
        }
        .heroMiniHead { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 800; letter-spacing: 1px; }
        .heroMiniErr { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.45); }
        @media (min-width: 1024px) {
          .hero { padding: 30px 24px 24px; }
          .heroPlace { font-size: 54px; }
          .heroSub { font-size: 13px; }
          .heroMini { padding: 14px 10px; }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// RANK LADDER — animated SVG tier shields on a swipe rail (badges copied from
// /prototype/rank-badges-svg via /prototype/profile-v2; rail mirrors its
// LadderStrip). Wired to this page's mock XP: Cartographer at T4.
// ════════════════════════════════════════════════════════════════════════════
const LADDER_TIERS = [
  { tier: 1, title: "Wanderer", threshold: 0 },
  { tier: 2, title: "Pathfinder", threshold: 1_000 },
  { tier: 3, title: "Trailblazer", threshold: 5_000 },
  { tier: 4, title: "Cartographer", threshold: 20_000 },
  { tier: 5, title: "Explorer", threshold: 50_000 },
  { tier: 6, title: "Navigator", threshold: 125_000 },
  { tier: 7, title: "Chronicler", threshold: 300_000 },
  { tier: 8, title: "Historian", threshold: 600_000 },
  { tier: 9, title: "Scholar", threshold: 1_200_000 },
  { tier: 10, title: "Sovereign", threshold: 2_500_000 },
];

const SHIELD_PATH =
  "M30,22 H130 Q136,22 136,28 V95 Q136,135 80,168 Q24,135 24,95 V28 Q24,22 30,22 Z";

const STAR_PATH = "M0,-6 L1.5,-1.8 L6,-1.8 L2.3,1 L3.7,5.4 L0,2.8 L-3.7,5.4 L-2.3,1 L-6,-1.8 L-1.5,-1.8 Z";

const IVORY = "#f5ecd7";
const IVORY_DARK = "#b8a887";

interface Palette {
  rimLight: string;
  rimDark: string;
  fieldLight: string;
  fieldDark: string;
  accent: string;
}

const PALETTES: Record<"bronze" | "silver" | "gold" | "royal", Palette> = {
  bronze: { rimLight: "#c77b3a", rimDark: "#5a2f12", fieldLight: "#3b2a1d", fieldDark: "#1a120b", accent: "#e0a060" },
  silver: { rimLight: "#e6edf3", rimDark: "#5e6b78", fieldLight: "#2b3440", fieldDark: "#141a22", accent: "#a8c4e0" },
  gold:   { rimLight: "#fde68a", rimDark: "#92400e", fieldLight: "#3a2b0f", fieldDark: "#1a1306", accent: "#fbbf24" },
  royal:  { rimLight: "#fde68a", rimDark: "#b45309", fieldLight: "#4c1d95", fieldDark: "#1e0b3a", accent: "#c084fc" },
};

function paletteFor(tier: number): Palette {
  if (tier <= 3) return PALETTES.bronze;
  if (tier <= 6) return PALETTES.silver;
  if (tier <= 9) return PALETTES.gold;
  return PALETTES.royal;
}

function starCount(tier: number): number {
  if (tier <= 3) return 1;
  if (tier <= 6) return 2;
  if (tier <= 9) return 3;
  return 5;
}

function starPositions(count: number): { x: number; y: number }[] {
  if (count === 1) return [{ x: 80, y: 142 }];
  if (count === 2) return [{ x: 70, y: 142 }, { x: 90, y: 142 }];
  if (count === 3) return [{ x: 62, y: 143 }, { x: 80, y: 139 }, { x: 98, y: 143 }];
  return [
    { x: 52, y: 146 },
    { x: 66, y: 140 },
    { x: 80, y: 137 },
    { x: 94, y: 140 },
    { x: 108, y: 146 },
  ];
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// Per-tier emblems (drawn centred around 80,85, ~60px wide)
function Emblem({ tier, accent }: { tier: number; accent: string }) {
  const stroke = IVORY_DARK;
  switch (tier) {
    case 1: // footprint: two offset footprints (marching step)
      return (
        <g fill={IVORY} stroke={stroke} strokeWidth="1.2">
          <g className="animStep">
            <ellipse cx="68" cy="82" rx="9" ry="13" transform="rotate(-14 68 82)" />
            <circle cx="60" cy="66" r="2.4" />
            <circle cx="65" cy="63" r="2.4" />
            <circle cx="70" cy="63" r="2.4" />
            <circle cx="75" cy="66" r="2.4" />
          </g>
          <g className="animStep" style={{ animationDelay: "0.9s" }}>
            <ellipse cx="93" cy="92" rx="9" ry="13" transform="rotate(-14 93 92)" />
            <circle cx="85" cy="76" r="2.4" />
            <circle cx="90" cy="73" r="2.4" />
            <circle cx="95" cy="73" r="2.4" />
            <circle cx="100" cy="76" r="2.4" />
          </g>
        </g>
      );
    case 2: // compass: ring + 4-point rose, N spike in accent (needle swings)
      return (
        <g stroke={IVORY} fill="none" strokeWidth="2.4">
          <circle cx="80" cy="85" r="26" />
          <g className="animNeedle">
            <path d="M80,59 L85,85 L80,111 L75,85 Z" fill={accent} stroke={stroke} strokeWidth="1.2" />
            <path d="M54,85 L80,80 L106,85 L80,90 Z" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
            <circle cx="80" cy="85" r="4" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
          </g>
        </g>
      );
    case 3: // trail: dashed winding path ending in a flag (ants march, flag waves)
      return (
        <g>
          <path
            className="animDash"
            d="M52,108 C62,96 58,90 70,84 C84,76 78,68 92,62 C98,59 104,60 106,58"
            fill="none"
            stroke={IVORY}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="6 6"
          />
          <path className="animFlag" d="M106,56 L106,42 L122,47 L106,52" fill={accent} stroke={stroke} strokeWidth="1.2" />
          <line x1="106" y1="56" x2="106" y2="68" stroke={IVORY} strokeWidth="2.4" />
        </g>
      );
    case 4: // map: unrolled scroll with dashed route + X, rolled edges (route marches, X pulses)
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <rect x="50" y="66" width="60" height="40" fill={IVORY} />
          <ellipse cx="50" cy="86" rx="5" ry="20" fill="#e6d8b8" />
          <ellipse cx="110" cy="86" rx="5" ry="20" fill="#e6d8b8" />
          <path
            className="animDash"
            d="M58,98 C66,86 74,94 84,80 C90,72 96,78 100,72"
            fill="none"
            stroke="#8a6f4a"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <path className="animPulseMark" d="M94,92 L104,102 M104,92 L94,102" stroke="#a33" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 5: // telescope: tilted tube on tripod + small stars (stars twinkle)
      return (
        <g>
          <g transform="rotate(-35 80 74)">
            <rect x="56" y="70" width="34" height="8" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
            <rect x="90" y="68" width="12" height="12" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
            <rect x="46" y="72" width="10" height="4" fill={IVORY} stroke={stroke} strokeWidth="1.2" />
          </g>
          <path d="M80,80 L80,104 M80,82 L64,110 M80,82 L96,110" stroke={IVORY} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path className="animTwinkle" d={STAR_PATH} transform="translate(58 58) scale(.9)" fill={accent} />
          <path className="animTwinkle" style={{ animationDelay: "0.7s" }} d={STAR_PATH} transform="translate(104 52) scale(.7)" fill={accent} />
        </g>
      );
    case 6: // astrolabe: rings + rule bar + hub + ticks (rule spins)
      return (
        <g fill="none" stroke={IVORY} strokeWidth="2.2">
          <circle cx="80" cy="85" r="27" />
          <circle cx="80" cy="85" r="17" strokeWidth="1.4" />
          <g className="animSpin">
            <line x1="66" y1="71" x2="94" y2="99" strokeWidth="2.6" />
          </g>
          <circle cx="80" cy="85" r="3.5" fill={IVORY} stroke={stroke} strokeWidth="1" />
          <path d="M80,56 v6 M80,108 v6 M51,85 h6 M103,85 h6" stroke={accent} strokeWidth="2.6" />
          <path d="M60,65 l4,4 M100,101 l4,4" stroke={IVORY} strokeWidth="1.6" />
        </g>
      );
    case 7: // scroll: rolled parchment + quill over it (quill bobs)
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <rect x="54" y="74" width="48" height="28" fill={IVORY} />
          <ellipse cx="54" cy="88" rx="4.5" ry="14" fill="#e6d8b8" />
          <ellipse cx="102" cy="88" rx="4.5" ry="14" fill="#e6d8b8" />
          <path d="M62,82 h28 M62,88 h34 M62,94 h24" stroke="#c4b294" strokeWidth="1.6" />
          <g className="animBob">
            <path
              d="M96,98 C96,76 86,60 70,52 C84,58 94,70 98,84 C100,90 99,95 96,98 Z"
              fill={accent}
            />
            <line x1="96" y1="98" x2="74" y2="58" stroke={stroke} strokeWidth="1.2" />
          </g>
        </g>
      );
    case 8: // tome: closed book, spine band, clasp, emblem circle (sigil pulses)
      return (
        <g stroke={stroke} strokeWidth="1.4">
          <rect x="52" y="60" width="56" height="48" rx="4" fill={IVORY} />
          <rect x="52" y="60" width="12" height="48" rx="4" fill={accent} />
          <line x1="70" y1="62" x2="102" y2="62" stroke={stroke} strokeWidth="1.2" />
          <circle className="animPulseMark" cx="86" cy="84" r="9" fill="none" stroke={accent} strokeWidth="2.4" />
          <rect x="104" y="80" width="8" height="8" rx="1.5" fill={accent} />
          <line x1="52" y1="102" x2="108" y2="102" stroke={stroke} strokeWidth="1.2" />
        </g>
      );
    case 9: // mortarboard: cap band, board, button + tassel (tassel sways)
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <path d="M64,84 v12 q16,10 32,0 v-12 q-16,8 -32,0 Z" fill={IVORY} />
          <path d="M80,58 L114,72 L80,86 L46,72 Z" fill={IVORY} />
          <circle cx="80" cy="72" r="2.6" fill={accent} />
          <g className="animSway">
            <path d="M114,72 v20" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
            <path d="M110.5,91 h7 l-1.5,13 h-4 Z" fill={accent} />
          </g>
        </g>
      );
    case 10: // crown + globe (crown bobs, jewels twinkle)
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <circle cx="80" cy="96" r="18" fill={IVORY} />
          <ellipse cx="80" cy="96" rx="8" ry="18" fill="none" stroke={stroke} strokeWidth="1.4" />
          <line x1="62" y1="96" x2="98" y2="96" stroke={stroke} strokeWidth="1.4" />
          <g className="animBob">
            <path
              d="M66,64 L70,48 L78,58 L80,44 L82,58 L90,48 L94,64 Z"
              fill={accent}
            />
            <circle className="animTwinkle" cx="70" cy="46" r="2.4" fill={accent} />
            <circle className="animTwinkle" style={{ animationDelay: "0.5s" }} cx="80" cy="42" r="2.4" fill={accent} />
            <circle className="animTwinkle" style={{ animationDelay: "1s" }} cx="90" cy="46" r="2.4" fill={accent} />
          </g>
        </g>
      );
    default:
      return null;
  }
}

function RankBadge({ tier, size }: { tier: number; size: number }) {
  const p = paletteFor(tier);
  const id = `rb${tier}-${useId()}`;
  const stars = starPositions(starCount(tier));

  return (
    <svg
      viewBox="0 0 160 190"
      width={size}
      height={(size * 190) / 160}
      role="img"
      aria-label={`Rank ${tier} badge`}
    >
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.rimLight} />
          <stop offset="1" stopColor={p.rimDark} />
        </linearGradient>
        <linearGradient id={`${id}-field`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.fieldLight} />
          <stop offset="1" stopColor={p.fieldDark} />
        </linearGradient>
        <linearGradient id={`${id}-acc`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={p.accent} />
          <stop offset="1" stopColor={p.rimLight} />
        </linearGradient>
        <filter id={`${id}-blur`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id={`${id}-clip`}>
          <path d={SHIELD_PATH} />
        </clipPath>
        <clipPath id={`${id}-ribbon`}>
          <rect x="34" y="150" width="92" height="20" />
        </clipPath>
      </defs>

      {/* a. soft glow */}
      <ellipse className="animGlow" cx="80" cy="92" rx="62" ry="66" fill={p.accent} opacity="0.25" filter={`url(#${id}-blur)`} />

      {/* royal crown on top of the shield edge */}
      {tier === 10 && (
        <g className="animBob" style={{ animationDelay: ".4s" }} fill={p.accent} stroke={p.rimDark} strokeWidth="1">
          <path d="M62,24 L66,10 L74,18 L80,6 L86,18 L94,10 L98,24 Z" />
          <circle cx="66" cy="8" r="2.4" />
          <circle cx="80" cy="4" r="2.4" />
          <circle cx="94" cy="8" r="2.4" />
        </g>
      )}

      {/* b. shield rim */}
      <path d={SHIELD_PATH} fill={`url(#${id}-rim)`} />

      {/* c. inner field */}
      <path
        d={SHIELD_PATH}
        transform="translate(80 95) scale(.86) translate(-80 -95)"
        fill={`url(#${id}-field)`}
        stroke={p.rimLight}
        strokeWidth="1"
        opacity="0.98"
      />

      {/* d. diagonal sheen (sweeps left → right, clipped to the shield) */}
      <g clipPath={`url(#${id}-clip)`}>
        <polygon className="animSheen" points="34,30 78,30 44,120 30,120" fill="#fff" opacity="0.12" />
      </g>

      {/* e. emblem */}
      <Emblem tier={tier} accent={p.accent} />

      {/* g. stars above the ribbon */}
      {stars.map((s, i) => (
        <path key={i} className="animTwinkle" style={{ animationDelay: `${i * 0.35}s` }} d={STAR_PATH} transform={`translate(${s.x} ${s.y}) scale(.85)`} fill={IVORY} />
      ))}

      {/* f. ribbon banner */}
      <g>
        <path d="M34,152 L14,160 L24,164 L14,172 L40,170 Z" fill={p.rimDark} />
        <path d="M126,152 L146,160 L136,164 L146,172 L120,170 Z" fill={p.rimDark} />
        <rect x="34" y="150" width="92" height="20" fill={`url(#${id}-acc)`} stroke={p.rimDark} strokeWidth="0.8" />
        <g clipPath={`url(#${id}-ribbon)`}>
          <polygon className="animSheen" style={{ animationDelay: ".9s" }} points="40,150 62,150 48,170 26,170" fill="#fff" opacity="0.3" />
        </g>
        <text
          x="80"
          y="165"
          textAnchor="middle"
          fontFamily="'Bebas Neue', sans-serif"
          fontSize="15"
          letterSpacing="2"
          fontWeight="700"
          fill={p.rimDark}
        >
          {ROMAN[tier - 1]}
        </text>
      </g>
    </svg>
  );
}

// Swipe rail of all 10 tiers, centred on the current badge (hidden scrollbar).
function RankLadderCard() {
  const railRef = useRef<HTMLDivElement | null>(null);
  const centered = useRef(false);
  const drag = useRef({ on: false, x: 0, left: 0 });
  const cur = LADDER_TIERS[CURRENT_TIER - 1];
  const totalXp = XP_BEFORE + SESSION_XP;
  const curPct = Math.round(
    clampPct(((totalXp - TIER_FLOOR) / (TIER_NEXT - TIER_FLOOR)) * 100)
  );

  // Callback ref: runs pre-paint on mount → centre the current cell with no flash.
  const onRail = (el: HTMLDivElement | null) => {
    railRef.current = el;
    if (!el || centered.current) return;
    centered.current = true;
    const cell = el.querySelector<HTMLElement>("[data-cur='1']");
    if (!cell) return;
    const rr = el.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    el.scrollLeft += cr.left + cr.width / 2 - (rr.left + el.clientWidth / 2);
  };

  // Mouse drag-to-scroll (touch swipes use native overflow scrolling).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (e.pointerType !== "mouse" || !rail) return;
    drag.current = { on: true, x: e.clientX, left: rail.scrollLeft };
    rail.setPointerCapture(e.pointerId);
    rail.style.cursor = "grabbing";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!drag.current.on || !rail) return;
    rail.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endDrag = () => {
    drag.current.on = false;
    if (railRef.current) railRef.current.style.cursor = "";
  };

  return (
    <section className="card rankL" data-section="rank">
      <div className="lcHead">
        <div className="lcTitles">
          <h3 className="lcTitle">{cur.title}</h3>
          <span className="lcSub">Tier {CURRENT_TIER} / 10 · {fmt(totalXp)} XP · {curPct}%</span>
        </div>
        <span className="lcHint">scroll</span>
      </div>

      <div
        className="lcRail"
        ref={onRail}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {LADDER_TIERS.map((t) => {
          const isCurrent = t.tier === CURRENT_TIER;
          const isPast = t.tier < CURRENT_TIER;
          const p = paletteFor(t.tier);
          const pct = isPast ? 100 : isCurrent ? curPct : 0;
          return (
            <div
              key={t.tier}
              data-cur={isCurrent ? "1" : undefined}
              className={`lcCell ${isCurrent ? "lcCellCur" : ""} ${isPast ? "lcCellPast" : ""}`}
              style={isCurrent ? { borderColor: p.accent, boxShadow: `0 0 16px ${p.accent}55` } : undefined}
            >
              <div
                className="lcBadge"
                style={{ opacity: isPast || isCurrent ? 1 : 0.22 }}
                title={`T${t.tier} — ${t.title}`}
              >
                <RankBadge tier={t.tier} size={isCurrent ? 72 : 56} />
              </div>
              <span className="lcName" style={isCurrent ? { color: p.accent } : undefined}>
                {t.title}
              </span>
              <span className="lcXpBar">
                <span
                  className="lcXpFill"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${p.accent}, ${p.rimLight})`,
                  }}
                />
              </span>
              <span className="lcXpNeed">{xpShort(t.threshold)} XP</span>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .rankL { padding: 16px; }
        .lcHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .lcTitles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .lcTitle { margin: 0; font-size: 19px; font-weight: 800; line-height: 1.1; }
        .lcSub { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.45); }
        .lcHint {
          flex-shrink: 0; padding-top: 4px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
          color: rgba(255,255,255,0.35);
        }
        .lcRail {
          display: flex; gap: 10px;
          margin: 14px -16px 4px; padding: 4px 28px 10px;
          overflow-x: auto;
          scroll-snap-type: x proximity;
          scrollbar-width: none;
          cursor: grab;
          user-select: none;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent);
          mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent);
        }
        .lcRail::-webkit-scrollbar { display: none; }
        .lcCell {
          flex: 0 0 148px;
          scroll-snap-align: center;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 10px 6px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .lcCellPast { background: rgba(255,255,255,0.04); }
        .lcCellCur { background: rgba(255,255,255,0.08); }
        .lcBadge { display: flex; }
        .lcName {
          font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.75);
          max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .lcXpBar {
          display: block; height: 4px; width: 100%;
          border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden;
        }
        .lcXpFill { display: block; height: 100%; border-radius: 999px; }
        .lcXpNeed {
          font-size: 9px; font-weight: 700; letter-spacing: 0.4px;
          color: rgba(255,255,255,0.4);
        }
        @media (min-width: 1024px) {
          .rankL { padding: 20px; }
          .lcTitle { font-size: 21px; }
          .lcRail { margin: 16px -20px 6px; padding: 6px 40px 12px; }
          .lcCell { flex-basis: 158px; }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LEADERBOARD — rankings + per-round pips + crowns
// ════════════════════════════════════════════════════════════════════════════
function LeaderboardCard({
  leaderboard,
  roundWinner,
}: {
  leaderboard: PlayerStats[];
  roundWinner: Map<number, string>;
}) {
  return (
    <section className="card leaderboard">
      <div className="stHead">
        <h3 className="cardTitle">Leaderboard</h3>
      </div>
      <div className="stRows">
        {leaderboard.map((p, idx) => (
          <div key={p.id} className={`stRow ${p.isMe ? "stRowMe" : ""}`}>
            <span
              className="stMedal"
              style={
                idx < 3
                  ? { background: MEDAL_COLORS[idx], color: "#1a0d02" }
                  : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }
              }
            >
              {idx + 1}
            </span>
            <Avatar name={p.name} playerId={p.id} size={34} />
            <div className="stMain">
              <div className="stNameRow">
                <span className="stName">{p.name}</span>
                {p.isMe && <span className="stYou">YOU</span>}
              </div>
              <div className="stPips">
                {p.rows.map((r) => {
                  const acc = Math.round((r.locationScore + r.timeScore) / 2);
                  const won = roundWinner.get(r.roundIndex) === p.id;
                  return (
                    <span key={r.roundIndex} className="stPipWrap">
                      {won && <Crown size={10} className="stCrown" />}
                      <span className="stPip" style={{ background: getAccuracyColor(acc) }} />
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="stRight">
              <span className="stAcc" style={{ color: getAccuracyColor(p.avgAccuracy) }}>
                {p.avgAccuracy}%
              </span>
              <span className="stXp">+{fmt(p.totalScore)}</span>
            </div>
          </div>
        ))}
      </div>
      <span className="stLegend">pips = per-round accuracy · crown = round winner</span>

      <style jsx>{`
        .leaderboard { padding: 16px 16px 12px; }
        .cardTitle { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .stHead { margin-bottom: 12px; }
        .stRows { display: flex; flex-direction: column; gap: 8px; }
        .stRow {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
        }
        .stRowMe { border-color: rgba(251,146,60,0.55); background: rgba(251,146,60,0.06); }
        .stMedal {
          width: 22px; height: 22px; border-radius: 999px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 900;
        }
        .stMain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .stNameRow { display: flex; align-items: center; gap: 6px; }
        .stName { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stYou {
          font-size: 8px; font-weight: 900; letter-spacing: 0.6px; padding: 1px 6px;
          border-radius: 999px; background: rgba(251,146,60,0.2); color: var(--main-color);
          border: 1px solid rgba(251,146,60,0.4);
        }
        .stPips { display: flex; gap: 4px; }
        .stPipWrap { position: relative; display: flex; align-items: flex-end; }
        .stCrown { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); color: #f0c060; }
        .stPip { width: 12px; height: 6px; border-radius: 3px; display: block; }
        .stRight { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
        .stAcc { font-size: 15px; font-weight: 900; }
        .stXp { font-size: 10px; font-weight: 700; color: #f0c060; }
        .stLegend { display: block; margin-top: 10px; font-size: 9.5px; color: rgba(255,255,255,0.35); text-align: center; }
        @media (min-width: 1024px) {
          .leaderboard { padding: 20px 20px 14px; }
          .stRow { padding: 10px 12px; }
        }
        @media (hover: hover) {
          .stRow { transition: background 0.15s; }
          .stRow:not(.stRowMe):hover { background: rgba(255,255,255,0.05); }
          .stRowMe:hover { background: rgba(251,146,60,0.1); }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HIGHLIGHTS — best-score tiles (prod "Your Best Scores" parity) + chip cards.
// The redundant "Best round" chip is folded into the Combo tile.
// ════════════════════════════════════════════════════════════════════════════
function HighlightsCard({ rows }: { rows: Result[] }) {
  const combo = (r: Result) => (r.locationScore + r.timeScore) / 2;
  const closest = rows.reduce((b, r) => (r.distanceKm < b.distanceKm ? r : b), rows[0]);
  const sharpest = rows.reduce((b, r) => (r.yearDiff < b.yearDiff ? r : b), rows[0]);
  const toughest = rows.reduce((b, r) => (combo(r) < combo(b) ? r : b), rows[0]);

  const bestWhere = Math.ceil(Math.max(...rows.map((r) => r.locationScore)));
  const bestWhen = Math.ceil(Math.max(...rows.map((r) => r.timeScore)));
  const bestCombo = Math.ceil(
    Math.max(...rows.map((r) => (r.locationScore + r.timeScore) / 2))
  );

  const tiles: {
    Icon: React.ComponentType<{ size?: number | string; className?: string }>;
    disk: string;
    value: number;
    label: string;
  }[] = [
    { Icon: WhereIcon, disk: "var(--where-color)", value: bestWhere, label: "Where" },
    { Icon: WhenIcon, disk: "var(--when-color)", value: bestWhen, label: "When" },
    { Icon: Trophy, disk: "var(--main-color)", value: bestCombo, label: "Combo" },
  ];

  const chips: { Icon: LucideIcon; color: string; label: string; value: string; foot: string }[] = [
    { Icon: Crosshair, color: "#22d3ee", label: "Closest guess", value: `${fmt(closest.distanceKm)} km`, foot: `R${closest.roundIndex + 1}` },
    { Icon: Timer, color: "#8b5cf6", label: "Sharpest year", value: `±${sharpest.yearDiff} yr`, foot: `R${sharpest.roundIndex + 1}` },
    { Icon: Flame, color: "#ef4444", label: "Toughest round", value: `${Math.round(combo(toughest))}%`, foot: `R${toughest.roundIndex + 1} · ${ROUNDS[toughest.roundIndex].title}` },
  ];

  return (
    <section className="card hl">
      <h3 className="cardTitle">Highlights</h3>
      <div className="bsGrid">
        {tiles.map(({ Icon, disk, value, label }) => (
          <div className="bsTile" key={label}>
            <span className="bsDisk" style={{ background: disk }}>
              <Icon size={18} />
            </span>
            <div className="bsText">
              <span className="bsVal">
                {value}
                <AccuracySuffix />
              </span>
              <span className="bsLabel">{label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="hlRow">
        {chips.map(({ Icon, color, label, value, foot }, i) => (
          <div className="hlChip" key={i}>
            <span className="hlDisk" style={{ background: `${color}22`, borderColor: `${color}66` }}>
              <Icon size={15} style={{ color }} />
            </span>
            <span className="hlValue">{value}</span>
            <span className="hlLabel">{label}</span>
            <span className="hlFoot">{foot}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .hl { padding: 16px 0 16px 16px; overflow: hidden; }
        .cardTitle { margin: 0 16px 12px 0; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .bsGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0 16px 10px 0; }
        .bsTile {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 10px; border-radius: 12px; min-width: 0;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
        }
        .bsDisk {
          width: 34px; height: 34px; border-radius: 999px; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center; color: #fff;
        }
        .bsText { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .bsVal { font-size: 20px; font-weight: 400; line-height: 1; }
        .bsLabel { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; }
        .hlRow {
          display: flex; gap: 10px; overflow-x: auto; padding-right: 16px;
          scroll-snap-type: x mandatory; scrollbar-width: none;
        }
        .hlRow::-webkit-scrollbar { display: none; }
        .hlChip {
          min-width: 150px; scroll-snap-align: start;
          display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
          padding: 12px; border-radius: 14px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
        }
        .hlDisk {
          width: 30px; height: 30px; border-radius: 10px; border: 1px solid;
          display: flex; align-items: center; justify-content: center; margin-bottom: 4px;
        }
        .hlValue { font-size: 18px; font-weight: 900; }
        .hlLabel { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .hlFoot { font-size: 9.5px; font-weight: 600; color: rgba(255,255,255,0.35); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        @media (min-width: 1024px) {
          .hl { padding: 20px 0 20px 20px; }
          .cardTitle { margin-right: 20px; }
          .bsGrid { margin-right: 20px; gap: 12px; }
          .bsTile { padding: 12px 14px; gap: 10px; }
          .bsVal { font-size: 24px; }
          .hlRow { overflow-x: visible; padding-right: 20px; gap: 12px; }
          .hlChip { flex: 1 1 0; min-width: 0; }
        }
        @media (hover: hover) {
          .bsTile { transition: background 0.15s; }
          .bsTile:hover { background: rgba(255,255,255,0.06); }
          .hlChip { transition: background 0.15s; }
          .hlChip:hover { background: rgba(255,255,255,0.06); }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BADGES — earned tiles with per-tier counts
// ════════════════════════════════════════════════════════════════════════════
function BadgesCard({
  tiles,
  total,
}: {
  tiles: { src: string; label: string; tier: string; count: number }[];
  total: number;
}) {
  return (
    <section className="card badges">
      <div className="bdHead">
        <h3 className="cardTitle">Badges won</h3>
        <span className="bdCount">{total} badges</span>
      </div>
      {tiles.length === 0 ? (
        <span className="bdEmpty">No badges this game — 75%+ in a round earns bronze.</span>
      ) : (
        <div className="bdRow">
          {tiles.map((t) => (
            <div className="bdTile" key={`${t.label}-${t.tier}`}>
              <div className="bdImgWrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.src} alt={`${t.label} ${t.tier}`} className="bdImg" draggable={false} />
                <span className="bdBubble">×{t.count}</span>
              </div>
              <span className="bdLabel">{t.label}</span>
              <span className="bdTier" data-tier={t.tier}>{t.tier}</span>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .badges { padding: 16px; }
        .bdHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .cardTitle { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .bdCount { font-size: 11px; font-weight: 800; color: #f0c060; }
        .bdEmpty { font-size: 12px; color: rgba(255,255,255,0.45); }
        .bdRow { display: flex; flex-wrap: wrap; gap: 10px; }
        .bdTile {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 10px 8px; border-radius: 12px; min-width: 62px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
        }
        .bdImgWrap { position: relative; }
        .bdImg { width: 36px; height: 36px; object-fit: contain; display: block; }
        .bdBubble {
          position: absolute; top: -6px; right: -8px;
          font-size: 9px; font-weight: 900; padding: 0 5px; border-radius: 999px;
          background: rgba(20,20,24,0.95); border: 1px solid rgba(255,255,255,0.2);
        }
        .bdLabel { font-size: 10px; font-weight: 700; }
        .bdTier { font-size: 8.5px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; }
        .bdTier[data-tier="gold"] { color: #f0c060; }
        .bdTier[data-tier="silver"] { color: #cbd5e1; }
        .bdTier[data-tier="bronze"] { color: #d97706; }
        @media (min-width: 1024px) {
          .badges { padding: 20px; }
          .bdTile { min-width: 74px; padding: 12px 10px; }
          .bdImg { width: 44px; height: 44px; }
        }
        @media (hover: hover) {
          .bdTile { transition: background 0.15s; }
          .bdTile:hover { background: rgba(255,255,255,0.06); }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ROUNDS — snap carousel of photo cards (replaces the accordion)
// ════════════════════════════════════════════════════════════════════════════
function RoundsCard({
  mode,
  me,
  roundWinner,
  nameOf,
}: {
  mode: "compete" | "practice";
  me: PlayerStats;
  roundWinner: Map<number, string>;
  nameOf: (id: string) => string;
}) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const trackRef = useRef<HTMLDivElement | null>(null);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(Math.max(0, Math.min(ROUNDS.length - 1, idx)));
  };

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const myRow = (i: number) => me.rows.find((r) => r.roundIndex === i)!;

  return (
    <section className="card rounds">
      <h3 className="cardTitle">Rounds</h3>
      <div className="rdTrack" ref={trackRef} onScroll={onScroll}>
        {ROUNDS.map((round, i) => {
          const r = myRow(i);
          const acc = Math.round((r.locationScore + r.timeScore) / 2);
          const winnerId = roundWinner.get(i);
          const isOpen = expanded.has(i);
          const roundRows = [...RESULTS.filter((x) => x.roundIndex === i)]
            .sort((a, b) => b.score - a.score);
          return (
            <div className="rdCard" key={i}>
              <div className="rdPhoto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={round.imageUrl} alt={round.title} className="rdImg" draggable={false} />
                <div className="rdScrim" />
                <div className="rdPhotoMeta">
                  <span className="rdPill">R{i + 1}</span>
                  <div className="rdPhotoText">
                    <span className="rdTitle">{round.title}</span>
                    <span className="rdLoc">{round.year} · {round.locationName}</span>
                  </div>
                </div>
              </div>
              <div className="rdBody" onClick={() => toggle(i)}>
                <div className="rdBodyTop">
                  <span className="rdAcc" style={{ color: getAccuracyColor(acc) }}>{acc}%</span>
                  <div className="rdStats">
                    <span style={{ color: "var(--where-color)" }}>
                      {r.locationScore}% · {fmt(r.distanceKm)} km
                    </span>
                    <span style={{ color: "var(--when-color)" }}>
                      {r.timeScore}% · {r.yearDiff} yrs
                    </span>
                  </div>
                </div>
                {mode === "compete" && winnerId && (
                  <span className={`rdWonChip ${winnerId === VIEWER_ID ? "rdWonChipMe" : ""}`}>
                    <Avatar name={nameOf(winnerId)} playerId={winnerId} size={16} />
                    {winnerId === VIEWER_ID ? "You won" : `Won by ${nameOf(winnerId)}`}
                  </span>
                )}
                {isOpen && (
                  <div className="rdAll">
                    {roundRows.map((x) => (
                      <div className="rdAllRow" key={x.playerId}>
                        <Avatar name={nameOf(x.playerId)} playerId={x.playerId} size={18} />
                        <span className="rdAllName">{nameOf(x.playerId)}</span>
                        <span
                          className="rdAllPct"
                          style={{ color: getAccuracyColor(Math.round((x.locationScore + x.timeScore) / 2)) }}
                        >
                          {Math.round((x.locationScore + x.timeScore) / 2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="rdDots">
        {ROUNDS.map((_, i) => (
          <span key={i} className={`rdDot ${i === active ? "rdDotOn" : ""}`} />
        ))}
      </div>

      <style jsx>{`
        .rounds { padding: 16px 0 12px; overflow: hidden; }
        .cardTitle { margin: 0 16px 12px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .rdTrack {
          display: flex; gap: 12px; overflow-x: auto; padding: 0 16px;
          scroll-snap-type: x mandatory; scrollbar-width: none;
        }
        .rdTrack::-webkit-scrollbar { display: none; }
        .rdCard {
          min-width: 82%; scroll-snap-align: start; border-radius: 14px; overflow: hidden;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
        }
        .rdPhoto { position: relative; aspect-ratio: 16 / 9; }
        .rdImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .rdScrim {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(8,12,20,0) 40%, rgba(8,12,20,0.85) 100%);
        }
        .rdPhotoMeta { position: absolute; left: 10px; right: 10px; bottom: 8px; display: flex; align-items: flex-end; gap: 8px; }
        .rdPill {
          padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 900;
          background: rgba(8,12,20,0.7); border: 1px solid rgba(255,255,255,0.25);
        }
        .rdPhotoText { display: flex; flex-direction: column; min-width: 0; }
        .rdTitle { font-size: 12px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rdLoc { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.65); }
        .rdBody { padding: 10px 12px 12px; cursor: pointer; }
        .rdBodyTop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .rdAcc { font-size: 22px; font-weight: 900; }
        .rdStats { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 10.5px; font-weight: 700; }
        .rdWonChip {
          margin-top: 8px; display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 10px 3px 4px; border-radius: 999px; font-size: 10.5px; font-weight: 700;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.75);
        }
        .rdWonChipMe {
          background: rgba(251,146,60,0.14); border-color: rgba(251,146,60,0.5); color: var(--main-color);
        }
        .rdAll { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; }
        .rdAllRow { display: flex; align-items: center; gap: 8px; }
        .rdAllName { flex: 1; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rdAllPct { font-size: 12px; font-weight: 800; }
        .rdDots { display: flex; justify-content: center; gap: 6px; margin-top: 12px; }
        .rdDot { width: 6px; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.15); transition: all 0.25s; }
        .rdDotOn { background: var(--main-color); width: 16px; }
        @media (min-width: 1024px) {
          .rounds { padding: 20px 0 16px; }
          .cardTitle { margin: 0 20px 14px; }
          .rdTrack { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; overflow: visible; padding: 0 20px; }
          .rdCard { min-width: 0; }
          .rdTitle { white-space: normal; }
          .rdDots { display: none; }
        }
        @media (hover: hover) {
          .rdBody { transition: background 0.15s; }
          .rdBody:hover { background: rgba(255,255,255,0.05); }
        }
      `}</style>
    </section>
  );
}


