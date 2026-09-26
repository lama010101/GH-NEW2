"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Home restructure: bottom nav + mode toggle + streak
// Route: /prototype/homenav   (direct access, self-contained, UI-only)
//
// UIX-BUILD-HOMENAV-001. Restructures the prod /home single-scroll layout into
// a GeoGuessr-style tabbed shell:
//
//   1. PERSISTENT BOTTOM NAV — Home / Play / Challenge / Profile.
//      - Home      = today's home content post-restructure (Journey card,
//                    Cartographer rank strip, Daily card, Practice card,
//                    Challenge entry card that points at the Challenge tab).
//      - Play      = mode-selection screen (does NOT launch a game directly):
//                    SOLO | MULTIPLAYER segmented toggle. SOLO shows the
//                    Historian's Journey card, Cartographer rank strip and
//                    Daily card; MULTIPLAYER shows a Challenge entry card that
//                    points at the Challenge tab (pointer chosen over
//                    duplicating the whole Challenge panel inside Play).
//      - Challenge = the existing friends feature (CompetePanel) relocated
//                    here: create-game head + Invitations / Your Turn /
//                    Completed sub-tabs. Internal logic untouched (mocked).
//      - Profile   = represents the existing /profile screen (real route
//                    exists: src/app/profile/page.tsx; /progress + /account
//                    also exist via NavModal). Mock profile surface here.
//      The hamburger keeps secondary/settings items (Leaderboard, Stats,
//      Account, Help, Install, Sign out).
//
//   2. DAILY CARD -> STREAK FRAMING — the "Next in: Xh Ym" countdown is
//      replaced by a 7-day streak row (day-of-week checkboxes, current day
//      highlighted). REAL backing exists, none invented:
//      player_daily_streak.daily_streak_current / _best / last_attempt_date
//      (written by sessionCore.ts §8 step 4) + daily_attempts rows for the
//      per-day checkmarks. Mock values used here.
//
//   3. HERO BAND — the historical-photo collage (same /mobile|desktop-
//      home_background.webp the prod page uses as a faint full-page bg) is
//      pulled forward into a fixed ~200px band behind the top header row
//      (logo / rank pill / bell / avatar / hamburger). Header content is
//      unchanged; the page body below is flat dark.
//
// All data is MOCK and held in local state. No Supabase, no auth, no
// network. Only this file is created. No other app files are touched.
// ============================================================================

import { useEffect, useState } from "react";

type TabId = "home" | "play" | "challenge" | "profile";
type PlayMode = "solo" | "multiplayer";
type ChallengeTab = "invitations" | "your_turn" | "completed";

// ── Mock profile (real backing: profiles + player_global_stats.total_xp) ──
const PROFILE = {
  displayName: "Alex Rivera",
  initials: "AR",
  avgAccuracy: 87,
  // 32,500 XP -> rankForXp tier 4 "Cartographer" (next: Explorer @ 50,000).
  totalXp: 32500,
  xpToNext: 17500,
  nextTitle: "Explorer",
  rankProgressPct: 42,
  gamesPlayed: 138,
  // player_daily_streak.daily_streak_current / daily_streak_best.
  dayStreak: 5,
  bestStreak: 12,
};

// ── Mock Historian's Journey state (real backing: journey_player_progress +
//    journey_stages; 42 completed -> floor(41/5)=8 "Steam Engine", 41%5=1
//    "Apprentice", icon rank-09.png — same math as StageCard.tsx) ──
const JOURNEY = {
  completed: 42,
  total: 100,
  tierTitle: "Steam Engine Apprentice",
  icon: "/icons/ranks/rank-09.png",
};

// ── Mock Challenge data (mirrors CompetePanel row shapes, UI-only) ──
const MOCK_INVITES = [
  { id: "i1", name: "Sarah Kim", initials: "SK", mode: "Relax", sent: "2h ago", left: "4d left" },
];

const MOCK_YOUR_TURN = [
  { id: "g1", name: "Mike Ross", initials: "MR", mode: "Rush", sub: "Round 2/5" },
  { id: "g2", name: "You (waiting)", initials: "AR", mode: "Relax", sub: "Round 0/5 · 13d left" },
];

const MOCK_COMPLETED = [
  { id: "g3", name: "Tom Webb", initials: "TW", mode: "Rush", sub: "3d ago", accuracy: 84, rank: 3 },
];

const fmtXp = (n: number) => n.toLocaleString("fr-FR");

function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

// ── 7-day streak row (replaces the "Next in" countdown on the Daily card).
//    Backed by real fields: player_daily_streak counters + daily_attempts
//    rows per UTC+14 date (§9: any attempt — in_progress/expired — counts). ──
function StreakRow() {
  // Mon-based index of today (0=Mon .. 6=Sun) so the highlight is real.
  const todayIdx = (new Date().getDay() + 6) % 7;
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  // Mock: the 5-day streak ends on today; days before the streak window in
  // this week render unchecked (they'd be read from daily_attempts).
  const checked = labels.map((_, i) => i <= todayIdx && i > todayIdx - PROFILE.dayStreak);
  return (
    <div className="hn-streakWrap">
      <div className="hn-streakHead">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2c1.5 3.5-.5 5.5-2 7-1.2 1.2-2 2.6-2 4.2A4.5 4.5 0 0 0 12.5 18c2.5-.3 4.5-2.3 4.5-5 0-1-.3-2-.8-2.8-.5 1-1.3 1.6-2.2 1.9.6-2.8-.3-7-2-10.1zM12 22a6 6 0 0 1-6-6c0-2.2 1-4 2.3-5.5C9.6 9 10.7 7.8 12 6c2.5 3.6 6 6.6 6 10a6 6 0 0 1-6 6z"
            fill="currentColor"
          />
        </svg>
        <span className="hn-streakCount">{PROFILE.dayStreak}-day streak</span>
        <span className="hn-streakBest">best {PROFILE.bestStreak}</span>
      </div>
      <div className="hn-streakDays">
        {labels.map((d, i) => (
          <div
            key={i}
            className={[
              "hn-streakDay",
              checked[i] ? "hn-streakDayDone" : "",
              i === todayIdx ? "hn-streakDayToday" : "",
            ].join(" ")}
          >
            <span className="hn-streakCheck">{checked[i] ? "✓" : ""}</span>
            <span className="hn-streakDow">{d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mode/progress cards (prod visual language: gradient bg, icon thumb left,
//    text middle, pill/chevron right). All CTAs are inert in the prototype. ──
function JourneyCard() {
  return (
    <div className="hn-card" style={{ background: "linear-gradient(135deg, #172554 0%, #1d4ed8 55%, #3b82f6 100%)" }}>
      <div className="hn-cardInner">
        <div className="hn-cardThumb" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={JOURNEY.icon} alt="" className="hn-cardThumbImg" draggable={false} />
        </div>
        <div className="hn-cardText">
          <h2 className="hn-cardTitle">HISTORIAN&apos;S JOURNEY</h2>
          <p className="hn-cardDesc"><b>{JOURNEY.tierTitle}</b></p>
          <p className="hn-cardDesc">{JOURNEY.completed} of {JOURNEY.total} stages completed</p>
        </div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hn-cardChevron">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  );
}

function RankStrip() {
  return (
    <div className="hn-rankStrip">
      <div className="hn-rankMed">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/rank-titles/cartographer.jpg" alt="Cartographer" className="hn-rankMedImg" draggable={false} />
        <span className="hn-rankMedTier"><span>T4</span></span>
      </div>
      <div className="hn-rankBody">
        <div className="hn-rankHead">
          <h3 className="hn-rankTitle">Cartographer</h3>
          <span className="hn-rankXp">{fmtXp(PROFILE.totalXp)}<i> XP</i></span>
        </div>
        <div className="hn-rankNext">
          <span className="hn-rankNextLabel">Next:</span>
          <span className="hn-rankNextTitle">{fmtXp(PROFILE.xpToNext)} XP to {PROFILE.nextTitle}</span>
        </div>
        <div className="hn-rankBar">
          <span className="hn-rankBarFill" style={{ width: `${PROFILE.rankProgressPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function DailyCard() {
  return (
    <div className="hn-card" style={{ background: "linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%)" }}>
      <div className="hn-cardInner">
        <div className="hn-cardThumb" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/daily_large.webp" alt="" className="hn-cardThumbImg" draggable={false} />
        </div>
        <div className="hn-cardText">
          <h2 className="hn-cardTitle">DAILY</h2>
          <p className="hn-cardDesc">Same events.<br />Rank worldwide</p>
          <StreakRow />
        </div>
        <button type="button" className="hn-pill" aria-label="Play Daily">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
          PLAY
        </button>
      </div>
    </div>
  );
}

function PracticeCard() {
  return (
    <div className="hn-card" style={{ background: "linear-gradient(135deg, #7c3008 0%, #c05010 50%, #ea6820 100%)" }}>
      <div className="hn-cardInner">
        <div className="hn-cardThumb" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/practice_large.webp" alt="" className="hn-cardThumbImg" draggable={false} />
        </div>
        <div className="hn-cardText">
          <h2 className="hn-cardTitle">PRACTICE</h2>
          <p className="hn-cardDesc">Play solo.<br />Unlimited</p>
        </div>
        <button type="button" className="hn-pill" aria-label="Play Practice">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
          PLAY
        </button>
      </div>
    </div>
  );
}

function ChallengeEntryCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="hn-card" style={{ background: "linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)" }}>
      <div className="hn-cardInner">
        <div className="hn-cardThumb" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/compete_large.webp" alt="" className="hn-cardThumbImg" draggable={false} />
        </div>
        <div className="hn-cardText">
          <h2 className="hn-cardTitle">CHALLENGE</h2>
          <p className="hn-cardDesc">Play with your friends.<br />Real-time or Turn-based</p>
        </div>
        <button type="button" className="hn-pill" onClick={onOpen} aria-label="Open Challenge tab">
          OPEN
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Tab content panels ──
function HomeTab({ onOpenChallenge }: { onOpenChallenge: () => void }) {
  return (
    <>
      <div className="hn-tagline">Where &amp; When — guess the moment that shaped history.</div>
      <JourneyCard />
      <RankStrip />
      <DailyCard />
      <PracticeCard />
      <ChallengeEntryCard onOpen={onOpenChallenge} />
    </>
  );
}

function PlayTab({ onOpenChallenge }: { onOpenChallenge: () => void }) {
  const [mode, setMode] = useState<PlayMode>("solo");
  return (
    <>
      <div className="hn-segWrap">
        <div className="hn-seg" role="tablist" aria-label="Play mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "solo"}
            className={`hn-segBtn ${mode === "solo" ? "hn-segBtnOn" : ""}`}
            onClick={() => setMode("solo")}
          >
            SOLO
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "multiplayer"}
            className={`hn-segBtn ${mode === "multiplayer" ? "hn-segBtnOn" : ""}`}
            onClick={() => setMode("multiplayer")}
          >
            MULTIPLAYER
          </button>
        </div>
      </div>
      {mode === "solo" ? (
        <>
          <JourneyCard />
          <RankStrip />
          <DailyCard />
        </>
      ) : (
        <>
          <ChallengeEntryCard onOpen={onOpenChallenge} />
          <p className="hn-hint">
            Invitations, your-turn games and results live in the Challenge tab.
          </p>
        </>
      )}
    </>
  );
}

function ChallengeTabPanel() {
  const [tab, setTab] = useState<ChallengeTab>("invitations");
  const tabs: Array<{ key: ChallengeTab; label: string; count: number }> = [
    { key: "invitations", label: "Invitations", count: MOCK_INVITES.length },
    { key: "your_turn", label: "Your Turn", count: MOCK_YOUR_TURN.length },
    { key: "completed", label: "Completed", count: MOCK_COMPLETED.length },
  ];
  return (
    <>
      {/* Play-with-friends head (same content as the prod compete card row) */}
      <div className="hn-card" style={{ background: "linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)" }}>
        <div className="hn-cardInner">
          <div className="hn-cardThumb" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/compete_large.webp" alt="" className="hn-cardThumbImg" draggable={false} />
          </div>
          <div className="hn-cardText">
            <h2 className="hn-cardTitle">CHALLENGE</h2>
            <p className="hn-cardDesc">Play with your friends.<br />Real-time or Turn-based</p>
          </div>
          <button type="button" className="hn-pill" aria-label="Create game">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            CREATE
          </button>
        </div>
      </div>

      {/* Sub tab bar (mirrors CompetePanel: Invitations / Your Turn / Completed) */}
      <div className="hn-subPanel">
        <div className="hn-subBar">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`hn-subTab ${tab === t.key ? "hn-subTabOn" : ""}`}
            >
              {t.label}
              {t.count > 0 && <span className="hn-subBadge">{t.count}</span>}
            </button>
          ))}
        </div>

        {tab === "invitations" && (
          <div className="hn-gameList">
            {MOCK_INVITES.map((g) => (
              <div key={g.id} className="hn-gameRow">
                <span className="hn-ava">{g.initials}</span>
                <div className="hn-gameInfo">
                  <span className="hn-gameName">{g.name}</span>
                  <span className="hn-gameSub"><span className="hn-modeBadge">{g.mode}</span> invited you · {g.sent} · {g.left}</span>
                </div>
                <button type="button" className="hn-goBtn" aria-label="Accept invitation">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
                </button>
                <button type="button" className="hn-delBtn" aria-label="Decline invitation">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "your_turn" && (
          <div className="hn-gameList">
            {MOCK_YOUR_TURN.map((g) => (
              <div key={g.id} className="hn-gameRow">
                <span className="hn-ava">{g.initials}</span>
                <div className="hn-gameInfo">
                  <span className="hn-gameName">{g.name}</span>
                  <span className="hn-gameSub"><span className="hn-modeBadge">{g.mode}</span> {g.sub}</span>
                </div>
                <button type="button" className="hn-goBtn" aria-label="Play your turn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "completed" && (
          <div className="hn-gameList">
            {MOCK_COMPLETED.map((g) => (
              <div key={g.id} className="hn-gameRow">
                <span className="hn-ava">{g.initials}</span>
                <div className="hn-gameInfo">
                  <span className="hn-gameName">{g.name}</span>
                  <span className="hn-gameSub"><span className="hn-modeBadge">{g.mode}</span> {g.sub}</span>
                </div>
                <span className="hn-gameAcc" style={{ color: accColor(g.accuracy) }}>{g.accuracy}%</span>
                <span className="hn-gameRank">#{g.rank}</span>
                <button type="button" className="hn-delBtn" aria-label="Delete game">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Mock of the existing /profile screen (display name, level, stats, account
// entries) — represents the real route this tab would host.
function ProfileTabPanel() {
  const menu = ["Profile stats", "Account settings", "Leaderboard", "Help", "Install app"];
  return (
    <>
      <div className="hn-profHero">
        <span className="hn-profAva">{PROFILE.initials}</span>
        <h2 className="hn-profName">{PROFILE.displayName}</h2>
        <span className="hn-profSub">Cartographer · LV 14</span>
      </div>
      <div className="hn-profStats">
        <div className="hn-profStat"><span className="hn-profVal" style={{ color: accColor(PROFILE.avgAccuracy) }}>{PROFILE.avgAccuracy}%</span><span className="hn-profLabel">Accuracy</span></div>
        <div className="hn-profStat"><span className="hn-profVal" style={{ color: "#ffd54a" }}>{fmtXp(PROFILE.totalXp)}</span><span className="hn-profLabel">Total XP</span></div>
        <div className="hn-profStat"><span className="hn-profVal">{PROFILE.gamesPlayed}</span><span className="hn-profLabel">Games</span></div>
        <div className="hn-profStat"><span className="hn-profVal" style={{ color: "#fb923c" }}>{PROFILE.dayStreak}</span><span className="hn-profLabel">Day streak</span></div>
      </div>
      <div className="hn-profMenu">
        {menu.map((m) => (
          <button key={m} type="button" className="hn-profRow">
            <span>{m}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        ))}
        <button type="button" className="hn-profRow hn-profRowDanger">
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}

// ── Bottom nav icons ──
function NavIcon({ id, active }: { id: TabId; active: boolean }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const };
  const stroke = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "home":
      return (
        <svg {...common} {...stroke}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h5v-6h4v6h5V9.5" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.2 : 0} />
        </svg>
      );
    case "play":
      return (
        <svg {...common} {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "challenge":
      return (
        <svg {...common} {...stroke}>
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
          <path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common} {...stroke}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.2 : 0} />
        </svg>
      );
  }
}

const NAV_ITEMS: Array<{ id: TabId; label: string }> = [
  { id: "home", label: "Home" },
  { id: "play", label: "Play" },
  { id: "challenge", label: "Challenge" },
  { id: "profile", label: "Profile" },
];

export default function HomeNavPrototypePage() {
  const [tab, setTab] = useState<TabId>("home");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = "Home Nav — Guess-History Prototype";
  }, []);

  const openChallenge = () => setTab("challenge");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PROTOTYPE_CSS }} />
      <main className="hn-screen">
        {/* Proto bar */}
        <div className="hn-protoBar">
          <span className="hn-protoTitle">Home — Bottom Nav restructure</span>
          <span className="hn-protoHint">Mock data</span>
        </div>

        {/* ── Hero band: the page-background collage pulled forward into a
            ~200px band behind the header row ── */}
        <div className="hn-hero">
          <div className="hn-heroImg" aria-hidden="true" />
          <div className="hn-heroScrim" aria-hidden="true" />
          <div className="hn-topbar">
            <button className="hn-topbarLogo" type="button">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/logo.webp" alt="logo" width={120} height={32} className="hn-topbarLogoImg" />
            </button>
            <div className="hn-xpPill">
              <span className="hn-xpPillBadge">RANK 4</span>
              <span className="hn-xpPillAcc" style={{ color: accColor(PROFILE.avgAccuracy) }}>
                {PROFILE.avgAccuracy}<span className="hn-xpPillAccSuffix">%</span>
              </span>
            </div>
            <div className="hn-topbarRight">
              <button type="button" className="hn-bellBtn" aria-label="Notifications">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                <span className="hn-bellDot">2</span>
              </button>
              <button type="button" className="hn-avatarBtn" aria-label="Profile">
                <span className="hn-avatarInitials">{PROFILE.initials}</span>
              </button>
              <button type="button" className="hn-menuBtn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable tab content */}
        <div className="hn-scroll">
          <div className="hn-content">
            {tab === "home" && <HomeTab onOpenChallenge={openChallenge} />}
            {tab === "play" && <PlayTab onOpenChallenge={openChallenge} />}
            {tab === "challenge" && <ChallengeTabPanel />}
            {tab === "profile" && <ProfileTabPanel />}
          </div>
        </div>

        {/* Persistent bottom nav */}
        <nav className="hn-nav" aria-label="Primary">
          <div className="hn-navInner">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`hn-navBtn ${tab === item.id ? "hn-navBtnOn" : ""}`}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => setTab(item.id)}
              >
                <NavIcon id={item.id} active={tab === item.id} />
                <span className="hn-navLabel">{item.label}</span>
                {item.id === "challenge" && <span className="hn-navDot" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </nav>

        {/* Hamburger menu — secondary/settings items only */}
        {menuOpen && (
          <div className="hn-menuOverlay" onClick={() => setMenuOpen(false)}>
            <div className="hn-menuSheet" onClick={(e) => e.stopPropagation()}>
              <div className="hn-menuHead">
                <span className="hn-ava hn-avaLg">{PROFILE.initials}</span>
                <div>
                  <div className="hn-gameName">{PROFILE.displayName}</div>
                  <div className="hn-gameSub">Cartographer · {fmtXp(PROFILE.totalXp)} XP</div>
                </div>
                <button type="button" className="hn-delBtn hn-menuClose" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
              {["Leaderboard", "Profile stats", "Account settings", "Help", "Fullscreen / Install App"].map((m) => (
                <button key={m} type="button" className="hn-menuItem" onClick={() => setMenuOpen(false)}>{m}</button>
              ))}
              <button type="button" className="hn-menuItem hn-profRowDanger" onClick={() => setMenuOpen(false)}>Sign out</button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

// ============================================================================
// PROTOTYPE CSS — all styles inline in this file (no CSS module touched)
// ============================================================================
const PROTOTYPE_CSS = `
  html, body { margin: 0; padding: 0; background: #080c14; }

  .hn-screen {
    position: fixed;
    inset: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #080c14;
  }

  /* ── Proto bar ── */
  .hn-protoBar {
    position: relative;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    background: #fbbf24;
    color: #1c1005;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .hn-protoHint { font-weight: 600; opacity: 0.75; text-transform: none; }

  /* ── Hero band (~200px) behind the header ── */
  .hn-hero {
    position: relative;
    height: 200px;
    flex-shrink: 0;
    overflow: hidden;
  }
  .hn-heroImg {
    position: absolute;
    inset: 0;
    background-image: url(/desktop-home_background.webp);
    background-size: cover;
    background-position: center 30%;
  }
  @media (max-width: 768px) {
    .hn-heroImg { background-image: url(/mobile-home_background.webp); }
  }
  .hn-heroScrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(8,12,20,0.45) 0%, rgba(8,12,20,0.18) 45%, rgba(8,12,20,0.92) 92%, #080c14 100%);
  }

  /* ── Top bar (same content as prod TopBar: logo / rank pill / bell / avatar
        / hamburger) ── */
  .hn-topbar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 0;
  }
  .hn-topbarLogo { background: none; border: none; padding: 0; cursor: pointer; }
  .hn-topbarLogoImg { display: block; height: 32px; width: auto; }
  .hn-xpPill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(8,12,20,0.55);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,0.14);
  }
  .hn-xpPillBadge { font-size: 10px; font-weight: 800; letter-spacing: 0.6px; color: #ffd54a; text-transform: uppercase; }
  .hn-xpPillAcc { font-size: 13px; font-weight: 800; }
  .hn-xpPillAccSuffix { font-size: 9px; margin-left: 1px; opacity: 0.8; }
  .hn-topbarRight { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .hn-bellBtn, .hn-menuBtn, .hn-avatarBtn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: rgba(8,12,20,0.55);
    color: #fff;
    cursor: pointer;
    backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,0.14);
  }
  .hn-bellDot {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .hn-avatarBtn { background: linear-gradient(135deg, #22d3ee, #8b5cf6); font-weight: 800; }
  .hn-avatarInitials { font-size: 13px; }

  /* ── Scroll area ── */
  .hn-scroll {
    position: relative;
    z-index: 1;
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .hn-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 16px 16px 28px;
    box-sizing: border-box;
  }
  @media (min-width: 768px) {
    .hn-content { max-width: 600px; }
  }

  .hn-tagline {
    text-align: center;
    color: #fff;
    font-size: 17px;
    font-weight: 500;
    letter-spacing: 0.2px;
    line-height: 1.4;
    padding: 0 8px 4px;
  }

  /* ── Cards (prod visual language) ── */
  .hn-card { width: 100%; border-radius: 16px; overflow: hidden; }
  .hn-cardInner {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    min-height: 110px;
    box-sizing: border-box;
  }
  .hn-cardThumb {
    width: 96px;
    height: 96px;
    border-radius: 16px;
    background: rgba(255,255,255,0.15);
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }
  .hn-cardThumbImg {
    position: absolute;
    top: 10%;
    left: 10%;
    width: 80%;
    height: 80%;
    object-fit: cover;
  }
  .hn-cardText { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .hn-cardTitle {
    font-size: 22px;
    font-weight: 800;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0;
    font-family: "Bebas Neue", -apple-system, sans-serif;
    line-height: 1;
  }
  .hn-cardDesc {
    font-size: 14px;
    color: rgba(255,255,255,0.75);
    line-height: 1.4;
    margin: 0;
  }
  .hn-cardChevron { color: #fff; opacity: 0.8; flex-shrink: 0; }
  .hn-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: rgba(255,255,255,0.22);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding: 8px 12px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    transition: background 0.15s, transform 0.15s;
  }
  .hn-pill:hover { background: rgba(255,255,255,0.36); transform: scale(1.06); }
  .hn-pill:active { transform: scale(0.94); }

  @media (max-width: 380px) {
    .hn-cardInner { padding: 12px 14px; gap: 10px; }
    .hn-cardThumb { width: 80px; height: 80px; }
  }

  /* ── Cartographer rank strip (RankCard, inline variant) ── */
  .hn-rankStrip {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-radius: 16px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(8px);
  }
  .hn-rankMed {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    overflow: visible;
    flex-shrink: 0;
  }
  .hn-rankMedImg {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255,213,74,0.7);
  }
  .hn-rankMedTier {
    position: absolute;
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
    background: #ffd54a;
    color: #1c1005;
    font-size: 9px;
    font-weight: 800;
    padding: 1px 7px;
    border-radius: 999px;
    letter-spacing: 0.5px;
  }
  .hn-rankBody { flex: 1; min-width: 0; }
  .hn-rankHead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .hn-rankTitle {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    color: #ffd54a;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: "Bebas Neue", -apple-system, sans-serif;
  }
  .hn-rankXp { font-size: 13px; font-weight: 800; color: #fff; white-space: nowrap; }
  .hn-rankXp i { font-style: normal; font-size: 9px; opacity: 0.7; margin-left: 2px; }
  .hn-rankNext { display: flex; gap: 6px; font-size: 11px; color: rgba(255,255,255,0.65); margin-top: 2px; }
  .hn-rankNextLabel { font-weight: 700; }
  .hn-rankBar {
    margin-top: 6px;
    height: 6px;
    border-radius: 999px;
    background: rgba(255,255,255,0.12);
    overflow: hidden;
  }
  .hn-rankBarFill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #ffd54a, #fb923c);
  }

  /* ── Daily streak row (replaces "Next in" countdown) ── */
  .hn-streakWrap { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
  .hn-streakHead { display: flex; align-items: center; gap: 6px; color: #ffb74d; }
  .hn-streakCount { font-size: 12px; font-weight: 800; color: #ffb74d; }
  .hn-streakBest { font-size: 10px; color: rgba(255,255,255,0.55); margin-left: auto; }
  .hn-streakDays { display: flex; gap: 5px; }
  .hn-streakDay {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 5px 0 4px;
    border-radius: 8px;
    background: rgba(0,0,0,0.25);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .hn-streakCheck {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.35);
    font-size: 10px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
  }
  .hn-streakDayDone .hn-streakCheck {
    background: #ffb74d;
    border-color: #ffb74d;
    color: #4a1500;
  }
  .hn-streakDayToday {
    border-color: #ffd54a;
    background: rgba(255,213,74,0.16);
  }
  .hn-streakDow { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.65); }
  .hn-streakDayToday .hn-streakDow { color: #ffd54a; }

  /* ── Play tab segmented toggle ── */
  .hn-segWrap { padding: 4px 0 8px; }
  .hn-seg {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .hn-segBtn {
    flex: 1;
    padding: 10px 0;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: rgba(255,255,255,0.6);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.8px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .hn-segBtnOn { background: #fff; color: #080c14; }
  .hn-hint { margin: 4px 4px 0; font-size: 12px; color: rgba(255,255,255,0.55); text-align: center; }

  /* ── Challenge sub panel (mirrors CompetePanel) ── */
  .hn-subPanel {
    border-radius: 16px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    padding: 12px;
    backdrop-filter: blur(8px);
  }
  .hn-subBar {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: rgba(0,0,0,0.3);
    margin-bottom: 10px;
  }
  .hn-subTab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px 0;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: rgba(255,255,255,0.6);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .hn-subTabOn { background: rgba(255,255,255,0.16); color: #fff; }
  .hn-subBadge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: #22d3ee;
    color: #06222a;
    font-size: 10px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .hn-gameList { display: flex; flex-direction: column; }
  .hn-gameRow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 4px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .hn-gameRow:first-child { border-top: none; }
  .hn-ava {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #64748b, #334155);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .hn-avaLg { width: 40px; height: 40px; font-size: 13px; }
  .hn-gameInfo { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .hn-gameName { font-size: 13px; font-weight: 700; color: #fff; }
  .hn-gameSub { font-size: 11px; color: rgba(255,255,255,0.6); }
  .hn-modeBadge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(34,211,238,0.18);
    color: #67e8f9;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .hn-goBtn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: #22d3ee;
    color: #06222a;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .hn-delBtn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .hn-gameAcc { font-size: 13px; font-weight: 800; }
  .hn-gameRank { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.6); }

  /* ── Profile tab ── */
  .hn-profHero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px 16px;
    border-radius: 16px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .hn-profAva {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: linear-gradient(135deg, #22d3ee, #8b5cf6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 800;
  }
  .hn-profName { margin: 4px 0 0; font-size: 20px; font-weight: 800; }
  .hn-profSub { font-size: 12px; color: rgba(255,255,255,0.6); }
  .hn-profStats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .hn-profStat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 4px;
    border-radius: 12px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
  }
  .hn-profVal { font-size: 15px; font-weight: 800; }
  .hn-profLabel { font-size: 9px; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.4px; }
  .hn-profMenu {
    border-radius: 16px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    overflow: hidden;
  }
  .hn-profRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 14px 16px;
    background: none;
    border: none;
    border-top: 1px solid rgba(255,255,255,0.08);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }
  .hn-profRow:first-child { border-top: none; }
  .hn-profRowDanger { color: #f87171; }

  /* ── Persistent bottom nav ── */
  .hn-nav {
    flex-shrink: 0;
    background: rgba(10,14,22,0.92);
    backdrop-filter: blur(12px);
    border-top: 1px solid rgba(255,255,255,0.1);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .hn-navInner {
    display: flex;
    max-width: 600px;
    margin: 0 auto;
  }
  .hn-navBtn {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 9px 0 8px;
    background: none;
    border: none;
    color: rgba(255,255,255,0.55);
    cursor: pointer;
    font-family: inherit;
  }
  .hn-navBtn::before {
    content: "";
    position: absolute;
    top: 0;
    left: 22%;
    right: 22%;
    height: 2px;
    border-radius: 2px;
    background: transparent;
  }
  .hn-navBtnOn { color: #ffd54a; }
  .hn-navBtnOn::before { background: #ffd54a; }
  .hn-navLabel { font-size: 10px; font-weight: 700; letter-spacing: 0.3px; }
  .hn-navDot {
    position: absolute;
    top: 8px;
    right: calc(50% - 20px);
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ef4444;
  }

  /* ── Hamburger sheet (secondary/settings items) ── */
  .hn-menuOverlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .hn-menuSheet {
    width: 100%;
    max-width: 480px;
    max-height: 75%;
    overflow-y: auto;
    background: #10151f;
    border-radius: 20px 20px 0 0;
    border: 1px solid rgba(255,255,255,0.12);
    border-bottom: none;
    padding: 8px 12px calc(16px + env(safe-area-inset-bottom, 0px));
  }
  .hn-menuHead {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 4px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    margin-bottom: 6px;
  }
  .hn-menuHead > div { flex: 1; }
  .hn-menuClose { margin-left: auto; }
  .hn-menuItem {
    display: block;
    width: 100%;
    padding: 14px 8px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
`;
