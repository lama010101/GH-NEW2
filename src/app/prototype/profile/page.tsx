"use client";
import { useState } from "react";

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
    <main className="screen">
      <div className="protoBar">
        <span className="protoTitle">Profile — Prototype</span>
        <span className="protoHint">Mock data</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        {/* ── Top actions ── */}
        <div className="topActions">
          <button className="backBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <button className="editBtn">Edit profile</button>
        </div>

        {/* ── Hero ── */}
        <section className="card heroCard">
          <div className="avatarWrap">
            <span className="avatar">{PROFILE.avatarInitials}</span>
            <span className="levelBadge">LV {PROFILE.level}</span>
          </div>
          <div className="heroInfo">
            <h1 className="name">{PROFILE.displayName}</h1>
            <span className="handle">@{PROFILE.handle} · Joined {PROFILE.joined}</span>
            <div className="levelBar">
              <div className="levelBarFill" style={{ width: `${PROFILE.levelProgress * 100}%` }} />
            </div>
            <span className="levelHint">{Math.round(PROFILE.levelProgress * 100)}% to level {PROFILE.level + 1}</span>
          </div>
        </section>

        {/* ── Key stats ── */}
        <div className="statStrip">
          <div className="statCard">
            <span className="statVal" style={{ color: accColor(PROFILE.avgAccuracy) }}>{PROFILE.avgAccuracy}%</span>
            <span className="statLabel">Accuracy</span>
          </div>
          <div className="statCard">
            <span className="statVal" style={{ color: "#ffd54a" }}>{(PROFILE.totalXp / 1000).toFixed(1)}k</span>
            <span className="statLabel">Total XP</span>
          </div>
          <div className="statCard">
            <span className="statVal">{PROFILE.gamesPlayed}</span>
            <span className="statLabel">Games</span>
          </div>
          <div className="statCard">
            <span className="statVal" style={{ color: "#fb923c" }}>{PROFILE.dayStreak}</span>
            <span className="statLabel">Day streak</span>
          </div>
        </div>

        {/* ── Accuracy breakdown ── */}
        <section className="card heroAcc">
          <AccuracyRing value={PROFILE.avgAccuracy} />
          <div className="accSide">
            <div className="accTile">
              <span className="accTileLabel" style={{ color: "#22d3ee" }}>WHERE</span>
              <div className="accBar"><div className="accBarFill" style={{ width: `${PROFILE.whereAccuracy}%`, background: "#22d3ee" }} /></div>
              <span className="accTileVal" style={{ color: accColor(PROFILE.whereAccuracy) }}>{PROFILE.whereAccuracy}%</span>
            </div>
            <div className="accTile">
              <span className="accTileLabel" style={{ color: "#8b5cf6" }}>WHEN</span>
              <div className="accBar"><div className="accBarFill" style={{ width: `${PROFILE.whenAccuracy}%`, background: "#8b5cf6" }} /></div>
              <span className="accTileVal" style={{ color: accColor(PROFILE.whenAccuracy) }}>{PROFILE.whenAccuracy}%</span>
            </div>
            <span className="accFoot">{PROFILE.roundsPlayed} rounds played</span>
          </div>
        </section>

        {/* ── Badges ── */}
        <section className="card">
          <div className="cardHead"><span className="accentBar" /><h2 className="cardTitle">Badge collection</h2></div>
          <div className="badgeTierRow">
            {BADGES.map((b) => (
              <div key={b.label} className="badgeTier" style={{ background: b.bg, border: `1px solid ${b.border}` }}>
                <span className="badgeTierCount" style={{ color: b.color }}>{b.count}</span>
                <span className="badgeTierLabel">{b.label}</span>
              </div>
            ))}
          </div>
          <div className="badgeDimRow">
            {BADGE_DIMS.map((d) => (
              <div key={d.label} className="badgeDim">
                <span className="badgeDimDot" style={{ background: d.accent }} />
                <span className="badgeDimLabel">{d.label}</span>
                <span className="badgeDimCount">{d.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Performance by mode ── */}
        <section className="card">
          <div className="cardHead"><span className="accentBar" /><h2 className="cardTitle">Performance by mode</h2></div>
          <div className="modeRow">
            {MODES.map((m) => (
              <div key={m.name} className="modeCard" style={{ background: m.bg, border: `1px solid ${m.border}` }}>
                <span className="modeAccent" style={{ background: m.accent }} />
                <span className="modeName">{m.name}</span>
                <span className="modeAcc" style={{ color: accColor(m.accuracy) }}>{m.accuracy}%</span>
                <span className="modeGames">{m.games} games</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Accuracy ── */}
        <section className="card">
          <div className="cardHead"><span className="accentBar" /><h2 className="cardTitle">Accuracy</h2></div>
          <div className="tabBar">
            <button className={`tabBtn ${accuracyTab === "era" ? "tabActive" : ""}`} onClick={() => setAccuracyTab("era")}>Era</button>
            <button className={`tabBtn ${accuracyTab === "region" ? "tabActive" : ""}`} onClick={() => setAccuracyTab("region")}>Region</button>
          </div>
          <div className="regionWrap">
            {accuracyTab === "era" && ACCURACY_ERAS.map((item) => (
              <div key={item.label} className="regionRow">
                <div className="regionLabelWrap">
                  <span className="regionLabel">{item.label}</span>
                  <span className="regionSpan">{item.span}</span>
                </div>
                <div className="regionBar"><div className="regionBarFill" style={{ width: `${item.percent}%` }} /></div>
                <span className="regionPct" style={{ color: accColor(item.percent) }}>{item.percent}%</span>
                <span className="regionCount">{item.count}</span>
              </div>
            ))}
            {accuracyTab === "region" && REGIONS.map((item) => (
              <div key={item.label} className="regionRow">
                <span className="regionLabel">{item.label}</span>
                <div className="regionBar"><div className="regionBarFill" style={{ width: `${item.percent}%` }} /></div>
                <span className="regionPct" style={{ color: accColor(item.percent) }}>{item.percent}%</span>
                <span className="regionCount">{item.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── History collection ── */}
        <section className="card">
          <div className="cardHead"><span className="accentBar" /><h2 className="cardTitle">History collection</h2></div>
          <div className="tabBar">
            <button className={`tabBtn ${historyTab === "era" ? "tabActive" : ""}`} onClick={() => setHistoryTab("era")}>Era</button>
            <button className={`tabBtn ${historyTab === "region" ? "tabActive" : ""}`} onClick={() => setHistoryTab("region")}>Region</button>
          </div>
          <div className="regionWrap">
            {historyTab === "era" && ERAS.map((item) => (
              <div key={item.label} className="regionRow">
                <span className="regionLabel">{item.label}</span>
                <div className="regionBar"><div className="regionBarFill" style={{ width: `${item.percent}%` }} /></div>
                <span className="regionPct">{item.percent}%</span>
                <span className="regionCount">{item.count}</span>
              </div>
            ))}
            {historyTab === "region" && REGIONS.map((item) => (
              <div key={item.label} className="regionRow">
                <span className="regionLabel">{item.label}</span>
                <div className="regionBar"><div className="regionBarFill" style={{ width: `${item.percent}%` }} /></div>
                <span className="regionPct">{item.percent}%</span>
                <span className="regionCount">{item.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Account ── */}
        <section className="card">
          <div className="cardHead"><span className="accentBar" /><h2 className="cardTitle">Account</h2></div>
          <div className="accountBody">
            <div className="accountRow">
              <span className="accountKey">Email</span>
              <span className="accountVal">{PROFILE.email}</span>
            </div>
            <div className="accountRow">
              <span className="accountKey">Member since</span>
              <span className="accountVal">{PROFILE.joined}</span>
            </div>
            <button className="signOutBtn">Sign out</button>
          </div>
        </section>

        <div className="dockSpacer" />
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }
      `}</style>

      <style jsx>{`
        .screen {
          position: fixed; inset: 0; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #fff;
        }
        .bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,0.86); }

        .protoBar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 60;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; background: rgba(10,10,12,0.6); backdrop-filter: blur(8px); flex-wrap: wrap;
        }
        .protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }
        .protoHint { font-size: 12px; font-weight: 600; opacity: 0.55; }

        .scroll {
          position: absolute; inset: 0; z-index: 2; overflow-y: auto;
          padding: 50px 16px calc(28px + env(safe-area-inset-bottom));
          display: flex; flex-direction: column; gap: 14px;
          max-width: 560px; margin: 0 auto; box-sizing: border-box;
        }

        /* ── Top actions ── */
        .topActions { display: flex; align-items: center; justify-content: space-between; padding: 4px 2px 0; }
        .backBtn {
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
          background: transparent; border: none; color: rgba(255,255,255,0.8); font-size: 14px; font-weight: 600;
        }
        .editBtn {
          font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; cursor: pointer;
          color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 7px 15px;
        }
        .editBtn:hover { background: rgba(255,255,255,0.15); }

        /* ── Cards ── */
        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }
        .cardHead { display: flex; align-items: center; gap: 10px; padding: 16px 18px 10px; }
        .accentBar { width: 4px; height: 18px; border-radius: 999px; background: #22d3ee; }
        .cardTitle { font-size: 16px; font-weight: 700; margin: 0; }

        /* ── Hero ── */
        .heroCard { display: flex; align-items: center; gap: 16px; padding: 20px 18px; }
        .avatarWrap { position: relative; flex-shrink: 0; }
        .avatar {
          width: 76px; height: 76px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-size: 28px; font-weight: 800; color: #fff;
          background: linear-gradient(135deg, #22d3ee, #8b5cf6); border: 2px solid rgba(255,255,255,0.25);
        }
        .levelBadge {
          position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%);
          font-size: 10px; font-weight: 800; letter-spacing: 0.5px; color: #06181c;
          background: #ffd54a; padding: 2px 9px; border-radius: 999px; white-space: nowrap;
        }
        .heroInfo { flex: 1; min-width: 0; }
        .name { font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.3px; }
        .handle { display: block; font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 2px; }
        .levelBar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; margin-top: 12px; }
        .levelBarFill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #22d3ee, #8b5cf6); transition: width 0.8s cubic-bezier(0.16,1,0.3,1); }
        .levelHint { display: block; font-size: 11px; color: rgba(255,255,255,0.45); margin-top: 5px; }

        /* ── Stat strip ── */
        .statStrip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .statCard {
          display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 14px 6px;
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; backdrop-filter: blur(10px);
        }
        .statVal { font-size: 22px; font-weight: 800; }
        .statLabel { font-size: 11px; color: rgba(255,255,255,0.5); text-align: center; }

        /* ── Accuracy breakdown ── */
        .heroAcc { display: flex; align-items: center; gap: 18px; padding: 20px 18px; }
        .ringWrap { position: relative; flex-shrink: 0; width: 132px; height: 132px; }
        .ringCenter { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .ringValue { font-size: 32px; font-weight: 800; line-height: 1; }
        .ringPct { font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.6); }
        .ringLabel { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 4px; }
        .accSide { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        .accTile { display: grid; grid-template-columns: 52px 1fr 44px; align-items: center; gap: 10px; }
        .accTileLabel { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; }
        .accBar { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .accBarFill { height: 100%; border-radius: 999px; transition: width 0.8s cubic-bezier(0.16,1,0.3,1); }
        .accTileVal { font-size: 15px; font-weight: 800; text-align: right; }
        .accFoot { font-size: 12px; color: rgba(255,255,255,0.45); }

        /* ── Badges ── */
        .badgeTierRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 0 18px; }
        .badgeTier { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px 6px; border-radius: 14px; }
        .badgeTierCount { font-size: 24px; font-weight: 800; }
        .badgeTierLabel { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); }
        .badgeDimRow { display: flex; gap: 8px; padding: 12px 18px 18px; }
        .badgeDim {
          flex: 1; display: flex; align-items: center; gap: 7px; padding: 10px 12px; border-radius: 11px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        }
        .badgeDimDot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .badgeDimLabel { font-size: 12px; color: rgba(255,255,255,0.7); flex: 1; }
        .badgeDimCount { font-size: 14px; font-weight: 800; }

        /* ── Modes ── */
        .modeRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 0 18px 18px; }
        .modeCard {
          position: relative; overflow: hidden; border-radius: 14px; padding: 16px 12px 14px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .modeAccent { position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .modeName { font-size: 14px; font-weight: 700; }
        .modeAcc { font-size: 22px; font-weight: 800; }
        .modeGames { font-size: 11px; color: rgba(255,255,255,0.55); }

        /* ── Region ── */
        .regionWrap { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 10px; }
        .regionRow { display: grid; grid-template-columns: 120px 1fr 44px 36px; align-items: center; gap: 10px; }
        .regionLabelWrap { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .regionLabel { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .regionSpan { font-size: 11px; color: rgba(255,255,255,0.45); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .regionBar { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .regionBarFill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #22d3ee, #8b5cf6); }
        .regionPct { font-size: 13px; font-weight: 800; text-align: right; }
        .regionCount { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.45); text-align: right; }

        /* ── Tabs ── */
        .tabBar { display: flex; gap: 6px; padding: 0 18px 12px; }
        .tabBtn {
          flex: 1; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.6);
          font-size: 13px; font-weight: 700; cursor: pointer; transition: all .15s ease;
        }
        .tabBtn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85); }
        .tabActive { background: rgba(34,211,238,0.12); border-color: rgba(34,211,238,0.35); color: #22d3ee; }
        .tabActive:hover { background: rgba(34,211,238,0.18); color: #67e8f9; }

        /* ── Account ── */
        .accountBody { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 14px; }
        .accountRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .accountKey { font-size: 14px; color: rgba(255,255,255,0.7); }
        .accountVal { font-size: 14px; color: rgba(255,255,255,0.5); }
        .signOutBtn {
          margin-top: 4px; width: 100%; padding: 13px; border-radius: 12px; cursor: pointer;
          font-size: 14px; font-weight: 700; color: #f87171;
          background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.35);
        }
        .signOutBtn:hover { background: rgba(239,68,68,0.22); }

        .dockSpacer { height: 4px; }
      `}</style>
    </main>
  );
}
