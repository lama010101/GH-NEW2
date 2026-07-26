import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { TIMER_MIN_SEC, TIMER_MAX_SEC } from "@/core/types";
import { getUsernameGradientStyle } from "@/core/competeUtils";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import { ImageButton } from "@/components/shared/ImageButton";
import { ERA_STOCK_IMAGES, REGION_STOCK_IMAGES } from "@/core/useEraRegionImages";
import styles from './LobbySection.module.css';
import { supabaseBrowser, getValidAccessToken } from '@/core/supabaseBrowser';
import { Zap, Leaf, ChevronDown, Timer, HelpCircle } from 'lucide-react';

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
  onSetRegionSelection?: (selectedRegions: string[]) => void;
}

type LastInvitedPlayer = { id: string; displayName: string; avatarUrl: string | null };
type PendingInvite = { id: string; displayName: string; avatarUrl: string | null };
type PlayerPoolEntry = { id: string; displayName: string; avatarUrl: string | null };

const LS_KEY = "gh_last_invited_players";
const LS_MAX = 10;
const ROUND_TIMER_DEFAULT_SEC = 120;
const ROUND_TIMER_TICKS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 300];
const ROUND_TIMER_MAJOR_TICKS = ROUND_TIMER_TICKS.filter((v) => v % 60 === 0);
const RUSH_ROUND_TIMER_TICKS = [60, 120, 180, 240, 300];
const DEADLINE_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

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

type RangeSliderProps = {
  className: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  format: (value: number) => string;
  ticks?: number[];
};

function RangeSlider({ className, min, max, step, value, disabled, onChange, format, ticks }: RangeSliderProps) {
  const [dragging, setDragging] = useState(false);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;

  useEffect(() => {
    if (!dragging) return;
    const handlePointerUp = () => setDragging(false);
    document.addEventListener('pointerup', handlePointerUp);
    return () => document.removeEventListener('pointerup', handlePointerUp);
  }, [dragging]);

  return (
    <>
      {ticks && ticks.length > 0 && (
        <div className={styles['slider-ticks']}>
          {ticks
            .filter((v) => v >= min && v <= max)
            .map((v) => {
              const tickPercent = max === min ? 0 : ((v - min) / (max - min)) * 100;
              return (
                <span
                  key={v}
                  className={styles['slider-tick']}
                  style={{ left: `${tickPercent}%` }}
                />
              );
            })}
        </div>
      )}
      <input
        type="range"
        className={className}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onPointerDown={() => setDragging(true)}
      />
      <span
        className={`${styles['sliderBubble']} ${dragging ? styles['sliderBubbleVisible'] : ''}`}
        style={{ left: `${percent}%` }}
      >
        {format(value)}
      </span>
    </>
  );
}

type EraId = 'ancient' | 'medieval' | 'earlymodern' | 'modern' | 'contemporary';
const ERAS: { id: EraId; label: string; span: string; icon: string; stockImg: string; yearMin: number; yearMax: number }[] = [
  { id: 'ancient',     label: 'Ancient',      span: '-3000 – 476',  icon: '🏛️', stockImg: ERA_STOCK_IMAGES.ancient,     yearMin: -3000, yearMax: 476  },
  { id: 'medieval',    label: 'Medieval',     span: '476 – 1492',   icon: '⚔️', stockImg: ERA_STOCK_IMAGES.medieval,    yearMin: 476,   yearMax: 1492 },
  { id: 'earlymodern', label: 'Early Modern', span: '1492 – 1789',  icon: '⛵', stockImg: ERA_STOCK_IMAGES.earlymodern, yearMin: 1492,  yearMax: 1789 },
  { id: 'modern',      label: 'Modern',       span: '1789 – 1945',  icon: '🏭', stockImg: ERA_STOCK_IMAGES.modern,      yearMin: 1789,  yearMax: 1945 },
  { id: 'contemporary',label: 'Contemporary', span: '1945 – 2025',  icon: '🚀', stockImg: ERA_STOCK_IMAGES.contemporary, yearMin: 1945,  yearMax: new Date().getFullYear() },
];

type RegionId = 'africa' | 'asia' | 'europe' | 'north_america' | 'oceania_antarctica' | 'south_america';
const REGIONS: { id: RegionId; label: string; icon: string; stockImg: string; continents: string[] }[] = [
  { id: 'europe',             label: 'Europe',                icon: '🏰', stockImg: REGION_STOCK_IMAGES.europe,             continents: ['Europe'] },
  { id: 'asia',               label: 'Asia',                  icon: '🏯', stockImg: REGION_STOCK_IMAGES.asia,               continents: ['Asia'] },
  { id: 'north_america',      label: 'North America',         icon: '🗽', stockImg: REGION_STOCK_IMAGES.north_america,      continents: ['North America'] },
  { id: 'south_america',      label: 'South America',         icon: '🦜', stockImg: REGION_STOCK_IMAGES.south_america,      continents: ['South America'] },
  { id: 'africa',             label: 'Africa',                icon: '🌍', stockImg: REGION_STOCK_IMAGES.africa,             continents: ['Africa'] },
  { id: 'oceania_antarctica', label: 'Oceania & Antarctica',  icon: '🏝️', stockImg: REGION_STOCK_IMAGES.oceania_antarctica, continents: ['Oceania', 'Antarctica'] },
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
  onSetRegionSelection,
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
  const prevModeRef = useRef(snapshot.config.mode);

  // Sync timer slider to authoritative snapshot value whenever it changes externally.
  useEffect(() => {
    setSliderValue(snapshot.config.roundTimerSec);
  }, [snapshot.config.roundTimerSec]);

  // Relax per-round timer defaults OFF: reset to 0 when the host switches into async mode.
  useEffect(() => {
    if (snapshot.config.mode === 'async' && prevModeRef.current !== 'async' && snapshot.config.roundTimerSec > 0) {
      onSetTimer?.(0);
    }
    prevModeRef.current = snapshot.config.mode;
  }, [snapshot.config.mode, snapshot.config.roundTimerSec, onSetTimer]);

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
  const [lastInvited, setLastInvited] = useState<LastInvitedPlayer[]>([]);
  const [inviteStates, setInviteStates] = useState<Record<string, 'idle' | 'pending' | 'sent' | 'error'>>({});
  const [playerPool, setPlayerPool] = useState<PlayerPoolEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllModal, setShowAllModal] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [presetsExpanded, setPresetsExpanded] = useState(false);
  const [helpModal, setHelpModal] = useState<'settings' | 'friends' | null>(null);

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

  /* ── Region selection state ── */
  // Empty selectedRegions in snapshot means "all regions" (no filter).
  // We represent "all" internally as a Set of all available region ids.
  const [availableRegionContinents, setAvailableRegionContinents] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchRegions() {
      try {
        const res = await fetch('/api/events/metadata');
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const regions: string[] = Array.isArray(json.regions) ? json.regions : [];
        setAvailableRegionContinents(regions);
      } catch {
        // silent — fall back to full static list
      }
    }
    fetchRegions();
    return () => { cancelled = true; };
  }, []);

  // Filter REGIONS to only those present in the DB (hide dead chips).
  // If fetch hasn't completed yet (null), show the full list so UI isn't empty.
  const visibleRegions = availableRegionContinents === null
    ? REGIONS
    : REGIONS.filter(r => r.continents.some(c => availableRegionContinents.includes(c)));

  const [selectedRegions, setSelectedRegions] = useState<Set<RegionId>>(
    () => new Set(REGIONS.map(r => r.id))
  );
  const suppressRegionSyncRef = useRef(false);

  // Sync selected regions to authoritative snapshot value whenever it changes externally.
  const snapshotRegionsKey = (snapshot.config.selectedRegions ?? [])
    .slice()
    .sort()
    .join(',');
  useEffect(() => {
    if (suppressRegionSyncRef.current) {
      suppressRegionSyncRef.current = false;
      return;
    }
    const incoming = (snapshot.config.selectedRegions ?? []) as string[];
    // Empty array in DB means "all regions" — map to full set of visible region ids.
    if (incoming.length === 0) {
      setSelectedRegions(new Set(REGIONS.map(r => r.id)));
      return;
    }
    // Map continent names back to region ids
    const incomingIds = REGIONS
      .filter(r => r.continents.some(c => incoming.includes(c)))
      .map(r => r.id);
    const incomingKey = incomingIds.slice().sort().join(',');
    const localKey = [...selectedRegions].sort().join(',');
    if (incomingKey === localKey) return;
    setSelectedRegions(new Set(incomingIds));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotRegionsKey]);

  const toggleRegion = useCallback((id: RegionId) => {
    if (selectedRegions.has(id) && selectedRegions.size === 1) return;
    const next = new Set(selectedRegions);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedRegions(next);
    suppressRegionSyncRef.current = true;
    // Send continent names to server; empty array = all regions
    const selectedContinents = REGIONS
      .filter(r => next.has(r.id))
      .flatMap(r => r.continents);
    const allVisibleSelected = visibleRegions.every(r => next.has(r.id));
    onSetRegionSelection?.(allVisibleSelected ? [] : selectedContinents);
  }, [selectedRegions, onSetRegionSelection, visibleRegions]);

  const allRegionsSelected = visibleRegions.every(r => selectedRegions.has(r.id));
  const toggleAllRegions = () => {
    if (allRegionsSelected) {
      const last = visibleRegions[visibleRegions.length - 1];
      if (last) {
        setSelectedRegions(new Set([last.id]));
        suppressRegionSyncRef.current = true;
        onSetRegionSelection?.(last.continents);
      }
    } else {
      setSelectedRegions(new Set(visibleRegions.map(r => r.id)));
      suppressRegionSyncRef.current = true;
      // All selected → send empty array (= all regions, no filter)
      onSetRegionSelection?.([]);
    }
  };

  // Load last-invited from localStorage on mount
  useEffect(() => {
    setLastInvited(readLastInvited());
  }, []);

  // Fetch recent players as the default invite pool. Re-invoked whenever the
  // search box is empty (mount + clear) so users who signed up after the lobby
  // was created — or who renamed — appear in the default list. Live DB search
  // (/api/friends/search) already covers the typed-query case; this refreshes
  // the unfiltered pool.
  const fetchRecentPlayers = useCallback(async () => {
    const token = await getValidAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch('/api/players/recent', { headers });
    const json = res.ok ? await res.json() : { players: [] };
    const players: PlayerPoolEntry[] = (json.players ?? []).map(
      (p: { id: string; display_name: string; avatar_url: string | null }) => ({
        id: p.id,
        displayName: p.display_name?.trim() || 'Player',
        avatarUrl: p.avatar_url,
      })
    );
    setPlayerPool(players);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (searchQuery.trim().length > 0) return;
    fetchRecentPlayers().catch(() => { if (!cancelled) setPlayerPool([]); });
    return () => { cancelled = true; };
  }, [searchQuery, fetchRecentPlayers]);

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

  // Build priority display list. Only active players should block re-invitation;
  // kicked/left players remain in snapshot.players but are inviteable again.
  const inLobbyIds = new Set(snapshot.players.filter((p) => p.leftAt === null).map((p) => p.playerId));
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

  // Client-side filter for the all-players modal
  const modalTrimmedQuery = modalSearchQuery.trim().toLowerCase();
  const modalFilteredList: PlayerPoolEntry[] = modalTrimmedQuery.length >= 1
    ? priorityList.filter((p) => p.displayName.toLowerCase().includes(modalTrimmedQuery))
    : priorityList;

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

  const handleShareLink = async () => {
    try {
      const link = typeof window !== "undefined" ? window.location.href : "";
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
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
              {'lobby '}
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--gh-text-primary)', letterSpacing: '1px' }}>{roomCode}</span>
            </span>
          </div>
        </div>
        <h1 className={styles['lobby-title-h1']}>{isHost ? t('lobby.create_game') : t('lobby.join_game')}</h1>
      </header>

      {/* Main Grid */}
      <div className={styles['lobby-grid']}>

        {/* ── Game Settings Card ── */}
        <div className={`${styles['lobby-card']} ${styles['lobby-settings']}`}>
          <div className={styles['lobby-card-header']}>
            <h3><span className={styles['lobby-section-number']}>1</span>{t('lobby.game_settings')}</h3><button type="button" className={styles['lobbyHelpBtn']} onClick={() => setHelpModal('settings')} aria-label={t('nav.help')}><HelpCircle size={16} /></button>
          </div>
          <div className={styles['lobbyTabRow']}>
            <button
              className={`${styles['lobbyTabBtn']} ${settingsTab === 'turnturn' ? styles['lobbyTabBtnActive'] : ''}`}
              onClick={() => isHost && onSetSubMode?.("async", maxTurnDays)}
              disabled={!isHost || busy}
            >
              <span className={styles['lobbyTabContent']}>
                <Leaf size={18} className={styles['lobbyTabIcon']} />
                <span className={styles['lobbyTabText']}>
                  <span className={styles['lobbyTabMain']}>{t('lobby.turn_by_turn')}</span>
                  <span className={styles['lobbyTabSub']}>{t('lobby.turn_by_turn_sub')}</span>
                </span>
              </span>
            </button>
            <button
              className={`${styles['lobbyTabBtn']} ${settingsTab === 'realtime' ? styles['lobbyTabBtnActive'] : ''}`}
              onClick={() => isHost && onSetSubMode?.("sync", maxTurnDays)}
              disabled={!isHost || busy}
            >
              <span className={styles['lobbyTabContent']}>
                <Zap size={18} className={styles['lobbyTabIcon']} />
                <span className={styles['lobbyTabText']}>
                  <span className={styles['lobbyTabMain']}>{t('lobby.realtime')}</span>
                  <span className={styles['lobbyTabSub']}>{t('lobby.realtime_sub')}</span>
                </span>
              </span>
            </button>
          </div>
          <div className={styles['lobby-settings-grid']}>
            {settingsTab === 'realtime' && (<>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
              <span className={styles['lobby-setting-label']}><Timer size={18} aria-hidden="true" /> Round</span>
              {isHost ? (
                <span className={styles['lobbyRowLeftWrap']}>
                  <button
                    type="button"
                    onClick={() => {
                      const val = sliderValue > 0 ? 0 : ROUND_TIMER_DEFAULT_SEC;
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
                      <span className={`${styles['lobby-timer-slider-wrap']} ${styles['lobbyRushTimerWrap']}`}>
                        <div className={styles['lobby-timer-slider-track']} />
                        <div
                          className={styles['lobby-timer-slider-fill']}
                          style={{
                            width: `${((sliderValue - TIMER_MIN_SEC) / (TIMER_MAX_SEC - TIMER_MIN_SEC)) * 100}%`,
                          }}
                        />
                        <RangeSlider
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
                          ticks={RUSH_ROUND_TIMER_TICKS}
                          format={(v) => formatTimerDisplay(v, '')}
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
              <span className={styles['lobby-setting-label']}><Timer size={16} aria-hidden="true" /> {t('lobby.results_timer')}</span>
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
                        <RangeSlider
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
                          format={(v) => formatTimerDisplay(v, '')}
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
            <div className={styles['lobby-presets-disclosure']}>
              <button
                type="button"
                className={styles['lobby-presets-header']}
                onClick={() => setPresetsExpanded(v => !v)}
              >
                <span className={styles['lobby-setting-label']}>Era & Region Presets</span>
                <ChevronDown size={16} className={`${styles['lobby-presets-chevron']} ${presetsExpanded ? styles['lobby-presets-chevron-open'] : ''}`} />
              </button>
              {presetsExpanded && (
                <div className={styles['lobby-presets-content']}>
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
                          <ImageButton
                            key={era.id}
                            label={tGame(`era_${era.id}` as string)}
                            sublabel={era.span}
                            stockImg={era.stockImg}
                            emoji={era.icon}
                            selected={on}
                            disabled={!isHost}
                            onClick={() => isHost && toggleEra(era.id)}
                            className={styles['lobbyImgBtn']}
                            onClassName={styles['lobbyImgBtnOn']}
                            offClassName={styles['lobbyImgBtnOff']}
                            imgClassName={styles['lobbyImgPhoto']}
                            overlayClassName={styles['lobbyImgOverlay']}
                            fallbackClassName={styles['lobbyImgFallback']}
                            captionClassName={styles['lobbyImgCaption']}
                            labelClassName={styles['lobbyImgLabel']}
                            sublabelClassName={styles['lobbyImgSpan']}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className={`${styles['lobby-setting-item']} ${styles['lobbySettingRowBlock']}`}>
                    <div className={styles['lobbySettingRowHead']}>
                      <span className={styles['lobby-setting-label']}>{tGame('region_presets')}</span>
                      {isHost && (
                        <button type="button" className={styles['lobbySelectAllBtn']} onClick={toggleAllRegions}>
                          {allRegionsSelected ? t('lobby.deselect_all') : t('lobby.select_all')}
                        </button>
                      )}
                    </div>
                    <div className={styles['lobbyEraRail']}>
                      {visibleRegions.map(region => {
                        const on = selectedRegions.has(region.id);
                        return (
                          <ImageButton
                            key={region.id}
                            label={tGame(`region_${region.id}` as string)}
                            stockImg={region.stockImg}
                            emoji={region.icon}
                            selected={on}
                            disabled={!isHost}
                            onClick={() => isHost && toggleRegion(region.id)}
                            className={styles['lobbyImgBtn']}
                            onClassName={styles['lobbyImgBtnOn']}
                            offClassName={styles['lobbyImgBtnOff']}
                            imgClassName={styles['lobbyImgPhoto']}
                            overlayClassName={styles['lobbyImgOverlay']}
                            fallbackClassName={styles['lobbyImgFallback']}
                            captionClassName={styles['lobbyImgCaption']}
                            labelClassName={styles['lobbyImgLabel']}
                            sublabelClassName={styles['lobbyImgSpan']}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
            </>)}
            {settingsTab === 'turnturn' && (<>
            <div className={`${styles['lobby-setting-item']} ${styles['lobbyRowWrap']}`}>
              <span className={styles['lobby-setting-label']}><Timer size={18} aria-hidden="true" /> Round</span>
              {isHost ? (
                <span className={styles['lobbyRowLeftWrap']}>
                  <button
                    type="button"
                    onClick={() => {
                      const val = sliderValue > 0 ? 0 : ROUND_TIMER_DEFAULT_SEC;
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
                        <RangeSlider
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
                          ticks={ROUND_TIMER_MAJOR_TICKS}
                          format={(v) => formatTimerDisplay(v, '')}
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
                <span className={styles['lobby-setting-label']}><Timer size={18} aria-hidden="true" /> Game</span>
                {isHost ? (
                <span className={styles['lobbyRowLeft']}>
                  <span className={styles['lobby-timer-slider-wrap']}>
                    <div className={styles['lobby-timer-slider-track']} />
                    <div className={styles['lobby-timer-slider-fill']} style={{ width: `${((maxTurnDays - 1) / 13) * 100}%` }} />
                    <RangeSlider
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
                      ticks={DEADLINE_TICKS}
                      format={(v) => (v === 1 ? t('lobby.1_day') : t('lobby.n_days', { n: v }))}
                    />
                  </span>
                  <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>{maxTurnDays === 1 ? t('lobby.1_day') : t('lobby.n_days', { n: maxTurnDays })}</span>
                </span>
                ) : (
                  <span className={`${styles['lobby-setting-value']} ${styles['lobbyNoWrap']}`}>{maxTurnDays === 1 ? t('lobby.1_day') : t('lobby.n_days', { n: maxTurnDays })}</span>
                )}
              </div>
            <div className={styles['lobby-presets-disclosure']}>
              <button
                type="button"
                className={styles['lobby-presets-header']}
                onClick={() => setPresetsExpanded(v => !v)}
              >
                <span className={styles['lobby-setting-label']}>Era & Region Presets</span>
                <ChevronDown size={16} className={`${styles['lobby-presets-chevron']} ${presetsExpanded ? styles['lobby-presets-chevron-open'] : ''}`} />
              </button>
              {presetsExpanded && (
                <div className={styles['lobby-presets-content']}>
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
                          <ImageButton
                            key={era.id}
                            label={tGame(`era_${era.id}` as string)}
                            sublabel={era.span}
                            stockImg={era.stockImg}
                            emoji={era.icon}
                            selected={on}
                            disabled={!isHost}
                            onClick={() => isHost && toggleEra(era.id)}
                            className={styles['lobbyImgBtn']}
                            onClassName={styles['lobbyImgBtnOn']}
                            offClassName={styles['lobbyImgBtnOff']}
                            imgClassName={styles['lobbyImgPhoto']}
                            overlayClassName={styles['lobbyImgOverlay']}
                            fallbackClassName={styles['lobbyImgFallback']}
                            captionClassName={styles['lobbyImgCaption']}
                            labelClassName={styles['lobbyImgLabel']}
                            sublabelClassName={styles['lobbyImgSpan']}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className={`${styles['lobby-setting-item']} ${styles['lobbySettingRowBlock']}`}>
                    <div className={styles['lobbySettingRowHead']}>
                      <span className={styles['lobby-setting-label']}>{tGame('region_presets')}</span>
                      {isHost && (
                        <button type="button" className={styles['lobbySelectAllBtn']} onClick={toggleAllRegions}>
                          {allRegionsSelected ? t('lobby.deselect_all') : t('lobby.select_all')}
                        </button>
                      )}
                    </div>
                    <div className={styles['lobbyEraRail']}>
                      {visibleRegions.map(region => {
                        const on = selectedRegions.has(region.id);
                        return (
                          <ImageButton
                            key={region.id}
                            label={tGame(`region_${region.id}` as string)}
                            stockImg={region.stockImg}
                            emoji={region.icon}
                            selected={on}
                            disabled={!isHost}
                            onClick={() => isHost && toggleRegion(region.id)}
                            className={styles['lobbyImgBtn']}
                            onClassName={styles['lobbyImgBtnOn']}
                            offClassName={styles['lobbyImgBtnOff']}
                            imgClassName={styles['lobbyImgPhoto']}
                            overlayClassName={styles['lobbyImgOverlay']}
                            fallbackClassName={styles['lobbyImgFallback']}
                            captionClassName={styles['lobbyImgCaption']}
                            labelClassName={styles['lobbyImgLabel']}
                            sublabelClassName={styles['lobbyImgSpan']}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
            </>)}
          </div>
        </div>

        {/* ── Invite + Roster Card (merged) ── */}
        <div className={`${styles['lobby-card']} ${styles['lobby-roster-card']}`}>

          {/* Sub-section A: Invite Players */}
          {viewer?.isHost && (
          <div className={styles['lobby-subsection']}>
            <div className={styles['lobby-subsection-header']}>
              <span className={styles['lobby-subsection-title']}><span className={styles['lobby-section-number']}>2</span>{t('lobby.invite_players')}</span>
              <span className={styles['lobbyShareBtnGroup']}>
                <button type="button" className={styles['lobbyShareBtn']} onClick={handleShareLink} data-testid="lobby-share-link">
                  {t('lobby.copy_link')}
                </button>
              </span>
              <button type="button" className={styles['lobbyHelpBtn']} onClick={() => setHelpModal('friends')} aria-label={t('nav.help')}><HelpCircle size={16} /></button>
            </div>
            {linkCopied && (
              <span className={styles['lobbyCopiedToast']}>
                {t('lobby.link_copied')}
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
                          <span style={{ color: followedIds.has(player.id) ? 'var(--gh-gold)' : 'var(--gh-text-muted)' }}>
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
                <div className={styles['lobbyAllModalSearchWrap']}>
                  <input
                    type="text"
                    className={styles['lobbyAllModalSearch']}
                    placeholder={t('lobby.search_players')}
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {modalSearchQuery && (
                    <button
                      type="button"
                      className={styles['lobbySearchClearBtn']}
                      onClick={() => setModalSearchQuery('')}
                      aria-label={t('lobby.clear_search')}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className={styles['lobbyAllModalList']}>
                  {modalFilteredList.length === 0 && (
                    <span className={styles['lobbyAllModalEmpty']}>{t('lobby.no_players_found')}</span>
                  )}
                  {modalFilteredList.map((player) => {
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
                            <span style={{ color: followedIds.has(player.id) ? 'var(--gh-gold)' : 'var(--gh-text-muted)' }}>
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
                  style={{ background: readyCount > 0 ? "var(--gh-success)" : "var(--gh-border-default)" }}
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
                      {!isViewerPlayer && (
                        <button
                          className={styles['lobbyStarBtn']}
                          onClick={() => toggleFollow(p.playerId)}
                          aria-label={followedIds.has(p.playerId) ? t('lobby.remove_from_favorites') : t('lobby.add_to_favorites')}
                        >
                          <span style={{ color: followedIds.has(p.playerId) ? 'var(--gh-gold)' : 'var(--gh-text-muted)' }}>
                            {followedIds.has(p.playerId) ? '★' : '☆'}
                          </span>
                        </button>
                      )}
                    </div>
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

      {helpModal && (
        <div className={styles['lobbyHelpModalBackdrop']} onClick={() => setHelpModal(null)}>
          <div className={styles['lobbyHelpModal']} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles['lobbyHelpModalClose']} onClick={() => setHelpModal(null)} aria-label={t('nav.help')}>×</button>
            <h4>{helpModal === 'settings' ? t('lobby.game_settings') : t('lobby.invite_players')}</h4>
            <p>{helpModal === 'settings' ? t('lobby.help_game_settings') : t('lobby.help_invite_players')}</p>
          </div>
        </div>
      )}
      {error ? <p className={styles['lobbyError']}>{error}</p> : null}
    </div>
  );
}
