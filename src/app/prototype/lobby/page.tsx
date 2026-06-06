"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Compete Lobby (improved UI)
// Route: /prototype/lobby   (direct access, fully self-contained)
//
// - Visual language follows the home page (dark background image + overlay,
//   rounded gradient cards) and the guess-modal prototype (self-contained
//   <style jsx>, proto bar, cyan/violet accents).
// - All data is MOCK and held in local state. No WebSocket, no Supabase,
//   no real network. Host controls, ready toggles, invites, and kick all
//   mutate local state so the layout/interactions can be reviewed in isolation.
//
// Does NOT touch or import any existing app files.
// ============================================================================

import { useMemo, useState } from "react";

type Player = {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
};

type PoolPlayer = {
  id: string;
  name: string;
};

const YEAR_MIN_BOUND = 1850;
const YEAR_MAX_BOUND = 2025;
const TIMER_MIN = 30;
const TIMER_MAX = 300;

const VIEWER_ID = "p1";

const INITIAL_PLAYERS: Player[] = [
  { id: "p1", name: "Alex Rivera", ready: false, isHost: true },
  { id: "p2", name: "Mina Kovač", ready: true, isHost: false },
  { id: "p3", name: "Theo Lambert", ready: false, isHost: false },
  { id: "p4", name: "Sara Bianchi", ready: true, isHost: false },
];

const INVITE_POOL: PoolPlayer[] = [
  { id: "u10", name: "Liang Wei" },
  { id: "u11", name: "Nora Hansen" },
  { id: "u12", name: "Omar Farouk" },
  { id: "u13", name: "Priya Nair" },
  { id: "u14", name: "Diego Santos" },
  { id: "u15", name: "Yuki Tanaka" },
  { id: "u16", name: "Elena Popescu" },
  { id: "u17", name: "Marcus Webb" },
];

// Deterministic gradient from an id (used for avatar fallbacks + name tint).
function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const h1 = hash % 360;
  const h2 = (h1 + 48) % 360;
  return `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 70% 42%))`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

function formatTimer(sec: number): string {
  if (sec === 0) return "OFF";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export default function LobbyPrototypePage() {
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [roomCode] = useState("BERLIN");

  // Host-controlled settings
  const [timerSec, setTimerSec] = useState(120);
  const [yearMin, setYearMin] = useState(1900);
  const [yearMax, setYearMax] = useState(2025);
  const [resultsSec, setResultsSec] = useState(30);

  // Invite panel
  const [search, setSearch] = useState("");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const viewer = players.find((p) => p.id === VIEWER_ID) ?? null;
  const isHost = viewer?.isHost ?? false;
  const isReady = viewer?.ready ?? false;
  const readyCount = players.filter((p) => p.ready).length;
  const totalPlayers = players.length;
  const allReady = totalPlayers > 0 && readyCount === totalPlayers;

  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    const joinedIds = new Set(players.map((p) => p.id));
    return INVITE_POOL.filter(
      (p) => !joinedIds.has(p.id) && (q === "" || p.name.toLowerCase().includes(q))
    ).slice(0, q === "" ? 6 : 12);
  }, [search, players]);

  const toggleReady = () => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === VIEWER_ID ? { ...p, ready: !p.ready } : p))
    );
  };

  const kickPlayer = (id: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const sendInvite = (id: string) => {
    setInvited((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setInvited((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2500);
  };

  const copy = (kind: "link" | "code") => {
    const text = kind === "code" ? roomCode : `https://guess-history.app/compete/${roomCode}`;
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      /* ignore */
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  };

  const yearPct = (v: number) =>
    ((v - YEAR_MIN_BOUND) / (YEAR_MAX_BOUND - YEAR_MIN_BOUND)) * 100;
  const timerPct = (v: number) => ((v - TIMER_MIN) / (TIMER_MAX - TIMER_MIN)) * 100;

  return (
    <main className="screen">
      {/* Proto bar (matches guess-modal prototype) */}
      <div className="protoBar">
        <span className="protoTitle">Compete Lobby — Prototype</span>
        <span className="protoHint">Mock data · host = you</span>
      </div>

      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        {/* ── Header ── */}
        <header className="header">
          <div className="headerTop">
            <span className="modeBadge">COMPETE</span>
            <span className="statusChip">
              <span className="statusDot" />
              Waiting for players
            </span>
          </div>
          <h1 className="title">Game Lobby</h1>
          <div className="roomRow">
            <span className="roomLabel">Room code</span>
            <span className="roomCode">{roomCode}</span>
          </div>
        </header>

        {/* ── Invite card ── */}
        {isHost && (
          <section className="card inviteCard">
            <div className="cardHead">
              <span className="accentBar" />
              <h2 className="cardTitle">Invite players</h2>
              <div className="shareGroup">
                <button className="shareBtn" onClick={() => copy("link")}>
                  {copied === "link" ? "Copied!" : "Copy link"}
                </button>
                <button className="shareBtn" onClick={() => copy("code")}>
                  {copied === "code" ? "Copied!" : "Copy code"}
                </button>
              </div>
            </div>

            <div className="searchWrap">
              <svg className="searchIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="searchField"
                placeholder="Search players…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="rail">
              {filteredPool.length === 0 ? (
                <div className="emptyRail">No players found</div>
              ) : (
                filteredPool.map((p) => {
                  const sent = invited.has(p.id);
                  return (
                    <div key={p.id} className="poolCard">
                      <span className="avatar" style={{ background: gradientFor(p.id) }}>
                        {initialsOf(p.name)}
                      </span>
                      <span className="poolName">{p.name}</span>
                      <button
                        className={`inviteBtn ${sent ? "inviteBtnSent" : ""}`}
                        onClick={() => sendInvite(p.id)}
                        disabled={sent}
                      >
                        {sent ? "Sent ✓" : "Invite"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ── Players roster card ── */}
        <section className="card">
          <div className="cardHead">
            <span className="accentBar" />
            <h2 className="cardTitle">
              Players <span className="countDim">({totalPlayers})</span>
            </h2>
            <span className="readyIndicator">
              <span
                className="readyDot"
                style={{ background: readyCount > 0 ? "#4ade80" : "rgba(255,255,255,0.25)" }}
              />
              {readyCount} ready
            </span>
          </div>

          <div className="roster">
            {players.map((p) => (
              <div key={p.id} className={`rosterRow ${p.ready ? "rosterRowReady" : ""}`}>
                <span className="avatar" style={{ background: gradientFor(p.id) }}>
                  {initialsOf(p.name)}
                </span>
                <div className="rosterMeta">
                  <span className="rosterName">
                    {p.name}
                    {p.id === VIEWER_ID && <span className="youTag">You</span>}
                  </span>
                  {p.isHost && <span className="hostBadge">♛ Host</span>}
                </div>
                <span className={`statusPill ${p.ready ? "pillReady" : "pillIdle"}`}>
                  {p.ready ? "READY" : "NOT READY"}
                </span>
                {isHost && !p.isHost && (
                  <button className="kickBtn" onClick={() => kickPlayer(p.id)} aria-label="Kick player">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Game settings card ── */}
        <section className="card">
          <div className="cardHead">
            <span className="accentBar" />
            <h2 className="cardTitle">Game settings</h2>
            <span className="relaxTag">RELAX MODE</span>
          </div>

          {/* Round timer */}
          <div className="setting">
            <div className="settingTop">
              <span className="settingLabel">Round timer</span>
              <span className="settingValue">{formatTimer(timerSec)}</span>
            </div>
            {isHost ? (
              <div className="settingControl">
                <button
                  className={`toggle ${timerSec > 0 ? "toggleOn" : "toggleOff"}`}
                  onClick={() => setTimerSec((v) => (v > 0 ? 0 : 120))}
                  aria-label="Toggle timer"
                >
                  <span className="toggleKnob" style={{ left: timerSec > 0 ? 22 : 2 }} />
                </button>
                {timerSec > 0 && (
                  <div className="sliderWrap">
                    <div className="sliderTrack" />
                    <div className="sliderFill" style={{ width: `${timerPct(timerSec)}%` }} />
                    <input
                      type="range"
                      className="slider"
                      min={TIMER_MIN}
                      max={TIMER_MAX}
                      step={5}
                      value={timerSec}
                      onChange={(e) => setTimerSec(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Year range */}
          <div className="setting">
            <div className="settingTop">
              <span className="settingLabel">Year range</span>
              <span className="settingValue">
                {yearMin} – {yearMax}
              </span>
            </div>
            {isHost ? (
              <div className="rangeWrap">
                <div className="sliderTrack" />
                <div
                  className="rangeFill"
                  style={{ left: `${yearPct(yearMin)}%`, right: `${100 - yearPct(yearMax)}%` }}
                />
                <input
                  type="range"
                  min={YEAR_MIN_BOUND}
                  max={YEAR_MAX_BOUND}
                  step={1}
                  value={yearMin}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v < yearMax - 1) setYearMin(v);
                  }}
                  className="rangeInput"
                />
                <input
                  type="range"
                  min={YEAR_MIN_BOUND}
                  max={YEAR_MAX_BOUND}
                  step={1}
                  value={yearMax}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > yearMin + 1) setYearMax(v);
                  }}
                  className="rangeInput rangeInputTop"
                />
              </div>
            ) : null}
          </div>

          {/* Results auto-advance */}
          <div className="setting">
            <div className="settingTop">
              <span className="settingLabel">Results auto-advance</span>
              <span className="settingValue">{formatTimer(resultsSec)}</span>
            </div>
            {isHost ? (
              <div className="settingControl">
                <button
                  className={`toggle ${resultsSec > 0 ? "toggleOn" : "toggleOff"}`}
                  onClick={() => setResultsSec((v) => (v > 0 ? 0 : 30))}
                  aria-label="Toggle results auto-advance"
                >
                  <span className="toggleKnob" style={{ left: resultsSec > 0 ? 22 : 2 }} />
                </button>
                {resultsSec > 0 && (
                  <div className="sliderWrap">
                    <div className="sliderTrack" />
                    <div className="sliderFill" style={{ width: `${timerPct(resultsSec)}%` }} />
                    <input
                      type="range"
                      className="slider"
                      min={TIMER_MIN}
                      max={TIMER_MAX}
                      step={5}
                      value={resultsSec}
                      onChange={(e) => setResultsSec(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <div className="dockSpacer" />
      </div>

      {/* ── Bottom dock ── */}
      <div className="dock">
        <button
          className={`readyBtn ${isReady ? "readyBtnOn" : ""}`}
          onClick={toggleReady}
        >
          {isReady ? "Ready — waiting for others" : "I'm ready"}
        </button>
        <span className="dockCount">
          {readyCount}/{totalPlayers} players ready
          {allReady && <span className="allReadyTag"> · starting soon</span>}
        </span>
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }
      `}</style>

      <style jsx>{`
        .screen {
          position: fixed; inset: 0; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #fff;
        }
        .bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,0.82); }

        .protoBar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 60;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; background: rgba(10,10,12,0.6);
          backdrop-filter: blur(8px); flex-wrap: wrap;
        }
        .protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }
        .protoHint { font-size: 12px; font-weight: 600; opacity: 0.55; }

        .scroll {
          position: absolute; inset: 0; z-index: 2; overflow-y: auto;
          padding: 56px 16px calc(120px + env(safe-area-inset-bottom));
          display: flex; flex-direction: column; gap: 16px;
          max-width: 520px; margin: 0 auto; box-sizing: border-box;
        }

        /* ── Header ── */
        .header { padding: 8px 4px 0; }
        .headerTop { display: flex; align-items: center; justify-content: space-between; }
        .modeBadge {
          font-size: 11px; font-weight: 800; letter-spacing: 1.5px;
          color: #22d3ee; background: rgba(34,211,238,0.12);
          border: 1px solid rgba(34,211,238,0.35);
          padding: 4px 10px; border-radius: 999px;
        }
        .statusChip {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7);
        }
        .statusDot {
          width: 8px; height: 8px; border-radius: 50%; background: #22d3ee;
          box-shadow: 0 0 8px rgba(34,211,238,0.7);
          animation: pulseDot 1.8s ease-in-out infinite;
        }
        @keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .title { font-size: 30px; font-weight: 800; margin: 12px 0 0; letter-spacing: -0.5px; }
        .roomRow { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
        .roomLabel { font-size: 13px; color: rgba(255,255,255,0.55); }
        .roomCode {
          font-size: 16px; font-weight: 800; letter-spacing: 3px; color: #fff;
          background: rgba(34,211,238,0.12); border: 1px solid rgba(34,211,238,0.3);
          padding: 3px 12px; border-radius: 8px;
        }

        /* ── Cards ── */
        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 18px; padding: 18px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }
        .cardHead { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .accentBar { width: 4px; height: 18px; border-radius: 999px; background: #22d3ee; }
        .cardTitle { font-size: 16px; font-weight: 700; margin: 0; }
        .countDim { color: rgba(255,255,255,0.45); font-weight: 600; }
        .relaxTag {
          margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: 1px;
          color: #a78bfa; background: rgba(139,92,246,0.14);
          border: 1px solid rgba(139,92,246,0.35); padding: 3px 9px; border-radius: 999px;
        }
        .readyIndicator {
          margin-left: auto; display: inline-flex; align-items: center; gap: 7px;
          font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75);
        }
        .readyDot { width: 9px; height: 9px; border-radius: 50%; }

        /* ── Invite ── */
        .shareGroup { margin-left: auto; display: flex; gap: 8px; }
        .shareBtn {
          font-size: 12px; font-weight: 600; color: #fff;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18);
          border-radius: 9px; padding: 6px 10px; cursor: pointer; white-space: nowrap;
          transition: background 0.15s;
        }
        .shareBtn:hover { background: rgba(255,255,255,0.18); }
        .searchWrap { position: relative; margin-bottom: 12px; }
        .searchIcon {
          position: absolute; left: 13px; top: 50%; transform: translateY(-50%);
          color: rgba(255,255,255,0.5); pointer-events: none;
        }
        .searchField {
          width: 100%; box-sizing: border-box;
          background: rgba(255,255,255,0.08); border: 1.5px solid rgba(255,255,255,0.18);
          border-radius: 12px; color: #fff; font-size: 14px;
          padding: 11px 14px 11px 40px; outline: none;
        }
        .searchField:focus { border-color: rgba(34,211,238,0.6); }
        .searchField::placeholder { color: rgba(255,255,255,0.45); }

        .rail {
          display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;
          scrollbar-width: none;
        }
        .rail::-webkit-scrollbar { display: none; }
        .poolCard {
          flex: 0 0 auto; width: 110px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px; padding: 14px 10px;
        }
        .poolName {
          font-size: 12px; font-weight: 600; text-align: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
        }
        .inviteBtn {
          width: 100%; font-size: 12px; font-weight: 700; color: #06181c;
          background: #22d3ee; border: none; border-radius: 9px; padding: 7px 0;
          cursor: pointer; transition: opacity 0.15s;
        }
        .inviteBtn:hover { opacity: 0.9; }
        .inviteBtnSent { background: rgba(74,222,128,0.25); color: #4ade80; cursor: default; }
        .emptyRail {
          padding: 20px; width: 100%; text-align: center;
          font-size: 13px; color: rgba(255,255,255,0.4);
        }

        /* ── Avatars ── */
        .avatar {
          flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 700; color: #fff;
          text-transform: uppercase; border: 2px solid rgba(255,255,255,0.25);
        }

        /* ── Roster ── */
        .roster { display: flex; flex-direction: column; gap: 8px; }
        .rosterRow {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 10px 12px; transition: border-color 0.2s, background 0.2s;
        }
        .rosterRowReady { border-color: rgba(74,222,128,0.35); background: rgba(74,222,128,0.06); }
        .rosterMeta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .rosterName {
          font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 7px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .youTag {
          font-size: 10px; font-weight: 700; color: #22d3ee;
          background: rgba(34,211,238,0.15); padding: 1px 7px; border-radius: 999px;
        }
        .hostBadge { font-size: 11px; font-weight: 600; color: #f0c060; }
        .statusPill {
          font-size: 10px; font-weight: 800; letter-spacing: 0.6px;
          padding: 4px 10px; border-radius: 999px; white-space: nowrap;
        }
        .pillReady { background: rgba(74,222,128,0.2); color: #4ade80; }
        .pillIdle { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); }
        .kickBtn {
          flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%;
          border: 1px solid rgba(239,68,68,0.4); background: rgba(239,68,68,0.12);
          color: #f87171; font-size: 18px; line-height: 1; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .kickBtn:hover { background: rgba(239,68,68,0.25); }

        /* ── Settings ── */
        .setting { padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.07); }
        .setting:first-of-type { border-top: none; padding-top: 4px; }
        .settingTop { display: flex; align-items: center; justify-content: space-between; }
        .settingLabel { font-size: 14px; font-weight: 600; }
        .settingValue { font-size: 14px; font-weight: 700; color: #22d3ee; }
        .settingControl { display: flex; align-items: center; gap: 14px; margin-top: 12px; }

        .toggle {
          position: relative; flex-shrink: 0; width: 44px; height: 24px;
          border-radius: 999px; border: none; cursor: pointer; transition: background 0.2s;
        }
        .toggleOn { background: #22d3ee; }
        .toggleOff { background: rgba(255,255,255,0.18); }
        .toggleKnob {
          position: absolute; top: 2px; width: 20px; height: 20px; border-radius: 50%;
          background: #fff; transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }

        .sliderWrap { position: relative; flex: 1; height: 20px; display: flex; align-items: center; }
        .sliderTrack {
          position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
          height: 4px; border-radius: 999px; background: rgba(255,255,255,0.15);
        }
        .sliderFill {
          position: absolute; left: 0; top: 50%; transform: translateY(-50%);
          height: 4px; border-radius: 999px; background: #22d3ee;
        }
        .slider {
          position: relative; width: 100%; -webkit-appearance: none; appearance: none;
          background: transparent; outline: none; margin: 0;
        }
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; border-radius: 50%; background: #fff;
          border: 2px solid #22d3ee; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
        .slider::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 50%; background: #fff;
          border: 2px solid #22d3ee; cursor: pointer;
        }

        .rangeWrap { position: relative; height: 22px; margin-top: 12px; display: flex; align-items: center; }
        .rangeFill {
          position: absolute; top: 50%; transform: translateY(-50%);
          height: 4px; border-radius: 999px; background: #22d3ee;
        }
        .rangeInput {
          position: absolute; left: 0; width: 100%; height: 4px;
          -webkit-appearance: none; appearance: none; background: transparent;
          pointer-events: none; outline: none; top: 50%; transform: translateY(-50%); margin: 0;
        }
        .rangeInput::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; pointer-events: all;
          width: 18px; height: 18px; border-radius: 50%; background: #fff;
          border: 2px solid #22d3ee; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
        .rangeInput::-moz-range-thumb {
          pointer-events: all; width: 18px; height: 18px; border-radius: 50%;
          background: #fff; border: 2px solid #22d3ee; cursor: pointer;
        }

        .dockSpacer { height: 4px; }

        /* ── Bottom dock ── */
        .dock {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 30;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 14px 16px calc(16px + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(10,10,12,0), rgba(10,10,12,0.85) 40%);
        }
        .readyBtn {
          width: 100%; max-width: 488px; padding: 16px;
          border-radius: 14px; border: none; cursor: pointer;
          font-size: 16px; font-weight: 800; color: #06181c; background: #22d3ee;
          box-shadow: 0 6px 22px rgba(34,211,238,0.35); transition: all 0.2s;
        }
        .readyBtn:hover { opacity: 0.95; }
        .readyBtnOn {
          background: rgba(74,222,128,0.18); color: #4ade80;
          border: 1px solid rgba(74,222,128,0.5); box-shadow: none;
        }
        .dockCount { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); }
        .allReadyTag { color: #4ade80; }
      `}</style>
    </main>
  );
}
