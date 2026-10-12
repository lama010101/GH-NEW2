"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Round Results V2 (per-round results UX rethink)
// Route: /prototype/round-results-v2   (direct access, self-contained)
//
// Improvements over the prod RoundCompleteSection flow:
//   Hero     — "round moment": placement headline, count-up accuracy ring,
//              round XP chip, delta vs your average, earned badge images
//   Event    — photo card with title scrim + expandable "what happened"
//   Versus   — "You vs the answer": WHERE + WHEN shown at once (prod hides one
//              behind tabs) — guess→answer rows, everyone's distance bars and
//              a shared year timeline against the correct-year tick
//   Standings— this-round / standings tabs, dual WHERE/WHEN pips per player,
//              winner crown, rank-delta arrows
//   Journey  — session strip: per-round cells colored by YOUR accuracy
//              (prod progress dots carry no information)
//   Dock     — sticky bar: countdown pill, ready avatars, optimistic
//              "Ready ✓" on Next
//
// All data is MOCK — the same players/scores as /prototype/round-results so
// the two treatments can be compared 1:1. Compete | Practice toggle in the
// proto bar.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Clock,
  Crown,
  MapPin,
  Medal,
  Settings,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getAccuracyColor } from "@/core/accuracyColor";

// ── Mock session (same numbers as /prototype/round-results) ─────────────────
const VIEWER_ID = "p1";
const CURRENT_ROUND_INDEX = 2; // 0-indexed -> round 3 of 5
const TOTAL_ROUNDS = 5;
const MY_ROUND_AVG = 84; // mock lifetime per-round average for the delta chip

type MockPlayer = { id: string; name: string; isHost: boolean };

const PLAYERS: MockPlayer[] = [
  { id: "p1", name: "Alex Rivera", isHost: true },
  { id: "p2", name: "Mina Kovač", isHost: false },
  { id: "p3", name: "Theo Lambert", isHost: false },
  { id: "p4", name: "Sara Bianchi", isHost: false },
];

const EVENT = {
  title: "Fall of the Berlin Wall",
  year: 1989,
  locationName: "Berlin, Germany",
  imageUrl: "/prototype/landing/hero/hero-1.webp",
  description:
    "Crowds gather at the Brandenburg Gate as the barrier dividing East and West Berlin is opened, a turning point that hastened German reunification.",
};

type Result = {
  playerId: string;
  score: number;
  accuracy: number;
  locationScore: number;
  timeScore: number;
  guessYear: number;
  distanceKm: number;
  cumulativeScore: number;
  cumulativeAccuracy: number;
  rankDelta: number; // standings movement produced by this round
};

const RESULTS: Result[] = [
  { playerId: "p2", score: 1980, accuracy: 99, locationScore: 100, timeScore: 98, guessYear: 1989, distanceKm: 0,   cumulativeScore: 8150, cumulativeAccuracy: 94, rankDelta: 0 },
  { playerId: "p1", score: 1840, accuracy: 94, locationScore: 96,  timeScore: 92, guessYear: 1991, distanceKm: 64,  cumulativeScore: 7240, cumulativeAccuracy: 89, rankDelta: 1 },
  { playerId: "p4", score: 1530, accuracy: 83, locationScore: 88,  timeScore: 78, guessYear: 1994, distanceKm: 174, cumulativeScore: 7300, cumulativeAccuracy: 79, rankDelta: -1 },
  { playerId: "p3", score: 1210, accuracy: 71, locationScore: 64,  timeScore: 78, guessYear: 1978, distanceKm: 364, cumulativeScore: 5230, cumulativeAccuracy: 68, rankDelta: 0 },
];

// Viewer's per-round accuracy so far (drives the journey strip).
const MY_ROUND_ACCS: (number | null)[] = [88, 76, 94, null, null];

const MY_BADGES = [
  { src: "/badges/combo_silver.webp", label: "Combo · Silver" },
  { src: "/badges/location_gold.webp", label: "Where · Gold" },
];

const READY_PLAYERS_INIT = ["p2"];

// ── Derived helpers ─────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();
const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const avatarHue = (playerId: string) => (playerId.charCodeAt(1) * 67) % 360;
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

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

// ── Ring atoms ──────────────────────────────────────────────────────────────
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
          <linearGradient id="rr2-accGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#f0c060" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#rr2-accGrad)" strokeWidth={sw}
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
  const offset = c - (clampPct(pct) / 100) * c;
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

// ── Page ────────────────────────────────────────────────────────────────────
export default function RoundResultsV2Page() {
  const [mode, setMode] = useState<"compete" | "practice">("compete");
  const [ready, setReady] = useState<string[]>(READY_PLAYERS_INIT);
  const [secsLeft, setSecsLeft] = useState(10);

  // Ticking auto-advance countdown (mirrors prod resultSecsLeft display).
  useEffect(() => {
    if (secsLeft <= 0) return;
    const id = setTimeout(() => setSecsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [secsLeft]);

  const me = useMemo(() => RESULTS.find((r) => r.playerId === VIEWER_ID)!, []);
  const roundXp = me.locationScore + me.timeScore;

  const thisRoundRows = useMemo(
    () => [...RESULTS].sort((a, b) => b.score - a.score),
    []
  );
  const standingsRows = useMemo(
    () => [...RESULTS].sort((a, b) => b.cumulativeAccuracy - a.cumulativeAccuracy),
    []
  );
  const myRank = thisRoundRows.findIndex((r) => r.playerId === VIEWER_ID) + 1;
  const winnerId = thisRoundRows[0].playerId;
  const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? id;

  const onNext = () => {
    if (!ready.includes(VIEWER_ID)) setReady((r) => [...r, VIEWER_ID]);
  };

  const iAmReady = ready.includes(VIEWER_ID);

  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Round Results · V2</span>
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
          playerCount={PLAYERS.length}
          winnerName={nameOf(winnerId)}
          roundXp={roundXp}
        />

        <EventCard />

        <VersusCard me={me} />

        {mode === "compete" && (
          <LeaderboardCard
            thisRoundRows={thisRoundRows}
            standingsRows={standingsRows}
            winnerId={winnerId}
          />
        )}

        <JourneyCard />

        <div className="dockSpacer" />
      </div>

      <div className="dock">
        <div className="dockLeft">
          {secsLeft > 0 ? (
            <span className="dockCount">
              <Timer size={13} />
              {secsLeft}s
            </span>
          ) : (
            <span className="dockCount dockCountIdle">–</span>
          )}
          {mode === "compete" && ready.length > 0 && (
            <span className="dockReady">
              {ready.map((pid) => (
                <span key={pid} className="dockReadyChip" title={`${nameOf(pid)} is ready`}>
                  <Avatar name={nameOf(pid)} playerId={pid} size={20} />
                  <span className="dockReadyCheck">✓</span>
                </span>
              ))}
            </span>
          )}
        </div>
        <button type="button" className="dockIcon" aria-label="Settings">
          <Settings size={18} />
        </button>
        <button
          type="button"
          className={`dockNext ${iAmReady ? "dockNextReady" : ""}`}
          onClick={onNext}
          disabled={iAmReady}
        >
          {iAmReady ? "Ready ✓" : (<>Next <ArrowRight size={15} /></>)}
        </button>
      </div>

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
        .dockSpacer { height: 84px; }

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
        .bigRingCenter { position: absolute; display: flex; align-items: baseline; gap: 1px; }
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
        .dockLeft { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; }
        .dockCount {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.65);
          font-variant-numeric: tabular-nums;
        }
        .dockCountIdle { color: rgba(255,255,255,0.3); }
        .dockReady { display: flex; align-items: center; }
        .dockReadyChip { position: relative; display: flex; margin-left: -6px; }
        .dockReadyChip:first-child { margin-left: 0; }
        .dockReadyCheck {
          position: absolute; right: -3px; bottom: -3px;
          width: 12px; height: 12px; border-radius: 999px;
          background: var(--gh-success); color: #06240f;
          font-size: 8px; font-weight: 900; line-height: 12px; text-align: center;
          border: 1.5px solid rgba(10,10,12,0.9);
        }
        .dockIcon {
          width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: #fff; cursor: pointer;
        }
        .dockNext {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          min-width: 118px; height: 44px; padding: 0 18px; border-radius: 14px; border: 0;
          cursor: pointer; background: linear-gradient(135deg, #fb923c, #f97316);
          color: #1a0d02; font-size: 14px; font-weight: 900; letter-spacing: 0.4px;
          box-shadow: 0 6px 20px rgba(249,115,22,0.35);
        }
        .dockNextReady {
          background: rgba(34,197,94,0.14); color: var(--gh-success);
          border: 1px solid rgba(34,197,94,0.5); box-shadow: none; cursor: default;
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
          .scroll > .hero { grid-column: 1 / span 5; }
          .scroll > .heroSolo { grid-column: 1 / -1; }
          .scroll > .event { grid-column: 6 / span 7; }
          .scroll > .lb { grid-column: 1 / span 5; }
          .scroll > .vs { grid-column: 6 / span 7; }
          .scroll > .lb ~ .vs { grid-column: 1 / -1; }
          .scroll > .journey { grid-column: 1 / -1; }
          .scroll > .dockSpacer { grid-column: 1 / -1; }
          .bgScrim { background: rgba(0,0,0,0.8); box-shadow: inset 0 0 260px rgba(0,0,0,0.75); }
          .protoBar { padding: 12px 24px; }
          .dock {
            left: 50%; right: auto; transform: translateX(-50%);
            bottom: 24px; width: min(560px, 92vw);
            border-radius: 18px; border: 1px solid rgba(255,255,255,0.14);
            box-shadow: 0 14px 44px rgba(0,0,0,0.55);
          }
        }

        /* ── Pointer affordances (non-touch) ── */
        @media (hover: hover) {
          .modeBtn { transition: color 0.15s; }
          .modeBtn:not(.modeBtnOn):hover { color: #fff; }
          .dockIcon, .dockNext { transition: all 0.15s; }
          .dockIcon:hover { background: rgba(255,255,255,0.12); }
          .dockNext:not(.dockNextReady):hover { filter: brightness(1.08); }
        }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HERO — the round result moment
// ════════════════════════════════════════════════════════════════════════════
function HeroCard({
  mode, me, myRank, playerCount, winnerName, roundXp,
}: {
  mode: "compete" | "practice";
  me: Result;
  myRank: number;
  playerCount: number;
  winnerName: string;
  roundXp: number;
}) {
  const xpShown = useCountUp(roundXp, 900);
  const medalColor = MEDAL_COLORS[myRank - 1] ?? "rgba(255,255,255,0.5)";
  const xpDelta = me.accuracy - MY_ROUND_AVG;
  const iWon = myRank === 1;

  return (
    <section className={`card hero ${mode === "practice" ? "heroSolo" : ""}`}>
      <span className="heroKicker">
        ROUND {CURRENT_ROUND_INDEX + 1} OF {TOTAL_ROUNDS} · {EVENT.title.toUpperCase()}
      </span>

      {mode === "compete" ? (
        <div className="heroPlaceRow">
          <span className="heroPlace">{ordinal(myRank)}</span>
          <div className="heroPlaceMeta">
            <span className="heroOf">of {playerCount} players</span>
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
          <span className="heroPlace heroPlaceSolo">Nice round</span>
        </div>
      )}
      <span className="heroSub">
        {mode === "compete"
          ? iWon
            ? "You took the round"
            : `${winnerName} took the round`
          : "Solo practice"}
      </span>

      <div className="heroRingWrap">
        <BigRing pct={me.accuracy} />
      </div>

      <div className="heroChipRow">
        <span className="heroXpChip">+{fmt(Math.round(xpShown))} XP</span>
        <span
          className="heroDelta"
          style={{ color: xpDelta >= 0 ? "var(--gh-success)" : "var(--gh-danger)" }}
        >
          {xpDelta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {xpDelta >= 0 ? "+" : ""}{xpDelta}% vs your avg ({MY_ROUND_AVG}%)
        </span>
      </div>

      <div className="heroMinis">
        <div className="heroMini">
          <div className="heroMiniHead">
            <MapPin size={13} strokeWidth={2.5} style={{ color: "var(--where-color)" }} />
            <span style={{ color: "var(--where-color)" }}>WHERE</span>
          </div>
          <MiniRing pct={me.locationScore} color="var(--where-color)" />
          <span className="heroMiniErr">
            {me.distanceKm === 0 ? "exact spot" : `${fmt(me.distanceKm)} km off`}
          </span>
        </div>
        <div className="heroMini">
          <div className="heroMiniHead">
            <Clock size={13} strokeWidth={2.5} style={{ color: "var(--when-color)" }} />
            <span style={{ color: "var(--when-color)" }}>WHEN</span>
          </div>
          <MiniRing pct={me.timeScore} color="var(--when-color)" />
          <span className="heroMiniErr">
            ±{Math.abs(me.guessYear - EVENT.year)} yr{Math.abs(me.guessYear - EVENT.year) === 1 ? "" : "s"} off
          </span>
        </div>
      </div>

      {MY_BADGES.length > 0 && (
        <div className="heroBadges">
          {MY_BADGES.map((b) => (
            <span key={b.src} className="heroBadge" title={b.label}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt={b.label} className="heroBadgeImg" />
            </span>
          ))}
        </div>
      )}

      <style jsx>{`
        .hero { padding: 22px 18px 18px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .heroKicker {
          font-size: 10px; font-weight: 800; letter-spacing: 2px; color: rgba(255,255,255,0.5);
          max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .heroPlaceRow { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
        .heroPlace { font-size: 44px; font-weight: 900; line-height: 1; }
        .heroPlaceSolo { font-size: 30px; }
        .heroPlaceMeta { display: flex; align-items: center; gap: 8px; }
        .heroOf { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.55); }
        .heroMedal {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 9px; border-radius: 999px; border: 1px solid;
          font-size: 9px; font-weight: 800; letter-spacing: 1px;
        }
        .heroSub { margin-top: 6px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.55); }
        .heroRingWrap { margin: 16px 0 10px; }
        .heroChipRow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .heroXpChip {
          padding: 4px 14px; border-radius: 999px;
          background: rgba(240,192,96,0.12); border: 1px solid rgba(240,192,96,0.4);
          color: #f0c060; font-size: 14px; font-weight: 800;
        }
        .heroDelta { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; }
        .heroMinis { display: flex; gap: 12px; margin-top: 16px; width: 100%; }
        .heroMini {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 12px 8px; border-radius: 14px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
        }
        .heroMiniHead { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 800; letter-spacing: 1px; }
        .heroMiniErr { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.45); }
        .heroBadges { display: flex; gap: 10px; margin-top: 14px; }
        .heroBadge {
          display: flex; padding: 6px; border-radius: 12px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
        }
        .heroBadgeImg { width: 42px; height: 42px; object-fit: contain; display: block; }
        @media (min-width: 1024px) {
          .hero { padding: 30px 24px 24px; }
          .heroPlace { font-size: 54px; }
          .heroPlaceSolo { font-size: 36px; }
          .heroSub { font-size: 13px; }
          .heroMini { padding: 14px 10px; }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EVENT — photo card with title scrim + expandable context
// ════════════════════════════════════════════════════════════════════════════
function EventCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card event">
      <div className="evImgWrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={EVENT.imageUrl} alt={EVENT.title} className="evImg" />
        <div className="evScrim" />
        <div className="evOverlay">
          <span className="evTitle">{EVENT.title}</span>
          <div className="evChips">
            <span className="evChip evChipWhen"><Clock size={11} />{EVENT.year}</span>
            <span className="evChip evChipWhere"><MapPin size={11} />{EVENT.locationName}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="evCtxBtn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <BookOpen size={13} />
        <span>What happened</span>
        <ChevronDown size={14} className={`evCtxChevron ${open ? "evCtxChevronOpen" : ""}`} />
      </button>
      {open && <p className="evCtxBody">{EVENT.description}</p>}

      <style jsx>{`
        .event { overflow: hidden; }
        .evImgWrap { position: relative; }
        .evImg { display: block; width: 100%; height: 168px; object-fit: cover; }
        .evScrim {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(8,8,10,0.92) 100%);
        }
        .evOverlay {
          position: absolute; left: 0; right: 0; bottom: 0;
          display: flex; flex-direction: column; gap: 6px; padding: 12px 14px;
        }
        .evTitle { font-size: 17px; font-weight: 900; line-height: 1.15; }
        .evChips { display: flex; gap: 6px; flex-wrap: wrap; }
        .evChip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 9px; border-radius: 999px;
          font-size: 10.5px; font-weight: 800;
          background: rgba(10,10,12,0.55); border: 1px solid rgba(255,255,255,0.14);
          backdrop-filter: blur(4px);
        }
        .evChipWhen { color: var(--when-color); }
        .evChipWhere { color: var(--where-color); }
        .evCtxBtn {
          width: 100%; display: flex; align-items: center; gap: 7px;
          padding: 10px 14px; border: 0; cursor: pointer;
          background: transparent; color: rgba(255,255,255,0.7);
          font-size: 11.5px; font-weight: 800; letter-spacing: 0.4px;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .evCtxChevron { margin-left: auto; transition: transform 0.2s; color: rgba(255,255,255,0.4); }
        .evCtxChevronOpen { transform: rotate(180deg); }
        .evCtxBody {
          margin: 0; padding: 0 14px 13px;
          font-size: 12px; line-height: 1.55; color: rgba(255,255,255,0.62);
        }
        @media (min-width: 1024px) {
          .evImg { height: 210px; }
          .evTitle { font-size: 20px; }
        }
        @media (hover: hover) {
          .evCtxBtn:hover { color: #fff; }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VERSUS — you vs the answer, plus everyone's errors at a glance
// ════════════════════════════════════════════════════════════════════════════
function VersusCard({ me }: { me: Result }) {
  const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? id;

  // WHEN timeline scale: all guesses + the correct year, padded and 5-rounded.
  const years = [EVENT.year, ...RESULTS.map((r) => r.guessYear)];
  const rawLo = Math.min(...years);
  const rawHi = Math.max(...years);
  const pad = Math.max(2, Math.round((rawHi - rawLo) * 0.18));
  const lo = Math.floor((rawLo - pad) / 5) * 5;
  const hi = Math.ceil((rawHi + pad) / 5) * 5;
  const span = Math.max(1, hi - lo);
  const pos = (y: number) => `${(((y - lo) / span) * 100).toFixed(2)}%`;

  // Label side alternates by sorted position so adjacent labels don't collide.
  const timelineRows = [...RESULTS].sort((a, b) => a.guessYear - b.guessYear);

  const maxDist = Math.max(1, ...RESULTS.map((r) => r.distanceKm));
  const distRows = [...RESULTS].sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <section className="card vs">
      <h3 className="cardTitle">You vs the answer</h3>

      <div className="vsRows">
        <div className="vsRow">
          <span className="vsIcon" style={{ color: "var(--where-color)", background: "rgba(34,211,238,0.1)", borderColor: "rgba(34,211,238,0.3)" }}>
            <MapPin size={14} />
          </span>
          <div className="vsMid">
            <span className="vsGuess">{me.distanceKm === 0 ? "Exact spot" : `${fmt(me.distanceKm)} km away`}</span>
            <span className="vsArrow">→</span>
            <span className="vsAnswer">{EVENT.locationName}</span>
          </div>
          <span className="vsScore" style={{ color: getAccuracyColor(me.locationScore) }}>{me.locationScore}</span>
        </div>
        <div className="vsRow">
          <span className="vsIcon" style={{ color: "var(--when-color)", background: "rgba(139,92,246,0.12)", borderColor: "rgba(139,92,246,0.35)" }}>
            <Clock size={14} />
          </span>
          <div className="vsMid">
            <span className="vsGuess">{me.guessYear}</span>
            <span className="vsArrow">→</span>
            <span className="vsAnswer">{EVENT.year}</span>
            <span className="vsOff">±{Math.abs(me.guessYear - EVENT.year)} yrs</span>
          </div>
          <span className="vsScore" style={{ color: getAccuracyColor(me.timeScore) }}>{me.timeScore}</span>
        </div>
      </div>

      {/* WHERE — everyone's distance off */}
      <div className="vsViz">
        <span className="vsVizLabel"><MapPin size={11} /> Everyone's distance off</span>
        <div className="vsDistBars">
          {distRows.map((r) => {
            const isMe = r.playerId === VIEWER_ID;
            const hue = avatarHue(r.playerId);
            return (
              <div key={r.playerId} className={`vsDistRow ${isMe ? "vsDistRowMe" : ""}`}>
                <span className="vsDistInit" style={{ background: `hsl(${hue} 55% 40%)` }}>
                  {initials(nameOf(r.playerId))}
                </span>
                <div className="vsDistTrack">
                  <span
                    className="vsDistFill"
                    style={{
                      width: `${Math.max(2.5, (r.distanceKm / maxDist) * 100)}%`,
                      background: isMe
                        ? "linear-gradient(90deg, #fb923c, #f97316)"
                        : `hsl(${hue} 45% 45%)`,
                    }}
                  />
                </div>
                <span className="vsDistVal">{r.distanceKm === 0 ? "exact" : `${fmt(r.distanceKm)} km`}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* WHEN — everyone's year vs the correct tick */}
      <div className="vsViz">
        <span className="vsVizLabel"><Clock size={11} /> Everyone's year vs the answer</span>
        <div className="vsTl">
          <div className="vsTlAxis" />
          <span className="vsTlTick" style={{ left: pos(EVENT.year) }}>
            <span className="vsTlTickLabel">{EVENT.year}</span>
          </span>
          {timelineRows.map((r, i) => {
            const isMe = r.playerId === VIEWER_ID;
            const hue = avatarHue(r.playerId);
            const above = i % 2 === 0;
            return (
              <span
                key={r.playerId}
                className={`vsTlDot ${above ? "vsTlDotAbove" : "vsTlDotBelow"} ${isMe ? "vsTlDotMe" : ""}`}
                style={{ left: pos(r.guessYear) }}
              >
                <span
                  className="vsTlTag"
                  style={isMe ? { color: "#fb923c" } : undefined}
                >
                  {r.guessYear}
                </span>
                <span
                  className="vsTlPin"
                  style={{
                    background: `hsl(${hue} 55% ${isMe ? 58 : 45}%)`,
                    boxShadow: isMe ? "0 0 0 2px #fb923c" : "none",
                  }}
                />
              </span>
            );
          })}
          <span className="vsTlBound" style={{ left: 0 }}>{lo}</span>
          <span className="vsTlBound" style={{ right: 0 }}>{hi}</span>
        </div>
      </div>

      <span className="vsLegend">bars = km off · gold tick = correct year</span>

      <style jsx>{`
        .vs { padding: 16px 16px 12px; }
        .cardTitle { margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }

        .vsRows { display: flex; flex-direction: column; gap: 8px; }
        .vsRow {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 11px; border-radius: 12px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
        }
        .vsIcon {
          width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; border: 1px solid;
        }
        .vsMid { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
        .vsGuess { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.85); }
        .vsArrow { font-size: 12px; color: rgba(255,255,255,0.35); }
        .vsAnswer { font-size: 13px; font-weight: 800; }
        .vsOff { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.4); }
        .vsScore { font-size: 18px; font-weight: 900; font-variant-numeric: tabular-nums; }

        .vsViz { margin-top: 14px; }
        .vsVizLabel {
          display: flex; align-items: center; gap: 5px; margin-bottom: 8px;
          font-size: 10px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase;
          color: rgba(255,255,255,0.45);
        }

        .vsDistBars { display: flex; flex-direction: column; gap: 6px; }
        .vsDistRow { display: flex; align-items: center; gap: 8px; }
        .vsDistRowMe .vsDistVal { color: var(--main-color); }
        .vsDistInit {
          width: 22px; height: 22px; border-radius: 999px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 8.5px; font-weight: 800; color: #fff;
        }
        .vsDistTrack {
          flex: 1; height: 8px; border-radius: 999px; overflow: hidden;
          background: rgba(255,255,255,0.06);
        }
        .vsDistFill { display: block; height: 100%; border-radius: 999px; }
        .vsDistVal {
          width: 52px; flex-shrink: 0; text-align: right;
          font-size: 10.5px; font-weight: 800; color: rgba(255,255,255,0.6);
          font-variant-numeric: tabular-nums;
        }

        .vsTl { position: relative; height: 74px; margin: 4px 6px 0; }
        .vsTlAxis {
          position: absolute; left: 0; right: 0; top: 50%; height: 2px;
          transform: translateY(-50%); border-radius: 2px;
          background: rgba(255,255,255,0.12);
        }
        .vsTlTick {
          position: absolute; top: 50%; transform: translate(-50%, -50%);
          width: 3px; height: 30px; border-radius: 2px;
          background: var(--gh-gold); box-shadow: 0 0 10px rgba(240,192,96,0.55);
        }
        .vsTlTickLabel {
          position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
          font-size: 10px; font-weight: 900; color: var(--gh-gold);
        }
        .vsTlDot { position: absolute; top: 50%; transform: translateX(-50%); }
        .vsTlPin {
          display: block; width: 12px; height: 12px; border-radius: 999px;
          margin: -6px 0 0 -6px; transform: translateY(0); border: 1.5px solid rgba(10,10,12,0.85);
        }
        .vsTlDotMe .vsTlPin { width: 14px; height: 14px; margin: -7px 0 0 -7px; }
        .vsTlTag {
          position: absolute; left: 50%; transform: translateX(-50%);
          font-size: 9px; font-weight: 800; color: rgba(255,255,255,0.55);
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .vsTlDotAbove .vsTlTag { bottom: 12px; }
        .vsTlDotBelow .vsTlTag { top: 12px; }
        .vsTlBound {
          position: absolute; bottom: -2px;
          font-size: 8.5px; font-weight: 700; color: rgba(255,255,255,0.3);
          font-variant-numeric: tabular-nums;
        }

        .vsLegend { display: block; margin-top: 12px; font-size: 9.5px; color: rgba(255,255,255,0.35); text-align: center; }
        @media (min-width: 1024px) {
          .vs { padding: 20px 20px 14px; }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LEADERBOARD — this round / standings, dual WHERE/WHEN pips + rank delta
// ════════════════════════════════════════════════════════════════════════════
function LeaderboardCard({
  thisRoundRows,
  standingsRows,
  winnerId,
}: {
  thisRoundRows: Result[];
  standingsRows: Result[];
  winnerId: string;
}) {
  const [tab, setTab] = useState<"round" | "standings">("round");
  const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? id;
  const rows = tab === "round" ? thisRoundRows : standingsRows;

  return (
    <section className="card lb">
      <div className="lbHead">
        <h3 className="cardTitle">Leaderboard</h3>
        <div className="lbTabs">
          <button
            type="button"
            className={`lbTab ${tab === "round" ? "lbTabOn" : ""}`}
            onClick={() => setTab("round")}
          >
            This round
          </button>
          <button
            type="button"
            className={`lbTab ${tab === "standings" ? "lbTabOn" : ""}`}
            onClick={() => setTab("standings")}
          >
            Standings
          </button>
        </div>
      </div>

      <div className="lbRows">
        {rows.map((r, idx) => {
          const isMe = r.playerId === VIEWER_ID;
          const acc = tab === "round" ? r.accuracy : r.cumulativeAccuracy;
          const val = tab === "round" ? `+${fmt(r.score)}` : `${Math.round(r.cumulativeAccuracy)}%`;
          return (
            <div key={r.playerId} className={`lbRow ${isMe ? "lbRowMe" : ""}`}>
              <span
                className="lbMedal"
                style={
                  idx < 3
                    ? { background: MEDAL_COLORS[idx], color: "#1a0d02" }
                    : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }
                }
              >
                {idx + 1}
              </span>
              <span className="lbAvatarWrap">
                <Avatar name={nameOf(r.playerId)} playerId={r.playerId} size={32} />
                {tab === "round" && r.playerId === winnerId && (
                  <Crown size={11} className="lbCrown" />
                )}
              </span>
              <div className="lbMain">
                <div className="lbNameRow">
                  <span className="lbName">{nameOf(r.playerId)}</span>
                  {isMe && <span className="lbYou">YOU</span>}
                </div>
                <div className="lbPips">
                  <span
                    className="lbPip"
                    style={{ background: getAccuracyColor(r.locationScore) }}
                    title={`WHERE ${r.locationScore}`}
                  />
                  <span
                    className="lbPip lbPipWhen"
                    style={{ background: getAccuracyColor(r.timeScore) }}
                    title={`WHEN ${r.timeScore}`}
                  />
                </div>
              </div>
              <div className="lbRight">
                <span className="lbVal" style={{ color: getAccuracyColor(acc) }}>{val}</span>
                {tab === "standings" && r.rankDelta !== 0 && (
                  <span
                    className="lbDelta"
                    style={{ color: r.rankDelta > 0 ? "var(--gh-success)" : "var(--gh-danger)" }}
                  >
                    {r.rankDelta > 0 ? "▲" : "▼"}{Math.abs(r.rankDelta)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <span className="lbLegend">
        {tab === "round" ? "crown = round winner · pips = WHERE / WHEN score" : "arrow = rank change after this round"}
      </span>

      <style jsx>{`
        .lb { padding: 16px 16px 12px; }
        .cardTitle { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .lbHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .lbTabs {
          display: flex; gap: 2px; padding: 2px; border-radius: 999px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09);
        }
        .lbTab {
          border: 0; padding: 4px 11px; border-radius: 999px; cursor: pointer;
          font-size: 10.5px; font-weight: 800; color: rgba(255,255,255,0.55); background: transparent;
        }
        .lbTabOn { background: rgba(255,255,255,0.14); color: #fff; }
        .lbRows { display: flex; flex-direction: column; gap: 8px; }
        .lbRow {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
        }
        .lbRowMe { border-color: rgba(251,146,60,0.55); background: rgba(251,146,60,0.06); }
        .lbMedal {
          width: 22px; height: 22px; border-radius: 999px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 900;
        }
        .lbAvatarWrap { position: relative; display: flex; flex-shrink: 0; }
        .lbCrown { position: absolute; top: -7px; right: -5px; color: #f0c060; }
        .lbMain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .lbNameRow { display: flex; align-items: center; gap: 6px; }
        .lbName { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lbYou {
          font-size: 8px; font-weight: 900; letter-spacing: 0.6px; padding: 1px 6px;
          border-radius: 999px; background: rgba(251,146,60,0.2); color: var(--main-color);
          border: 1px solid rgba(251,146,60,0.4);
        }
        .lbPips { display: flex; gap: 4px; }
        .lbPip { width: 22px; height: 5px; border-radius: 3px; display: block; }
        .lbRight { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
        .lbVal { font-size: 14px; font-weight: 900; font-variant-numeric: tabular-nums; }
        .lbDelta { font-size: 10px; font-weight: 800; }
        .lbLegend { display: block; margin-top: 10px; font-size: 9.5px; color: rgba(255,255,255,0.35); text-align: center; }
        @media (min-width: 1024px) {
          .lb { padding: 20px 20px 14px; }
          .lbRow { padding: 10px 12px; }
        }
        @media (hover: hover) {
          .lbRow { transition: background 0.15s; }
          .lbRow:not(.lbRowMe):hover { background: rgba(255,255,255,0.05); }
          .lbRowMe:hover { background: rgba(251,146,60,0.1); }
          .lbTab { transition: color 0.15s; }
          .lbTab:not(.lbTabOn):hover { color: #fff; }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// JOURNEY — session strip: per-round cells colored by YOUR accuracy
// ════════════════════════════════════════════════════════════════════════════
function JourneyCard() {
  return (
    <section className="card journey">
      <div className="jnHead">
        <h3 className="cardTitle">Session journey</h3>
        <span className="jnSub">Round {CURRENT_ROUND_INDEX + 1} of {TOTAL_ROUNDS}</span>
      </div>
      <div className="jnStrip">
        {MY_ROUND_ACCS.map((acc, i) => {
          const isCurrent = i === CURRENT_ROUND_INDEX;
          const done = acc != null;
          return (
            <div key={i} className={`jnCell ${isCurrent ? "jnCellNow" : ""} ${done ? "" : "jnCellFuture"}`}>
              <span className="jnRound">R{i + 1}</span>
              <span
                className="jnBar"
                style={
                  done
                    ? { background: getAccuracyColor(acc), height: `${18 + (acc / 100) * 26}px` }
                    : { background: "rgba(255,255,255,0.08)", height: "18px" }
                }
              >
                {isCurrent && <span className="jnNow" />}
              </span>
              <span className="jnAcc" style={done ? { color: getAccuracyColor(acc) } : undefined}>
                {done ? `${acc}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <span className="jnLegend">bar height + color = your accuracy that round</span>

      <style jsx>{`
        .journey { padding: 16px 16px 12px; }
        .cardTitle { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .jnHead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        .jnSub { font-size: 10.5px; font-weight: 700; color: rgba(255,255,255,0.45); }
        .jnStrip { display: flex; align-items: flex-end; gap: 8px; }
        .jnCell {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
          padding: 8px 4px 6px; border-radius: 12px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
        }
        .jnCellNow { border-color: rgba(251,146,60,0.55); background: rgba(251,146,60,0.07); }
        .jnCellFuture { border-style: dashed; }
        .jnRound { font-size: 9px; font-weight: 800; letter-spacing: 0.6px; color: rgba(255,255,255,0.45); }
        .jnBar {
          position: relative; width: 100%; max-width: 34px; border-radius: 6px;
          display: flex; align-items: flex-end; justify-content: center;
        }
        .jnNow {
          position: absolute; top: -4px;
          width: 8px; height: 8px; border-radius: 999px;
          background: var(--main-color); box-shadow: 0 0 8px rgba(251,146,60,0.8);
        }
        .jnAcc { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.35); font-variant-numeric: tabular-nums; }
        .jnLegend { display: block; margin-top: 10px; font-size: 9.5px; color: rgba(255,255,255,0.35); text-align: center; }
        @media (min-width: 1024px) {
          .journey { padding: 20px 20px 14px; }
          .jnStrip { gap: 12px; }
          .jnBar { max-width: 46px; }
        }
      `}</style>
    </section>
  );
}
