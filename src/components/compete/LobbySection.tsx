import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { TIMER_MIN_SEC, TIMER_MAX_SEC } from "@/core/types";
import { getUsernameGradientStyle, shortId } from "@/core/competeUtils";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import PlayerAvatar from "@/components/compete/PlayerAvatar";

interface LobbySectionProps {
  snapshot: CompeteSessionSnapshot;
  viewer: SessionPlayer | null;
  busy: boolean;
  error: string | null;
  isConnected?: boolean;
  onToggleReady: () => void;
  onStartGame: () => void;
  onSetTimer?: (roundTimerSec: number) => void;
  onSetYearRange?: (yearMin: number, yearMax: number) => void;
  onSetResultsTimer?: (resultsAutoAdvanceSec: number) => void;
  onKickPlayer?: (targetPlayerId: string) => void;
}

function formatTimerDisplay(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const YEAR_MIN_BOUND = -100;
const YEAR_MAX_BOUND = new Date().getFullYear();

export default function LobbySection({
  snapshot,
  viewer,
  busy,
  error,
  isConnected = true,
  onToggleReady,
  onStartGame,
  onSetTimer,
  onSetYearRange,
  onSetResultsTimer,
  onKickPlayer,
}: LobbySectionProps) {
  const router = useRouter();

  /* Timer slider transient state — synced from snapshot on every update.
     Local value is ONLY for drag feedback; authority stays in snapshot. */
  const [sliderValue, setSliderValue] = useState(snapshot.config.roundTimerSec);
  const timerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync timer slider to authoritative snapshot value whenever it changes externally.
  useEffect(() => {
    setSliderValue(snapshot.config.roundTimerSec);
  }, [snapshot.config.roundTimerSec]);

  /* Year range transient state — synced from snapshot on every update. */
  const [yearMinValue, setYearMinValue] = useState(snapshot.config.yearMin);
  const [yearMaxValue, setYearMaxValue] = useState(snapshot.config.yearMax);
  const yearDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync year range to authoritative snapshot value whenever it changes externally.
  useEffect(() => {
    setYearMinValue(snapshot.config.yearMin);
    setYearMaxValue(snapshot.config.yearMax);
  }, [snapshot.config.yearMin, snapshot.config.yearMax]);

  /* Results auto-advance transient state — synced from snapshot on every update. */
  const [resultsTimerValue, setResultsTimerValue] = useState(snapshot.config.resultsAutoAdvanceSec);
  const resultsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync results timer to authoritative snapshot value whenever it changes externally.
  useEffect(() => {
    setResultsTimerValue(snapshot.config.resultsAutoAdvanceSec);
  }, [snapshot.config.resultsAutoAdvanceSec]);

  /* ── Invite panel: friend list from Supabase profiles ── */
  const [profiles, setProfiles] = useState<Array<{ id: string; display_name: string | null; avatar_url: string | null }>>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [inviteExpanded, setInviteExpanded] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabaseBrowser
      .from("profiles")
      .select("id, display_name, avatar_url")
      .then(({ data }) => {
        if (cancelled) return;
        setProfiles(data ?? []);
      });
    return () => { cancelled = true; };
  }, []);

  const sessionPlayerIds = new Set(snapshot.players.map((p) => p.playerId));
  const filteredFriends = profiles
    .filter((p) => !sessionPlayerIds.has(p.id) && p.id !== (viewer?.playerId ?? ""))
    .filter((p) => {
      if (!friendSearch.trim()) return true;
      const name = (p.display_name ?? "").toLowerCase();
      return name.includes(friendSearch.trim().toLowerCase());
    });

  const inviteLink = typeof window !== "undefined" ? window.location.href : "";
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 1500);
    } catch {
      // ignore
    }
  };

  /* ------------------------------------------------------------------
   * Render-only derivation — ALL lobby display values from snapshot.
   * No local lobby state. UI reflects DO snapshot only.
   * ------------------------------------------------------------------ */
  const sessionStatus   = snapshot.status;
  const roomCode        = snapshot.roomCode;
  const activePlayers   = snapshot.players.filter((p) => p.leftAt === null);
  const totalPlayers    = activePlayers.length;
  const readyCount      = activePlayers.filter((p) => p.ready).length;
  const allReady        = snapshot.allPlayersReady;
  const isHost          = viewer?.isHost ?? false;
  const isReady         = viewer?.ready ?? false;
  const canStart        = isHost && allReady && !busy;

  console.log("[PLAYERS_RENDER]", {
    totalPlayers: snapshot.players?.length ?? null,
    players: snapshot.players?.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
    })),
  });

  return (
    <div className="lobby-shell">
      {/* Title Bar */}
      <div className="lobby-title-bar">
        <button className="lobby-back-btn" onClick={() => router.push("/")}>
          ←
        </button>
        <div className="lobby-title-center">
          <span className="lobby-title-text">Compete</span>
          <span className="lobby-status-line">
            <span
              className="lobby-connection-dot"
              style={{
                background: isConnected ? "#22d3ee" : "#ef4444",
                boxShadow: isConnected
                  ? "0 0 6px rgba(34,211,238,0.5)"
                  : "0 0 6px rgba(239,68,68,0.4)",
              }}
            />
            Room {roomCode} · Status: {sessionStatus}
          </span>
        </div>
        <span className="lobby-title-spacer" />
      </div>

      {/* Main Grid */}
      <div className="lobby-grid">
        {/* Settings Card */}
        <div className="card lobby-card lobby-settings">
          <div className="lobby-card-header">
            <span className="lobby-accent-bar" />
            <h3>Game Settings</h3>
          </div>
          <div className="lobby-settings-grid">
            <div className="lobby-setting-item" style={{ flexWrap: "wrap" }}>
              <span className="lobby-setting-label">Timer</span>
              {isHost ? (
                <span style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <input
                    type="range"
                    className="lobby-timer-slider"
                    min={TIMER_MIN_SEC}
                    max={TIMER_MAX_SEC}
                    step={5}
                    value={sliderValue}
                    disabled={busy}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSliderValue(val);
                      if (timerDebounceRef.current) clearTimeout(timerDebounceRef.current);
                      timerDebounceRef.current = setTimeout(() => {
                        onSetTimer?.(val);
                      }, 400);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      accentColor: "#22d3ee",
                    }}
                  />
                  <span className="lobby-setting-value" style={{ whiteSpace: "nowrap" }}>
                    {formatTimerDisplay(sliderValue)}
                  </span>
                </span>
              ) : (
                <span className="lobby-setting-value">{formatTimerDisplay(snapshot.config.roundTimerSec)}</span>
              )}
            </div>
            <div className="lobby-setting-item" style={{ flexWrap: "wrap" }}>
              <span className="lobby-setting-label">Year Range</span>
              {isHost ? (
                <span style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <span className="lobby-year-range-wrap">
                    <div className="lobby-year-range-track" />
                    <div
                      className="lobby-year-range-fill"
                      style={{
                        left: `${((yearMinValue - YEAR_MIN_BOUND) / (YEAR_MAX_BOUND - YEAR_MIN_BOUND)) * 100}%`,
                        right: `${100 - ((yearMaxValue - YEAR_MIN_BOUND) / (YEAR_MAX_BOUND - YEAR_MIN_BOUND)) * 100}%`,
                      }}
                    />
                    <input
                      type="range"
                      min={YEAR_MIN_BOUND}
                      max={YEAR_MAX_BOUND}
                      step={1}
                      value={yearMinValue}
                      disabled={busy}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val >= yearMaxValue - 1) return;
                        setYearMinValue(val);
                        if (yearDebounceRef.current) clearTimeout(yearDebounceRef.current);
                        yearDebounceRef.current = setTimeout(() => {
                          onSetYearRange?.(val, yearMaxValue);
                        }, 400);
                      }}
                      style={{ zIndex: yearMinValue > 1000 ? 5 : 3 }}
                    />
                    <input
                      type="range"
                      min={YEAR_MIN_BOUND}
                      max={YEAR_MAX_BOUND}
                      step={1}
                      value={yearMaxValue}
                      disabled={busy}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val <= yearMinValue + 1) return;
                        setYearMaxValue(val);
                        if (yearDebounceRef.current) clearTimeout(yearDebounceRef.current);
                        yearDebounceRef.current = setTimeout(() => {
                          onSetYearRange?.(yearMinValue, val);
                        }, 400);
                      }}
                      style={{ zIndex: 4 }}
                    />
                  </span>
                  <span className="lobby-setting-value" style={{ whiteSpace: "nowrap" }}>
                    {yearMinValue} – {yearMaxValue}
                  </span>
                </span>
              ) : (
                <span className="lobby-setting-value">
                  {snapshot.config.yearMin} – {snapshot.config.yearMax}
                </span>
              )}
            </div>
            <div className="lobby-setting-item" style={{ flexWrap: "wrap" }}>
              <span className="lobby-setting-label">Results Auto-Advance</span>
              {isHost ? (
                <span style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const val = resultsTimerValue > 0 ? 0 : Math.max(TIMER_MIN_SEC, resultsTimerValue || TIMER_MIN_SEC);
                      setResultsTimerValue(val);
                      if (resultsDebounceRef.current) clearTimeout(resultsDebounceRef.current);
                      resultsDebounceRef.current = setTimeout(() => {
                        onSetResultsTimer?.(val);
                      }, 400);
                    }}
                    disabled={busy}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: "none",
                      background: resultsTimerValue > 0 ? "#22d3ee" : "rgba(255,255,255,0.15)",
                      position: "relative",
                      cursor: busy ? "not-allowed" : "pointer",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: resultsTimerValue > 0 ? 22 : 2,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 0.2s",
                      }}
                    />
                  </button>
                  {resultsTimerValue > 0 ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      <input
                        type="range"
                        className="lobby-timer-slider"
                        min={TIMER_MIN_SEC}
                        max={TIMER_MAX_SEC}
                        step={5}
                        value={resultsTimerValue}
                        disabled={busy}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setResultsTimerValue(val);
                          if (resultsDebounceRef.current) clearTimeout(resultsDebounceRef.current);
                          resultsDebounceRef.current = setTimeout(() => {
                            onSetResultsTimer?.(val);
                          }, 400);
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          accentColor: "#22d3ee",
                        }}
                      />
                      <span className="lobby-setting-value" style={{ whiteSpace: "nowrap" }}>
                        {formatTimerDisplay(resultsTimerValue)}
                      </span>
                    </span>
                  ) : (
                    <span className="lobby-setting-value" style={{ whiteSpace: "nowrap" }}>
                      OFF
                    </span>
                  )}
                </span>
              ) : (
                <span className="lobby-setting-value">
                  {snapshot.config.resultsAutoAdvanceSec === 0 ? "OFF" : formatTimerDisplay(snapshot.config.resultsAutoAdvanceSec)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Players Card */}
        <div className="card lobby-card lobby-players">
          <div className="lobby-card-header">
            <span className="lobby-accent-bar" />
            <h3>Players ({totalPlayers})</h3>
          </div>
          <div className="lobby-player-list">
            {activePlayers.length === 0 ? (
              <p className="small">No players yet.</p>
            ) : (
              activePlayers.forEach((p, index) => {
                console.log("[PLAYER_RENDER_ITEM]", {
                  index,
                  playerId: p?.playerId,
                  displayName: p?.displayName,
                  ready: p?.ready,
                  isHost: p?.isHost,
                });
              }),
              activePlayers.map((p) => (
                <div
                  key={p.playerId}
                  className="lobby-player-row"
                >
                  <span className="lobby-player-info">
                    <PlayerAvatar
                      avatarUrl={p.avatarUrl}
                      displayName={p.displayName || shortId(p.playerId)}
                      size={32}
                    />
                    <span style={getUsernameGradientStyle(p.playerId)}>
                      {p.displayName || shortId(p.playerId)}
                    </span>
                  </span>
                  <span className="lobby-player-badges">
                    {p.isHost ? <span className="lobby-host-badge">Host</span> : null}
                    <span className={`lobby-ready-badge${p.ready ? " ready" : ""}`}>
                      {p.ready ? "Ready" : "Not ready"}
                    </span>
                    {isHost && !p.isHost ? (
                      <button
                        type="button"
                        className="lobby-kick-btn"
                        onClick={() => onKickPlayer?.(p.playerId)}
                        disabled={busy}
                        title="Kick player"
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Invite Card */}
        <div className="card lobby-card lobby-invite">
          <div className="lobby-card-header">
            <span className="lobby-accent-bar" />
            <h3>Invite</h3>
            <button
              type="button"
              className="lobby-invite-toggle"
              onClick={() => setInviteExpanded((v) => !v)}
              aria-label={inviteExpanded ? "Collapse invite panel" : "Expand invite panel"}
            >
              {inviteExpanded ? "−" : "+"}
            </button>
          </div>
          <div className={`lobby-invite-body${!inviteExpanded ? " collapsed" : ""}`}>
            {/* Room code */}
            <div className="lobby-invite-section">
              <span className="lobby-invite-label">Room Code</span>
              <div className="lobby-room-code-row">
                <code className="lobby-room-code">{roomCode}</code>
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                  onClick={() => handleCopy(roomCode, "Room code copied!")}
                >
                  {copiedLabel === "Room code copied!" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Invite link */}
            <div className="lobby-invite-section">
              <span className="lobby-invite-label">Invite Link</span>
              <div className="lobby-room-code-row">
                <code className="lobby-room-code" style={{ fontSize: 12 }}>
                  {inviteLink}
                </code>
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                  onClick={() => handleCopy(inviteLink, "Link copied!")}
                >
                  {copiedLabel === "Link copied!" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Friend search */}
            <div className="lobby-invite-section">
              <span className="lobby-invite-label">Invite Friends</span>
              <input
                type="text"
                placeholder="Search friends..."
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
                className="lobby-friend-search"
              />
            </div>

            {/* Friend list */}
            <div className="lobby-friend-list">
              {filteredFriends.length === 0 ? (
                <div className="lobby-friend-empty">
                  {friendSearch.trim() ? "No friends match your search." : "No friends to invite."}
                </div>
              ) : (
                filteredFriends.map((friend) => (
                  <div key={friend.id} className="lobby-friend-row">
                    <span className="lobby-friend-info">
                      <PlayerAvatar
                        avatarUrl={friend.avatar_url}
                        displayName={friend.display_name ?? shortId(friend.id)}
                        size={28}
                      />
                      <span style={getUsernameGradientStyle(friend.id)}>
                        {friend.display_name ?? shortId(friend.id)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="button secondary"
                      style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                      onClick={() =>
                        handleCopy(
                          `Join my Guess-History game! Room code: ${roomCode} → ${inviteLink}`,
                          "Invite copied!"
                        )
                      }
                    >
                      {copiedLabel === "Invite copied!" ? "Copied!" : "Invite"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Dock */}
      <div className="lobby-dock">
        <div className="lobby-dock-content">
          <span className="lobby-ready-count">
            {readyCount} / {totalPlayers} Ready
          </span>
          <div className="lobby-dock-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onToggleReady}
              disabled={busy || isReady}
            >
              {isReady ? "Ready ✓" : "Ready Up"}
            </button>
            {isHost ? (
              <button
                type="button"
                className="button"
                onClick={onStartGame}
                disabled={!canStart}
              >
                {busy ? "Starting..." : "Start Game"}
              </button>
            ) : (
              <span className="small">{busy ? "Starting..." : "Waiting for host…"}</span>
            )}
          </div>
        </div>
      </div>

      {error ? <p style={{ color: "#ff6b6b", margin: 0, marginTop: 12 }}>{error}</p> : null}

      <style>{`
        .lobby-shell {
          display: grid;
          gap: 16px;
          padding-bottom: 80px;
        }
        .lobby-title-bar {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #000;
          border-radius: 16px;
          padding: 14px 18px;
          margin-bottom: 4px;
        }
        .lobby-back-btn {
          background: transparent;
          border: none;
          color: #fff;
          font-size: 20px;
          cursor: pointer;
          padding: 4px 8px;
          line-height: 1;
        }
        .lobby-title-text {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.5px;
        }
        .lobby-title-center {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .lobby-status-line {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .lobby-connection-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: inline-block;
          transition: background 0.3s, box-shadow 0.3s;
        }
        .lobby-title-spacer {
          width: 36px;
        }
        .lobby-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr 1fr;
          grid-template-areas:
            "settings invite"
            "players  invite";
          align-items: start;
        }
        .lobby-card {
          background: rgba(16, 24, 48, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 22px;
          padding: 20px;
          min-width: 0;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lobby-card:hover {
          border-color: rgba(255, 255, 255, 0.18);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        .lobby-settings { grid-area: settings; }
        .lobby-players { grid-area: players; }
        .lobby-invite { grid-area: invite; }
        .lobby-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }
        .lobby-accent-bar {
          width: 4px;
          height: 22px;
          background: linear-gradient(180deg, #22d3ee, #0891b2);
          border-radius: 4px;
          flex-shrink: 0;
        }
        .lobby-card-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #fff;
        }
        .lobby-settings-grid {
          display: grid;
          gap: 0;
        }
        .lobby-setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          transition: background 0.15s;
        }
        .lobby-setting-item:last-child {
          border-bottom: none;
        }
        .lobby-setting-label {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.3px;
        }
        .lobby-setting-value {
          font-size: 14px;
          font-weight: 700;
          color: #22d3ee;
          font-variant-numeric: tabular-nums;
        }
        .lobby-player-list {
          display: grid;
          gap: 10px;
        }
        .lobby-player-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(255,255,255,0.04);
          border-radius: 14px;
          border: 1px solid transparent;
          transition: background 0.2s, border-color 0.2s, transform 0.15s;
        }
        .lobby-player-row:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.08);
        }
        .lobby-player-info {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 500;
          min-width: 0;
          overflow: hidden;
        }
        .lobby-player-badges {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .lobby-host-badge {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(34, 211, 238, 0.12);
          color: #22d3ee;
          border: 1px solid rgba(34, 211, 238, 0.25);
          font-size: 11px;
          font-weight: 600;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .lobby-ready-badge {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.5);
          border: 1px solid rgba(255,255,255,0.1);
          font-size: 11px;
          font-weight: 600;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .lobby-ready-badge.ready {
          background: rgba(34, 211, 238, 0.12);
          color: #22d3ee;
          border-color: rgba(34, 211, 238, 0.25);
        }
        .lobby-kick-btn {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          border-radius: 6px;
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          padding: 0;
          transition: background 0.15s, transform 0.1s;
        }
        .lobby-kick-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          transform: scale(1.05);
        }
        .lobby-kick-btn:active {
          transform: scale(0.95);
        }
        .lobby-kick-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }
        @keyframes lobbyPlayerEnter {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lobbySkeletonShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .lobby-player-row {
          animation: lobbyPlayerEnter 0.25s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .lobby-player-row {
            animation: none;
          }
          .lobby-card {
            transition: none;
          }
          .lobby-player-row,
          .lobby-setting-item,
          .lobby-host-badge,
          .lobby-ready-badge,
          .lobby-kick-btn,
          .lobby-room-code,
          .lobby-friend-search,
          .lobby-friend-row,
          .lobby-timer-slider::-webkit-slider-thumb,
          .lobby-timer-slider::-moz-range-thumb,
          .lobby-year-range-wrap input[type="range"]::-webkit-slider-thumb,
          .lobby-year-range-wrap input[type="range"]::-moz-range-thumb {
            transition: none;
          }
        }
        .lobby-invite-body {
          display: grid;
          gap: 8px;
        }
        .lobby-room-code-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .lobby-room-code {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 3px;
          color: #fff;
          background: rgba(255,255,255,0.08);
          padding: 8px 14px;
          border-radius: 10px;
          word-break: break-all;
          flex: 1;
          min-width: 0;
          transition: background 0.2s;
        }
        .lobby-room-code:hover {
          background: rgba(255,255,255,0.12);
        }
        .lobby-invite-toggle {
          display: none;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          border-radius: 8px;
          width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          margin-left: auto;
        }
        .lobby-invite-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .lobby-invite-label {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255,255,255,0.45);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .lobby-friend-search {
          width: 100%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px;
          padding: 8px 12px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lobby-friend-search::placeholder {
          color: rgba(255,255,255,0.35);
        }
        .lobby-friend-search:focus {
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.12);
        }
        .lobby-friend-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 200px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .lobby-friend-list::-webkit-scrollbar {
          width: 4px;
        }
        .lobby-friend-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 2px;
        }
        .lobby-friend-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          transition: background 0.15s, border-color 0.15s;
        }
        .lobby-friend-row:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.1);
        }
        .lobby-friend-info {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          font-size: 13px;
          font-weight: 500;
        }
        .lobby-friend-empty {
          text-align: center;
          padding: 24px 12px;
          font-size: 13px;
          color: rgba(255,255,255,0.35);
          background: rgba(255,255,255,0.02);
          border-radius: 12px;
          border: 1px dashed rgba(255,255,255,0.08);
        }
        .lobby-dock {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(34, 211, 238, 0.08);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-top: 1px solid rgba(34, 211, 238, 0.25);
        }
        .lobby-dock-content {
          max-width: 1320px;
          margin: 0 auto;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .lobby-ready-count {
          font-size: 14px;
          font-weight: 600;
          color: #22d3ee;
          white-space: nowrap;
        }
        .lobby-dock-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .lobby-year-range-wrap {
          position: relative;
          height: 20px;
          flex: 1;
          min-width: 0;
        }
        .lobby-year-range-track {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          height: 4px;
          background: rgba(255,255,255,0.12);
          width: 100%;
          border-radius: 2px;
        }
        .lobby-year-range-fill {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          height: 4px;
          background: linear-gradient(90deg, #22d3ee, #0891b2);
          border-radius: 2px;
        }
        .lobby-year-range-wrap input[type="range"] {
          position: absolute;
          width: 100%;
          height: 4px;
          background: transparent;
          pointer-events: none;
          -webkit-appearance: none;
          appearance: none;
          outline: none;
          top: 50%;
          transform: translateY(-50%);
        }
        .lobby-year-range-wrap input[type="range"]::-webkit-slider-thumb {
          pointer-events: all;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #22d3ee;
          -webkit-appearance: none;
          appearance: none;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
        .lobby-year-range-wrap input[type="range"]::-moz-range-thumb {
          pointer-events: all;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #22d3ee;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
        .lobby-timer-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          background: rgba(255,255,255,0.12);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        .lobby-timer-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #22d3ee;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          cursor: pointer;
          transition: box-shadow 0.2s, transform 0.15s;
        }
        .lobby-timer-slider::-webkit-slider-thumb:hover {
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
          transform: scale(1.1);
        }
        .lobby-timer-slider::-webkit-slider-thumb:active {
          transform: scale(1.15);
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.6);
        }
        .lobby-timer-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #22d3ee;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          cursor: pointer;
          transition: box-shadow 0.2s, transform 0.15s;
        }
        .lobby-timer-slider::-moz-range-thumb:hover {
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
          transform: scale(1.1);
        }

        @media (max-width: 768px) {
          .lobby-grid {
            grid-template-columns: 1fr;
            grid-template-areas:
              "settings"
              "invite"
              "players";
            gap: 12px;
          }
          .lobby-title-text {
            font-size: 16px;
          }
          .lobby-dock-content {
            padding: 10px 12px;
          }
          .lobby-room-code-row {
            flex-direction: column;
            align-items: stretch;
          }
          .lobby-invite-toggle {
            display: flex;
          }
          .lobby-invite-body.collapsed {
            display: none;
          }
          .lobby-invite-body {
            display: flex;
            flex-direction: column;
            gap: 14px;
          }
          .lobby-setting-item {
            padding: 10px 0;
          }
          .lobby-card {
            padding: 16px;
          }
        }

        @media (max-width: 360px) {
          .lobby-card {
            padding: 14px;
            border-radius: 18px;
          }
          .lobby-player-row {
            padding: 8px;
          }
          .lobby-dock-actions .button {
            padding: 8px 12px;
            font-size: 13px;
          }
          .lobby-setting-label {
            font-size: 12px;
          }
          .lobby-setting-value {
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}
