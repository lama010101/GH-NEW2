import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { TIMER_MIN_SEC, TIMER_MAX_SEC } from "@/core/types";
import { getUsernameGradientStyle } from "@/core/competeUtils";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import './LobbySection.module.css';

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

  /* ── Invite panel: recent invites from localStorage ── */
  const [inviteExpanded, setInviteExpanded] = useState(true);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const recentInvites: Array<{ id: string; name: string; avatarUrl: string }> = (() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("gh_last_invited_players");
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 5).filter((p) =>
        p && typeof p.id === "string" && typeof p.name === "string" && typeof p.avatarUrl === "string"
      );
    } catch {
      return [];
    }
  })();

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
            {/* Invite Friends - recent from localStorage */}
            <div className="lobby-invite-section">
              <span className="lobby-invite-label">INVITE FRIENDS</span>
              <div className="lobby-friend-list">
                {recentInvites.length === 0 ? (
                  <div className="lobby-friend-empty lobbyEmptyInvite">
                    No recent invites
                  </div>
                ) : (
                  recentInvites.map((friend) => (
                    <div key={friend.id} className="lobby-friend-row">
                      <span className="lobby-friend-info">
                        <PlayerAvatar
                          avatarUrl={friend.avatarUrl}
                          displayName={friend.name}
                          size={28}
                        />
                        <span style={getUsernameGradientStyle(friend.id)}>
                          {friend.name}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="button secondary lobbyBtnSm"
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

            {/* Room code */}
            <div className="lobby-invite-section">
              <span className="lobby-invite-label">ROOM CODE</span>
              <div className="lobby-room-code-row">
                <code className="lobby-room-code">{roomCode}</code>
                <button
                  type="button"
                  className="button secondary lobbyBtnMd"
                  onClick={() => handleCopy(roomCode, "Room code copied!")}
                >
                  {copiedLabel === "Room code copied!" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Invite link */}
            <div className="lobby-invite-section">
              <span className="lobby-invite-label">INVITE LINK</span>
              <div className="lobby-room-code-row">
                <button
                  type="button"
                  className="button secondary lobbyBtnMd"
                  onClick={() => handleCopy(inviteLink, "Link copied!")}
                >
                  {copiedLabel === "Link copied!" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div className="card lobby-card lobby-settings">
          <div className="lobby-card-header">
            <span className="lobby-accent-bar" />
            <h3>Game Settings</h3>
          </div>
          <div className="lobby-settings-grid">
            <div className="lobby-setting-item lobbyRowWrap">
              <span className="lobby-setting-label">Timer</span>
              {isHost ? (
                <span className="lobbyRowLeft">
                  <input
                    type="range"
                    className="lobby-timer-slider lobbySliderInput"
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
                  />
                  <span className="lobby-setting-value lobbyNoWrap">
                    {formatTimerDisplay(sliderValue)}
                  </span>
                </span>
              ) : (
                <span className="lobby-setting-value">{formatTimerDisplay(snapshot.config.roundTimerSec)}</span>
              )}
            </div>
            <div className="lobby-setting-item lobbyRowWrap">
              <span className="lobby-setting-label">Year Range</span>
              {isHost ? (
                <span className="lobbyRowLeft">
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
                      className="lobbyRangeInputTop"
                    />
                  </span>
                  <span className="lobby-setting-value lobbyNoWrap">
                    {yearMinValue} – {yearMaxValue}
                  </span>
                </span>
              ) : (
                <span className="lobby-setting-value">
                  {snapshot.config.yearMin} – {snapshot.config.yearMax}
                </span>
              )}
            </div>
            <div className="lobby-setting-item lobbyRowWrap">
              <span className="lobby-setting-label">Results Auto-Advance</span>
              {isHost ? (
                <span className="lobbyRowLeftWrap">
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
                    className="lobbyToggleBtn"
                    style={{
                      background: resultsTimerValue > 0 ? "#22d3ee" : "rgba(255,255,255,0.15)",
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    <span
                      className="lobbyToggleKnob"
                      style={{
                        left: resultsTimerValue > 0 ? 22 : 2,
                      }}
                    />
                  </button>
                  {resultsTimerValue > 0 ? (
                    <span className="lobbyRowLeft">
                      <input
                        type="range"
                        className="lobby-timer-slider lobbySliderInput"
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
                      />
                      <span className="lobby-setting-value lobbyNoWrap">
                        {formatTimerDisplay(resultsTimerValue)}
                      </span>
                    </span>
                  ) : (
                    <span className="lobby-setting-value lobbyNoWrap">
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
                      displayName={p.displayName || p.playerId.slice(0, 8)}
                      size={32}
                    />
                    <span style={getUsernameGradientStyle(p.playerId)}>
                      {p.displayName || p.playerId.slice(0, 8)}
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

      {error ? <p className="lobbyError">{error}</p> : null}
    </div>
  );
}
