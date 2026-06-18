"use client";
import { useState } from "react";
import styles from "./profile.module.css";

// Note: styled-jsx is available in Next.js by default

// ============================================================================
// STANDALONE PROTOTYPE — Profile page (improved UI)
// Route: /prototype/profile   (direct access, fully self-contained)
//
// - Visual language follows the home / guess-modal / lobby / round-results /
//   final-results prototypes: dark background image + scrim, proto bar, rounded
//   glass cards, cyan (WHERE) + violet (WHEN) accents, gradient SVG accuracy
//   ring, self-contained <style jsx>.
// - All data is MOCK and held in local constants. No WebSocket, no Supabase,
//   no real network. Replaces the production page's "coming soon" placeholders
//   with populated example sections so the layout can be reviewed in isolation.
//
// Does NOT touch or import any existing app files.
// ============================================================================

const PROFILE = {
  displayName: "Alex Rivera",
  handle: "alexrivera",
  joined: "March 2024",
  email: "alex.rivera@example.com",
  level: 14,
  levelProgress: 0.62, // 62% to next level
  avatarInitials: "AR",
  avgAccuracy: 87,
  whereAccuracy: 84,
  whenAccuracy: 90,
  totalXp: 124800,
  roundsPlayed: 642,
  gamesPlayed: 138,
  dayStreak: 23,
};

const BADGES = [
  { label: "Gold", count: 41, color: "#ffcc44", bg: "rgba(255,190,0,0.14)", border: "rgba(255,190,0,0.4)" },
  { label: "Silver", count: 76, color: "#cdd6e3", bg: "rgba(180,195,215,0.14)", border: "rgba(180,195,215,0.4)" },
  { label: "Bronze", count: 118, color: "#cd9a5a", bg: "rgba(180,120,60,0.15)", border: "rgba(180,120,60,0.4)" },
];

const BADGE_DIMS = [
  { label: "Year", count: 88, accent: "#8b5cf6" },
  { label: "Location", count: 94, accent: "#22d3ee" },
  { label: "Combo", count: 53, accent: "#ffd54a" },
];

const MODES = [
  { name: "Daily", accuracy: 89, games: 64, accent: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" },
  { name: "Level Up", accuracy: 85, games: 51, accent: "#8b5cf6", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.3)" },
  { name: "Compete", accuracy: 82, games: 23, accent: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.3)" },
];

const ERAS = [
  { label: "Contemporary", count: 214, percent: 92 },
  { label: "Modern", count: 168, percent: 88 },
  { label: "Early Modern", count: 132, percent: 79 },
  { label: "Medieval", count: 84, percent: 71 },
  { label: "Ancient", count: 44, percent: 63 },
];

const ACCURACY_ERAS = [
  { label: "Contemporary", span: "1945 to present", percent: 92, count: 214 },
  { label: "Modern", span: "1800 to 1945", percent: 88, count: 168 },
  { label: "Early Modern", span: "1500 to 1800", percent: 79, count: 132 },
  { label: "Medieval", span: "500 to 1500", percent: 71, count: 84 },
  { label: "Ancient", span: "3000 BC to 500", percent: 63, count: 44 },
];

const REGIONS = [
  { label: "Europe", percent: 94, count: 186 },
  { label: "North America", percent: 88, count: 142 },
  { label: "Asia", percent: 79, count: 98 },
  { label: "South America", percent: 71, count: 64 },
  { label: "Africa", percent: 65, count: 52 },
  { label: "Oceania", percent: 82, count: 38 },
];

function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

function AccuracyRing({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="ringWrap">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <defs>
          <linearGradient id="profGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
        <circle
          cx="66" cy="66" r={r} fill="none" stroke="url(#profGrad)" strokeWidth="11"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform="rotate(-90 66 66)" style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="ringCenter">
        <span className="ringValue">{value}<span className="ringPct">%</span></span>
        <span className="ringLabel">overall</span>
      </div>
    </div>
  );
}

export default function ProfilePrototypePage() {
  const [accuracyTab, setAccuracyTab] = useState<"era" | "region">("era");
  const [historyTab, setHistoryTab] = useState<"era" | "region">("era");
  return (
    <>
      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }
      `}</style>
      <main className={styles.screen}>
        <div className={styles.protoBar}>
          <span className={styles.protoTitle}>Profile — Prototype</span>
          <span className={styles.protoHint}>Mock data</span>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home_background.webp" alt="" className={styles.bgImg} draggable={false} />
        <div className={styles.bgScrim} />

        <div className={styles.scroll}>
        {/* ── Top actions ── */}
        <div className={styles.topActions}>
          <button className={styles.backBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <button className={styles.editBtn}>Edit profile</button>
        </div>

        {/* ── Hero ── */}
        <section className={`${styles.card} ${styles.heroCard}`}>
          <div className={styles.avatarWrap}>
            <span className={styles.avatar}>{PROFILE.avatarInitials}</span>
            <span className={styles.levelBadge}>LV {PROFILE.level}</span>
          </div>
          <div className={styles.heroInfo}>
            <h1 className={styles.name}>{PROFILE.displayName}</h1>
            <span className={styles.handle}>@{PROFILE.handle} · Joined {PROFILE.joined}</span>
            <div className={styles.levelBar}>
              <div className={styles.levelBarFill} style={{ width: `${PROFILE.levelProgress * 100}%` }} />
            </div>
            <span className={styles.levelHint}>{Math.round(PROFILE.levelProgress * 100)}% to level {PROFILE.level + 1}</span>
          </div>
        </section>

        {/* ── Key stats ── */}
        <div className={styles.statStrip}>
          <div className={styles.statCard}>
            <span className={styles.statVal} style={{ color: accColor(PROFILE.avgAccuracy) }}>{PROFILE.avgAccuracy}%</span>
            <span className={styles.statLabel}>Accuracy</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statVal} style={{ color: "#ffd54a" }}>{(PROFILE.totalXp / 1000).toFixed(1)}k</span>
            <span className={styles.statLabel}>Total XP</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statVal}>{PROFILE.gamesPlayed}</span>
            <span className={styles.statLabel}>Games</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statVal} style={{ color: "#fb923c" }}>{PROFILE.dayStreak}</span>
            <span className={styles.statLabel}>Day streak</span>
          </div>
        </div>

        {/* ── Accuracy breakdown ── */}
        <section className={`${styles.card} ${styles.heroAcc}`}>
          <AccuracyRing value={PROFILE.avgAccuracy} />
          <div className={styles.accSide}>
            <div className={styles.accTile}>
              <span className={styles.accTileLabel} style={{ color: "#22d3ee" }}>WHERE</span>
              <div className={styles.accBar}><div className={styles.accBarFill} style={{ width: `${PROFILE.whereAccuracy}%`, background: "#22d3ee" }} /></div>
              <span className={styles.accTileVal} style={{ color: accColor(PROFILE.whereAccuracy) }}>{PROFILE.whereAccuracy}%</span>
            </div>
            <div className={styles.accTile}>
              <span className={styles.accTileLabel} style={{ color: "#8b5cf6" }}>WHEN</span>
              <div className={styles.accBar}><div className={styles.accBarFill} style={{ width: `${PROFILE.whenAccuracy}%`, background: "#8b5cf6" }} /></div>
              <span className={styles.accTileVal} style={{ color: accColor(PROFILE.whenAccuracy) }}>{PROFILE.whenAccuracy}%</span>
            </div>
            <span className={styles.accFoot}>{PROFILE.roundsPlayed} rounds played</span>
          </div>
        </section>

        {/* ── Badges ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}><span className={styles.accentBar} /><h2 className={styles.cardTitle}>Badge collection</h2></div>
          <div className={styles.badgeTierRow}>
            {BADGES.map((b) => (
              <div key={b.label} className={styles.badgeTier} style={{ background: b.bg, border: `1px solid ${b.border}` }}>
                <span className={styles.badgeTierCount} style={{ color: b.color }}>{b.count}</span>
                <span className={styles.badgeTierLabel}>{b.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.badgeDimRow}>
            {BADGE_DIMS.map((d) => (
              <div key={d.label} className={styles.badgeDim}>
                <span className={styles.badgeDimDot} style={{ background: d.accent }} />
                <span className={styles.badgeDimLabel}>{d.label}</span>
                <span className={styles.badgeDimCount}>{d.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Performance by mode ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}><span className={styles.accentBar} /><h2 className={styles.cardTitle}>Performance by mode</h2></div>
          <div className={styles.modeRow}>
            {MODES.map((m) => (
              <div key={m.name} className={styles.modeCard} style={{ background: m.bg, border: `1px solid ${m.border}` }}>
                <span className={styles.modeAccent} style={{ background: m.accent }} />
                <span className={styles.modeName}>{m.name}</span>
                <span className={styles.modeAcc} style={{ color: accColor(m.accuracy) }}>{m.accuracy}%</span>
                <span className={styles.modeGames}>{m.games} games</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Accuracy ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}><span className={styles.accentBar} /><h2 className={styles.cardTitle}>Accuracy</h2></div>
          <div className={styles.tabBar}>
            <button className={`${styles.tabBtn} ${accuracyTab === "era" ? styles.tabActive : ""}`} onClick={() => setAccuracyTab("era")}>Era</button>
            <button className={`${styles.tabBtn} ${accuracyTab === "region" ? styles.tabActive : ""}`} onClick={() => setAccuracyTab("region")}>Region</button>
          </div>
          <div className={styles.regionWrap}>
            {accuracyTab === "era" && ACCURACY_ERAS.map((item) => (
              <div key={item.label} className={styles.regionRow}>
                <div className={styles.regionLabelWrap}>
                  <span className={styles.regionLabel}>{item.label}</span>
                  <span className={styles.regionSpan}>{item.span}</span>
                </div>
                <div className={styles.regionBar}><div className={styles.regionBarFill} style={{ width: `${item.percent}%` }} /></div>
                <span className={styles.regionPct} style={{ color: accColor(item.percent) }}>{item.percent}%</span>
                <span className={styles.regionCount}>{item.count}</span>
              </div>
            ))}
            {accuracyTab === "region" && REGIONS.map((item) => (
              <div key={item.label} className={styles.regionRow}>
                <span className={styles.regionLabel}>{item.label}</span>
                <div className={styles.regionBar}><div className={styles.regionBarFill} style={{ width: `${item.percent}%` }} /></div>
                <span className={styles.regionPct} style={{ color: accColor(item.percent) }}>{item.percent}%</span>
                <span className={styles.regionCount}>{item.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── History collection ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}><span className={styles.accentBar} /><h2 className={styles.cardTitle}>History collection</h2></div>
          <div className={styles.tabBar}>
            <button className={`${styles.tabBtn} ${historyTab === "era" ? styles.tabActive : ""}`} onClick={() => setHistoryTab("era")}>Era</button>
            <button className={`${styles.tabBtn} ${historyTab === "region" ? styles.tabActive : ""}`} onClick={() => setHistoryTab("region")}>Region</button>
          </div>
          <div className={styles.regionWrap}>
            {historyTab === "era" && ERAS.map((item) => (
              <div key={item.label} className={styles.regionRow}>
                <span className={styles.regionLabel}>{item.label}</span>
                <div className={styles.regionBar}><div className={styles.regionBarFill} style={{ width: `${item.percent}%` }} /></div>
                <span className={styles.regionPct}>{item.percent}%</span>
                <span className={styles.regionCount}>{item.count}</span>
              </div>
            ))}
            {historyTab === "region" && REGIONS.map((item) => (
              <div key={item.label} className={styles.regionRow}>
                <span className={styles.regionLabel}>{item.label}</span>
                <div className={styles.regionBar}><div className={styles.regionBarFill} style={{ width: `${item.percent}%` }} /></div>
                <span className={styles.regionPct}>{item.percent}%</span>
                <span className={styles.regionCount}>{item.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Account ── */}
        <section className={styles.card}>
          <div className={styles.cardHead}><span className={styles.accentBar} /><h2 className={styles.cardTitle}>Account</h2></div>
          <div className={styles.accountBody}>
            <div className={styles.accountRow}>
              <span className={styles.accountKey}>Email</span>
              <span className={styles.accountVal}>{PROFILE.email}</span>
            </div>
            <div className={styles.accountRow}>
              <span className={styles.accountKey}>Member since</span>
              <span className={styles.accountVal}>{PROFILE.joined}</span>
            </div>
            <button className={styles.signOutBtn}>Sign out</button>
          </div>
        </section>

        <div className={styles.dockSpacer} />
      </div>
    </main>
    </>
  );
}
