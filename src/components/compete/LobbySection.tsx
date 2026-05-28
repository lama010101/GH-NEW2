import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { TIMER_MIN_SEC, TIMER_MAX_SEC } from "@/core/types";
import { getUsernameGradientStyle } from "@/core/competeUtils";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import styles from './LobbySection.module.css';

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

  /* ── Invite panel: friend search ── */
  const [inviteExpanded, setInviteExpanded] = useState(true);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [friendQuery, setFriendQuery] = useState('');
  const [friendResults, setFriendResults] = useState<Array<{id: string; display_name: string; avatar_url: string | null}>>([]);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [friendSearchError, setFriendSearchError] = useState(false);
  const [inviteStates, setInviteStates] = useState<Record<string, 'idle' | 'pending' | 'sent' | 'error'>>({});
  const friendSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Friend search debounce
  useEffect(() => {
    if (friendSearchDebounceRef.current) {
      clearTimeout(friendSearchDebounceRef.current);
    }
    if (friendQuery.length < 2) {
      setFriendResults([]);
      setFriendSearchError(false);
      return;
    }
    setFriendSearchLoading(true);
    setFriendSearchError(false);
    friendSearchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/friends/search?q=${encodeURIComponent(friendQuery)}`);
        const data = await res.json();
        if (res.ok) {
          setFriendResults(data.players ?? []);
        } else {
          setFriendSearchError(true);
        }
      } catch {
        setFriendSearchError(true);
      } finally {
        setFriendSearchLoading(false);
      }
    }, 400);
    return () => {
      if (friendSearchDebounceRef.current) {
        clearTimeout(friendSearchDebounceRef.current);
      }
    };
  }, [friendQuery]);

  const handleSendInvite = async (playerId: string) => {
    setInviteStates(prev => ({ ...prev, [playerId]: 'pending' }));
    try {
      const res = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: snapshot.gameId, invitee_id: playerId }),
      });
      if (res.ok) {
        setInviteStates(prev => ({ ...prev, [playerId]: 'sent' }));
      } else {
        setInviteStates(prev => ({ ...prev, [playerId]: 'error' }));
        setTimeout(() => {
          setInviteStates(prev => ({ ...prev, [playerId]: 'idle' }));
        }, 2000);
      }
    } catch {
      setInviteStates(prev => ({ ...prev, [playerId]: 'error' }));
      setTimeout(() => {
        setInviteStates(prev => ({ ...prev, [playerId]: 'idle' }));
      }, 2000);
    }
  };

  const inviteLink = typeof window !== "undefined" ? window.location.href : "";
  const truncatedInviteLink = inviteLink.length > 32 ? inviteLink.slice(0, 32) + "…" : inviteLink;
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
    <div className={styles['lobby-shell']}>
      {/* Title Bar */}
      <div className={styles['lobby-title-bar']}>
        <button className={styles['lobby-back-btn']} onClick={() => router.push("/")}>
          ←
        </button>
        <div className={styles['lobby-title-center']}>
          <span className={styles['lobby-title-text']}>Compete</span>
          <span className={styles['lobby-status-line']}>
            <span
              className={styles['lobby-connection-dot']}
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
        <span className={styles['lobby-title-spacer']} />
      </div>

      {/* Main Grid */}
      <div className={styles['lobby-grid']}>
        {/* Settings Card */}
        <div className={`card ${styles['lobby-card']} ${styles['lobby-settings']}`}>
          <div className={styles['lobby-card-header']}>
            <span className={styles['lobby-accent-bar']} />
            <h3>Game Settings</h3>
          </div>
          <div className={styles['lobby-settings-grid']}>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
              <span className={styles['lobby-setting-label']}>Timer</span>
              {isHost ? (
                <span className={styles['lobbyRowLeft']}>
                  <input
                    type="range"
                    className={`${styles['lobby-timer-slider']} ${styles['lobbySliderInput']}`}
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
                  <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                    {formatTimerDisplay(sliderValue)}
                  </span>
                </span>
              ) : (
                <span className={styles['lobby-setting-value']}>{formatTimerDisplay(snapshot.config.roundTimerSec)}</span>
              )}
            </div>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
              <span className={styles['lobby-setting-label']}>Year Range</span>
              {isHost ? (
                <span className={styles['lobbyRowLeft']}>
                  <span className={styles['lobby-year-range-wrap']}>
                    <div className={styles['lobby-year-range-track']} />
                    <div
                      className={styles['lobby-year-range-fill']}
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
                      className={styles['lobbyRangeInputTop']}
                    />
                  </span>
                  <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                    {yearMinValue} – {yearMaxValue}
                  </span>
                </span>
              ) : (
                <span className={styles['lobby-setting-value']}>
                  {snapshot.config.yearMin} – {snapshot.config.yearMax}
                </span>
              )}
            </div>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
              <span className={styles['lobby-setting-label']}>Results Auto-Advance</span>
              {isHost ? (
                <span className={styles['lobbyRowLeftWrap']}>
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
                    className={styles['lobbyToggleBtn']}
                    style={{
                      background: resultsTimerValue > 0 ? "#22d3ee" : "rgba(255,255,255,0.15)",
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    <span
                      className={styles['lobbyToggleKnob']}
                      style={{
                        left: resultsTimerValue > 0 ? 22 : 2,
                      }}
                    />
                  </button>
                  {resultsTimerValue > 0 ? (
                    <span className={styles['lobbyRowLeft']}>
                      <input
                        type="range"
                        className={`${styles['lobby-timer-slider']} ${styles['lobbySliderInput']}`}
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
                      <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                        {formatTimerDisplay(resultsTimerValue)}
                      </span>
                    </span>
                  ) : (
                    <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                      OFF
                    </span>
                  )}
                </span>
              ) : (
                <span className={styles['lobby-setting-value']}>
                  {snapshot.config.resultsAutoAdvanceSec === 0 ? "OFF" : formatTimerDisplay(snapshot.config.resultsAutoAdvanceSec)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Players Card */}
        <div className={`card ${styles['lobby-card']} ${styles['lobby-players']}`}>
          <div className={styles['lobby-card-header']}>
            <span className={styles['lobby-accent-bar']} />
            <h3>Players ({totalPlayers})</h3>
          </div>
          <div className={styles['lobby-player-list']}>
            {activePlayers.length === 0 ? (
              <p className="small">No players yet.</p>
            ) : (
              activePlayers.map((p) => (
                <div
                  key={p.playerId}
                  className={styles['lobby-player-row']}
                >
                  <span className={styles['lobby-player-info']}>
                    <PlayerAvatar
                      avatarUrl={p.avatarUrl}
                      displayName={p.displayName || p.playerId.slice(0, 8)}
                      size={32}
                    />
                    <span style={getUsernameGradientStyle(p.playerId)}>
                      {p.displayName || p.playerId.slice(0, 8)}
                    </span>
                  </span>
                  <span className={styles['lobby-player-badges']}>
                    {p.isHost ? <span className={styles['lobby-host-badge']}>Host</span> : null}
                    <span className={`${styles['lobby-ready-badge']}${p.ready ? ' ' + styles['ready'] : ''}`}>
                      {p.ready ? "Ready" : "Not ready"}
                    </span>
                    {isHost && !p.isHost ? (
                      <button
                        type="button"
                        className={styles['lobby-kick-btn']}
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
        <div className={`card ${styles['lobby-card']} ${styles['lobby-invite']}`}>
          <div className={styles['lobby-card-header']}>
            <span className={styles['lobby-accent-bar']} />
            <h3>Invite</h3>
            <button
              type="button"
              className={styles['lobby-invite-toggle']}
              onClick={() => setInviteExpanded((v) => !v)}
              aria-label={inviteExpanded ? "Collapse invite panel" : "Expand invite panel"}
            >
              {inviteExpanded ? "−" : "+"}
            </button>
          </div>
          <div className={`${styles['lobby-invite-body']}${!inviteExpanded ? ' ' + styles['collapsed'] : ''}`}>
            {/* Invite Friends - search */}
            <div className={styles['lobby-invite-section']}>
              <span className={styles['lobby-invite-label']}>INVITE FRIENDS</span>
              <input
                type="text"
                className={styles['friendSearchInput']}
                placeholder="Search players..."
                value={friendQuery}
                onChange={(e) => setFriendQuery(e.target.value)}
              />
              {friendSearchLoading && (
                <div className={styles['friendSearchStatus']}>Searching...</div>
              )}
              {friendSearchError && (
                <div className={styles['friendSearchStatus']}>Search failed</div>
              )}
              <div className={styles['lobby-friend-list']}>
                {friendQuery.length < 2 ? (
                  <div className={`${styles['lobby-friend-empty']} ${styles['lobbyEmptyInvite']}`}>
                    Type to search players
                  </div>
                ) : friendResults.length === 0 && !friendSearchLoading && !friendSearchError ? (
                  <div className={`${styles['lobby-friend-empty']} ${styles['lobbyEmptyInvite']}`}>
                    No players found
                  </div>
                ) : (
                  friendResults.map((player) => {
                    const isInLobby = snapshot.players.some((p) => p.playerId === player.id);
                    const inviteState = inviteStates[player.id] || 'idle';
                    return (
                      <div key={player.id} className={styles['lobby-friend-row']}>
                        <span className={styles['lobby-friend-info']}>
                          <PlayerAvatar
                            avatarUrl={player.avatar_url}
                            displayName={player.display_name}
                            size={28}
                          />
                          <span style={getUsernameGradientStyle(player.id)}>
                            {player.display_name}
                          </span>
                        </span>
                        {isInLobby ? (
                          <span className={styles['inLobbyPill']}>In lobby</span>
                        ) : (
                          <button
                            type="button"
                            className={`button secondary ${styles['lobbyBtnSm']}`}
                            onClick={() => handleSendInvite(player.id)}
                            disabled={inviteState !== 'idle'}
                          >
                            {inviteState === 'pending' ? '...' : inviteState === 'sent' ? 'Sent ✓' : inviteState === 'error' ? 'Failed' : 'Invite'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Room code */}
            <div className={styles['lobby-invite-section']}>
              <span className={styles['lobby-invite-label']}>ROOM CODE</span>
              <div className={styles['lobby-room-code-row']}>
                <code className={styles['lobby-room-code']}>{roomCode}</code>
                <button
                  type="button"
                  className={`button secondary ${styles['lobbyBtnMd']}`}
                  onClick={() => handleCopy(roomCode, "Room code copied!")}
                >
                  {copiedLabel === "Room code copied!" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Invite link */}
            <div className={styles['lobby-invite-section']}>
              <span className={styles['lobby-invite-label']}>INVITE LINK</span>
              <div className={styles['lobby-room-code-row']}>
                <code className={`${styles['lobby-room-code']} ${styles['lobbyCode']}`}>
                  {truncatedInviteLink}
                </code>
                <button
                  type="button"
                  className={`button secondary ${styles['lobbyBtnMd']}`}
                  onClick={() => handleCopy(inviteLink, "Link copied!")}
                >
                  {copiedLabel === "Link copied!" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Dock */}
      <div className={styles['lobby-dock']}>
        <div className={styles['lobby-dock-content']}>
          <span className={styles['lobby-ready-count']}>
            {readyCount} / {totalPlayers} Ready
          </span>
          <div className={styles['lobby-dock-actions']}>
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

      {error ? <p className={styles['lobbyError']}>{error}</p> : null}
    </div>
  );
}
