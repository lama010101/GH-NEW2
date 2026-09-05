"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Compete Lobby (mirrors prod LobbySection UI)
// Route: /prototype/lobby   (direct access, UI-only)
//
// Visual structure + styling are an exact mirror of the production lobby
// (src/components/compete/LobbySection.tsx + LobbySection.module.css).
// It reuses the prod CSS module, PlayerAvatar, ImageButton, era/region
// stock images, and lucide icons so the pixels match 1:1.
//
// All data is MOCK and held in local state. No WebSocket, no Supabase,
// no real network. Host controls, ready toggles, tab switching, era/region
// selection, and sliders mutate local state only — UIX, not functionalities.
//
// Only this file is modified. No other app files are touched.
// ============================================================================

import { useLayoutEffect, useMemo, useState } from "react";
import { ChevronDown, Timer, HelpCircle } from "lucide-react";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import { ImageButton } from "@/components/shared/ImageButton";
import { ERA_STOCK_IMAGES, REGION_STOCK_IMAGES } from "@/core/useEraRegionImages";
import { TIMER_MIN_SEC, TIMER_MAX_SEC } from "@/core/types";
import styles from "@/components/compete/LobbySection.module.css";

// ── Mock data ──
const VIEWER_ID = "p1";
const ROOM_CODE = "BERLIN";

type MockPlayer = {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  ready: boolean;
  isHost: boolean;
  leftAt: string | null;
  roundStatus?: "joined" | "ready" | "playing" | "finished";
};

type MockPoolEntry = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  is_ai: boolean;
};

const INITIAL_PLAYERS: MockPlayer[] = [
  { playerId: "p1", displayName: "Alex Rivera", avatarUrl: null, ready: false, isHost: true, leftAt: null },
  { playerId: "p2", displayName: "Mina Kovač", avatarUrl: null, ready: true, isHost: false, leftAt: null },
  { playerId: "p3", displayName: "Theo Lambert", avatarUrl: null, ready: false, isHost: false, leftAt: null },
  { playerId: "p4", displayName: "Sara Bianchi", avatarUrl: null, ready: true, isHost: false, leftAt: null },
];

const MOCK_POOL: MockPoolEntry[] = [
  { id: "u10", displayName: "Liang Wei", avatarUrl: null, is_ai: false },
  { id: "u11", displayName: "Nora Hansen", avatarUrl: null, is_ai: false },
  { id: "u12", displayName: "Omar Farouk", avatarUrl: null, is_ai: false },
  { id: "u13", displayName: "Priya Nair", avatarUrl: null, is_ai: false },
  { id: "u14", displayName: "Diego Santos", avatarUrl: null, is_ai: false },
  { id: "u15", displayName: "Yuki Tanaka", avatarUrl: null, is_ai: false },
  { id: "u16", displayName: "Elena Popescu", avatarUrl: null, is_ai: false },
  { id: "u17", displayName: "Marcus Webb", avatarUrl: null, is_ai: false },
  { id: "ai1", displayName: "Hermes AI", avatarUrl: null, is_ai: true },
  { id: "ai2", displayName: "Athena AI", avatarUrl: null, is_ai: true },
  { id: "ai3", displayName: "Odin AI", avatarUrl: null, is_ai: true },
  { id: "ai4", displayName: "Freya AI", avatarUrl: null, is_ai: true },
];

const MOCK_FOLLOWED = new Set<string>(["u11", "u14"]);
const MOCK_PENDING_INVITEES: MockPlayer[] = [];

type EraId = "ancient" | "medieval" | "earlymodern" | "modern" | "contemporary";
const ERAS: { id: EraId; label: string; span: string; icon: string; stockImg: string; yearMin: number; yearMax: number }[] = [
  { id: "ancient", label: "Ancient", span: "-3000 – 476", icon: "🏛️", stockImg: ERA_STOCK_IMAGES.ancient, yearMin: -3000, yearMax: 476 },
  { id: "medieval", label: "Medieval", span: "476 – 1492", icon: "⚔️", stockImg: ERA_STOCK_IMAGES.medieval, yearMin: 476, yearMax: 1492 },
  { id: "earlymodern", label: "Early Modern", span: "1492 – 1789", icon: "⛵", stockImg: ERA_STOCK_IMAGES.earlymodern, yearMin: 1492, yearMax: 1789 },
  { id: "modern", label: "Modern", span: "1789 – 1945", icon: "🏭", stockImg: ERA_STOCK_IMAGES.modern, yearMin: 1789, yearMax: 1945 },
  { id: "contemporary", label: "Contemporary", span: "1945 – 2025", icon: "🚀", stockImg: ERA_STOCK_IMAGES.contemporary, yearMin: 1945, yearMax: 2025 },
];

type RegionId = "africa" | "asia" | "europe" | "north_america" | "oceania_antarctica" | "south_america";
const REGIONS: { id: RegionId; label: string; icon: string; stockImg: string }[] = [
  { id: "europe", label: "Europe", icon: "🏰", stockImg: REGION_STOCK_IMAGES.europe },
  { id: "asia", label: "Asia", icon: "🏯", stockImg: REGION_STOCK_IMAGES.asia },
  { id: "north_america", label: "North America", icon: "🗽", stockImg: REGION_STOCK_IMAGES.north_america },
  { id: "south_america", label: "South America", icon: "🦜", stockImg: REGION_STOCK_IMAGES.south_america },
  { id: "africa", label: "Africa", icon: "🌍", stockImg: REGION_STOCK_IMAGES.africa },
  { id: "oceania_antarctica", label: "Oceania & Antarctica", icon: "🏝️", stockImg: REGION_STOCK_IMAGES.oceania_antarctica },
];

const ROUND_TIMER_DEFAULT_SEC = 120;
const ROUND_TIMER_TICKS = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300];
const ROUND_TIMER_MAJOR_TICKS = ROUND_TIMER_TICKS.filter((v) => v % 60 === 0);
const RESULTS_TIMER_TICKS = ROUND_TIMER_TICKS;
const RESULTS_TIMER_MAJOR_TICKS = RESULTS_TIMER_TICKS.filter((v) => v % 60 === 0);
const DEADLINE_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const DEADLINE_MAJOR_TICKS = [1, 5, 10, 14];

// ── i18n strings (inlined from en.json so the prototype stays self-contained text-wise) ──
const T = {
  back: "Back",
  mode_challenge: "CHALLENGE",
  label: "lobby",
  create_game: "Create Game",
  join_game: "Join Game",
  game_settings: "Game Settings",
  turn_by_turn: "ANYTIME",
  turn_by_turn_sub: "Play at your own pace",
  realtime: "LIVE",
  realtime_sub: "Play all at the same time",
  round: "Round",
  game: "Game",
  results_timer: "Results",
  timer_off: "OFF",
  era_region_presets: "Era & Region Presets",
  era_presets: "Era Presets",
  region_presets: "Region Presets",
  select_all: "Select all",
  deselect_all: "Deselect all",
  invite_players: "Invite Players",
  copy_link: "Share link",
  link_copied: "Link copied!",
  filter_humans: "Humans",
  filter_ai: "AI",
  filter_friends: "Friends",
  filter_all: "All",
  search_players: "Search players...",
  clear_search: "Clear search",
  no_players_found: "No players found",
  no_favorites_yet: "No favorites yet — click the star on a player's avatar to add them here.",
  view_all: "View all ({count})",
  all_players: "All Players ({count})",
  invite: "Invite",
  invite_pending: "…",
  invite_sent: "Sent ✓",
  invite_failed: "Failed",
  ai_coming_up: "Coming Up",
  players: "Players ({current}/{total})",
  ready_count: "{count} ready",
  you: "You",
  host: "Host",
  ready: "Ready",
  not_ready: "Not Ready",
  invited: "INVITED",
  no_players_yet: "No players yet",
  kick_player: "Kick player",
  remove_invite: "Remove invite",
  relax_start_my_game: "Start my game",
  ready_waiting: "Ready — waiting for others",
  im_ready: "I'm ready",
  players_ready: "({ready}/{total} players ready)",
  starting_soon: " · starting soon",
  "1_day": "1 day",
  n_days: "{n} days",
  add_to_favorites: "Add to favorites",
  remove_from_favorites: "Remove from favorites",
  help: "Help",
  help_game_settings:
    "Choose how this Compete session plays out.\n\nANYTIME (Own Pace) — Asynchronous. Each player plays all 5 rounds independently, at their own speed — no waiting on anyone else. The session stays open for the deadline you set below (1–14 days). You can optionally turn on a per-round timer; if a player runs out of time on a round, only that round auto-submits for them — nobody else is affected.\n\nLIVE (Live Challenge) — Synchronous. Everyone plays the same round at the same time. Each round has an optional countdown timer (15 seconds to 5 minutes). After everyone submits, results are shown to all players together, with an auto-advance timer to the next round.\n\nRound Timer — Optional. How long each player has to submit a guess for a round.\nResults Timer — The maximum time available to view the round results before automatically advancing to the next round.\nGame Timer (Anytime only) — The overall deadline for the whole session, from 1 to 14 days after you start the game.",
  help_invite_players:
    "Add 2 to 8 players to this game.\n\nSearch for players by name, or use Share Link to send a join link to anyone — they don't need to already be a friend to join.\n\nAs host, you can click the star on a player's avatar to mark them as a favorite, making them easier to find next time.\n\nPlayers you invite will appear in the lobby once they accept. As host, you can remove a player from the lobby at any time before the game starts.",
  era_ancient: "Ancient",
  era_medieval: "Medieval",
  era_earlymodern: "Early Modern",
  era_modern: "Modern",
  era_contemporary: "Contemporary",
  region_europe: "Europe",
  region_asia: "Asia",
  region_north_america: "North America",
  region_south_america: "South America",
  region_africa: "Africa",
  region_oceania_antarctica: "Oceania & Antarctica",
};

function formatTimerDisplay(sec: number, offLabel: string): string {
  if (sec === 0) return offLabel;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function fmt(key: string, vars: Record<string, string | number>): string {
  return key.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

// ── Slider style overrides (makes the lobby sliders match the requested screenshot design:
// vertical orange pill thumb, dark track, ruler-style major/minor ticks) ──
const SLIDER_OVERRIDE_CSS = `
  .protoSliderWrap > div:nth-child(1) {
    background: var(--gh-border-default) !important;
    height: 2px !important;
    border-radius: 1px;
  }
  .protoSliderWrap > div:nth-child(2) {
    background: transparent !important;
  }
  .protoSliderWrap input[type="range"] {
    height: 30px;
  }
  .protoSliderWrap input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13.3px;
    height: 30px;
    border-radius: 999px;
    background: var(--gh-orange) !important;
    border: none !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
    cursor: pointer;
    margin-top: 0;
    transition: none !important;
  }
  .protoSliderWrap input[type="range"]::-webkit-slider-thumb:hover,
  .protoSliderWrap input[type="range"]::-webkit-slider-thumb:active {
    transform: none !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
  }
  .protoSliderWrap input[type="range"]::-moz-range-thumb {
    width: 13.3px;
    height: 30px;
    border-radius: 999px;
    background: var(--gh-orange) !important;
    border: none !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
    cursor: pointer;
    transition: none !important;
  }
  .protoSliderWrap input[type="range"]::-moz-range-thumb:hover,
  .protoSliderWrap input[type="range"]::-moz-range-thumb:active {
    transform: none !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
  }
  .protoSliderTicks {
    position: absolute !important;
    top: 50% !important;
    left: 0 !important;
    right: 0 !important;
    height: 0 !important;
    transform: translateY(-50%) !important;
    pointer-events: none;
  }
  .protoSliderTicks > span {
    width: 2px !important;
    height: 4px !important;
    border-radius: 1px;
    background: var(--gh-text-muted) !important;
    opacity: 0.85;
  }
  .protoSliderTicks > span.protoSliderTickMajor {
    height: 10px !important;
    background: var(--gh-text-secondary) !important;
    opacity: 1;
  }
`;

// ── Tab icon overrides (Game Settings ANYTIME/LIVE tabs use custom webp art icons;
// neutral glass badge in both states so the colorful icons read clearly) ──
const TAB_OVERRIDE_CSS = `
  .protoTabIconBadge {
    background: rgba(255, 255, 255, 0.10) !important;
  }
  .protoTabIconImg {
    width: 20px;
    height: 20px;
    object-fit: contain;
    display: block;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }
`;

// ── Invite filter switch (All/Friends slot is a pill switch reusing the prod
// timer-toggle classes; wrapper keeps the filter-btn slot sizing/typography) ──
const FILTER_SWITCH_CSS = `
  .protoFilterSwitchWrap {
    cursor: default;
    gap: 6px;
  }
  .protoFilterSwitchWrap > button {
    flex-shrink: 0;
  }
`;

// ── RangeSlider (visual drag bubble) — mirrors prod RangeSlider ──
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
  majorTicks?: number[];
};

function RangeSlider({ className, min, max, step, value, disabled, onChange, format, ticks, majorTicks }: RangeSliderProps) {
  const [dragging, setDragging] = useState(false);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const majorSet = useMemo(() => new Set(majorTicks ?? []), [majorTicks]);
  return (
    <>
      {ticks && ticks.length > 0 && (
        <div className={`${styles["slider-ticks"]} protoSliderTicks`}>
          {ticks
            .filter((v) => v >= min && v <= max)
            .map((v) => {
              const tickPercent = max === min ? 0 : ((v - min) / (max - min)) * 100;
              const isMajor = majorSet.has(v);
              return (
                <span
                  key={v}
                  className={`${styles["slider-tick"]} ${isMajor ? "protoSliderTickMajor" : ""}`}
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
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
      />
      <span
        className={`${styles["sliderBubble"]} ${dragging ? styles["sliderBubbleVisible"] : ""}`}
        style={{ left: `${percent}%` }}
      >
        {format(value)}
      </span>
    </>
  );
}

export default function LobbyPrototypePage() {
  // ── Mock lobby state (local only) ──
  const [players, setPlayers] = useState<MockPlayer[]>(INITIAL_PLAYERS);
  const [pendingInvitees] = useState<MockPlayer[]>(MOCK_PENDING_INVITEES);
  const [mode, setMode] = useState<"sync" | "async">("sync");

  // Settings (host-controlled, local only)
  const [sliderValue, setSliderValue] = useState(120);
  const [resultsTimerValue, setResultsTimerValue] = useState(30);
  const [maxTurnDays, setMaxTurnDays] = useState(3);
  const [selectedEras, setSelectedEras] = useState<Set<EraId>>(new Set(ERAS.map((e) => e.id)));
  const [selectedRegions, setSelectedRegions] = useState<Set<RegionId>>(new Set(REGIONS.map((r) => r.id)));
  const [presetsExpanded, setPresetsExpanded] = useState(true);
  const [helpModal, setHelpModal] = useState<"settings" | "friends" | null>(null);

  // Collapse era/region presets on mobile before first paint so they are
  // expanded by default on tablet/desktop only (no mobile flash).
  // 769px matches the prod layout breakpoint (@media (max-width: 768px) stacks the grid).
  useLayoutEffect(() => {
    const m = window.matchMedia("(min-width: 769px)");
    setPresetsExpanded(m.matches);
  }, []);

  // Invite panel
  const [linkCopied, setLinkCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteStates, setInviteStates] = useState<Record<string, "idle" | "pending" | "sent" | "error">>({});
  const [comingUpId, setComingUpId] = useState<string | null>(null);
  const [showAllModal, setShowAllModal] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState("");

  // Filter + follows (local only)
  const [filter, setFilter] = useState({ humans: false, ai: false, friends: false });
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set(MOCK_FOLLOWED));

  const toggleHumans = () => setFilter((f) => ({ ...f, humans: !f.humans }));
  const toggleAi = () => setFilter((f) => ({ ...f, ai: !f.ai }));
  const toggleFriends = () => setFilter((f) => ({ ...f, friends: !f.friends }));

  const toggleFollow = (playerId: string) => {
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  // ── Derived display values (mirror prod render-only derivation) ──
  const viewer = players.find((p) => p.playerId === VIEWER_ID) ?? null;
  const isHost = viewer?.isHost ?? false;
  const isReady = viewer?.ready ?? false;
  const isAsync = mode === "async";
  const settingsTab: "realtime" | "turnturn" = isAsync ? "turnturn" : "realtime";

  const activePlayers = players.filter((p) => p.leftAt === null);
  const totalPlayers = activePlayers.length;
  const readyCount = activePlayers.filter((p) => p.ready).length;
  const allPlayersReady = totalPlayers > 0 && readyCount === totalPlayers;

  // ── Invite pool derivation (mirror prod) ──
  const inLobbyIds = new Set(activePlayers.map((p) => p.playerId));
  const pendingInviteeIds = new Set(pendingInvitees.map((p) => p.playerId));
  const viewerId = VIEWER_ID;

  const matchesFilter = (p: MockPoolEntry): boolean => {
    const identitySelected = filter.humans || filter.ai;
    const identityMatch = !identitySelected || (filter.humans && !p.is_ai) || (filter.ai && p.is_ai);
    const friendsMatch = !filter.friends || followedIds.has(p.id);
    return identityMatch && friendsMatch;
  };

  const priorityList: MockPoolEntry[] = MOCK_POOL.filter(
    (p) => !inLobbyIds.has(p.id) && p.id !== viewerId && !pendingInviteeIds.has(p.id)
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const searchResults: MockPoolEntry[] = trimmedQuery.length >= 1
    ? MOCK_POOL.filter(
        (p) => !inLobbyIds.has(p.id) && p.id !== viewerId && p.displayName.toLowerCase().includes(trimmedQuery)
      )
    : [];
  const displayList: MockPoolEntry[] = (trimmedQuery.length >= 1 ? searchResults : priorityList)
    .filter(matchesFilter)
    .sort((a, b) => {
      const aFav = followedIds.has(a.id) ? 0 : 1;
      const bFav = followedIds.has(b.id) ? 0 : 1;
      return aFav - bFav;
    })
    .slice(0, trimmedQuery.length >= 1 ? 20 : 10);
  const hasMore = trimmedQuery.length === 0 && priorityList.filter(matchesFilter).length > 10;

  const modalTrimmedQuery = modalSearchQuery.trim().toLowerCase();
  const modalFilteredList: MockPoolEntry[] = (modalTrimmedQuery.length >= 1
    ? priorityList.filter((p) => p.displayName.toLowerCase().includes(modalTrimmedQuery))
    : priorityList
  ).filter(matchesFilter);

  // ── Local handlers (UIX only — no network) ──
  const handleSendInvite = (player: MockPoolEntry) => {
    if (player.is_ai) return;
    setInviteStates((prev) => ({ ...prev, [player.id]: "pending" }));
    setTimeout(() => {
      setInviteStates((prev) => ({ ...prev, [player.id]: "sent" }));
      setTimeout(() => setInviteStates((prev) => ({ ...prev, [player.id]: "idle" })), 3000);
    }, 600);
  };

  const handleAiComingUp = (player: MockPoolEntry) => {
    setComingUpId(player.id);
    setTimeout(() => setComingUpId(null), 2000);
  };

  const handleShareLink = () => {
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const toggleReady = () => {
    setPlayers((prev) => prev.map((p) => (p.playerId === VIEWER_ID ? { ...p, ready: !p.ready } : p)));
  };

  const kickPlayer = (id: string) => {
    setPlayers((prev) => prev.filter((p) => p.playerId !== id));
  };

  // Era/region toggles (local only)
  const allErasSelected = selectedEras.size === ERAS.length;
  const toggleEra = (id: EraId) => {
    setSelectedEras((prev) => {
      if (prev.has(id) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllEras = () => {
    if (allErasSelected) {
      const last = ERAS[ERAS.length - 1];
      setSelectedEras(new Set([last.id]));
    } else {
      setSelectedEras(new Set(ERAS.map((e) => e.id)));
    }
  };

  const allRegionsSelected = REGIONS.every((r) => selectedRegions.has(r.id));
  const toggleRegion = (id: RegionId) => {
    setSelectedRegions((prev) => {
      if (prev.has(id) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllRegions = () => {
    if (allRegionsSelected) {
      const last = REGIONS[REGIONS.length - 1];
      setSelectedRegions(new Set([last.id]));
    } else {
      setSelectedRegions(new Set(REGIONS.map((r) => r.id)));
    }
  };

  const switchTab = (next: "sync" | "async") => {
    if (!isHost) return;
    setMode(next);
    // Mirror prod: entering async resets per-round timer to OFF
    if (next === "async" && sliderValue > 0) setSliderValue(0);
  };

  const eraLabel = (id: EraId) => (T as Record<string, string>)[`era_${id}`];
  const regionLabel = (id: RegionId) => (T as Record<string, string>)[`region_${id}`];

  const rosterTotal = isAsync ? 30 : 8;

  return (
    <main className="app-shell" style={{ position: "relative", minHeight: "100dvh" }}>
      {/* Proto bar (prototype-only identifier) */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 14px",
          background: "rgba(10,10,12,0.6)",
          backdropFilter: "blur(8px)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.3px", opacity: 0.85, color: "#fff" }}>
          Compete Lobby — Prototype (mirrors prod UI)
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.55, color: "#fff" }}>Mock data · host = you</span>
      </div>

      {/* Background (mirrors compete page shell) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: "url(/desktop-home_background.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          background: "rgba(0, 0, 0, 0.4)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 2, paddingTop: 0 }}>
        <div className="shell-grid">
          <div style={{ height: 0 }} />

          <div className={styles["lobby-shell"]} data-testid="lobby-shell">
            <header className={styles["lobby-header"]}>
              <div className={styles["lobby-header-top"]}>
                <button
                  className={styles["lobby-back-btn"]}
                  onClick={() => typeof window !== "undefined" && window.history.back()}
                  aria-label={T.back}
                  data-testid="lobby-back-btn"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className={styles["lobby-mode-badge"]}>{T.mode_challenge}</span>
                <div className={styles["lobby-header-meta"]}>
                  <span className={styles["lobby-status-chip"]}>
                    <span className={styles["lobby-status-dot"]} />
                    {T.label}{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--gh-text-primary)", letterSpacing: "1px" }}>
                      {ROOM_CODE}
                    </span>
                  </span>
                </div>
              </div>
              <h1 className={styles["lobby-title-h1"]}>{isHost ? T.create_game : T.join_game}</h1>
            </header>

            {/* Main Grid */}
            <div className={styles["lobby-grid"]}>
              {/* ── Game Settings Card ── */}
              <div className={`${styles["lobby-card"]} ${styles["lobby-settings"]}`}>
                <div className={styles["lobby-card-header"]}>
                  <h3>
                    <span className={styles["lobby-section-number"]}>1</span>
                    {T.game_settings}
                  </h3>
                  <button type="button" className={styles["lobbyHelpBtn"]} onClick={() => setHelpModal("settings")} aria-label={T.help}>
                    <HelpCircle size={16} />
                  </button>
                </div>
                <div className={styles["lobbyTabRow"]}>
                  <button
                    className={`${styles["lobbyTabBtn"]} ${settingsTab === "turnturn" ? styles["lobbyTabBtnActive"] : ""}`}
                    onClick={() => switchTab("async")}
                    disabled={!isHost}
                  >
                    <span className={styles["lobbyTabContent"]}>
                      <span className={styles["lobbyTabTitleRow"]}>
                        <span className={`${styles["lobbyTabIconBadge"]} protoTabIconBadge`}>
                          <img src="/icons/level.webp" alt="" width={20} height={20} className="protoTabIconImg" draggable={false} />
                        </span>
                        <span className={styles["lobbyTabMain"]}>{T.turn_by_turn}</span>
                      </span>
                      <span className={styles["lobbyTabSub"]}>{T.turn_by_turn_sub}</span>
                    </span>
                  </button>
                  <button
                    className={`${styles["lobbyTabBtn"]} ${settingsTab === "realtime" ? styles["lobbyTabBtnActive"] : ""}`}
                    onClick={() => switchTab("sync")}
                    disabled={!isHost}
                  >
                    <span className={styles["lobbyTabContent"]}>
                      <span className={styles["lobbyTabTitleRow"]}>
                        <span className={`${styles["lobbyTabIconBadge"]} protoTabIconBadge`}>
                          <img src="/icons/practice.webp" alt="" width={20} height={20} className="protoTabIconImg" draggable={false} />
                        </span>
                        <span className={styles["lobbyTabMain"]}>{T.realtime}</span>
                      </span>
                      <span className={styles["lobbyTabSub"]}>{T.realtime_sub}</span>
                    </span>
                  </button>
                </div>
                <div className={styles["lobby-settings-grid"]}>
                  {settingsTab === "realtime" && (
                    <>
                      <div className={`${styles["lobby-setting-item"]} ${styles["lobbyRowWrap"]}`}>
                        <span className={styles["lobby-setting-label"]}>
                          <Timer size={18} aria-hidden="true" /> {T.round}
                        </span>
                        {isHost ? (
                          <span className={styles["lobbyRowLeftWrap"]}>
                            <button
                              type="button"
                              onClick={() => setSliderValue((v) => (v > 0 ? 0 : ROUND_TIMER_DEFAULT_SEC))}
                              className={sliderValue > 0 ? styles["lobbyToggleBtnOn"] : styles["lobbyToggleBtnOff"]}
                            >
                              <span className={styles["lobbyToggleKnob"]} style={{ left: sliderValue > 0 ? 22 : 2 }} />
                            </button>
                            {sliderValue > 0 ? (
                              <span className={styles["lobbyRowLeft"]}>
                                <span className={`${styles["lobby-timer-slider-wrap"]} ${styles["lobbyRushTimerWrap"]} protoSliderWrap`}>
                                  <div className={styles["lobby-timer-slider-track"]} />
                                  <div
                                    className={styles["lobby-timer-slider-fill"]}
                                    style={{ width: `${((sliderValue - TIMER_MIN_SEC) / (TIMER_MAX_SEC - TIMER_MIN_SEC)) * 100}%` }}
                                  />
                                  <RangeSlider
                                    className={styles["lobby-timer-slider"]}
                                    min={TIMER_MIN_SEC}
                                    max={TIMER_MAX_SEC}
                                    step={15}
                                    value={sliderValue}
                                    onChange={(e) => setSliderValue(Number(e.target.value))}
                                    ticks={ROUND_TIMER_TICKS}
                                    majorTicks={ROUND_TIMER_MAJOR_TICKS}
                                    format={(v) => formatTimerDisplay(v, "")}
                                  />
                                </span>
                                <span className={`${styles["lobby-setting-value"]} ${styles["lobbyNoWrap"]}`}>
                                  {formatTimerDisplay(sliderValue, T.timer_off)}
                                </span>
                              </span>
                            ) : (
                              <span className={`${styles["lobby-setting-value"]} ${styles["lobbyNoWrap"]}`}>{T.timer_off}</span>
                            )}
                          </span>
                        ) : (
                          <span className={styles["lobby-setting-value"]}>
                            {sliderValue === 0 ? T.timer_off : formatTimerDisplay(sliderValue, T.timer_off)}
                          </span>
                        )}
                      </div>
                      <div className={`${styles["lobby-setting-item"]} ${styles["lobbyRowWrap"]}`}>
                        <span className={styles["lobby-setting-label"]}>
                          <Timer size={16} aria-hidden="true" /> {T.results_timer}
                        </span>
                        {isHost ? (
                          <span className={styles["lobbyRowLeftWrap"]}>
                            <button
                              type="button"
                              onClick={() => setResultsTimerValue((v) => (v > 0 ? 0 : Math.max(TIMER_MIN_SEC, v || TIMER_MIN_SEC)))}
                              className={resultsTimerValue > 0 ? styles["lobbyToggleBtnOn"] : styles["lobbyToggleBtnOff"]}
                            >
                              <span className={styles["lobbyToggleKnob"]} style={{ left: resultsTimerValue > 0 ? 22 : 2 }} />
                            </button>
                            {resultsTimerValue > 0 ? (
                              <span className={styles["lobbyRowLeft"]}>
                                <span className={`${styles["lobby-timer-slider-wrap"]} protoSliderWrap`}>
                                  <div className={styles["lobby-timer-slider-track"]} />
                                  <div
                                    className={styles["lobby-timer-slider-fill"]}
                                    style={{ width: `${((resultsTimerValue - TIMER_MIN_SEC) / (TIMER_MAX_SEC - TIMER_MIN_SEC)) * 100}%` }}
                                  />
                                  <RangeSlider
                                    className={styles["lobby-timer-slider"]}
                                    min={TIMER_MIN_SEC}
                                    max={TIMER_MAX_SEC}
                                    step={15}
                                    value={resultsTimerValue}
                                    onChange={(e) => setResultsTimerValue(Number(e.target.value))}
                                    ticks={RESULTS_TIMER_TICKS}
                                    majorTicks={RESULTS_TIMER_MAJOR_TICKS}
                                    format={(v) => formatTimerDisplay(v, "")}
                                  />
                                </span>
                                <span className={`${styles["lobby-setting-value"]} ${styles["lobbyNoWrap"]}`}>
                                  {formatTimerDisplay(resultsTimerValue, T.timer_off)}
                                </span>
                              </span>
                            ) : (
                              <span className={`${styles["lobby-setting-value"]} ${styles["lobbyNoWrap"]}`}>{T.timer_off}</span>
                            )}
                          </span>
                        ) : (
                          <span className={styles["lobby-setting-value"]}>
                            {resultsTimerValue === 0 ? T.timer_off : formatTimerDisplay(resultsTimerValue, T.timer_off)}
                          </span>
                        )}
                      </div>
                      <div className={styles["lobby-presets-disclosure"]}>
                        <button type="button" className={styles["lobby-presets-header"]} onClick={() => setPresetsExpanded((v) => !v)}>
                          <span className={styles["lobby-setting-label"]}>{T.era_region_presets}</span>
                          <ChevronDown
                            size={16}
                            className={`${styles["lobby-presets-chevron"]} ${presetsExpanded ? styles["lobby-presets-chevron-open"] : ""}`}
                          />
                        </button>
                        {presetsExpanded && (
                          <div className={styles["lobby-presets-content"]}>
                            <div className={`${styles["lobby-setting-item"]} ${styles["lobbySettingRowBlock"]}`}>
                              <div className={styles["lobbySettingRowHead"]}>
                                <span className={styles["lobby-setting-label"]}>{T.era_presets}</span>
                                <span className={styles["lobby-setting-value"]}>
                                  {selectedEras.size} / {ERAS.length}
                                </span>
                                {isHost && (
                                  <button type="button" className={styles["lobbySelectAllBtn"]} onClick={toggleAllEras}>
                                    {allErasSelected ? T.deselect_all : T.select_all}
                                  </button>
                                )}
                              </div>
                              <div className={styles["lobbyEraRail"]}>
                                {ERAS.map((era) => {
                                  const on = selectedEras.has(era.id);
                                  return (
                                    <ImageButton
                                      key={era.id}
                                      label={eraLabel(era.id)}
                                      sublabel={era.span}
                                      stockImg={era.stockImg}
                                      emoji={era.icon}
                                      selected={on}
                                      disabled={!isHost}
                                      onClick={() => isHost && toggleEra(era.id)}
                                      className={styles["lobbyImgBtn"]}
                                      onClassName={styles["lobbyImgBtnOn"]}
                                      offClassName={styles["lobbyImgBtnOff"]}
                                      imgClassName={styles["lobbyImgPhoto"]}
                                      overlayClassName={styles["lobbyImgOverlay"]}
                                      fallbackClassName={styles["lobbyImgFallback"]}
                                      captionClassName={styles["lobbyImgCaption"]}
                                      labelClassName={styles["lobbyImgLabel"]}
                                      sublabelClassName={styles["lobbyImgSpan"]}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                            <div className={`${styles["lobby-setting-item"]} ${styles["lobbySettingRowBlock"]}`}>
                              <div className={styles["lobbySettingRowHead"]}>
                                <span className={styles["lobby-setting-label"]}>{T.region_presets}</span>
                                <span className={styles["lobby-setting-value"]}>
                                  {REGIONS.filter((r) => selectedRegions.has(r.id)).length} / {REGIONS.length}
                                </span>
                                {isHost && (
                                  <button type="button" className={styles["lobbySelectAllBtn"]} onClick={toggleAllRegions}>
                                    {allRegionsSelected ? T.deselect_all : T.select_all}
                                  </button>
                                )}
                              </div>
                              <div className={styles["lobbyEraRail"]}>
                                {REGIONS.map((region) => {
                                  const on = selectedRegions.has(region.id);
                                  return (
                                    <ImageButton
                                      key={region.id}
                                      label={regionLabel(region.id)}
                                      stockImg={region.stockImg}
                                      emoji={region.icon}
                                      selected={on}
                                      disabled={!isHost}
                                      onClick={() => isHost && toggleRegion(region.id)}
                                      className={styles["lobbyImgBtn"]}
                                      onClassName={styles["lobbyImgBtnOn"]}
                                      offClassName={styles["lobbyImgBtnOff"]}
                                      imgClassName={styles["lobbyImgPhoto"]}
                                      overlayClassName={styles["lobbyImgOverlay"]}
                                      fallbackClassName={styles["lobbyImgFallback"]}
                                      captionClassName={styles["lobbyImgCaption"]}
                                      labelClassName={styles["lobbyImgLabel"]}
                                      sublabelClassName={styles["lobbyImgSpan"]}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {settingsTab === "turnturn" && (
                    <>
                      <div className={`${styles["lobby-setting-item"]} ${styles["lobbyRowWrap"]}`}>
                        <span className={styles["lobby-setting-label"]}>
                          <Timer size={18} aria-hidden="true" /> {T.round}
                        </span>
                        {isHost ? (
                          <span className={styles["lobbyRowLeftWrap"]}>
                            <button
                              type="button"
                              onClick={() => setSliderValue((v) => (v > 0 ? 0 : ROUND_TIMER_DEFAULT_SEC))}
                              className={sliderValue > 0 ? styles["lobbyToggleBtnOn"] : styles["lobbyToggleBtnOff"]}
                            >
                              <span className={styles["lobbyToggleKnob"]} style={{ left: sliderValue > 0 ? 22 : 2 }} />
                            </button>
                            {sliderValue > 0 ? (
                              <span className={styles["lobbyRowLeft"]}>
                                <span className={`${styles["lobby-timer-slider-wrap"]} protoSliderWrap`}>
                                  <div className={styles["lobby-timer-slider-track"]} />
                                  <div
                                    className={styles["lobby-timer-slider-fill"]}
                                    style={{ width: `${((sliderValue - TIMER_MIN_SEC) / (TIMER_MAX_SEC - TIMER_MIN_SEC)) * 100}%` }}
                                  />
                                  <RangeSlider
                                    className={styles["lobby-timer-slider"]}
                                    min={TIMER_MIN_SEC}
                                    max={TIMER_MAX_SEC}
                                    step={15}
                                    value={sliderValue}
                                    onChange={(e) => setSliderValue(Number(e.target.value))}
                                    ticks={ROUND_TIMER_TICKS}
                                    majorTicks={ROUND_TIMER_MAJOR_TICKS}
                                    format={(v) => formatTimerDisplay(v, "")}
                                  />
                                </span>
                                <span className={`${styles["lobby-setting-value"]} ${styles["lobbyNoWrap"]}`}>
                                  {formatTimerDisplay(sliderValue, T.timer_off)}
                                </span>
                              </span>
                            ) : (
                              <span className={`${styles["lobby-setting-value"]} ${styles["lobbyNoWrap"]}`}>{T.timer_off}</span>
                            )}
                          </span>
                        ) : (
                          <span className={styles["lobby-setting-value"]}>
                            {sliderValue === 0 ? T.timer_off : formatTimerDisplay(sliderValue, T.timer_off)}
                          </span>
                        )}
                      </div>
                      <div className={`${styles["lobby-setting-item"]} ${styles["lobbyRowWrap"]}`}>
                        <span className={styles["lobby-setting-label"]}>
                          <Timer size={18} aria-hidden="true" /> {T.game}
                        </span>
                        {isHost ? (
                          <span className={styles["lobbyRowLeft"]}>
                            <span className={`${styles["lobby-timer-slider-wrap"]} protoSliderWrap`}>
                              <div className={styles["lobby-timer-slider-track"]} />
                              <div
                                className={styles["lobby-timer-slider-fill"]}
                                style={{ width: `${((maxTurnDays - 1) / 13) * 100}%` }}
                              />
                              <RangeSlider
                                className={styles["lobby-timer-slider"]}
                                min={1}
                                max={14}
                                step={1}
                                value={maxTurnDays}
                                onChange={(e) => setMaxTurnDays(Number(e.target.value))}
                                ticks={DEADLINE_TICKS}
                                majorTicks={DEADLINE_MAJOR_TICKS}
                                format={(v) => (v === 1 ? T["1_day"] : fmt(T.n_days, { n: v }))}
                              />
                            </span>
                            <span className={`${styles["lobby-setting-value"]} ${styles["lobbyNoWrap"]}`}>
                              {maxTurnDays === 1 ? T["1_day"] : fmt(T.n_days, { n: maxTurnDays })}
                            </span>
                          </span>
                        ) : (
                          <span className={`${styles["lobby-setting-value"]} ${styles["lobbyNoWrap"]}`}>
                            {maxTurnDays === 1 ? T["1_day"] : fmt(T.n_days, { n: maxTurnDays })}
                          </span>
                        )}
                      </div>
                      <div className={styles["lobby-presets-disclosure"]}>
                        <button type="button" className={styles["lobby-presets-header"]} onClick={() => setPresetsExpanded((v) => !v)}>
                          <span className={styles["lobby-setting-label"]}>{T.era_region_presets}</span>
                          <ChevronDown
                            size={16}
                            className={`${styles["lobby-presets-chevron"]} ${presetsExpanded ? styles["lobby-presets-chevron-open"] : ""}`}
                          />
                        </button>
                        {presetsExpanded && (
                          <div className={styles["lobby-presets-content"]}>
                            <div className={`${styles["lobby-setting-item"]} ${styles["lobbySettingRowBlock"]}`}>
                              <div className={styles["lobbySettingRowHead"]}>
                                <span className={styles["lobby-setting-label"]}>{T.era_presets}</span>
                                <span className={styles["lobby-setting-value"]}>
                                  {selectedEras.size} / {ERAS.length}
                                </span>
                                {isHost && (
                                  <button type="button" className={styles["lobbySelectAllBtn"]} onClick={toggleAllEras}>
                                    {allErasSelected ? T.deselect_all : T.select_all}
                                  </button>
                                )}
                              </div>
                              <div className={styles["lobbyEraRail"]}>
                                {ERAS.map((era) => {
                                  const on = selectedEras.has(era.id);
                                  return (
                                    <ImageButton
                                      key={era.id}
                                      label={eraLabel(era.id)}
                                      sublabel={era.span}
                                      stockImg={era.stockImg}
                                      emoji={era.icon}
                                      selected={on}
                                      disabled={!isHost}
                                      onClick={() => isHost && toggleEra(era.id)}
                                      className={styles["lobbyImgBtn"]}
                                      onClassName={styles["lobbyImgBtnOn"]}
                                      offClassName={styles["lobbyImgBtnOff"]}
                                      imgClassName={styles["lobbyImgPhoto"]}
                                      overlayClassName={styles["lobbyImgOverlay"]}
                                      fallbackClassName={styles["lobbyImgFallback"]}
                                      captionClassName={styles["lobbyImgCaption"]}
                                      labelClassName={styles["lobbyImgLabel"]}
                                      sublabelClassName={styles["lobbyImgSpan"]}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                            <div className={`${styles["lobby-setting-item"]} ${styles["lobbySettingRowBlock"]}`}>
                              <div className={styles["lobbySettingRowHead"]}>
                                <span className={styles["lobby-setting-label"]}>{T.region_presets}</span>
                                <span className={styles["lobby-setting-value"]}>
                                  {REGIONS.filter((r) => selectedRegions.has(r.id)).length} / {REGIONS.length}
                                </span>
                                {isHost && (
                                  <button type="button" className={styles["lobbySelectAllBtn"]} onClick={toggleAllRegions}>
                                    {allRegionsSelected ? T.deselect_all : T.select_all}
                                  </button>
                                )}
                              </div>
                              <div className={styles["lobbyEraRail"]}>
                                {REGIONS.map((region) => {
                                  const on = selectedRegions.has(region.id);
                                  return (
                                    <ImageButton
                                      key={region.id}
                                      label={regionLabel(region.id)}
                                      stockImg={region.stockImg}
                                      emoji={region.icon}
                                      selected={on}
                                      disabled={!isHost}
                                      onClick={() => isHost && toggleRegion(region.id)}
                                      className={styles["lobbyImgBtn"]}
                                      onClassName={styles["lobbyImgBtnOn"]}
                                      offClassName={styles["lobbyImgBtnOff"]}
                                      imgClassName={styles["lobbyImgPhoto"]}
                                      overlayClassName={styles["lobbyImgOverlay"]}
                                      fallbackClassName={styles["lobbyImgFallback"]}
                                      captionClassName={styles["lobbyImgCaption"]}
                                      labelClassName={styles["lobbyImgLabel"]}
                                      sublabelClassName={styles["lobbyImgSpan"]}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Invite + Roster Card (merged) ── */}
              <div className={`${styles["lobby-card"]} ${styles["lobby-roster-card"]}`}>
                {/* Sub-section A: Invite Players */}
                {isHost && (
                  <div className={styles["lobby-subsection"]}>
                    <div className={styles["lobby-subsection-header"]}>
                      <span className={styles["lobby-subsection-title"]}>
                        <span className={styles["lobby-section-number"]}>2</span>
                        {T.invite_players}
                      </span>
                      <span className={styles["lobbyShareBtnGroup"]}>
                        <button type="button" className={styles["lobbyShareBtn"]} onClick={handleShareLink} data-testid="lobby-share-link">
                          {T.copy_link}
                        </button>
                      </span>
                      <button type="button" className={styles["lobbyHelpBtn"]} onClick={() => setHelpModal("friends")} aria-label={T.help}>
                        <HelpCircle size={16} />
                      </button>
                    </div>
                    {linkCopied && <span className={styles["lobbyCopiedToast"]}>{T.link_copied}</span>}
                    <div className={styles["lobbyFilterRow"]}>
                      <button
                        type="button"
                        className={`${styles["lobbyFilterBtn"]} ${filter.humans ? styles["lobbyFilterBtnActive"] : ""}`}
                        onClick={toggleHumans}
                        aria-pressed={filter.humans}
                      >
                        {T.filter_humans}
                      </button>
                      <button
                        type="button"
                        className={`${styles["lobbyFilterBtn"]} ${filter.ai ? styles["lobbyFilterBtnActive"] : ""}`}
                        onClick={toggleAi}
                        aria-pressed={filter.ai}
                      >
                        {T.filter_ai}
                      </button>
                      <span className={`${styles["lobbyFilterBtn"]} protoFilterSwitchWrap`}>
                        <span className={styles["lobbyFilterStar"]}>{filter.friends ? "★" : "☆"}</span>
                        {filter.friends ? T.filter_friends : T.filter_all}
                        <button
                          type="button"
                          onClick={toggleFriends}
                          role="switch"
                          aria-checked={filter.friends}
                          aria-label={T.filter_friends}
                          className={filter.friends ? styles["lobbyToggleBtnOn"] : styles["lobbyToggleBtnOff"]}
                        >
                          <span className={styles["lobbyToggleKnob"]} style={{ left: filter.friends ? 22 : 2 }} />
                        </button>
                      </span>
                    </div>
                    <div className={styles["lobbySearchWrap"]}>
                      <svg className={styles["lobbySearchIcon"]} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="text"
                        className={`${styles["lobbyInviteSearch"]} ${searchQuery ? styles["lobbyInviteSearchWithClear"] : ""}`}
                        placeholder={T.search_players}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button type="button" className={styles["lobbySearchClearBtn"]} onClick={() => setSearchQuery("")} aria-label={T.clear_search}>
                          ×
                        </button>
                      )}
                    </div>
                    <div className={styles["lobbyRail"]}>
                      {displayList.length === 0 ? (
                        <div className={`${styles["lobbyPlayerCard"]} ${styles["lobbyPlayerCardEmpty"]}`}>
                          <span className={styles["lobbyEmptyRailText"]}>
                            {filter.friends ? T.no_favorites_yet : T.no_players_found}
                          </span>
                        </div>
                      ) : (
                        displayList.map((player) => {
                          const inviteState = inviteStates[player.id] ?? "idle";
                          return (
                            <div key={player.id} className={styles["lobbyPlayerCard"]}>
                              <div className={styles["lobbyAvatarWrap"]}>
                                <PlayerAvatar
                                  avatarUrl={player.avatarUrl}
                                  displayName={player.displayName}
                                  playerId={player.id}
                                  size={40}
                                  isMe={player.id === viewerId}
                                  disableProfileNavigation
                                />
                                <button
                                  className={styles["lobbyStarBtn"]}
                                  onClick={() => toggleFollow(player.id)}
                                  aria-label={followedIds.has(player.id) ? T.remove_from_favorites : T.add_to_favorites}
                                >
                                  <span style={{ color: followedIds.has(player.id) ? "var(--gh-gold)" : "var(--gh-text-muted)" }}>
                                    {followedIds.has(player.id) ? "★" : "☆"}
                                  </span>
                                </button>
                              </div>
                              <div className={styles["lobbyPlayerCardName"]}>
                                <span className={styles["lobbyPlayerCardNameText"]}>{player.displayName}</span>
                              </div>
                              <button
                                type="button"
                                className={`${styles["lobbyInviteBtn"]} ${player.is_ai && comingUpId === player.id ? styles["lobbyInviteBtnComingUp"] : ""}`}
                                onClick={() => (player.is_ai ? handleAiComingUp(player) : handleSendInvite(player))}
                                disabled={!player.is_ai && inviteState !== "idle"}
                              >
                                {player.is_ai
                                  ? comingUpId === player.id
                                    ? T.ai_coming_up
                                    : T.filter_ai
                                  : inviteState === "pending"
                                    ? T.invite_pending
                                    : inviteState === "sent"
                                      ? T.invite_sent
                                      : inviteState === "error"
                                        ? T.invite_failed
                                        : T.invite}
                              </button>
                            </div>
                          );
                        })
                      )}
                      {hasMore && (
                        <div
                          className={`${styles["lobbyPlayerCard"]} ${styles["lobbyViewAllCard"]}`}
                          onClick={() => setShowAllModal(true)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && setShowAllModal(true)}
                        >
                          <span className={styles["lobbyViewAllText"]}>{fmt(T.view_all, { count: priorityList.length })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* All-players modal */}
                {showAllModal && (
                  <div className={styles["lobbyAllModal"]} onClick={() => setShowAllModal(false)} role="dialog" aria-modal="true">
                    <div className={styles["lobbyAllModalInner"]} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className={styles["lobbyAllModalClose"]} onClick={() => setShowAllModal(false)}>
                        ×
                      </button>
                      <span className={styles["lobby-subsection-title"]}>{fmt(T.all_players, { count: priorityList.length })}</span>
                      <div className={styles["lobbyAllModalSearchWrap"]}>
                        <input
                          type="text"
                          className={styles["lobbyAllModalSearch"]}
                          placeholder={T.search_players}
                          value={modalSearchQuery}
                          onChange={(e) => setModalSearchQuery(e.target.value)}
                          autoFocus
                        />
                        {modalSearchQuery && (
                          <button type="button" className={styles["lobbySearchClearBtn"]} onClick={() => setModalSearchQuery("")} aria-label={T.clear_search}>
                            ×
                          </button>
                        )}
                      </div>
                      <div className={styles["lobbyAllModalList"]}>
                        {modalFilteredList.length === 0 && (
                          <span className={styles["lobbyAllModalEmpty"]}>{T.no_players_found}</span>
                        )}
                        {modalFilteredList.map((player) => {
                          const inviteState = inviteStates[player.id] ?? "idle";
                          return (
                            <div key={player.id} className={styles["lobbyPlayerCard"]}>
                              <div className={styles["lobbyAvatarWrap"]}>
                                <PlayerAvatar
                                  avatarUrl={player.avatarUrl}
                                  displayName={player.displayName}
                                  playerId={player.id}
                                  size={40}
                                  isMe={player.id === viewerId}
                                  disableProfileNavigation
                                />
                                <button
                                  className={styles["lobbyStarBtn"]}
                                  onClick={() => toggleFollow(player.id)}
                                  aria-label={followedIds.has(player.id) ? T.remove_from_favorites : T.add_to_favorites}
                                >
                                  <span style={{ color: followedIds.has(player.id) ? "var(--gh-gold)" : "var(--gh-text-muted)" }}>
                                    {followedIds.has(player.id) ? "★" : "☆"}
                                  </span>
                                </button>
                              </div>
                              <div className={styles["lobbyPlayerCardName"]}>
                                <span className={styles["lobbyPlayerCardNameText"]}>{player.displayName}</span>
                              </div>
                              <button
                                type="button"
                                className={`${styles["lobbyInviteBtn"]} ${player.is_ai && comingUpId === player.id ? styles["lobbyInviteBtnComingUp"] : ""}`}
                                onClick={() => (player.is_ai ? handleAiComingUp(player) : handleSendInvite(player))}
                                disabled={!player.is_ai && inviteState !== "idle"}
                              >
                                {player.is_ai
                                  ? comingUpId === player.id
                                    ? T.ai_coming_up
                                    : T.filter_ai
                                  : inviteState === "pending"
                                    ? T.invite_pending
                                    : inviteState === "sent"
                                      ? T.invite_sent
                                      : inviteState === "error"
                                        ? T.invite_failed
                                        : T.invite}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-section B: Players roster */}
                <div className={styles["lobby-subsection"]}>
                  <div className={styles["lobby-subsection-header"]}>
                    <span className={styles["lobby-accent-bar-sm"]} />
                    <span className={styles["lobby-subsection-title"]}>{fmt(T.players, { current: totalPlayers, total: rosterTotal })}</span>
                    <span className={styles["lobbyReadyIndicator"]}>
                      <span
                        className={styles["lobbyReadyDot"]}
                        style={{ background: readyCount > 0 ? "var(--gh-success)" : "var(--gh-border-default)" }}
                      />
                      {fmt(T.ready_count, { count: readyCount })}
                    </span>
                  </div>
                  <div className={styles["lobbyRosterList"]} data-testid="lobby-roster">
                    {activePlayers.map((p) => {
                      const isViewerPlayer = p.playerId === viewer?.playerId;
                      return (
                        <div
                          key={p.playerId}
                          className={`${styles["lobbyRosterRow"]} ${p.ready ? styles["lobbyRosterRowReady"] : ""}`}
                          data-testid={`lobby-player-${p.playerId}`}
                          data-ready={p.ready ? "true" : "false"}
                          data-host={p.isHost ? "true" : "false"}
                        >
                          <div className={styles["lobbyAvatarWrap"]}>
                            <PlayerAvatar
                              avatarUrl={p.avatarUrl}
                              displayName={p.displayName}
                              playerId={p.playerId}
                              size={40}
                              isMe={isViewerPlayer}
                              disableProfileNavigation
                            />
                            {!isViewerPlayer && (
                              <button
                                className={styles["lobbyStarBtn"]}
                                onClick={() => toggleFollow(p.playerId)}
                                aria-label={followedIds.has(p.playerId) ? T.remove_from_favorites : T.add_to_favorites}
                              >
                                <span style={{ color: followedIds.has(p.playerId) ? "var(--gh-gold)" : "var(--gh-text-muted)" }}>
                                  {followedIds.has(p.playerId) ? "★" : "☆"}
                                </span>
                              </button>
                            )}
                          </div>
                          <div className={styles["lobbyRosterMeta"]}>
                            <span className={styles["lobbyRosterName"]}>
                              {p.displayName}
                              {isViewerPlayer && <span className={styles["lobbyYouTag"]}>{T.you}</span>}
                            </span>
                            {p.isHost && <span className={styles["lobbyHostInline"]}>♛ {T.host}</span>}
                          </div>
                          {isAsync ? (
                            (() => {
                              switch (p.roundStatus) {
                                case "finished":
                                  return <span className={styles["lobbyStatusPillGreen"]}>Finished</span>;
                                case "playing":
                                  return (
                                    <span className={styles["lobbyStatusPillAmber"]} style={{ background: "rgba(var(--gh-blue-rgb), 0.18)", color: "var(--gh-blue)" }}>
                                      Playing
                                    </span>
                                  );
                                case "ready":
                                  return <span className={styles["lobbyStatusPillGreen"]}>{T.ready}</span>;
                                case "joined":
                                  return <span className={styles["lobbyStatusPillGrey"]}>Joined</span>;
                                default:
                                  return (
                                    <span className={p.ready ? styles["lobbyStatusPillGreen"] : styles["lobbyStatusPillGrey"]}>
                                      {p.ready ? T.ready : T.not_ready}
                                    </span>
                                  );
                              }
                            })()
                          ) : (
                            <span className={p.ready ? styles["lobbyStatusPillGreen"] : styles["lobbyStatusPillGrey"]}>
                              {p.ready ? T.ready : T.not_ready}
                            </span>
                          )}
                          {isHost && !p.isHost && (
                            <button
                              type="button"
                              className={styles["lobby-kick-btn"]}
                              onClick={() => kickPlayer(p.playerId)}
                              title={T.kick_player}
                              data-testid={`lobby-kick-${p.playerId}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {pendingInvitees.map((p) => (
                      <div key={p.playerId} className={styles["lobbyRosterRow"]}>
                        <PlayerAvatar
                          avatarUrl={p.avatarUrl}
                          displayName={p.displayName}
                          playerId={p.playerId}
                          size={40}
                          isMe={p.playerId === viewerId}
                          disableProfileNavigation
                        />
                        <div className={styles["lobbyRosterMeta"]}>
                          <span className={styles["lobbyRosterName"]}>{p.displayName}</span>
                        </div>
                        <span className={styles["lobbyStatusPillAmber"]}>{T.invited}</span>
                        {isHost && (
                          <button type="button" className={styles["lobby-kick-btn"]} title={T.remove_invite}>
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    {activePlayers.length === 0 && pendingInvitees.length === 0 && (
                      <div className={styles["lobbyRosterEmpty"]}>{T.no_players_yet}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Dock — READY CTA (sync) or START MY GAME (async) */}
            <div className={styles["lobby-dock"]} data-testid="lobby-dock">
              <div className={styles["lobby-dock-content"]}>
                {isAsync ? (
                  <button
                    type="button"
                    className={styles["lobbyReadyBtnNotReady"]}
                    onClick={toggleReady}
                    data-testid="lobby-ready-btn"
                  >
                    {T.relax_start_my_game}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={isReady ? styles["lobbyReadyBtnIsReady"] : styles["lobbyReadyBtnNotReady"]}
                    onClick={toggleReady}
                    data-testid="lobby-ready-btn"
                  >
                    {isReady ? T.ready_waiting : T.im_ready}
                  </button>
                )}
                {!isAsync && (
                  <span className={styles["lobby-ready-count"]} data-testid="lobby-ready-count">
                    {fmt(T.players_ready, { ready: readyCount, total: totalPlayers })}
                    {allPlayersReady && totalPlayers > 0 && <span className={styles["lobbyAllReadyTag"]}>{T.starting_soon}</span>}
                  </span>
                )}
              </div>
            </div>

            {helpModal && (
              <div className={styles["lobbyHelpModalBackdrop"]} onClick={() => setHelpModal(null)}>
                <div className={styles["lobbyHelpModal"]} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className={styles["lobbyHelpModalClose"]} onClick={() => setHelpModal(null)} aria-label={T.help}>
                    ×
                  </button>
                  <h4>{helpModal === "settings" ? T.game_settings : T.invite_players}</h4>
                  <p>{helpModal === "settings" ? T.help_game_settings : T.help_invite_players}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: SLIDER_OVERRIDE_CSS + TAB_OVERRIDE_CSS + FILTER_SWITCH_CSS }} />
    </main>
  );
}
