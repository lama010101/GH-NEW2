import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { TIMER_MIN_SEC, TIMER_MAX_SEC } from "@/core/types";
import { getUsernameGradientStyle } from "@/core/competeUtils";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import styles from './LobbySection.module.css';
import { supabaseBrowser, getValidAccessToken } from '@/core/supabaseBrowser';

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
  onSetSubMode?: (mode: "sync" | "async", sessionDeadlineDays: number) => void;
  onKickPlayer?: (targetPlayerId: string) => void;
  onSetEraSelection?: (selectedEras: string[], yearMin: number, yearMax: number) => void;
}

type LastInvitedPlayer = { id: string; displayName: string; avatarUrl: string | null };
type PendingInvite = { id: string; displayName: string; avatarUrl: string | null };
type PlayerPoolEntry = { id: string; displayName: string; avatarUrl: string | null };

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

function formatTimerDisplay(sec: number, offLabel: string): string {
  if (sec === 0) return offLabel;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

type EraId = 'ancient' | 'medieval' | 'earlymodern' | 'modern' | 'contemporary';
const ERAS: { id: EraId; label: string; span: string; icon: string; yearMin: number; yearMax: number }[] = [
  { id: 'ancient',     label: 'Ancient',      span: '-3000 – 476',  icon: '🏛️', yearMin: -3000, yearMax: 476  },
  { id: 'medieval',    label: 'Medieval',     span: '476 – 1492',   icon: '⚔️', yearMin: 476,   yearMax: 1492 },
  { id: 'earlymodern', label: 'Early Modern', span: '1492 – 1789',  icon: '⛵', yearMin: 1492,  yearMax: 1789 },
  { id: 'modern',      label: 'Modern',       span: '1789 – 1945',  icon: '🏭', yearMin: 1789,  yearMax: 1945 },
  { id: 'contemporary',label: 'Contemporary', span: '1945 – 2025',  icon: '🚀', yearMin: 1945,  yearMax: new Date().getFullYear() },
];

export default function LobbySection({
  snapshot,
  viewer,
  busy,
  error,
  // isConnected kept in props interface for future use
  onToggleReady,
  onStartGame,
  onSetTimer,
  onSetYearRange,
  onSetResultsTimer,
  onSetSubMode,
  onKickPlayer,
  onSetEraSelection,
}: LobbySectionProps) {
  void onSetYearRange;
  void onStartGame;
  const router = useRouter();
  const t = useTranslations();
  const tGame = useTranslations('game');

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

  // Sync year range to authoritative snapshot value whenever it changes externally.
  useEffect(() => {
    void yearMinValue;
    void yearMaxValue;
    setYearMinValue(snapshot.config.yearMin);
    setYearMaxValue(snapshot.config.yearMax);
  }, [snapshot.config.yearMin, snapshot.config.yearMax, yearMinValue, yearMaxValue]);

  /* Results auto-advance transient state — synced from snapshot on every update. */
  const [resultsTimerValue, setResultsTimerValue] = useState(snapshot.config.resultsAutoAdvanceSec);
  const resultsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync results timer to authoritative snapshot value whenever it changes externally.
  useEffect(() => {
    setResultsTimerValue(snapshot.config.resultsAutoAdvanceSec);
  }, [snapshot.config.resultsAutoAdvanceSec]);

  // Sync selected eras to authoritative snapshot value whenever it changes externally.
  // Use a stable string key to avoid firing on every broadcast (JSON arrays are always
  // new references). Skip sync if local state already matches incoming value.
  const snapshotErasKey = (snapshot.config.selectedEras ?? ERAS.map(e => e.id))
    .slice()
    .sort()
    .join(',');
  useEffect(() => {
    if (suppressEraSyncRef.current) {
      suppressEraSyncRef.current = false;
      return;
    }
    const incoming = (snapshot.config.selectedEras ?? ERAS.map(e => e.id)) as EraId[];
    const incomingKey = incoming.slice().sort().join(',');
    const localKey = [...selectedEras].sort().join(',');
    if (incomingKey === localKey) return; // already in sync, skip
    setSelectedEras(new Set(incoming));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotErasKey]);

  /* ── Invite panel ── */
  const [linkCopied, setLinkCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [lastInvited, setLastInvited] = useState<LastInvitedPlayer[]>([]);
  const [inviteStates, setInviteStates] = useState<Record<string, 'idle' | 'pending' | 'sent' | 'error'>>({});
  const [playerPool, setPlayerPool] = useState<PlayerPoolEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllModal, setShowAllModal] = useState(false);

  /* ── Settings tab UI state ── */
  // Tab is derived from the authoritative snapshot.config.mode (single source of truth).
  // sync → realtime tab, async → turnturn tab. Host click dispatches onSetSubMode (WS → DB → broadcast).
  const settingsTab: 'realtime' | 'turnturn' = snapshot.config.mode === "async" ? 'turnturn' : 'realtime';

  /* Max turn days transient state — synced from snapshot on every update.
     Local value is ONLY for drag feedback; authority stays in snapshot. */
  const [maxTurnDays, setMaxTurnDays] = useState(snapshot.config.sessionDeadlineDays ?? 3);
  const deadlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync max turn days to authoritative snapshot value whenever it changes externally.
  useEffect(() => {
    setMaxTurnDays(snapshot.config.sessionDeadlineDays ?? 3);
  }, [snapshot.config.sessionDeadlineDays]);

  const [selectedEras, setSelectedEras] = useState<Set<EraId>>(
    () => new Set((snapshot.config.selectedEras ?? ERAS.map(e => e.id)) as EraId[])
  );
  const suppressEraSyncRef = useRef(false);

  const centerEarlyModernOnMobile = useCallback((rail: HTMLDivElement | null) => {
    if (!rail || typeof window === 'undefined') return;
    if (window.innerWidth >= 640) return;
    const btn = rail.querySelector('[data-era="earlymodern"]');
    if (btn instanceof HTMLElement) {
      btn.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
    }
  }, []);

  const toggleEra = useCallback((id: EraId) => {
    if (selectedEras.has(id) && selectedEras.size === 1) return;
    const next = new Set(selectedEras);
    if (next.has(id)) next.delete(id); else next.add(id);
    const selected = ERAS.filter(e => next.has(e.id));
    const newMin = Math.min(...selected.map(e => e.yearMin));
    const newMax = Math.max(...selected.map(e => e.yearMax));
    setSelectedEras(next);
    setYearMinValue(newMin);
    setYearMaxValue(newMax);
    onSetEraSelection?.([...next], newMin, newMax);
  }, [selectedEras, onSetEraSelection]);

  const allErasSelected = selectedEras.size === ERAS.length;
  const toggleAllEras = () => {
    if (allErasSelected) {
      const last = ERAS[ERAS.length - 1];
      setSelectedEras(new Set([last.id]));
      setYearMinValue(last.yearMin);
      setYearMaxValue(last.yearMax);
      onSetEraSelection?.([last.id], last.yearMin, last.yearMax);
    } else {
      const allMin = Math.min(...ERAS.map(e => e.yearMin));
      const allMax = Math.max(...ERAS.map(e => e.yearMax));
      setSelectedEras(new Set(ERAS.map(e => e.id)));
      setYearMinValue(allMin);
      setYearMaxValue(allMax);
      onSetEraSelection?.(ERAS.map(e => e.id), allMin, allMax);
    }
  };

  // Load last-invited from localStorage on mount
  useEffect(() => {
    setLastInvited(readLastInvited());
  }, []);

  // Fetch recent players on mount as default pool
  useEffect(() => {
    let cancelled = false;
    async function fetchRecent() {
      const token = await getValidAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/players/recent', { headers });
      if (cancelled) return;
      const json = res.ok ? await res.json() : { players: [] };
      const players: PlayerPoolEntry[] = (json.players ?? []).map(
        (p: { id: string; display_name: string; avatar_url: string | null }) => ({
          id: p.id,
          displayName: p.display_name?.trim() || 'Player',
          avatarUrl: p.avatar_url,
        })
      );
      setPlayerPool(players);
    }
    fetchRecent();
    return () => { cancelled = true; };
  }, []);

  // Live debounced search — fires when searchQuery >= 2 chars
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) return;
    searchDebounceRef.current = setTimeout(async () => {
      const token = await getValidAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(q)}`, { headers });
      if (!res.ok) return;
      const json = await res.json();
      const players: PlayerPoolEntry[] = (json.players ?? []).map(
        (p: { id: string; display_name: string; avatar_url: string | null }) => ({
          id: p.id,
          displayName: p.display_name?.trim() || 'Player',
          avatarUrl: p.avatar_url,
        })
      );
      setPlayerPool(players);
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  /* ── Pending invites (invited but not yet joined) ── */
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  /* ── Follow state ── */
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  // Fetch followed players on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchFollows() {
      try {
        const { data, error } = await supabaseBrowser
          .from('player_follows')
          .select('followed_id')
          .order('created_at', { ascending: false });
        if (error || cancelled) return;
        setFollowedIds(new Set((data ?? []).map((r) => r.followed_id)));
      } catch {
        // silent
      }
    }
    fetchFollows();
    return () => { cancelled = true; };
  }, []);

  const toggleFollow = async (playerId: string) => {
    const isFollowed = followedIds.has(playerId);
    // Optimistic update
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (isFollowed) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
    try {
      if (isFollowed) {
        await fetch('/api/players/follow', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ followed_id: playerId }),
        });
      } else {
        await fetch('/api/players/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ followed_id: playerId }),
        });
      }
    } catch (e) {
      console.error('[LobbySection] Failed to toggle follow:', e);
      // Revert optimistic update on error
      setFollowedIds((prev) => {
        const next = new Set(prev);
        if (isFollowed) {
          next.add(playerId);
        } else {
          next.delete(playerId);
        }
        return next;
      });
    }
  };

  // Remove pending invites for players who have now joined
  useEffect(() => {
    const joinedIds = new Set(snapshot.players.map((p) => p.playerId));
    setPendingInvites((prev) => prev.filter((p) => !joinedIds.has(p.id)));
  }, [snapshot.players]);

  // Build priority display list
  const inLobbyIds = new Set(snapshot.players.map((p) => p.playerId));
  const viewerId = viewer?.playerId ?? null;
  const lastInvitedFiltered = lastInvited.filter((p) => !inLobbyIds.has(p.id) && p.id !== viewerId);
  const lastInvitedIds = new Set(lastInvitedFiltered.map((p) => p.id));
  const poolRemainder = playerPool.filter((p) => !lastInvitedIds.has(p.id) && !inLobbyIds.has(p.id) && p.id !== viewerId);
  const priorityList: PlayerPoolEntry[] = [
    ...lastInvitedFiltered.map((p) => ({ id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl })),
    ...poolRemainder,
  ].filter(p => !pendingInvites.some(pi => pi.id === p.id));

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const searchResults: PlayerPoolEntry[] = trimmedQuery.length >= 1
    ? playerPool.filter((p) => !inLobbyIds.has(p.id) && p.id !== viewerId).slice(0, 20)
    : [];
  const displayList: PlayerPoolEntry[] = (trimmedQuery.length >= 1
    ? searchResults
    : priorityList.slice(0, 10)
  ).sort((a, b) => {
    const aFav = followedIds.has(a.id) ? 0 : 1;
    const bFav = followedIds.has(b.id) ? 0 : 1;
    return aFav - bFav;
  });
  const hasMore = trimmedQuery.length === 0 && priorityList.length > 10;

  const handleSendInvite = async (player: PlayerPoolEntry) => {
    setInviteStates(prev => ({ ...prev, [player.id]: 'pending' }));
    try {
      const token = await getValidAccessToken();
      const res = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
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
        const errData = await res.json().catch(() => ({}));
        console.error("[INVITE_SEND_FAIL]", res.status, errData);
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
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  /* ------------------------------------------------------------------
   * Render-only derivation — ALL lobby display values from snapshot.
   * No local lobby state. UI reflects DO snapshot only.
   * ------------------------------------------------------------------ */
  const roomCode        = snapshot.roomCode;
  const activePlayers   = snapshot.players.filter((p) => p.leftAt === null);
  const totalPlayers    = activePlayers.length;
  const readyCount      = activePlayers.filter((p) => p.ready).length;
  const isReady         = viewer?.ready ?? false;
  const isHost          = viewer?.isHost ?? false;

  return (
    <div className={styles['lobby-shell']} data-testid="lobby-shell">
      <header className={styles['lobby-header']}>
        <div className={styles['lobby-header-top']}>
          <button className={styles['lobby-back-btn']} onClick={() => router.push("/home")} aria-label={t('lobby.back')} data-testid="lobby-back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className={styles['lobby-mode-badge']}>{t('lobby.mode_challenge')}</span>
          <div className={styles['lobby-header-meta']}>
            <span className={styles['lobby-status-chip']}>
              <span className={styles['lobby-status-dot']} />
              {t('lobby.waiting')}
            </span>
          </div>
        </div>
        <h1 className={styles['lobby-title-h1']}>{t('lobby.game_lobby')}</h1>
      </header>

      {/* Main Grid */}
      <div className={styles['lobby-grid']}>

        {/* ── Invite + Roster Card (merged) ── */}
        <div className={`${styles['lobby-card']} ${styles['lobby-roster-card']}`}>

          {/* Sub-section A: Invite Players */}
          {viewer?.isHost && (
          <div className={styles['lobby-subsection']}>
            <div className={styles['lobby-subsection-header']}>
              <span className={styles['lobby-accent-bar-sm']} />
              <span className={styles['lobby-subsection-title']}>{t('lobby.invite_players')}</span>
              <div className={styles['lobbyShareBtnGroup']}>
                <button type="button" className={styles['lobbyShareBtn']} onClick={handleCopyLink} data-testid="lobby-copy-link">
                  {t('lobby.copy_link')}
                </button>
                <button type="button" className={styles['lobbyShareBtn']} onClick={handleCopyCode} data-testid="lobby-copy-code">
                  {t('lobby.copy_code')}
                </button>
              </div>
            </div>
            {(linkCopied || codeCopied) && (
              <span className={styles['lobbyCopiedToast']}>
                {linkCopied ? t('lobby.link_copied') : t('lobby.code_copied')}
              </span>
            )}
            <div className={styles['lobbySearchWrap']}>
              <svg className={styles['lobbySearchIcon']} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className={`${styles['lobbyInviteSearch']} ${searchQuery ? styles['lobbyInviteSearchWithClear'] : ''}`}
                placeholder={t('lobby.search_players')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles['lobbySearchClearBtn']}
                  onClick={() => setSearchQuery('')}
                  aria-label={t('lobby.clear_search')}
                >
                  ×
                </button>
              )}
            </div>
            <div className={styles['lobbyRail']}>
              {displayList.length === 0 ? (
                <div className={`${styles['lobbyPlayerCard']} ${styles['lobbyPlayerCardEmpty']}`}>
                  <span className={styles['lobbyEmptyRailText']}>{t('lobby.no_players_found')}</span>
                </div>
              ) : (
                displayList.map((player) => {
                  const inviteState = inviteStates[player.id] ?? 'idle';
                  const nameParts = player.displayName.split(' ');
                  const firstName = nameParts[0];
                  const lastName = nameParts.slice(1).join(' ');
                  return (
                    <div key={player.id} className={styles['lobbyPlayerCard']}>
                      <div className={styles['lobbyAvatarWrap']}>
                        <PlayerAvatar avatarUrl={player.avatarUrl} displayName={player.displayName} size={40} />
                        <button
                          className={styles['lobbyStarBtn']}
                          onClick={() => toggleFollow(player.id)}
                          aria-label={followedIds.has(player.id) ? t('lobby.remove_from_favorites') : t('lobby.add_to_favorites')}
                        >
                          <span style={{ color: followedIds.has(player.id) ? '#f0c060' : 'rgba(255,255,255,0.5)' }}>
                            {followedIds.has(player.id) ? '★' : '☆'}
                          </span>
                        </button>
                      </div>
                      <div style={getUsernameGradientStyle(player.id)}>
                        <span className={styles['lobbyCardNameFirst']}>{firstName}</span>
                        {lastName && <span className={styles['lobbyCardNameLast']}>{lastName}</span>}
                      </div>
                      <button
                        type="button"
                        className={styles['lobbyInviteBtn']}
                        onClick={() => handleSendInvite(player)}
                        disabled={inviteState !== 'idle'}
                      >
                        {inviteState === 'pending'
                          ? t('lobby.invite_pending')
                          : inviteState === 'sent'
                          ? t('lobby.invite_sent')
                          : inviteState === 'error'
                          ? t('lobby.invite_failed')
                          : t('lobby.invite')}
                      </button>
                    </div>
                  );
                })
              )}
              {hasMore && (
                <div
                  className={`${styles['lobbyPlayerCard']} ${styles['lobbyViewAllCard']}`}
                  onClick={() => setShowAllModal(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setShowAllModal(true)}
                >
                  <span className={styles['lobbyViewAllText']}>{t('lobby.view_all', { count: priorityList.length })}</span>
                </div>
              )}
            </div>
          </div>
          )}

          {/* All-players modal */}
          {showAllModal && (
            <div className={styles['lobbyAllModal']} onClick={() => setShowAllModal(false)}>
              <div className={styles['lobbyAllModalInner']} onClick={(e) => e.stopPropagation()}>
                <button type="button" className={styles['lobbyAllModalClose']} onClick={() => setShowAllModal(false)}>×</button>
                <span className={styles['lobby-subsection-title']}>{t('lobby.all_players', { count: priorityList.length })}</span>
                <div className={styles['lobbyAllModalList']}>
                  {priorityList.map((player) => {
                    const inviteState = inviteStates[player.id] ?? 'idle';
                    const nameParts = player.displayName.split(' ');
                    const firstName = nameParts[0];
                    const lastName = nameParts.slice(1).join(' ');
                    return (
                      <div key={player.id} className={styles['lobbyPlayerCard']}>
                        <div className={styles['lobbyAvatarWrap']}>
                          <PlayerAvatar avatarUrl={player.avatarUrl} displayName={player.displayName} size={40} />
                          <button
                            className={styles['lobbyStarBtn']}
                            onClick={() => toggleFollow(player.id)}
                            aria-label={followedIds.has(player.id) ? t('lobby.remove_from_favorites') : t('lobby.add_to_favorites')}
                          >
                            <span style={{ color: followedIds.has(player.id) ? '#f0c060' : 'rgba(255,255,255,0.5)' }}>
                              {followedIds.has(player.id) ? '★' : '☆'}
                            </span>
                          </button>
                        </div>
                        <div style={getUsernameGradientStyle(player.id)}>
                          <span className={styles['lobbyCardNameFirst']}>{firstName}</span>
                          {lastName && <span className={styles['lobbyCardNameLast']}>{lastName}</span>}
                        </div>
                        <button
                          type="button"
                          className={styles['lobbyInviteBtn']}
                          onClick={() => handleSendInvite(player)}
                          disabled={inviteState !== 'idle'}
                        >
                          {inviteState === 'pending'
                            ? t('lobby.invite_pending')
                            : inviteState === 'sent'
                            ? t('lobby.invite_sent')
                            : inviteState === 'error'
                            ? t('lobby.invite_failed')
                            : t('lobby.invite')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Sub-section B: Players roster */}
          <div className={styles['lobby-subsection']}>
            <div className={styles['lobby-subsection-header']}>
              <span className={styles['lobby-accent-bar-sm']} /><span className={styles['lobby-subsection-title']}>{t('lobby.players', { current: totalPlayers, total: totalPlayers + pendingInvites.length })}</span>
              <span className={styles['lobbyReadyIndicator']}>
                <span
                  className={styles['lobbyReadyDot']}
                  style={{ background: readyCount > 0 ? "#4ade80" : "rgba(255,255,255,0.25)" }}
                />
                {t('lobby.ready_count', { count: readyCount })}
              </span>
            </div>
            <div className={styles['lobbyRosterList']} data-testid="lobby-roster">
              {activePlayers.map((p) => {
                const displayName = p.displayName || p.playerId.slice(0, 8);
                const isViewerPlayer = p.playerId === viewer?.playerId;
                return (
                  <div key={p.playerId} className={`${styles['lobbyRosterRow']} ${p.ready ? styles['lobbyRosterRowReady'] : ''}`} data-testid={`lobby-player-${p.playerId}`} data-ready={p.ready ? 'true' : 'false'} data-host={p.isHost ? 'true' : 'false'}>
                    <div className={styles['lobbyAvatarWrap']}>
                      <PlayerAvatar avatarUrl={p.avatarUrl} displayName={displayName} size={40} />
                    </div>
                    {!isViewerPlayer && (
                      <button className={styles['lobbyStarBtnInline']} onClick={() => toggleFollow(p.playerId)} aria-label={t('lobby.toggle_follow')}>
                        <span style={{ color: followedIds.has(p.playerId) ? '#f0c060' : 'rgba(255,255,255,0.45)' }}>
                          {followedIds.has(p.playerId) ? '★' : '☆'}
                        </span>
                      </button>
                    )}
                    <div className={styles['lobbyRosterMeta']}>
                      <span className={styles['lobbyRosterName']}>
                        {displayName}
                        {isViewerPlayer && <span className={styles['lobbyYouTag']}>{t('lobby.you')}</span>}
                      </span>
                      {p.isHost && <span className={styles['lobbyHostInline']}>♛ {t('lobby.host')}</span>}
                    </div>
                    <span className={p.ready ? styles['lobbyStatusPillGreen'] : styles['lobbyStatusPillGrey']}>
                      {p.ready ? t('lobby.ready') : t('lobby.not_ready')}
                    </span>
                    {isHost && !p.isHost && (
                      <button type="button" className={styles['lobby-kick-btn']} onClick={() => onKickPlayer?.(p.playerId)} disabled={busy} title={t('lobby.kick_player')} data-testid={`lobby-kick-${p.playerId}`}>×</button>
                    )}
                  </div>
                );
              })}
              {pendingInvites.map((p) => (
                <div key={p.id} className={styles['lobbyRosterRow']}>
                  <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName} size={40} />
                  <div className={styles['lobbyRosterMeta']}>
                    <span className={styles['lobbyRosterName']}>{p.displayName}</span>
                  </div>
                  <span className={styles['lobbyStatusPillAmber']}>{t('lobby.invited')}</span>
                  {isHost && (
                    <button
                      type="button"
                      className={styles['lobby-kick-btn']}
                      onClick={() => setPendingInvites((prev) => prev.filter((invite) => invite.id !== p.id))}
                      title={t('lobby.remove_invite')}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {activePlayers.length === 0 && pendingInvites.length === 0 && (
                <div className={styles['lobbyRosterEmpty']}>{t('lobby.no_players_yet')}</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Game Settings Card ── */}
        <div className={`${styles['lobby-card']} ${styles['lobby-settings']}`}>
          <div className={styles['lobby-card-header']}>
            <span className={styles['lobby-accent-bar']} />
            <h3>{t('lobby.game_settings')}</h3>
          </div>
          <div className={styles['lobbyTabRow']}>
            <button
              className={`${styles['lobbyTabBtn']} ${settingsTab === 'realtime' ? styles['lobbyTabBtnActive'] : ''}`}
              onClick={() => isHost && onSetSubMode?.("sync", maxTurnDays)}
              disabled={!isHost || busy}
            >{t('lobby.realtime')}</button>
            <button
              className={`${styles['lobbyTabBtn']} ${settingsTab === 'turnturn' ? styles['lobbyTabBtnActive'] : ''}`}
              onClick={() => isHost && onSetSubMode?.("async", maxTurnDays)}
              disabled={!isHost || busy}
            >{t('lobby.turn_by_turn')}</button>
          </div>
          <div className={styles['lobby-settings-grid']}>
            {settingsTab === 'realtime' && (<>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
              <span className={styles['lobby-setting-label']}>{t('lobby.round_timer')}</span>
              {isHost ? (
                <span className={styles['lobbyRowLeftWrap']}>
                  <button
                    type="button"
                    onClick={() => {
                      const val = sliderValue > 0 ? 0 : 120;
                      setSliderValue(val);
                      if (timerDebounceRef.current) clearTimeout(timerDebounceRef.current);
                      timerDebounceRef.current = setTimeout(() => {
                        onSetTimer?.(val);
                      }, 400);
                    }}
                    disabled={busy}
                    className={sliderValue > 0 ? styles['lobbyToggleBtnOn'] : styles['lobbyToggleBtnOff']}
                  >
                    <span
                      className={styles['lobbyToggleKnob']}
                      style={{ left: sliderValue > 0 ? 22 : 2 }}
                    />
                  </button>
                  {sliderValue > 0 ? (
                    <span className={styles['lobbyRowLeft']}>
                      <span className={styles['lobby-timer-slider-wrap']}>
                        <div className={styles['lobby-timer-slider-track']} />
                        <div
                          className={styles['lobby-timer-slider-fill']}
                          style={{
                            width: `${((sliderValue - TIMER_MIN_SEC) / (TIMER_MAX_SEC - TIMER_MIN_SEC)) * 100}%`,
                          }}
                        />
                        <input
                          type="range"
                          className={styles['lobby-timer-slider']}
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
                      </span>
                      <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                        {formatTimerDisplay(sliderValue, t('lobby.timer_off'))}
                      </span>
                    </span>
                  ) : (
                    <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                      {t('lobby.timer_off')}
                    </span>
                  )}
                </span>
              ) : (
                <span className={styles['lobby-setting-value']}>
                  {snapshot.config.roundTimerSec === 0 ? t('lobby.timer_off') : formatTimerDisplay(snapshot.config.roundTimerSec, t('lobby.timer_off'))}
                </span>
              )}
            </div>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
              <span className={styles['lobby-setting-label']}>{t('lobby.results_timer')}</span>
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
                      <span className={styles['lobby-timer-slider-wrap']}>
                        <div className={styles['lobby-timer-slider-track']} />
                        <div
                          className={styles['lobby-timer-slider-fill']}
                          style={{
                            width: `${((resultsTimerValue - TIMER_MIN_SEC) / (TIMER_MAX_SEC - TIMER_MIN_SEC)) * 100}%`,
                          }}
                        />
                        <input
                          type="range"
                          className={styles['lobby-timer-slider']}
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
                      </span>
                      <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                        {formatTimerDisplay(resultsTimerValue, t('lobby.timer_off'))}
                      </span>
                    </span>
                  ) : (
                    <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                      {t('lobby.timer_off')}
                    </span>
                  )}
                </span>
              ) : (
                <span className={styles['lobby-setting-value']}>
                  {snapshot.config.resultsAutoAdvanceSec === 0 ? t('lobby.timer_off') : formatTimerDisplay(snapshot.config.resultsAutoAdvanceSec, t('lobby.timer_off'))}
                </span>
              )}
            </div>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbySettingRowBlock']}`}>
              <div className={styles['lobbySettingRowHead']}>
                <span className={styles['lobby-setting-label']}>{tGame('era_presets')}</span>
                {isHost && (
                  <button type="button" className={styles['lobbySelectAllBtn']} onClick={toggleAllEras}>
                    {allErasSelected ? t('lobby.deselect_all') : t('lobby.select_all')}
                  </button>
                )}
              </div>
              <div className={styles['lobbyEraRail']} ref={centerEarlyModernOnMobile}>
                {ERAS.map(era => {
                  const on = selectedEras.has(era.id);
                  return (
                    <button
                      key={era.id}
                      data-era={era.id}
                      type="button"
                      className={`${styles['lobbyEraBtn']} ${on ? styles['lobbyEraBtnOn'] : styles['lobbyEraBtnOff']}`}
                      onClick={() => isHost && toggleEra(era.id)}
                      disabled={!isHost}
                      aria-pressed={on}
                    >
                      <span className={styles['lobbyEraLabel']}>{tGame(`era_${era.id}` as any)}</span>
                      <span className={styles['lobbyEraIcon']}>{era.icon}</span>
                      <span className={styles['lobbyEraSpan']}>{era.span}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            </>)}
            {settingsTab === 'turnturn' && (<>
              <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
                <span className={styles['lobby-setting-label']}>{t('lobby.max_time_per_turn')}</span>
                {isHost ? (
                <span className={styles['lobbyRowLeft']}>
                  <span className={styles['lobby-timer-slider-wrap']}>
                    <div className={styles['lobby-timer-slider-track']} />
                    <div className={styles['lobby-timer-slider-fill']} style={{ width: `${((maxTurnDays - 1) / 13) * 100}%` }} />
                    <input
                      type="range"
                      className={styles['lobby-timer-slider']}
                      min={1}
                      max={14}
                      step={1}
                      value={maxTurnDays}
                      disabled={busy}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMaxTurnDays(val);
                        if (deadlineDebounceRef.current) clearTimeout(deadlineDebounceRef.current);
                        deadlineDebounceRef.current = setTimeout(() => {
                          onSetSubMode?.("async", val);
                        }, 400);
                      }}
                    />
                  </span>
                  <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>{maxTurnDays === 1 ? t('lobby.1_day') : t('lobby.n_days', { n: maxTurnDays })}</span>
                </span>
                ) : (
                  <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>{maxTurnDays === 1 ? t('lobby.1_day') : t('lobby.n_days', { n: maxTurnDays })}</span>
                )}
              </div>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
              <span className={styles['lobby-setting-label']}>{t('lobby.round_timer')}</span>
              {isHost ? (
                <span className={styles['lobbyRowLeftWrap']}>
                  <button
                    type="button"
                    onClick={() => {
                      const val = sliderValue > 0 ? 0 : 120;
                      setSliderValue(val);
                      if (timerDebounceRef.current) clearTimeout(timerDebounceRef.current);
                      timerDebounceRef.current = setTimeout(() => {
                        onSetTimer?.(val);
                      }, 400);
                    }}
                    disabled={busy}
                    className={sliderValue > 0 ? styles['lobbyToggleBtnOn'] : styles['lobbyToggleBtnOff']}
                  >
                    <span
                      className={styles['lobbyToggleKnob']}
                      style={{ left: sliderValue > 0 ? 22 : 2 }}
                    />
                  </button>
                  {sliderValue > 0 ? (
                    <span className={styles['lobbyRowLeft']}>
                      <span className={styles['lobby-timer-slider-wrap']}>
                        <div className={styles['lobby-timer-slider-track']} />
                        <div
                          className={styles['lobby-timer-slider-fill']}
                          style={{
                            width: `${((sliderValue - TIMER_MIN_SEC) / (TIMER_MAX_SEC - TIMER_MIN_SEC)) * 100}%`,
                          }}
                        />
                        <input
                          type="range"
                          className={styles['lobby-timer-slider']}
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
                      </span>
                      <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                        {formatTimerDisplay(sliderValue, t('lobby.timer_off'))}
                      </span>
                    </span>
                  ) : (
                    <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>
                      {t('lobby.timer_off')}
                    </span>
                  )}
                </span>
              ) : (
                <span className={styles['lobby-setting-value']}>
                  {snapshot.config.roundTimerSec === 0 ? t('lobby.timer_off') : formatTimerDisplay(snapshot.config.roundTimerSec, t('lobby.timer_off'))}
                </span>
              )}
            </div>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbySettingRowBlock']}`}>
              <div className={styles['lobbySettingRowHead']}>
                <span className={styles['lobby-setting-label']}>{tGame('era_presets')}</span>
                {isHost && (
                  <button type="button" className={styles['lobbySelectAllBtn']} onClick={toggleAllEras}>
                    {allErasSelected ? t('lobby.deselect_all') : t('lobby.select_all')}
                  </button>
                )}
              </div>
              <div className={styles['lobbyEraRail']} ref={centerEarlyModernOnMobile}>
                {ERAS.map(era => {
                  const on = selectedEras.has(era.id);
                  return (
                    <button
                      key={era.id}
                      data-era={era.id}
                      type="button"
                      className={`${styles['lobbyEraBtn']} ${on ? styles['lobbyEraBtnOn'] : styles['lobbyEraBtnOff']}`}
                      onClick={() => isHost && toggleEra(era.id)}
                      disabled={!isHost}
                      aria-pressed={on}
                    >
                      <span className={styles['lobbyEraLabel']}>{tGame(`era_${era.id}` as any)}</span>
                      <span className={styles['lobbyEraIcon']}>{era.icon}</span>
                      <span className={styles['lobbyEraSpan']}>{era.span}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            </>)}
          </div>
        </div>

      </div>

      {/* Bottom Dock — single READY CTA */}
      <div className={styles['lobby-dock']} data-testid="lobby-dock">
        <div className={styles['lobby-dock-content']}>
          <button
            type="button"
            className={isReady ? styles['lobbyReadyBtnIsReady'] : styles['lobbyReadyBtnNotReady']}
            onClick={onToggleReady}
            disabled={busy}
            data-testid="lobby-ready-btn"
          >
            {isReady ? t('lobby.ready_waiting') : t('lobby.im_ready')}
          </button>
          <span className={styles['lobby-ready-count']} data-testid="lobby-ready-count">
            {t('lobby.players_ready', { ready: readyCount ?? 0, total: totalPlayers ?? 0 })}
            {snapshot.allPlayersReady && totalPlayers > 0 && (
              <span className={styles['lobbyAllReadyTag']}>{t('lobby.starting_soon')}</span>
            )}
          </span>
        </div>
      </div>

      {error ? <p className={styles['lobbyError']}>{error}</p> : null}
    </div>
  );
}
