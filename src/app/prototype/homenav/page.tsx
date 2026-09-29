"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Home restructure: 2-tab nav, Historian hero card
// Route: /prototype/homenav   (direct access, self-contained, UI-only)
//
// UIX-BUILD-HOMENAV-003 — corrective pass on the -002 revision after review:
//      - Nav tabs render REAL icon files: play_large.webp (singleplayer) and
//        compete_large.webp (multiplayer — same file prod Challenge uses).
//      - Multiplayer tab shows a red count badge when Invitations/Your Turn
//        have pending items (hidden at 0).
//      - Historian's Journey card is now the purple hero card: taller, bigger
//        stage icon/title, and a "Next title" preview derived from the real
//        STAGE_RANK_NAMES/STAGE_SUB_TITLES arrays in StageCard.tsx.
//
// UIX-BUILD-HOMENAV-002 — revision of the -001 pass after visual review.
// This spec supersedes the -001 nav/card structure:
//
//   1. BOTTOM NAV — exactly 2 tabs: SINGLEPLAYER | MULTIPLAYER.
//      - Singleplayer (default) = 3 cards only: Historian's Journey, Daily,
//        Practice.
//      - Multiplayer = the friends feature surface (Invitations / Your Turn /
//        Completed + Create + Anytime|Live lobby flow).
//      - No Profile tab: profile access stays exactly where it already is —
//        topbar avatar + hamburger menu (both unchanged per spec #7).
//
//   2. CARTOGRAPHER / XP-TIER CARD REMOVED — deliberate product decision.
//      The XP/tier system still lives in the topbar rank pill and the
//      hamburger "Profile stats" entry; no replacement UI created.
//
//   3. HISTORIAN'S JOURNEY CARD — first card, primary CTA: stage icon as the
//      main visual, user avatar as a small inset badge on the icon corner,
//      stage title + stage progress only (no XP/tier text), prominent PLAY.
//
//   4. SPACING FIX — the oversized band area under the topbar is reduced to a
//      slim header backdrop so the tagline follows at normal spacing.
//
//   5. DAILY CARD — keeps the -001 7-day streak row (real backing:
//      player_daily_streak + daily_attempts). Daily/Practice card content
//      unchanged; only order/position touched.
//
//   6. MULTIPLAYER CREATE FLOW — Create now offers "Anytime" or "Live",
//      then lands in a lobby where the mode can still be switched pre-game.
//      LOCAL UI STATE ONLY — no session/backend wiring (spec #6).
//
// All data is MOCK and held in local state. No Supabase, no auth, no
// network. Only this file is touched (plus docs/PROGRESS.md bookkeeping).
// ============================================================================

import { useEffect, useState } from "react";

type TabId = "singleplayer" | "multiplayer";
type LobbyMode = "anytime" | "live";
type ChallengeTab = "invitations" | "your_turn" | "completed";

// ── Mock profile (real backing: profiles + player_global_stats.total_xp) ──
const PROFILE = {
  displayName: "Alex Rivera",
  initials: "AR",
  avgAccuracy: 87,
  // total_xp -> rankForXp tier 4 "Cartographer"; shown in the topbar rank pill
  // and the hamburger header — its dedicated card was removed per spec #2.
  totalXp: 32500,
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
  // "Next title" = stage 43's title, derived from the real arrays in
  // src/components/home/StageCard.tsx: STAGE_RANK_NAMES[(43-1)/5=8] =
  // "Steam Engine" + STAGE_SUB_TITLES[(43-1)%5=2] = "Adept". No invented names.
  nextTierTitle: "Steam Engine Adept",
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
    // Purple hero treatment — the page's primary/hero card (spec #3).
    <div className="hn-card hn-cardHero" style={{ background: "linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)" }}>
      <div className="hn-cardInner hn-heroInner">
        {/* Stage icon is the card's main visual (replaces any generic levelup
            icon). The user avatar is a small inset badge in the icon's corner —
            secondary/personalizing, not competing for primary weight. */}
        <div className="hn-heroRow">
          <div className="hn-cardThumb" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={JOURNEY.icon} alt="" className="hn-cardThumbImg" draggable={false} />
            <span className="hn-avaBadge">{PROFILE.initials}</span>
          </div>
          <div className="hn-cardText">
            <h2 className="hn-cardTitle">HISTORIAN&apos;S JOURNEY</h2>
            <p className="hn-cardDesc"><b>{JOURNEY.tierTitle}</b></p>
            <p className="hn-cardDesc">{JOURNEY.completed} of {JOURNEY.total} stages completed</p>
            <p className="hn-cardNext">Next title: <b>{JOURNEY.nextTierTitle}</b></p>
          </div>
        </div>
        {/* Full-width PLAY — the page's primary CTA sits below the hero row so
            the stage text isn't squeezed beside it. */}
        <button type="button" className="hn-ctaPlay" aria-label="Continue Historian's Journey">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
          PLAY
        </button>
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

// ── Tab content panels ──

// SINGLEPLAYER — spec #4: exactly 3 cards, this order. Nothing else.
function SingleplayerTab() {
  return (
    <>
      <div className="hn-tagline">Where &amp; When — guess the moment that shaped history.</div>
      <JourneyCard />
      <DailyCard />
      <PracticeCard />
    </>
  );
}

// MULTIPLAYER — the friends surface (previous Challenge tab content) plus the
// Create -> Anytime|Live -> lobby flow. Create/lobby phase + mode are LOCAL
// UI state only; no session/backend wiring (spec #6).
function MultiplayerTabPanel() {
  const [phase, setPhase] = useState<"list" | "choose" | "lobby">("list");
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>("anytime");
  const [tab, setTab] = useState<ChallengeTab>("invitations");
  const tabs: Array<{ key: ChallengeTab; label: string; count: number }> = [
    { key: "invitations", label: "Invitations", count: MOCK_INVITES.length },
    { key: "your_turn", label: "Your Turn", count: MOCK_YOUR_TURN.length },
    { key: "completed", label: "Completed", count: MOCK_COMPLETED.length },
  ];

  // ── Create flow: pick Anytime|Live first (spec #6) ──
  if (phase === "choose") {
    return (
      <div className="hn-lobbyCard">
        <div className="hn-lobbyHead">
          <button type="button" className="hn-backBtn" aria-label="Back to challenges" onClick={() => setPhase("list")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h2 className="hn-lobbyTitle">NEW GAME</h2>
        </div>
        <p className="hn-hint" style={{ marginTop: 0 }}>Choose a mode for this challenge.</p>
        <button type="button" className="hn-modeOpt" onClick={() => { setLobbyMode("anytime"); setPhase("lobby"); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/anytime_256.png" alt="" className="hn-modeOptImg" draggable={false} />
          <span className="hn-modeOptTxt">
            <span className="hn-modeOptName">Anytime</span>
            <span className="hn-modeOptSub">Turn-based · up to 14 days</span>
          </span>
        </button>
        <button type="button" className="hn-modeOpt" onClick={() => { setLobbyMode("live"); setPhase("lobby"); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/live_256.png" alt="" className="hn-modeOptImg" draggable={false} />
          <span className="hn-modeOptTxt">
            <span className="hn-modeOptName">Live</span>
            <span className="hn-modeOptSub">Real-time · up to 5 mins</span>
          </span>
        </button>
      </div>
    );
  }

  // ── Lobby (pre-game): mode is still switchable here — mock local state ──
  if (phase === "lobby") {
    return (
      <div className="hn-lobbyCard">
        <div className="hn-lobbyHead">
          <button type="button" className="hn-backBtn" aria-label="Back to challenges" onClick={() => setPhase("list")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h2 className="hn-lobbyTitle">LOBBY</h2>
        </div>
        <div className="hn-seg" role="tablist" aria-label="Lobby mode">
          <button
            type="button"
            role="tab"
            aria-selected={lobbyMode === "anytime"}
            className={`hn-segBtn ${lobbyMode === "anytime" ? "hn-segBtnOn" : ""}`}
            onClick={() => setLobbyMode("anytime")}
          >
            ANYTIME
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lobbyMode === "live"}
            className={`hn-segBtn ${lobbyMode === "live" ? "hn-segBtnOn" : ""}`}
            onClick={() => setLobbyMode("live")}
          >
            LIVE
          </button>
        </div>
        <p className="hn-hint" style={{ marginTop: 0 }}>
          {lobbyMode === "anytime"
            ? "Turn-based · up to 14 days — mode can be switched until the game starts."
            : "Real-time · up to 5 mins — mode can be switched until the game starts."}
        </p>
        <div className="hn-gameList">
          <div className="hn-gameRow">
            <span className="hn-ava">{PROFILE.initials}</span>
            <div className="hn-gameInfo">
              <span className="hn-gameName">{PROFILE.displayName} (you)</span>
              <span className="hn-gameSub">Host</span>
            </div>
            <span className="hn-readyBadge">Ready</span>
          </div>
          {["Invite a friend", "Invite a friend"].map((label, i) => (
            <div key={i} className="hn-gameRow hn-gameRowEmpty">
              <span className="hn-ava hn-avaEmpty">?</span>
              <div className="hn-gameInfo">
                <span className="hn-gameName">{label}</span>
                <span className="hn-gameSub">Waiting…</span>
              </div>
              <button type="button" className="hn-inviteBtn">Invite</button>
            </div>
          ))}
        </div>
        <button type="button" className="hn-startBtn">Start when everyone is ready</button>
      </div>
    );
  }

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
          <button type="button" className="hn-pill" aria-label="Create game" onClick={() => setPhase("choose")}>
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

// ── Bottom nav icons — real asset files already used by the app ──
function NavIcon({ id }: { id: TabId }) {
  // SINGLEPLAYER -> /icons/play_large.webp (specified asset)
  // MULTIPLAYER  -> /icons/compete_large.webp — the exact icon file the
  //   production Challenge feature renders (src/app/home/page.tsx:544 —
  //   'compete' ModeCard). Same file, no new/duplicated icon.
  const src = id === "singleplayer" ? "/icons/play_large.webp" : "/icons/compete_large.webp";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="hn-navIconImg" draggable={false} />
  );
}

const NAV_ITEMS: Array<{ id: TabId; label: string }> = [
  { id: "singleplayer", label: "SINGLEPLAYER" },
  { id: "multiplayer", label: "MULTIPLAYER" },
];

export default function HomeNavPrototypePage() {
  const [tab, setTab] = useState<TabId>("singleplayer");
  const [menuOpen, setMenuOpen] = useState(false);
  // Spec #2: Multiplayer tab badge = pending Invitations + Your Turn counts.
  // Same convention as the topbar bell's red count dot. Hidden when 0.
  const pendingMultiplayer = MOCK_INVITES.length + MOCK_YOUR_TURN.length;

  useEffect(() => {
    document.title = "Home Nav v2 — Guess-History Prototype";
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PROTOTYPE_CSS }} />
      <main className="hn-screen">
        {/* Proto bar */}
        <div className="hn-protoBar">
          <span className="hn-protoTitle">Home — 2-Tab Nav (v3)</span>
          <span className="hn-protoHint">Mock data</span>
        </div>

        {/* ── Hero band: slim collage backdrop behind the header row (the
            -001 200px band left a large empty gap under the topbar — spec #1) ── */}
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
            {tab === "singleplayer" && <SingleplayerTab />}
            {tab === "multiplayer" && <MultiplayerTabPanel />}
          </div>
        </div>

        {/* Persistent bottom nav — exactly 2 tabs (spec #5) */}
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
                <NavIcon id={item.id} />
                <span className="hn-navLabel">{item.label}</span>
                {item.id === "multiplayer" && pendingMultiplayer > 0 && (
                  <span className="hn-navBadge" aria-hidden="true">{pendingMultiplayer}</span>
                )}
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

  /* ── Hero band: slim collage backdrop behind the header (was 200px in
        -001 — the oversized band read as a large empty gap under the topbar) ── */
  .hn-hero {
    position: relative;
    height: 100px;
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

  /* ── Historian's Journey hero card (spec #3): taller than siblings so the
        stage icon + title read as the page's primary element; purple gradient
        is applied inline on the card. Column layout: icon+text row on top,
        full-width PLAY below. ── */
  .hn-heroInner { flex-direction: column; align-items: stretch; padding: 20px; gap: 16px; }
  .hn-heroRow { display: flex; align-items: center; gap: 16px; }
  .hn-cardHero .hn-cardThumb { width: 112px; height: 112px; border-radius: 20px; }
  .hn-cardHero .hn-cardTitle { font-size: 26px; }
  .hn-cardHero .hn-cardDesc { font-size: 15px; }
  .hn-cardHero .hn-avaBadge { width: 30px; height: 30px; font-size: 10px; right: 6px; bottom: 6px; }
  .hn-cardHero .hn-ctaPlay { width: 100%; padding: 15px 0; font-size: 15px; }
  .hn-cardNext {
    margin: 3px 0 0;
    font-size: 12px;
    color: rgba(255,255,255,0.7);
  }
  .hn-cardNext b { color: #f5d0fe; font-weight: 700; }

  @media (max-width: 380px) {
    .hn-cardInner { padding: 12px 14px; gap: 10px; }
    .hn-cardThumb { width: 80px; height: 80px; }
    .hn-cardHero .hn-cardThumb { width: 96px; height: 96px; }
  }

  /* ── Historian's Journey card: user-avatar inset badge on the stage icon ── */
  .hn-avaBadge {
    position: absolute;
    right: 5px;
    bottom: 5px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: linear-gradient(135deg, #22d3ee, #8b5cf6);
    border: 2px solid #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 800;
    color: #fff;
    z-index: 2;
  }

  /* ── Primary PLAY CTA — the Historian card is the page's main action ── */
  .hn-ctaPlay {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    background: #ffffff;
    color: #172554;
    font-size: 14px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    padding: 13px 20px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  }
  .hn-ctaPlay:hover { transform: scale(1.06); }
  .hn-ctaPlay:active { transform: scale(0.94); }

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

  /* ── Segmented toggle track (lobby Anytime|Live switch) ── */
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

  /* ── Danger text (hamburger Sign out) ── */
  .hn-profRowDanger { color: #f87171; }

  /* ── Multiplayer create chooser + lobby (mock, UI-only) ── */
  .hn-lobbyCard {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: 16px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(8px);
  }
  .hn-lobbyHead { display: flex; align-items: center; gap: 10px; }
  .hn-lobbyTitle {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-family: "Bebas Neue", -apple-system, sans-serif;
    line-height: 1;
  }
  .hn-backBtn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.16);
    background: rgba(255,255,255,0.08);
    color: #fff;
    cursor: pointer;
    flex-shrink: 0;
  }
  .hn-modeOpt {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    color: #fff;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, transform 0.15s;
  }
  .hn-modeOpt:hover { background: rgba(255,255,255,0.12); transform: scale(1.01); }
  .hn-modeOptImg { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
  .hn-modeOptTxt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .hn-modeOptName { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
  .hn-modeOptSub { font-size: 11px; color: rgba(255,255,255,0.6); }
  .hn-readyBadge {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(34,197,94,0.18);
    color: #4ade80;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    flex-shrink: 0;
  }
  .hn-gameRowEmpty { opacity: 0.75; }
  .hn-avaEmpty {
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.4);
    border: 1px dashed rgba(255,255,255,0.25);
  }
  .hn-inviteBtn {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(34,211,238,0.5);
    background: rgba(34,211,238,0.12);
    color: #67e8f9;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .hn-startBtn {
    width: 100%;
    padding: 14px 0;
    border-radius: 14px;
    border: none;
    background: linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%);
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    cursor: pointer;
    transition: transform 0.15s, filter 0.15s;
  }
  .hn-startBtn:hover { transform: scale(1.02); filter: brightness(1.1); }
  .hn-startBtn:active { transform: scale(0.97); }

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
    color: rgba(255,255,255,0.78);
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
  .hn-navLabel { font-size: 12px; font-weight: 800; letter-spacing: 0.5px; }
  .hn-navIconImg {
    width: 24px;
    height: 24px;
    object-fit: contain;
    display: block;
    /* The brand webps are dark-on-transparent — lift them off the dark bar */
    filter: drop-shadow(0 0 3px rgba(255,255,255,0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.8));
  }
  /* Multiplayer pending-activity badge — same look as the topbar bell dot
     (.hn-bellDot): red pill with a count, shown only when count > 0. */
  .hn-navBadge {
    position: absolute;
    top: 6px;
    right: calc(50% - 22px);
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 2px #0a0f18;
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
