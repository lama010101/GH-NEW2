"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Profile V2 (profile-page UX rethink)
// Route: /prototype/profile-v2   (direct access, self-contained)
//
// Improvements over the old /prototype/profile mock:
//   Hero      — the avatar IS the accuracy stat: 84px circle wrapped in a
//               gradient accuracy ring, LV pill, streak / rank / percentile
//               chips, inline name edit (Mine) or Follow pill (Public)
//   Avatar    — the historical figure behind the avatar (mirrors prod's
//               avatars-table card: name / bio / born / died)
//   Rank      — swipe-rail ladder of the 10 animated SVG tier shields from
//               /prototype/rank-badges-svg, centred on the current tier
//   Split     — WHERE/WHEN bars with real error units + computed insights
//   Stats     — 4 tiles; the accuracy tile carries an 8-week sparkline
//   Modes     — Daily / Level Up / Practice mini rings
//   Badges    — tier tiles + dimension bars + recent-earned shelf
//   Era/Reg   — ONE merged card: Era|Region x Accuracy|Rounds matrix
//   Account   — email / member since / player id / sign out  (Mine only)
//
// protoBar toggle: Mine | Public — Public = viewing someone else's profile
// (hides the pencil, name edit, Account card + Sign out; shows Follow).
// All data is MOCK and held in local constants. No dock — dockSpacer only.
// ============================================================================

import React, { useId, useRef, useState } from "react";
import {
  MapPin,
  Clock,
  Pencil,
  Check,
  UserPlus,
  UserCheck,
  LogOut,
  Trophy,
  Crosshair,
  TrendingUp,
} from "lucide-react";
import { getAccuracyColor } from "@/core/accuracyColor";

// ── Mock profile (values mirror src/app/prototype/profile/page.tsx) ──────────
const PROFILE = {
  playerId: "p1",
  displayName: "Alex Rivera",
  handle: "alexrivera",
  joined: "Mar 2024",
  joinedFull: "March 2024",
  email: "alex.rivera@example.com",
  level: 14,
  avgAccuracy: 87,
  whereAccuracy: 84,
  whenAccuracy: 90,
  whereAvgKm: 96,           // average location error
  whenAvgYrs: 4,            // average year error
  totalXp: 124_800,
  roundsPlayed: 642,
  gamesPlayed: 138,
  dayStreak: 23,
  weeklyAccuracy: [81, 83, 80, 85, 84, 86, 85, 87], // last 8 weeks
};

// Mock historical avatar (shape mirrors prod's ProfileHistoricalAvatar built
// from the avatars table: first_name+last_name / description / born / died).
const HIST_AVATAR = {
  name: "Ibn Battuta",
  description:
    "Moroccan scholar and explorer who covered ~120,000 km across Africa and Asia — more than any other traveller of his age.",
  bornLabel: "Born 24 Feb 1304, Tangier, Morocco",
  diedLabel: "Died 1369, Marrakesh, Morocco",
};

// Mock rank-tier window for the ladder's current tier (T5 Explorer:
// 50,000 → 125,000 XP — mirrors src/core/rank.ts thresholds).
const CURRENT_TIER = 5;
const TIER_FLOOR = 50_000;
const TIER_NEXT = 125_000;

type AxisRow = { label: string; span?: string; percent: number; count: number };

const ERAS: AxisRow[] = [
  { label: "Contemporary", span: "1945–present", percent: 92, count: 214 },
  { label: "Modern", span: "1800–1945", percent: 88, count: 168 },
  { label: "Early Modern", span: "1500–1800", percent: 79, count: 132 },
  { label: "Medieval", span: "500–1500", percent: 71, count: 84 },
  { label: "Ancient", span: "3000 BC–500", percent: 63, count: 44 },
];

const REGIONS: AxisRow[] = [
  { label: "Europe", percent: 94, count: 186 },
  { label: "North America", percent: 88, count: 142 },
  { label: "Oceania", percent: 82, count: 38 },
  { label: "Asia", percent: 79, count: 98 },
  { label: "South America", percent: 71, count: 64 },
  { label: "Africa", percent: 65, count: 52 },
];

const MODES = [
  { name: "Daily", accuracy: 89, sub: "64 games", accent: "#3b82f6", streak: true },
  { name: "Level Up", accuracy: 85, sub: "Level 23", accent: "#8b5cf6", streak: false },
  { name: "Practice", accuracy: 82, sub: "51 games", accent: "#fb923c", streak: false },
];

const BADGE_TIERS = [
  { label: "Gold", count: 41, color: "#f0c060" },
  { label: "Silver", count: 76, color: "#cbd5e1" },
  { label: "Bronze", count: 118, color: "#d97706" },
];

const BADGE_DIMS = [
  { label: "Year", count: 88, color: "#8b5cf6" },
  { label: "Location", count: 94, color: "#22d3ee" },
  { label: "Combo", count: 53, color: "#f0c060" },
];

const RECENT_BADGES = [
  { src: "/badges/location_gold.webp", caption: "R3 · Gold" },
  { src: "/badges/year_gold.webp", caption: "R1 · Gold" },
  { src: "/badges/combo_silver.webp", caption: "R5 · Silver" },
  { src: "/badges/location_silver.webp", caption: "R2 · Silver" },
  { src: "/badges/year_bronze.webp", caption: "R4 · Bronze" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();
const xpShort = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
    : `${n}`;
const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const avatarHue = (playerId: string) => (playerId.charCodeAt(1) * 67) % 360;
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

// ── Ring / sparkline atoms ───────────────────────────────────────────────────
function AvatarRing({ pct, name, playerId }: { pct: number; name: string; playerId: string }) {
  const av = 84;              // avatar circle diameter
  const sw = 6;               // ring stroke
  const size = av + sw * 2;   // svg size — ring hugs the avatar
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clampPct(pct) / 100) * c;
  const hue = avatarHue(playerId);
  return (
    <div className="avRing" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="pv2-accGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#f0c060" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#pv2-accGrad)" strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        className="avCircle"
        style={{
          width: av, height: av, fontSize: 30,
          background: `linear-gradient(135deg, hsl(${hue} 62% 46%), hsl(${(hue + 40) % 360} 62% 30%))`,
        }}
      >
        {initials(name)}
      </span>

      <style jsx>{`
        .avRing { position: relative; display: flex; align-items: center; justify-content: center; }
        .avCircle {
          position: absolute; border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; color: #fff; border: 1px solid rgba(255,255,255,0.18);
        }
      `}</style>
    </div>
  );
}

function TinyRing({ pct, color, size = 44 }: { pct: number; color: string; size?: number }) {
  const sw = 4;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clampPct(pct) / 100) * c;
  return (
    <div className="tinyRing" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="tinyRingVal" style={{ color }}>{Math.round(pct)}</span>

      <style jsx>{`
        .tinyRing { position: relative; display: flex; align-items: center; justify-content: center; }
        .tinyRingVal { position: absolute; font-size: 11px; font-weight: 900; }
      `}</style>
    </div>
  );
}

function Sparkline({ data, color, w = 48, h = 20 }: { data: number[]; color: string; w?: number; h?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = 2 + (i / (data.length - 1)) * (w - 4);
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ProfileV2Page() {
  const [view, setView] = useState<"mine" | "public">("mine");
  const [name, setName] = useState(PROFILE.displayName);
  const mine = view === "mine";

  return (
    <div className="screen">
      <div className="protoBar">
        <span className="protoTitle">Profile · V2</span>
        <div className="modeToggle">
          {(["mine", "public"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`modeBtn ${view === m ? "modeBtnOn" : ""}`}
              onClick={() => setView(m)}
            >
              {m === "mine" ? "Mine" : "Public"}
            </button>
          ))}
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        <HeroCard mine={mine} name={name} onRename={setName} />

        <HistAvatarCard />

        <RankLadderCard />

        <SkillSplitCard />

        <StatsCard />

        <ModesCard />

        <BadgesCard />

        <EraRegionCard />

        {mine && <AccountCard />}

        <div className="dockSpacer" />
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
        @media (min-width: 900px) {
          .scroll {
            max-width: 1080px;
            display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
            align-content: start; gap: 16px;
          }
          .scroll > * { min-width: 0; }
          .scroll [data-section="hero"] { grid-column: 1 / -1; }
          .scroll [data-section="rank"] { grid-column: 1 / -1; }
        }
        .dockSpacer { height: 28px; flex-shrink: 0; }
        @media (min-width: 900px) { .dockSpacer { grid-column: 1 / -1; } }

        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
          flex-shrink: 0;
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
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HERO — avatar accuracy ring + identity chips (+ Follow in public view)
// ════════════════════════════════════════════════════════════════════════════
function HeroCard({
  mine,
  name,
  onRename,
}: {
  mine: boolean;
  name: string;
  onRename: (n: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [following, setFollowing] = useState(false);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };
  const save = () => {
    const v = draft.trim();
    if (v) onRename(v); // mock save — local state only, no persistence
    setEditing(false);
  };

  return (
    <section className="card hero" data-section="hero">
      <div className="heroRow">
        <div className="heroAvWrap">
          <AvatarRing pct={PROFILE.avgAccuracy} name={name} playerId={PROFILE.playerId} />
          <span className="lvPill">LV {PROFILE.level}</span>
          {mine && !editing && (
            <button type="button" className="avEdit" aria-label="Edit name" onClick={startEdit}>
              <Pencil size={11} strokeWidth={2.6} />
            </button>
          )}
        </div>

        <div className="heroInfo">
          <div className="heroNameRow">
            <h1 className="heroName">{name}</h1>
            {!mine && (
              <button
                type="button"
                className={`followBtn ${following ? "followBtnOn" : ""}`}
                onClick={() => setFollowing((f) => !f)}
              >
                {following ? <UserCheck size={12} strokeWidth={2.6} /> : <UserPlus size={12} strokeWidth={2.6} />}
                {following ? "Friends" : "Add Friend"}
              </button>
            )}
          </div>
          <span className="heroMeta">@{PROFILE.handle} · joined {PROFILE.joined}</span>
          <div className="heroChips">
            <span className="hChip hChipStreak">🔥 {PROFILE.dayStreak}</span>
            <span className="hChip hChipRank"><b>T5</b> Explorer</span>
            <span className="hChip hChipTop">Top 12% this week</span>
          </div>
        </div>
      </div>

      {mine && editing && (
        <div className="nameEdit">
          <input
            className="nameInput"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button type="button" className="savePill" onClick={save}>
            <Check size={12} strokeWidth={3} /> Save
          </button>
        </div>
      )}

      <style jsx>{`
        .hero { padding: 18px 16px; }
        .heroRow { display: flex; align-items: center; gap: 16px; }
        .heroAvWrap { position: relative; flex-shrink: 0; }
        .lvPill {
          position: absolute; bottom: -4px; right: -4px;
          padding: 2px 7px; border-radius: 999px;
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          font-size: 9px; font-weight: 900; letter-spacing: 0.5px;
          border: 1px solid rgba(255,255,255,0.3);
        }
        .avEdit {
          position: absolute; top: -4px; right: -4px;
          width: 24px; height: 24px; border-radius: 999px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          background: rgba(20,20,26,0.95); border: 1px solid rgba(255,255,255,0.25); color: #fff;
        }
        .heroInfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .heroNameRow { display: flex; align-items: center; gap: 8px; }
        .heroName {
          margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.2px;
          min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .followBtn {
          margin-left: auto; flex-shrink: 0;
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 13px; border-radius: 999px; cursor: pointer;
          font-size: 11px; font-weight: 800;
          background: linear-gradient(135deg, #fb923c, #f97316);
          border: 1px solid transparent; color: #1a0d02;
        }
        .followBtnOn {
          background: rgba(251,146,60,0.12); border-color: rgba(251,146,60,0.55); color: var(--main-color);
        }
        .heroMeta { font-size: 11.5px; font-weight: 600; color: rgba(255,255,255,0.5); }
        .heroChips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .hChip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 999px;
          font-size: 10px; font-weight: 800; border: 1px solid;
        }
        .hChip b {
          font-size: 8px; font-weight: 900; padding: 0 4px; border-radius: 999px;
          background: rgba(240,192,96,0.25);
        }
        .hChipStreak { background: rgba(251,146,60,0.14); border-color: rgba(251,146,60,0.45); color: var(--main-color); }
        .hChipRank { background: rgba(240,192,96,0.12); border-color: rgba(240,192,96,0.4); color: var(--gh-gold); }
        .hChipTop { background: rgba(34,211,238,0.1); border-color: rgba(34,211,238,0.35); color: var(--where-color); }
        .nameEdit { display: flex; gap: 8px; margin-top: 14px; }
        .nameInput {
          flex: 1; min-width: 0; height: 34px; padding: 0 12px; border-radius: 10px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18);
          color: #fff; font-size: 13px; font-weight: 700; outline: none;
        }
        .nameInput:focus { border-color: rgba(251,146,60,0.6); }
        .savePill {
          display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
          height: 34px; padding: 0 14px; border-radius: 999px; border: 0; cursor: pointer;
          background: linear-gradient(135deg, #fb923c, #f97316);
          color: #1a0d02; font-size: 12px; font-weight: 900;
        }
        @media (max-width: 400px) {
          .hero { padding: 14px 12px; }
          .heroRow { gap: 12px; }
          .heroName { font-size: 16px; }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HIST AVATAR — the historical figure behind the avatar (mirrors prod profile)
// ════════════════════════════════════════════════════════════════════════════
function HistAvatarCard() {
  return (
    <section className="card hist" data-section="histavatar">
      <h3 className="histName">{HIST_AVATAR.name}</h3>
      <p className="histDesc">{HIST_AVATAR.description}</p>
      <p className="histLife">{HIST_AVATAR.bornLabel}</p>
      <p className="histLife">{HIST_AVATAR.diedLabel}</p>

      <style jsx>{`
        .hist { padding: 18px 20px; text-align: center; }
        .histName { margin: 0 0 6px; font-size: 17px; font-weight: 800; letter-spacing: 0.3px; }
        .histDesc { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,0.55); }
        .histLife { margin: 2px 0 0; font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.45); }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// RANK LADDER — animated SVG tier shields on a swipe rail (badges copied from
// /prototype/rank-badges-svg; rail mirrors its LadderStrip)
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
  const curPct = Math.round(
    clampPct(((PROFILE.totalXp - TIER_FLOOR) / (TIER_NEXT - TIER_FLOOR)) * 100)
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
          <span className="lcSub">Tier {CURRENT_TIER} / 10 · {fmt(PROFILE.totalXp)} XP · {curPct}%</span>
        </div>
        <span className="lcHint">swipe</span>
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
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SKILL SPLIT — WHERE/WHEN bars with error units + computed insights
// ════════════════════════════════════════════════════════════════════════════
function SkillSplitCard() {
  // Insights are computed from the mock data, not hardcoded strings.
  const strongest = REGIONS.reduce((b, r) => (r.percent > b.percent ? r : b), REGIONS[0]);
  const focus = ERAS.reduce((b, r) => (r.percent < b.percent ? r : b), ERAS[0]);
  const wk = PROFILE.weeklyAccuracy;
  const trend = wk[wk.length - 1] - wk[0]; // first-vs-last weekly delta

  const axes = [
    { Icon: MapPin, label: "WHERE", color: "var(--where-color)", pct: PROFILE.whereAccuracy, err: `avg ${PROFILE.whereAvgKm} km off` },
    { Icon: Clock, label: "WHEN", color: "var(--when-color)", pct: PROFILE.whenAccuracy, err: `avg ${PROFILE.whenAvgYrs} yrs off` },
  ];

  return (
    <section className="card split" data-section="split">
      <h3 className="cardTitle">Skill split</h3>
      <div className="skRows">
        {axes.map(({ Icon, label, color, pct, err }) => (
          <div className="skRow" key={label}>
            <span className="skIcon" style={{ color, background: `${color === "var(--where-color)" ? "#22d3ee" : "#8b5cf6"}1a`, borderColor: `${color === "var(--where-color)" ? "#22d3ee" : "#8b5cf6"}4d` }}>
              <Icon size={14} strokeWidth={2.5} />
            </span>
            <div className="skMain">
              <div className="skLine">
                <span className="skLabel" style={{ color }}>{label}</span>
                <div className="skBar">
                  <span className="skBarFill" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="skVal" style={{ color: getAccuracyColor(pct) }}>{pct}%</span>
              </div>
              <span className="skErr">{err}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="skDiv" />

      <div className="ins">
        <span className="insTitle">Insights</span>
        <div className="insRow">
          <Trophy size={12} strokeWidth={2.4} style={{ color: "var(--gh-gold)" }} />
          <span>Strongest: {strongest.label} {strongest.percent}% ({strongest.count} rounds)</span>
        </div>
        <div className="insRow">
          <Crosshair size={12} strokeWidth={2.4} style={{ color: "var(--main-color)" }} />
          <span>Focus area: {focus.label} — {focus.percent}% across {focus.count} rounds</span>
        </div>
        <div className="insRow">
          <TrendingUp size={12} strokeWidth={2.4} style={{ color: trend >= 0 ? "var(--gh-success)" : "var(--gh-danger)" }} />
          <span>Trend: {trend >= 0 ? "+" : ""}{trend}% accuracy over your last 20 games</span>
        </div>
      </div>

      <style jsx>{`
        .split { padding: 16px; }
        .cardTitle { margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .skRows { display: flex; flex-direction: column; gap: 14px; }
        .skRow { display: flex; align-items: flex-start; gap: 10px; }
        .skIcon {
          width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid; margin-top: 1px;
        }
        .skMain { flex: 1; min-width: 0; }
        .skLine { display: flex; align-items: center; gap: 8px; }
        .skLabel { width: 44px; flex-shrink: 0; font-size: 10px; font-weight: 800; letter-spacing: 0.8px; }
        .skBar {
          flex: 1; height: 7px; border-radius: 999px;
          background: rgba(255,255,255,0.08); overflow: hidden;
        }
        .skBarFill { display: block; height: 100%; border-radius: 999px; }
        .skVal { width: 38px; flex-shrink: 0; text-align: right; font-size: 14px; font-weight: 900; }
        .skErr { display: block; margin-top: 4px; margin-left: 52px; font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.4); }
        .skDiv { height: 1px; margin: 14px 0 12px; background: rgba(255,255,255,0.08); }
        .ins { display: flex; flex-direction: column; gap: 7px; }
        .insTitle { font-size: 9px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 2px; }
        .insRow { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.78); }
        .insRow svg { flex-shrink: 0; }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STATS — 4 tiles; accuracy tile carries the 8-week sparkline
// ════════════════════════════════════════════════════════════════════════════
function StatsCard() {
  const wk = PROFILE.weeklyAccuracy;
  const latest = wk[wk.length - 1];
  const sparkColor = getAccuracyColor(latest);

  return (
    <section className="card stats" data-section="stats">
      <h3 className="cardTitle">Stats</h3>
      <div className="statGrid">
        <div className="statTile">
          <span className="statVal" style={{ color: sparkColor }}>{PROFILE.avgAccuracy}%</span>
          <Sparkline data={wk} color={sparkColor} />
          <span className="statLabel">Accuracy</span>
        </div>
        <div className="statTile">
          <span className="statVal" style={{ color: "var(--gh-gold)" }}>{(PROFILE.totalXp / 1000).toFixed(1)}k</span>
          <span className="statSub">lifetime</span>
          <span className="statLabel">Total XP</span>
        </div>
        <div className="statTile">
          <span className="statVal">{PROFILE.gamesPlayed}</span>
          <span className="statSub">{(PROFILE.roundsPlayed / PROFILE.gamesPlayed).toFixed(1)} r/game</span>
          <span className="statLabel">Games</span>
        </div>
        <div className="statTile">
          <span className="statVal">{PROFILE.roundsPlayed}</span>
          <span className="statSub">played</span>
          <span className="statLabel">Rounds</span>
        </div>
      </div>

      <style jsx>{`
        .stats { padding: 14px 12px; }
        .cardTitle { margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .statGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .statTile {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 10px 4px 8px; border-radius: 12px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
        }
        .statVal { font-size: 17px; font-weight: 900; line-height: 1; }
        .statSub { font-size: 8.5px; font-weight: 600; color: rgba(255,255,255,0.38); height: 20px; display: flex; align-items: center; }
        .statLabel { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: rgba(255,255,255,0.45); }
        .spark { display: block; height: 20px; }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODES — Daily / Level Up / Practice with mini accuracy rings
// ════════════════════════════════════════════════════════════════════════════
function ModesCard() {
  return (
    <section className="card modes" data-section="modes">
      <h3 className="cardTitle">Performance by mode</h3>
      <div className="mdRow">
        {MODES.map((m) => (
          <div
            key={m.name}
            className="mdTile"
            style={{ background: `${m.accent}14`, border: `1px solid ${m.accent}40` }}
          >
            <TinyRing pct={m.accuracy} color={m.accent} size={44} />
            <span className="mdName">{m.name}</span>
            <span className="mdSub">{m.sub}</span>
            {m.streak && <span className="mdStreak">🔥 {PROFILE.dayStreak}</span>}
          </div>
        ))}
      </div>

      <style jsx>{`
        .modes { padding: 16px; }
        .cardTitle { margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .mdRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .mdTile {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          padding: 12px 6px 10px; border-radius: 14px;
        }
        .mdName { font-size: 11px; font-weight: 800; }
        .mdSub { font-size: 9.5px; font-weight: 600; color: rgba(255,255,255,0.45); }
        .mdStreak {
          padding: 1px 8px; border-radius: 999px;
          background: rgba(251,146,60,0.14); border: 1px solid rgba(251,146,60,0.4);
          font-size: 9px; font-weight: 800; color: var(--main-color);
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BADGES — tier tiles + dimension bars + recent-earned shelf
// ════════════════════════════════════════════════════════════════════════════
function BadgesCard() {
  const total = BADGE_TIERS.reduce((s, t) => s + t.count, 0);
  const dimMax = Math.max(...BADGE_DIMS.map((d) => d.count));

  return (
    <section className="card badges" data-section="badges">
      <div className="bdHead">
        <h3 className="cardTitle">Badges</h3>
        <span className="bdTotal">{total} earned</span>
      </div>

      <div className="bdTierRow">
        {BADGE_TIERS.map((t) => (
          <div
            key={t.label}
            className="bdTier"
            style={{ background: `${t.color}14`, border: `1px solid ${t.color}45` }}
          >
            <span className="bdTierCount" style={{ color: t.color }}>{t.count}</span>
            <span className="bdTierLabel">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="bdDims">
        {BADGE_DIMS.map((d) => (
          <div className="bdDim" key={d.label}>
            <span className="bdDimLabel">{d.label}</span>
            <div className="bdDimBar">
              <span
                className="bdDimFill"
                style={{ width: `${(d.count / dimMax) * 100}%`, background: d.color }}
              />
            </div>
            <span className="bdDimCount" style={{ color: d.color }}>{d.count}</span>
          </div>
        ))}
      </div>

      <span className="bdRecentTitle">Recent</span>
      <div className="bdRecent">
        {RECENT_BADGES.map((b) => (
          <div className="bdRec" key={b.src}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.src} alt={b.caption} className="bdRecImg" draggable={false} />
            <span className="bdRecCap">{b.caption}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .badges { padding: 16px; }
        .bdHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .cardTitle { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .bdTotal { font-size: 11px; font-weight: 800; color: var(--gh-gold); }
        .bdTierRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .bdTier {
          display: flex; flex-direction: column; align-items: center; gap: 1px;
          padding: 9px 4px 7px; border-radius: 12px;
        }
        .bdTierCount { font-size: 18px; font-weight: 900; line-height: 1; }
        .bdTierLabel { font-size: 9.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .bdDims { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; }
        .bdDim { display: flex; align-items: center; gap: 8px; }
        .bdDimLabel { width: 52px; flex-shrink: 0; font-size: 10.5px; font-weight: 700; color: rgba(255,255,255,0.7); }
        .bdDimBar {
          flex: 1; height: 7px; border-radius: 999px;
          background: rgba(255,255,255,0.08); overflow: hidden;
        }
        .bdDimFill { display: block; height: 100%; border-radius: 999px; }
        .bdDimCount { width: 24px; flex-shrink: 0; text-align: right; font-size: 11px; font-weight: 800; }
        .bdRecentTitle {
          display: block; margin: 14px 0 8px;
          font-size: 9px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .bdRecent { display: flex; gap: 8px; }
        .bdRec {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 8px 2px 6px; border-radius: 12px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
        }
        .bdRecImg { width: 34px; height: 34px; object-fit: contain; display: block; }
        .bdRecCap { font-size: 8.5px; font-weight: 700; color: rgba(255,255,255,0.5); white-space: nowrap; }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ERA / REGION — one merged matrix: dim toggle x metric toggle
// ════════════════════════════════════════════════════════════════════════════
function EraRegionCard() {
  const [dim, setDim] = useState<"era" | "region">("era");
  const [metric, setMetric] = useState<"acc" | "rounds">("acc");

  const rows = dim === "era" ? ERAS : REGIONS;
  const maxCount = Math.max(...rows.map((r) => r.count));

  return (
    <section className="card er" data-section="eraregion">
      <div className="erHead">
        <h3 className="cardTitle">Era & region</h3>
        <div className="erToggles">
          <div className="seg">
            {(["era", "region"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`segBtn ${dim === d ? "segBtnOn" : ""}`}
                onClick={() => setDim(d)}
              >
                {d === "era" ? "Era" : "Region"}
              </button>
            ))}
          </div>
          <div className="seg">
            {(["acc", "rounds"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`segBtn ${metric === m ? "segBtnOn" : ""}`}
                onClick={() => setMetric(m)}
              >
                {m === "acc" ? "Accuracy" : "Rounds"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="erRows">
        {rows.map((r) => (
          <div className="erRow" key={r.label}>
            <div className="erLabelWrap">
              <span className="erLabel">{r.label}</span>
              {r.span && <span className="erSpan">{r.span}</span>}
            </div>
            <div className="erBar">
              <span
                className="erBarFill"
                style={
                  metric === "acc"
                    ? { width: `${r.percent}%`, background: getAccuracyColor(r.percent) }
                    : { width: `${(r.count / maxCount) * 100}%`, background: "rgba(255,255,255,0.32)" }
                }
              />
            </div>
            {metric === "acc" ? (
              <span className="erVal" style={{ color: getAccuracyColor(r.percent) }}>
                {r.percent}%<span className="erDim"> ·{r.count}</span>
              </span>
            ) : (
              <span className="erVal">
                {r.count}<span className="erDim"> ·{r.percent}%</span>
              </span>
            )}
          </div>
        ))}
      </div>

      <style jsx>{`
        .er { padding: 16px; }
        .erHead { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
        .cardTitle { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .erToggles { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .seg {
          display: flex; gap: 2px; padding: 2px; border-radius: 999px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
        }
        .segBtn {
          border: 0; padding: 4px 11px; border-radius: 999px; cursor: pointer;
          font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.55); background: transparent;
        }
        .segBtnOn { background: rgba(251,146,60,0.2); color: var(--main-color); }
        .erRows { display: flex; flex-direction: column; gap: 10px; }
        .erRow { display: flex; align-items: center; gap: 10px; }
        .erLabelWrap { width: 92px; flex-shrink: 0; display: flex; flex-direction: column; }
        .erLabel { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .erSpan { font-size: 8.5px; font-weight: 600; color: rgba(255,255,255,0.38); white-space: nowrap; }
        .erBar {
          flex: 1; height: 8px; border-radius: 999px;
          background: rgba(255,255,255,0.08); overflow: hidden;
        }
        .erBarFill { display: block; height: 100%; border-radius: 999px; }
        .erVal { width: 76px; flex-shrink: 0; text-align: right; font-size: 12px; font-weight: 900; }
        .erDim { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.4); }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ACCOUNT — own-profile only rows + sign out (mock, no action)
// ════════════════════════════════════════════════════════════════════════════
function AccountCard() {
  return (
    <section className="card account" data-section="account">
      <h3 className="cardTitle">Account</h3>
      <div className="acRows">
        <div className="acRow">
          <span className="acKey">Email</span>
          <span className="acVal">{PROFILE.email}</span>
        </div>
        <div className="acRow">
          <span className="acKey">Member since</span>
          <span className="acVal">{PROFILE.joinedFull}</span>
        </div>
        <div className="acRow">
          <span className="acKey">Player ID</span>
          <span className="acVal">{PROFILE.playerId}</span>
        </div>
      </div>
      <div className="acDiv" />
      <button type="button" className="acOut">
        <LogOut size={13} strokeWidth={2.4} /> Sign out
      </button>

      <style jsx>{`
        .account { padding: 16px; }
        .cardTitle { margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.75); }
        .acRows { display: flex; flex-direction: column; gap: 9px; }
        .acRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .acKey { font-size: 11.5px; font-weight: 600; color: rgba(255,255,255,0.5); }
        .acVal { font-size: 12px; font-weight: 700; }
        .acDiv { height: 1px; margin: 14px 0 12px; background: rgba(255,255,255,0.08); }
        .acOut {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%; height: 38px; border-radius: 12px; cursor: pointer;
          background: transparent; border: 1px solid rgba(239,68,68,0.55);
          color: var(--gh-danger); font-size: 12.5px; font-weight: 800;
        }
      `}</style>
    </section>
  );
}
