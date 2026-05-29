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

type LastInvitedPlayer = { id: string; displayName: string; avatarUrl: string | null };
type PendingInvite = { id: string; displayName: string; avatarUrl: string | null };

const LS_KEY = "gh_last_invited_players";
const LS_MAX = 10;

function readLastInvited(): LastInvitedPlayer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as LastInvitedPlayer[]) : [];
  } catch {
    return [];
  }
}

function writeLastInvited(player: LastInvitedPlayer): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readLastInvited().filter((p) => p.id !== player.id);
    const updated = [player, ...existing].slice(0, LS_MAX);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
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

  /* ── Invite panel ── */
  const [linkCopiedToast, setLinkCopiedToast] = useState(false);
  const [lastInvited, setLastInvited] = useState<LastInvitedPlayer[]>([]);
  const [inviteStates, setInviteStates] = useState<Record<string, 'idle' | 'pending' | 'sent' | 'error'>>({});

  // Load last-invited from localStorage on mount
  useEffect(() => {
    setLastInvited(readLastInvited());
  }, []);

  /* ── Pending invites (invited but not yet joined) ── */
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  // Remove pending invites for players who have now joined
  useEffect(() => {
    const joinedIds = new Set(snapshot.players.map((p) => p.playerId));
    setPendingInvites((prev) => prev.filter((p) => !joinedIds.has(p.id)));
  }, [snapshot.players]);

  const handleSendInvite = async (player: LastInvitedPlayer) => {
    setInviteStates(prev => ({ ...prev, [player.id]: 'pending' }));
    try {
      const res = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: snapshot.gameId, invitee_id: player.id }),
      });
      if (res.ok) {
        setInviteStates(prev => ({ ...prev, [player.id]: 'sent' }));
        writeLastInvited(player);
        setLastInvited(readLastInvited());
        setPendingInvites((prev) => {
          if (prev.some((p) => p.id === player.id)) return prev;
          return [...prev, { id: player.id, displayName: player.displayName, avatarUrl: player.avatarUrl }];
        });
        setTimeout(() => {
          setInviteStates(prev => ({ ...prev, [player.id]: 'idle' }));
        }, 3000);
      } else {
        setInviteStates(prev => ({ ...prev, [player.id]: 'error' }));
        setTimeout(() => {
          setInviteStates(prev => ({ ...prev, [player.id]: 'idle' }));
        }, 3000);
      }
    } catch {
      setInviteStates(prev => ({ ...prev, [player.id]: 'error' }));
      setTimeout(() => {
        setInviteStates(prev => ({ ...prev, [player.id]: 'idle' }));
      }, 3000);
    }
  };

  const handleCopyLink = async () => {
    try {
      const link = typeof window !== "undefined" ? window.location.href : "";
      await navigator.clipboard.writeText(link);
      setLinkCopiedToast(true);
      setTimeout(() => setLinkCopiedToast(false), 2000);
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
  const isReady         = viewer?.ready ?? false;
  const isHost          = viewer?.isHost ?? false;

  /* ── Auto-start: fire onStartGame once when all players are ready and >= 2 players ── */
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (
      !autoStartFiredRef.current &&
      snapshot.players.length >= 2 &&
      snapshot.allPlayersReady &&
      !busy
    ) {
      autoStartFiredRef.current = true;
      onStartGame();
    }
    // Reset guard if conditions no longer met (player un-readied)
    if (!snapshot.allPlayersReady) {
      autoStartFiredRef.current = false;
    }
  }, [snapshot.allPlayersReady, snapshot.players.length, busy, onStartGame]);

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

        {/* ── Invite + Roster Card (merged) ── */}
        <div className={`card ${styles['lobby-card']} ${styles['lobby-roster-card']}`}>

          {/* Sub-section A: Invite Players */}
          <div className={styles['lobby-subsection']}>
            <div className={styles['lobby-subsection-header']}>
              <span className={styles['lobby-subsection-title']}>Invite Players</span>
              <button
                type="button"
                className={styles['lobbyLinkBtn']}
                onClick={handleCopyLink}
              >
                Invite via link or code
              </button>
            </div>
            {linkCopiedToast && (
              <span className={styles['lobbyCopiedToast']}>Copied!</span>
            )}
            <div className={styles['lobbyRail']}>
              {lastInvited.length === 0 ? (
                <div className={`${styles['lobbyPlayerCard']} ${styles['lobbyPlayerCardEmpty']}`}>
                  <span className={styles['lobbyEmptyRailText']}>No recent invites</span>
                </div>
              ) : (
                lastInvited.map((player) => {
                  const isInLobby = snapshot.players.some((p) => p.playerId === player.id);
                  const inviteState = inviteStates[player.id] ?? 'idle';
                  return (
                    <div key={player.id} className={styles['lobbyPlayerCard']}>
                      <PlayerAvatar avatarUrl={player.avatarUrl} displayName={player.displayName} size={40} />
                      <span className={styles['lobbyPlayerCardName']} style={getUsernameGradientStyle(player.id)}>
                        {player.displayName}
                      </span>
                      {isInLobby ? (
                        <span className={styles['lobbyStatusPillGreen']}>In lobby</span>
                      ) : (
                        <button
                          type="button"
                          className={styles['lobbyInviteBtn']}
                          onClick={() => handleSendInvite(player)}
                          disabled={inviteState !== 'idle'}
                        >
                          {inviteState === 'pending'
                            ? '…'
                            : inviteState === 'sent'
                            ? 'Sent ✓'
                            : inviteState === 'error'
                            ? 'Failed'
                            : 'Invite'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Sub-section B: Players roster */}
          <div className={styles['lobby-subsection']}>
            <div className={styles['lobby-subsection-header']}>
              <span className={styles['lobby-subsection-title']}>
                Players ({totalPlayers}/{totalPlayers + pendingInvites.length})
              </span>
              <span className={styles['lobbyReadyIndicator']}>
                <span
                  className={styles['lobbyReadyDot']}
                  style={{ background: readyCount > 0 ? "#4ade80" : "rgba(255,255,255,0.25)" }}
                />
                {readyCount} ready
              </span>
            </div>
            <div className={styles['lobbyRail']}>
              {activePlayers.map((p) => (
                <div key={p.playerId} className={styles['lobbyPlayerCard']}>
                  {p.isHost && <span className={styles['lobbyCrownIcon']}>♛</span>}
                  <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName || p.playerId.slice(0, 8)} size={40} />
                  <span className={styles['lobbyPlayerCardName']} style={getUsernameGradientStyle(p.playerId)}>
                    {p.displayName || p.playerId.slice(0, 8)}
                  </span>
                  <span className={p.ready ? styles['lobbyStatusPillGreen'] : styles['lobbyStatusPillGrey']}>
                    {p.ready ? "READY" : "NOT READY"}
                  </span>
                  {isHost && !p.isHost && (
                    <button
                      type="button"
                      className={styles['lobby-kick-btn']}
                      onClick={() => onKickPlayer?.(p.playerId)}
                      disabled={busy}
                      title="Kick player"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {pendingInvites.map((p) => (
                <div key={p.id} className={styles['lobbyPlayerCard']}>
                  <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName} size={40} />
                  <span className={styles['lobbyPlayerCardName']}>
                    {p.displayName}
                  </span>
                  <span className={styles['lobbyStatusPillAmber']}>PENDING</span>
                </div>
              ))}
              {activePlayers.length === 0 && pendingInvites.length === 0 && (
                <div className={`${styles['lobbyPlayerCard']} ${styles['lobbyPlayerCardEmpty']}`}>
                  <span className={styles['lobbyEmptyRailText']}>No players yet</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Game Settings Card ── */}
        <div className={`card ${styles['lobby-card']} ${styles['lobby-settings']}`}>
          <div className={styles['lobby-card-header']}>
            <span className={styles['lobby-accent-bar']} />
            <h3>Game Settings</h3>
          </div>
          <span className={styles['lobbyRelaxLabel']}>RELAX MODE</span>
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
                    className={resultsTimerValue > 0 ? styles['lobbyToggleBtnOn'] : styles['lobbyToggleBtnOff']}
                  >
                    <span
                      className={styles['lobbyToggleKnob']}
                      style={{ left: resultsTimerValue > 0 ? 22 : 2 }}
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

      </div>

      {/* Bottom Dock — single READY CTA */}
      <div className={styles['lobby-dock']}>
        <div className={styles['lobby-dock-content']}>
          <button
            type="button"
            className={isReady ? styles['lobbyReadyBtnOff'] : styles['lobbyReadyBtnOn']}
            onClick={onToggleReady}
            disabled={busy}
          >
            {isReady ? "NOT READY" : "READY"}
          </button>
          <span className={styles['lobby-ready-count']}>
            ({readyCount}/{totalPlayers} players ready)
          </span>
        </div>
      </div>

      {error ? <p className={styles['lobbyError']}>{error}</p> : null}
    </div>
  );
}
