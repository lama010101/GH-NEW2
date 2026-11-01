"use client";

// ============================================================================
// LANDING-V2 PROTOTYPE — newbie-friendly, animated landing page
// Route: /prototype/landing
//
// Goals:
//   - Must have animation
//   - Use only existing webapp assets + CSS tokens
//   - Easy to understand for a first-time visitor
//   - Explain that images are made with AI
//   - Sell "have fun and learn history"
//
// Uses REAL game components:
//   - WhereCard / WhenCard (mock Berlin Wall data)
//   - ERA_STOCK_IMAGES / REGION_STOCK_IMAGES from @/core/useEraRegionImages
//   - getAccuracyColor from @/core/accuracyColor
//
// No API calls. No real event images. Self-contained prototype.
// All copy lives in i18n: landing.lp_* (this page) + help.gm_*/faq_* (reused).
// ============================================================================

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import WhenCard from "@/components/compete/WhenCard";
import { ERA_STOCK_IMAGES, REGION_STOCK_IMAGES } from "@/core/useEraRegionImages";
import { getAccuracyColor } from "@/core/accuracyColor";
import type { RoundResult } from "@/core/competeTypes";
import type { SessionPlayer } from "@/core/types";
import { toProxiedImageUrl } from "@/lib/imageProxy";
import { YearPicker } from "@/components/YearPicker";
import { AuthModal } from "@/components/AuthModal";
import { useAuthGate } from "@/hooks/useAuthGate";
import { LanguageDropdown } from "@/components/layout/LanguageDropdown";
import styles from "./landing.module.css";
import lbStyles from "@/app/leaderboard/leaderboard.module.css";

const GameMap = dynamic(
  () => import("@/components/GameMap").then((m) => m.GameMap),
  { ssr: false }
);

const WhereCard = dynamic(
  () => import("@/components/compete/WhereCard"),
  { ssr: false }
);

// ── Mock data for WhereCard + WhenCard (Fall of the Berlin Wall, 1989) ──
const CORRECT_LAT = 52.5163;
const CORRECT_LNG = 13.3777;
const CORRECT_NAME = "Berlin, Germany";
const CORRECT_YEAR = 1989;
const DEMO_YEAR_END = 1989;
const DEMO_XP = 184;
const DEMO_FLY_TO_BERLIN = { lat: 52.5163, lng: 13.3777, id: 1 };

const MOCK_PLAYERS: SessionPlayer[] = [
  {
    playerId: "p1",
    displayName: "Albert Einstein",
    joinedAt: "2024-01-01T00:00:00Z",
    leftAt: null,
    ready: true,
    isHost: true,
    avatarUrl: "https://im.runware.ai/image/ws/2/ii/28093021-6f59-4240-8ace-0a6e15f2672e.webp",
    hasSubmitted: true,
  },
  {
    playerId: "p2",
    displayName: "Marie Curie",
    joinedAt: "2024-01-01T00:00:00Z",
    leftAt: null,
    ready: true,
    isHost: false,
    avatarUrl: "https://im.runware.ai/image/ws/2/ii/917583d3-87cd-4d55-a09d-7713a934180f.webp",
    hasSubmitted: true,
  },
  {
    playerId: "p3",
    displayName: "Nelson Mandela",
    joinedAt: "2024-01-01T00:00:00Z",
    leftAt: null,
    ready: true,
    isHost: false,
    avatarUrl: "https://im.runware.ai/image/ws/2/ii/dc36c8d7-b0f9-4ea7-9f55-047909ed4bd5.webp",
    hasSubmitted: true,
  },
];

const MOCK_ROUND_RESULTS: RoundResult[] = [
  {
    playerId: "p1",
    score: 1840,
    rank: 1,
    accuracy: 92,
    locationScore: 96,
    didSubmit: true,
    guessYear: 1991,
    guessLat: 52.45,
    guessLng: 13.38,
    timeScore: 88,
    badges: [{ dimension: "location", tier: "gold", accuracy: 96 }],
    nearMisses: [],
    cumulativeScore: 1840,
    cumulativeAccuracy: 92,
  },
  {
    playerId: "p2",
    score: 1980,
    rank: 0,
    accuracy: 99,
    locationScore: 100,
    didSubmit: true,
    guessYear: 1989,
    guessLat: 52.52,
    guessLng: 13.40,
    timeScore: 98,
    badges: [{ dimension: "combo", tier: "gold", accuracy: 99 }],
    nearMisses: [],
    cumulativeScore: 1980,
    cumulativeAccuracy: 99,
  },
  {
    playerId: "p3",
    score: 1210,
    rank: 0,
    accuracy: 71,
    locationScore: 64,
    didSubmit: true,
    guessYear: 1978,
    guessLat: 52.40,
    guessLng: 13.10,
    timeScore: 78,
    badges: [],
    nearMisses: [],
    cumulativeScore: 1210,
    cumulativeAccuracy: 71,
  },
];

const MY_PLAYER_ID = "p1";
const MY_DISTANCE_KM = 42;

// Era/region labels resolve through i18n keys so they follow the UI locale.
const ERA_LABEL_KEYS: Record<string, string> = {
  ancient: "lp_era_ancient",
  medieval: "lp_era_medieval",
  earlymodern: "lp_era_earlymodern",
  modern: "lp_era_modern",
  contemporary: "lp_era_contemporary",
};

const REGION_LABEL_KEYS: Record<string, string> = {
  africa: "lp_region_africa",
  asia: "lp_region_asia",
  europe: "lp_region_europe",
  north_america: "lp_region_north_america",
  south_america: "lp_region_south_america",
  oceania_antarctica: "lp_region_oceania_antarctica",
};

const HERO_IMAGES = [
  { src: "/prototype/landing/hero/hero-1.webp", label: "Hero 1" },
  { src: "/prototype/landing/hero/hero-2.webp", label: "Hero 2" },
  { src: "/prototype/landing/hero/hero-3.webp", label: "Hero 3" },
  { src: "/prototype/landing/hero/hero-5.webp", label: "Hero 5" },
  { src: "/prototype/landing/hero/hero-7.webp", label: "Hero 7" },
];

const PIPELINE = [
  { labelKey: "lp_pipe1_label", descKey: "lp_pipe1_desc" },
  { labelKey: "lp_pipe2_label", descKey: "lp_pipe2_desc" },
  { labelKey: "lp_pipe3_label", descKey: "lp_pipe3_desc" },
  { labelKey: "lp_pipe4_label", descKey: "lp_pipe4_desc" },
];

const FUN_BADGES = [
  { src: "/badges/year_gold.webp", labelKey: "lp_badge_year" },
  { src: "/badges/location_gold.webp", labelKey: "lp_badge_location" },
  { src: "/badges/combo_gold.webp", labelKey: "lp_badge_combo" },
];

const RANK_PREVIEWS = [
  { key: "wanderer", titleKey: "lp_rank_wanderer" },
  { key: "pathfinder", titleKey: "lp_rank_pathfinder" },
  { key: "trailblazer", titleKey: "lp_rank_trailblazer" },
  { key: "cartographer", titleKey: "lp_rank_cartographer" },
  { key: "explorer", titleKey: "lp_rank_explorer" },
];

const ACCURACY_TIERS = [
  { label: "85%+", nameKey: "lp_tier_expert", color: "var(--gh-success)" },
  { label: "60–84%", nameKey: "lp_tier_skilled", color: "var(--gh-gold)" },
  { label: "40–59%", nameKey: "lp_tier_apprentice", color: "var(--gh-orange)" },
  { label: "<40%", nameKey: "lp_tier_beginner", color: "var(--gh-danger)" },
];

const HOW_STEPS = [
  { titleKey: "lp_step1_title", descKey: "lp_step1_desc" },
  { titleKey: "lp_step2_title", descKey: "lp_step2_desc" },
  { titleKey: "lp_step3_title", descKey: "lp_step3_desc" },
];

const PHASE_TITLE_KEYS = ["lp_phase1_title", "lp_phase2_title", "lp_phase3_title", "lp_phase4_title"];
const PHASE_BODY_KEYS = ["lp_phase1_body", "lp_phase2_body", "lp_phase3_body", "lp_phase4_body"];

const GAME_MODES = [
  { key: "practice", icon: "/icons/practice.webp" },
  { key: "daily", icon: "/icons/daily.webp" },
  { key: "challenge", icon: "/icons/compete.webp" },
  { key: "journey", icon: "/icons/level.webp" },
];

// help.faq_q{2,1,3,8,10}/faq_a{…}: account, scoring, modes, daily reset, badges
const FAQ_HELP_ITEMS = [2, 1, 3, 8, 10];

const AVATAR_PREVIEWS = [
  {
    name: "Albert Einstein",
    descKey: "lp_avatar_einstein_desc",
    born: { date: "1879-03-14", place: "Ulm, Germany" },
    died: { date: "1955-04-18", place: "Princeton, USA" },
    url: "https://firebasestorage.googleapis.com/v0/b/historify-ai.firebasestorage.app/o/avatars%2F0d19257e-9a2a-4553-93d7-1edf70327c68_AlbertEinstein.jpg?alt=media&token=d008d166-da67-423f-9281-9ec2e7f6aef0",
  },
  {
    name: "Marie Curie",
    descKey: "lp_avatar_curie_desc",
    born: { date: "1867-11-07", place: "Warsaw, Poland" },
    died: { date: "1934-07-04", place: "Passy, France" },
    url: "https://firebasestorage.googleapis.com/v0/b/historify-ai.firebasestorage.app/o/avatars%2Fa0afd408-fa5a-43f7-8723-4d50642ce210_MarieCurie.jpg?alt=media&token=32195928-02bf-4fd8-894f-4fb95badddb4",
  },
  {
    name: "Nelson Mandela",
    descKey: "lp_avatar_mandela_desc",
    born: { date: "1918-07-18", place: "Mvezo, South Africa" },
    died: { date: "2013-12-05", place: "Johannesburg, South Africa" },
    url: "https://firebasestorage.googleapis.com/v0/b/historify-ai.firebasestorage.app/o/avatars%2Fd93a9e35-9e9b-42cd-afd4-5d53e2329167_NelsonMandela.jpg?alt=media&token=55a85578-412a-4bf2-86ed-ba9c87c7b29e",
  },
  {
    name: "Ada Lovelace",
    descKey: "lp_avatar_lovelace_desc",
    born: { date: "1815-12-10", place: "London, United Kingdom" },
    died: { date: "1852-11-27", place: "Marylebone, United Kingdom" },
    url: "https://firebasestorage.googleapis.com/v0/b/historify-ai.firebasestorage.app/o/avatars%2Fe44e050a-f408-4698-a6d0-6f607fd2579b_AdaLovelace.jpg?alt=media&token=e82217a3-9b73-45ac-a932-1815dd762368",
  },
  {
    name: "Charles Darwin",
    descKey: "lp_avatar_darwin_desc",
    born: { date: "1809-02-12", place: "Shrewsbury, United Kingdom" },
    died: { date: "1882-04-19", place: "Downe, United Kingdom" },
    url: "https://firebasestorage.googleapis.com/v0/b/historify-ai.firebasestorage.app/o/avatars%2F1cb7486d-da10-44ac-b068-483147b76226_CharlesDarwin.jpg?alt=media&token=487ff003-b5f3-4c2a-8510-3c1e3e6de016",
  },
];

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

type LandingLeaderboardTab = "overall" | "daily" | "levelup";
type LandingDailySubTab = "today" | "alltime";

type LandingLeaderboardEntry = {
  rank: number;
  player_id: string;
  display_name: string;
  avatar_url: string | null;
  is_ai: boolean;
  is_friend: boolean;
  avg_accuracy: number;
  games_played: number;
  rounds_won: number;
  current_level: number;
  best_accuracy: number;
};

const LEADERBOARD_OVERALL: LandingLeaderboardEntry[] = [
  { rank: 1, player_id: "p5", display_name: "Jamal Wright", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 91, games_played: 124, rounds_won: 12, current_level: 7, best_accuracy: 96 },
  { rank: 2, player_id: "p2", display_name: "Mina Kovač", avatar_url: null, is_ai: false, is_friend: true, avg_accuracy: 93, games_played: 110, rounds_won: 10, current_level: 6, best_accuracy: 98 },
  { rank: 3, player_id: "p1", display_name: "Alex Rivera", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 87, games_played: 98, rounds_won: 8, current_level: 5, best_accuracy: 94 },
  { rank: 4, player_id: "p6", display_name: "Priya Patel", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 85, games_played: 92, rounds_won: 7, current_level: 5, best_accuracy: 92 },
  { rank: 5, player_id: "p7", display_name: "Liam O'Connor", avatar_url: null, is_ai: true, is_friend: false, avg_accuracy: 82, games_played: 80, rounds_won: 6, current_level: 4, best_accuracy: 89 },
  { rank: 6, player_id: "p4", display_name: "Sara Bianchi", avatar_url: null, is_ai: false, is_friend: true, avg_accuracy: 80, games_played: 75, rounds_won: 5, current_level: 4, best_accuracy: 88 },
  { rank: 7, player_id: "p3", display_name: "Theo Lambert", avatar_url: null, is_ai: true, is_friend: false, avg_accuracy: 70, games_played: 60, rounds_won: 4, current_level: 3, best_accuracy: 78 },
];

const LEADERBOARD_DAILY_TODAY: LandingLeaderboardEntry[] = [
  { rank: 1, player_id: "p2", display_name: "Mina Kovač", avatar_url: null, is_ai: false, is_friend: true, avg_accuracy: 96, games_played: 4, rounds_won: 3, current_level: 6, best_accuracy: 98 },
  { rank: 2, player_id: "p1", display_name: "Alex Rivera", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 94, games_played: 3, rounds_won: 2, current_level: 5, best_accuracy: 94 },
  { rank: 3, player_id: "p5", display_name: "Jamal Wright", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 91, games_played: 5, rounds_won: 3, current_level: 7, best_accuracy: 96 },
  { rank: 4, player_id: "p4", display_name: "Sara Bianchi", avatar_url: null, is_ai: false, is_friend: true, avg_accuracy: 88, games_played: 4, rounds_won: 2, current_level: 4, best_accuracy: 88 },
  { rank: 5, player_id: "p9", display_name: "Emma Dubois", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 86, games_played: 3, rounds_won: 1, current_level: 4, best_accuracy: 86 },
];

const LEADERBOARD_DAILY_ALLTIME: LandingLeaderboardEntry[] = [
  { rank: 1, player_id: "p5", display_name: "Jamal Wright", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 91, games_played: 452, rounds_won: 112, current_level: 7, best_accuracy: 96 },
  { rank: 2, player_id: "p2", display_name: "Mina Kovač", avatar_url: null, is_ai: false, is_friend: true, avg_accuracy: 93, games_played: 410, rounds_won: 98, current_level: 6, best_accuracy: 98 },
  { rank: 3, player_id: "p1", display_name: "Alex Rivera", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 87, games_played: 389, rounds_won: 86, current_level: 5, best_accuracy: 94 },
  { rank: 4, player_id: "p6", display_name: "Priya Patel", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 85, games_played: 371, rounds_won: 74, current_level: 5, best_accuracy: 92 },
  { rank: 5, player_id: "p7", display_name: "Liam O'Connor", avatar_url: null, is_ai: true, is_friend: false, avg_accuracy: 82, games_played: 340, rounds_won: 62, current_level: 4, best_accuracy: 89 },
  { rank: 6, player_id: "p4", display_name: "Sara Bianchi", avatar_url: null, is_ai: false, is_friend: true, avg_accuracy: 80, games_played: 312, rounds_won: 55, current_level: 4, best_accuracy: 88 },
];

const LEADERBOARD_LEVELUP: LandingLeaderboardEntry[] = [
  { rank: 1, player_id: "p5", display_name: "Jamal Wright", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 96, games_played: 124, rounds_won: 12, current_level: 12, best_accuracy: 96 },
  { rank: 2, player_id: "p2", display_name: "Mina Kovač", avatar_url: null, is_ai: false, is_friend: true, avg_accuracy: 98, games_played: 110, rounds_won: 10, current_level: 11, best_accuracy: 98 },
  { rank: 3, player_id: "p1", display_name: "Alex Rivera", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 94, games_played: 98, rounds_won: 8, current_level: 9, best_accuracy: 94 },
  { rank: 4, player_id: "p6", display_name: "Priya Patel", avatar_url: null, is_ai: false, is_friend: false, avg_accuracy: 92, games_played: 92, rounds_won: 7, current_level: 8, best_accuracy: 92 },
  { rank: 5, player_id: "p7", display_name: "Liam O'Connor", avatar_url: null, is_ai: true, is_friend: false, avg_accuracy: 89, games_played: 80, rounds_won: 6, current_level: 7, best_accuracy: 89 },
];

function MainLeaderboard() {
  const t = useTranslations("landing");
  const [activeTab, setActiveTab] = useState<LandingLeaderboardTab>("overall");
  const [activeSubTab, setActiveSubTab] = useState<LandingDailySubTab>("today");
  const [filter, setFilter] = useState({ humans: false, ai: false, friends: false });

  const allRows = activeTab === "daily"
    ? (activeSubTab === "today" ? LEADERBOARD_DAILY_TODAY : LEADERBOARD_DAILY_ALLTIME)
    : activeTab === "levelup"
      ? LEADERBOARD_LEVELUP
      : LEADERBOARD_OVERALL;

  const filteredRows = useMemo(() => {
    const rows = !filter.humans && !filter.ai && !filter.friends ? allRows : allRows.filter(
      (e) => (filter.humans && !e.is_ai) || (filter.ai && e.is_ai) || (filter.friends && e.is_friend)
    );
    return [...rows].sort((a, b) => {
      if (activeTab === "levelup") return (b.current_level ?? 0) - (a.current_level ?? 0);
      return (b.avg_accuracy ?? 0) - (a.avg_accuracy ?? 0);
    });
  }, [allRows, filter, activeTab]);

  const ownRank = useMemo(() => {
    const idx = filteredRows.findIndex((e) => e.player_id === "p1");
    return idx >= 0 ? idx + 1 : null;
  }, [filteredRows]);

  const summaryLabel = activeTab === "daily"
    ? `${t("lp_lb_daily")} ${activeSubTab === "today" ? t("lp_lb_today") : t("lp_lb_alltime")}`
    : activeTab === "levelup"
      ? t("lp_lb_levelup")
      : t("lp_lb_overall");

  const podium = useMemo(() => {
    if (filteredRows.length < 3) return [];
    return [
      { entry: filteredRows[1], place: 2, className: lbStyles.podiumSilver, height: "85%" },
      { entry: filteredRows[0], place: 1, className: lbStyles.podiumGold, height: "100%" },
      { entry: filteredRows[2], place: 3, className: lbStyles.podiumBronze, height: "85%" },
    ];
  }, [filteredRows]);

  const getInitials = (name: string | null): string => {
    if (!name) return "?";
    return name.trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  };

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null) return "—";
    return num.toLocaleString();
  };

  function AccuracyValue({ acc }: { acc: number | undefined }) {
    if (acc === undefined || acc === null) return "—";
    return (
      <span className={lbStyles.accuracyValue} style={{ color: getAccuracyColor(acc) }}>
        {Math.round(acc)}%
      </span>
    );
  }

  function PlayerCell({ entry }: { entry: LandingLeaderboardEntry }) {
    let subtitle: string;
    if (activeTab === "overall") {
      subtitle = `${t("lp_lb_rounds_won", { won: entry.rounds_won ?? 0 })} · ${t("lp_lb_games_played", { games: entry.games_played ?? 0 })}`;
    } else if (activeTab === "daily") {
      subtitle = t("lp_lb_games_played", { games: entry.games_played ?? 0 });
    } else {
      subtitle = t("lp_lb_level_n", { level: entry.current_level ?? 0 });
    }
    const avatarFallback = entry.is_ai ? "AI" : getInitials(entry.display_name);
    return (
      <div className={lbStyles.playerCell}>
        {entry.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toProxiedImageUrl(entry.avatar_url) ?? ""}
            alt=""
            className={lbStyles.avatar}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className={`${lbStyles.avatarInitials} ${entry.is_ai ? lbStyles.avatarAi : ""}`}>{avatarFallback}</div>
        )}
        <div className={lbStyles.playerInfo}>
          <span className={lbStyles.playerName}>
            {entry.display_name}
            {entry.is_ai ? <span className={lbStyles.aiBadge}>AI</span> : null}
          </span>
          <span className={lbStyles.playerSubtitle}>{subtitle}</span>
        </div>
      </div>
    );
  }

  const renderRank = (rank: number) => {
    if (rank === 1) return <span className={lbStyles.medalGold}>🥇</span>;
    if (rank === 2) return <span className={lbStyles.medalSilver}>🥈</span>;
    if (rank === 3) return <span className={lbStyles.medalBronze}>🥉</span>;
    return <span className={lbStyles.rankNumber}>{rank}</span>;
  };

  return (
    <div>
      <div className={lbStyles.tabRow}>
        {(["overall", "daily", "levelup"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`${lbStyles.tab} ${activeTab === tab ? lbStyles.tabActive : ""}`}
          >
            {tab === "overall" ? t("lp_lb_overall") : tab === "daily" ? t("lp_lb_daily") : t("lp_lb_levelup")}
          </button>
        ))}
      </div>

      {activeTab === "daily" && (
        <div className={lbStyles.subTabRow}>
          <button
            type="button"
            onClick={() => setActiveSubTab("today")}
            className={`${lbStyles.subTab} ${activeSubTab === "today" ? lbStyles.subTabActive : ""}`}
          >
            {t("lp_lb_today")}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("alltime")}
            className={`${lbStyles.subTab} ${activeSubTab === "alltime" ? lbStyles.subTabActive : ""}`}
          >
            {t("lp_lb_alltime")}
          </button>
        </div>
      )}

      <div className={lbStyles.filterRow}>
        <button
          type="button"
          onClick={() => setFilter((f) => ({ ...f, humans: !f.humans }))}
          className={`${lbStyles.filterChip} ${filter.humans ? lbStyles.filterChipActive : ""}`}
          aria-pressed={filter.humans}
        >
          {t("lp_lb_humans")}
        </button>
        <button
          type="button"
          onClick={() => setFilter((f) => ({ ...f, ai: !f.ai }))}
          className={`${lbStyles.filterChip} ${filter.ai ? lbStyles.filterChipActive : ""}`}
          aria-pressed={filter.ai}
        >
          {t("lp_lb_ai")}
        </button>
        <button
          type="button"
          onClick={() => setFilter((f) => ({ ...f, friends: !f.friends }))}
          className={`${lbStyles.friendsToggle} ${filter.friends ? lbStyles.friendsToggleActive : ""}`}
          aria-pressed={filter.friends}
        >
          {t("lp_lb_friends")}
        </button>
      </div>

      {ownRank !== null && ownRank > 0 && (
        <div className={lbStyles.summaryLine}>
          {t("lp_lb_you_rank", { rank: ownRank, summary: summaryLabel })}
        </div>
      )}

      {podium.length === 3 && (
        <div className={lbStyles.podium}>
          {podium.map((slot) => (
            <div
              key={slot.entry.player_id}
              className={`${lbStyles.podiumItem} ${slot.className}`}
              style={{ height: slot.height }}
            >
              <span className={lbStyles.podiumRank}>{slot.place}</span>
              {slot.entry.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={toProxiedImageUrl(slot.entry.avatar_url) ?? ""}
                  alt=""
                  className={lbStyles.podiumAvatar}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className={`${lbStyles.podiumAvatarInitials} ${slot.entry.is_ai ? lbStyles.avatarAi : ""}`}>
                  {slot.entry.is_ai ? "AI" : getInitials(slot.entry.display_name)}
                </div>
              )}
              <span className={lbStyles.podiumName}>{slot.entry.display_name}</span>
              <span className={lbStyles.podiumValue}>
                {activeTab === "levelup" ? (
                  <span style={{ color: "var(--gh-violet)" }}>{slot.entry.current_level}</span>
                ) : (
                  <AccuracyValue acc={slot.entry.avg_accuracy} />
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <div className={lbStyles.emptyState}>{t("lp_lb_empty")}</div>
      ) : (
        <div className={lbStyles.tableWrapper}>
          <table className={lbStyles.table}>
            <thead>
              <tr>
                <th className={lbStyles.th}>#</th>
                <th className={lbStyles.th}>{t("lp_lb_player")}</th>
                {activeTab === "levelup" ? (
                  <>
                    <th className={lbStyles.th}>{t("lp_lb_accuracy")}</th>
                    <th className={lbStyles.th}>{t("lp_lb_level")}</th>
                  </>
                ) : (
                  <>
                    <th className={lbStyles.th}>{t("lp_lb_accuracy")}</th>
                    <th className={`${lbStyles.th} ${lbStyles.thGames}`}>{t("lp_lb_games")}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((entry, idx) => {
                const rank = idx + 1;
                const isMe = entry.player_id === "p1";
                return (
                  <tr
                    key={entry.player_id}
                    className={`${lbStyles.row} ${isMe ? lbStyles.rowHighlight : ""}`}
                  >
                    <td className={lbStyles.rankCell}>{renderRank(rank)}</td>
                    <td className={lbStyles.playerCell}><PlayerCell entry={entry} /></td>
                    {activeTab === "levelup" ? (
                      <>
                        <td className={lbStyles.accuracyCell}><AccuracyValue acc={entry.best_accuracy} /></td>
                        <td className={lbStyles.levelCell}><span className={lbStyles.levelValue}>{t("lp_lb_lvl", { level: entry.current_level })}</span></td>
                      </>
                    ) : (
                      <>
                        <td className={lbStyles.accuracyCell}><AccuracyValue acc={entry.avg_accuracy} /></td>
                        <td className={`${lbStyles.gamesCell} ${lbStyles.gamesCellDesktop}`}>{formatNumber(entry.games_played)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function LandingV2Prototype() {
  const t = useTranslations("landing");
  const th = useTranslations("help");
  const [topbarSolid, setTopbarSolid] = useState(false);
  const [showTopbarExtras, setShowTopbarExtras] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [demoPhase, setDemoPhase] = useState(0);
  const [demoLoop, setDemoLoop] = useState(0);
  const [demoXp, setDemoXp] = useState(0);
  const [whereLbExpanded, setWhereLbExpanded] = useState(false);
  const [whereCluesExpanded, setWhereCluesExpanded] = useState(false);
  const [whenLbExpanded, setWhenLbExpanded] = useState(false);
  const [whenCluesExpanded, setWhenCluesExpanded] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const { requireAuth, isModalOpen, closeModal } = useAuthGate();
  const demoCounterRef = useRef<number | null>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const heroLogoRef = useRef<HTMLHeadingElement>(null);
  const heroCtaRef = useRef<HTMLButtonElement>(null);

  // Scroll reveal
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const ids = entries.map((e) => e.target.id).filter(Boolean) as string[];
        if (ids.length === 0) return;
        setRevealed((prev) => {
          const next = { ...prev };
          ids.forEach((id) => { next[id] = true; });
          return next;
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Topbar scroll state
  useEffect(() => {
    const onScroll = () => setTopbarSolid((window.scrollY || window.pageYOffset) > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Show topbar logo + Play Now only when the hero logo and CTA are hidden by the topbar
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !topbarRef.current) return;
    const topbarHeight = topbarRef.current.offsetHeight;
    const visible = { logo: true, cta: true };
    const update = () => setShowTopbarExtras(!visible.logo && !visible.cta);
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.target === heroLogoRef.current) visible.logo = e.isIntersecting;
          if (e.target === heroCtaRef.current) visible.cta = e.isIntersecting;
        });
        update();
      },
      { threshold: 0, rootMargin: `-${topbarHeight}px 0px 0px 0px` }
    );
    if (heroLogoRef.current) obs.observe(heroLogoRef.current);
    if (heroCtaRef.current) obs.observe(heroCtaRef.current);
    update();
    return () => obs.disconnect();
  }, []);

  // Hero slideshow
  useEffect(() => {
    const id = setInterval(() => setHeroIndex((i) => (i + 1) % HERO_IMAGES.length), 5000);
    return () => clearInterval(id);
  }, []);

  // Avatar card slideshow
  useEffect(() => {
    const id = setInterval(() => setAvatarIndex((i) => (i + 1) % AVATAR_PREVIEWS.length), 3500);
    return () => clearInterval(id);
  }, []);

  // Mini-demo phase loop
  useEffect(() => {
    const phases: [number, number][] = [
      [0, 2200],
      [1, 2200],
      [2, 2200],
      [3, 3400],
    ];

    const runPhase = (idx: number) => {
      const [phase, wait] = phases[idx];
      setDemoPhase(phase);
      setDemoLoop((l) => l + 1);
      if (phase === 3) {
        // animate XP counter
        const start = 0;
        const end = DEMO_XP;
        const startTime = performance.now();
        const duration = 1200;
        const tick = (now: number) => {
          const t = Math.min(1, (now - startTime) / duration);
          setDemoXp(Math.round(start + (end - start) * easeOutQuad(t)));
          if (t < 1) {
            demoCounterRef.current = requestAnimationFrame(tick);
          }
        };
        demoCounterRef.current = requestAnimationFrame(tick);
      }
      return new Promise<void>((resolve) => setTimeout(resolve, wait));
    };

    let cancelled = false;
    (async () => {
      // eslint-disable-next-line no-constant-condition
      while (!cancelled) {
        for (let i = 0; i < phases.length; i++) {
          if (cancelled) break;
          await runPhase(i);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (demoCounterRef.current) cancelAnimationFrame(demoCounterRef.current);
    };
  }, []);

  const phaseTitle = t(PHASE_TITLE_KEYS[demoPhase]);
  const phaseBody = t(PHASE_BODY_KEYS[demoPhase]);

  const eraPairs = useMemo(() => Object.entries(ERA_STOCK_IMAGES), []);
  const regionPairs = useMemo(() => Object.entries(REGION_STOCK_IMAGES), []);
  const doubleEras = useMemo(() => [...eraPairs, ...eraPairs], [eraPairs]);
  const doubleRegions = useMemo(() => [...regionPairs, ...regionPairs], [regionPairs]);

  const navLinks = (
    <>
      <a href="#how" onClick={() => setMenuOpen(false)}>{t("lp_nav_how")}</a>
      <a href="#modes" onClick={() => setMenuOpen(false)}>{t("lp_nav_modes")}</a>
      <a href="#explore" onClick={() => setMenuOpen(false)}>{t("lp_nav_explore")}</a>
      <a href="#ai" onClick={() => setMenuOpen(false)}>{t("lp_nav_ai")}</a>
      <a href="#faq" onClick={() => setMenuOpen(false)}>{t("lp_nav_faq")}</a>
    </>
  );

  return (
    <div className={styles.page}>
      <header
        ref={topbarRef}
        className={`${styles.topbar} ${topbarSolid ? styles.topbarSolid : ""} ${showTopbarExtras ? styles.topbarHasExtras : ""}`}
      >
        {showTopbarExtras && (
          <a className={styles.brand} href="#hero" aria-label={t("lp_nav_back_top")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt={t("logo_alt")} width={120} height={32} className={styles.brandImg} />
          </a>
        )}

        <nav className={styles.topnav} aria-label={t("lp_nav_aria")}>
          {navLinks}
          <LanguageDropdown />
        </nav>

        <button
          type="button"
          className={`${styles.hamburger} ${menuOpen ? styles.hamburgerOpen : ""}`}
          aria-label={menuOpen ? t("lp_menu_close") : t("lp_menu_open")}
          aria-expanded={menuOpen}
          aria-controls="landing-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          id="landing-menu"
          className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`}
          aria-label={t("lp_nav_aria")}
        >
          {navLinks}
          <LanguageDropdown />
        </nav>

        {showTopbarExtras && (
          <button
            type="button"
            onClick={() => requireAuth('/home')}
            className={`${styles.playNowBtn} ${styles.topbarCta}`}
          >
            {t("lp_play_now")}
          </button>
        )}
      </header>

      {/* ── HERO ── */}
      <section className={styles.hero} id="hero" aria-label={t("lp_hero_aria")}>
        <div className={styles.heroSlides} aria-hidden="true">
          {HERO_IMAGES.map((img, i) => (
            <div
              key={img.src}
              className={`${styles.heroSlide} ${i === heroIndex ? styles.heroSlideActive : ""}`}
              style={{ backgroundImage: `url(${img.src})` }}
            />
          ))}
        </div>
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={styles.heroInner}>
          <p className={styles.eyebrowCenter}>
            <span className={styles.eyebrow}>{t("lp_hero_eyebrow")}</span>
          </p>
          <h1 ref={heroLogoRef} className={styles.heroLogo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt={t("logo_alt")} width={440} height={118} className={styles.heroLogoImg} />
          </h1>
          <p className={styles.heroSub}>{t("lp_hero_headline")}</p>
          <p className={styles.heroTagline}>{t("lp_hero_tagline")}</p>
          <div className={styles.heroTrust}>
            <span className={styles.trustChip}>{t("lp_trust_free")}</span>
            <span className={styles.trustChip}>{t("lp_trust_no_download")}</span>
            <span className={styles.trustChip}>{t("lp_trust_ai")}</span>
          </div>
          <div className={styles.heroCtaRow}>
            <button
              ref={heroCtaRef}
              type="button"
              onClick={() => requireAuth('/home')}
              className={`${styles.playNowBtn} ${styles.heroCta}`}
            >
              {t("lp_play_now")}
            </button>
            <a href="#how" className={styles.ghostBtn}>{t("lp_hero_how")}</a>
          </div>
          <div className={styles.heroDots}>
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHeroIndex(i)}
                className={`${styles.heroDot} ${i === heroIndex ? styles.heroDotActive : ""}`}
                aria-label={t("lp_slide_aria", { n: i + 1 })}
              />
            ))}
          </div>
        </div>
        <div className={styles.scrollInd} aria-hidden="true">
          <span>{t("lp_scroll")}</span>
          <span className={styles.mouse} />
        </div>
      </section>

      {/* ── HOW TO PLAY ── */}
      <section className={styles.sec} id="how" data-reveal="how">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.how ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>{t("lp_how_eyebrow")}</span>
            </p>
            <h2 className={styles.secHeadH2}>{t("lp_how_title")}</h2>
            <p className={styles.secHeadP}>{t("lp_how_sub")}</p>
          </div>

          <div className={`${styles.stepsRow} ${revealed.how ? styles.in : ""}`}>
            {HOW_STEPS.map((step, i) => (
              <Fragment key={step.titleKey}>
                {i > 0 && <div className={styles.stepArrow} aria-hidden="true">→</div>}
                <div className={styles.stepCard}>
                  <span className={styles.stepNum}>{`0${i + 1}`}</span>
                  <h3 className={styles.stepTitle}>{t(step.titleKey)}</h3>
                  <p className={styles.stepDesc}>{t(step.descKey)}</p>
                </div>
              </Fragment>
            ))}
          </div>

          <div className={`${styles.demo} ${revealed.how ? styles.in : ""}`}>
            <div className={styles.demoCard}>
              <div className={styles.demoView}>
                {demoPhase === 0 && (
                  <div key={`see-${demoLoop}`} className={styles.demoScene}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/prototype/landing/berlinwall.webp" alt={t("lp_demo_scene_alt")} className={styles.demoSceneImg} />
                  </div>
                )}
                {demoPhase === 1 && (
                  <div key={`where-${demoLoop}`} className={styles.demoWhere}>
                    <div className={styles.demoMapWrap}>
                      <GameMap
                        guessLocation={{ lat: 52.5163, lng: 13.3777 }}
                        onSetLocation={() => {}}
                        localPlayerAvatarUrl={MOCK_PLAYERS[0].avatarUrl}
                        hideZoomControls
                        flyToTarget={DEMO_FLY_TO_BERLIN}
                      />
                    </div>
                    <p className={styles.demoWhereText}>{t("lp_demo_where_guess", { place: "Berlin" })}</p>
                  </div>
                )}
                {demoPhase === 2 && (
                  <div key={`when-${demoLoop}`} className={styles.demoWhen}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/when.webp" alt={t("lp_demo_when_alt")} width={40} height={40} className={styles.demoWhenIcon} />
                    <div className={styles.demoYearPickerWrap}>
                      <YearPicker
                        value={DEMO_YEAR_END}
                        onChange={() => {}}
                        min={1900}
                        max={2025}
                        valueIsCommitted
                        className={styles.demoYearPicker}
                      />
                    </div>
                    <p className={styles.demoWhenText}>{t("lp_demo_when_guess", { year: DEMO_YEAR_END })}</p>
                  </div>
                )}
                {demoPhase === 3 && (
                  <div key={`reveal-${demoLoop}`} className={styles.demoReveal}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/prototype/landing/berlinwall.webp" alt="" className={styles.demoSceneImg} />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(180deg, rgba(8,12,20,.55) 0%, rgba(8,12,20,.80) 100%)",
                        zIndex: 1,
                      }}
                      aria-hidden="true"
                    />
                    <div
                      style={{
                        position: "relative",
                        zIndex: 2,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <p className={styles.demoRevealTitle}>{t("lp_demo_reveal_title")}</p>
                      <p className={styles.demoRevealYear}>1989</p>
                      <div className={styles.demoRevealScore}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/badges/combo_gold.webp" alt={t("lp_demo_badge_alt")} className={styles.demoBadge} />
                        <span className={styles.demoXp}>{demoXp} XP</span>
                      </div>
                      <p className={styles.demoFact}>{t("lp_demo_fact")}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className={styles.demoProgress}>
                {[0, 1, 2, 3].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.demoDot} ${p === demoPhase ? styles.demoDotActive : ""}`}
                    aria-label={t("lp_demo_phase_aria", { n: p + 1 })}
                  />
                ))}
              </div>
              <div className={styles.demoCaption}>
                <p className={styles.demoPhaseTitle}>{phaseTitle}</p>
                <p className={styles.demoPhaseBody}>{phaseBody}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── GAME MODES ── */}
      <section className={styles.sec} id="modes" data-reveal="modes">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.modes ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>{t("lp_modes_eyebrow")}</span>
            </p>
            <h2 className={styles.secHeadH2}>{t("lp_modes_title")}</h2>
            <p className={styles.secHeadP}>{t("lp_modes_sub")}</p>
          </div>

          <div className={`${styles.modesGrid} ${revealed.modes ? styles.in : ""}`}>
            {GAME_MODES.map((mode) => (
              <div key={mode.key} className={styles.modeCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mode.icon} alt="" width={44} height={44} className={styles.modeIcon} loading="lazy" />
                <h3 className={styles.modeTitle}>{th(`gm_${mode.key}_title`)}</h3>
                <p className={styles.modeSub}>{th(`gm_${mode.key}_sub`)}</p>
                <p className={styles.modeDesc}>{th(`gm_${mode.key}_desc`)}</p>
                <div className={styles.modeChips}>
                  {th(`gm_${mode.key}_features`).split("|").map((f) => (
                    <span key={f} className={styles.modeChip}>{f}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REAL CARDS ── */}
      <section className={`${styles.sec} ${styles.how}`} id="cards" data-reveal="cards">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.cards ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>{t("lp_cards_eyebrow")}</span>
            </p>
            <h2 className={styles.secHeadH2}>{t("lp_cards_title")}</h2>
            <p className={styles.secHeadP}>{t("lp_cards_sub")}</p>
            <span className={styles.examplePill}>{t("lp_example_round")}</span>
          </div>

          <div className={`${styles.cardsGrid} ${revealed.cards ? styles.in : ""}`}>
            <div className={styles.cardsCol}>
              <p className={styles.howStepLabel}>{t("lp_step_where")}</p>
              <WhereCard
                roundResults={MOCK_ROUND_RESULTS}
                playerId={MY_PLAYER_ID}
                correctLat={CORRECT_LAT}
                correctLng={CORRECT_LNG}
                correctName={CORRECT_NAME}
                whereAccPenalty={0}
                guessLat={52.45}
                guessLng={13.38}
                myDistanceKm={MY_DISTANCE_KM}
                whereLbExpanded={whereLbExpanded}
                setWhereLbExpanded={setWhereLbExpanded}
                whereCluesExpanded={whereCluesExpanded}
                setWhereCluesExpanded={setWhereCluesExpanded}
                roundHints={[]}
                snapshotPlayers={MOCK_PLAYERS}
                currentRoundIndex={0}
                isVisible={true}
                bare={false}
                isPractice={false}
              />
            </div>

            <div className={styles.cardsCol}>
              <p className={styles.howStepLabel}>{t("lp_step_when")}</p>
              <WhenCard
                roundResults={MOCK_ROUND_RESULTS}
                playerId={MY_PLAYER_ID}
                correctYear={CORRECT_YEAR}
                whenAccPenalty={0}
                whenLbExpanded={whenLbExpanded}
                setWhenLbExpanded={setWhenLbExpanded}
                whenCluesExpanded={whenCluesExpanded}
                setWhenCluesExpanded={setWhenCluesExpanded}
                roundHints={[]}
                snapshotPlayers={MOCK_PLAYERS}
                isVisible={true}
                bare={false}
                isPractice={false}
              />
            </div>

            <div className={styles.cardsWide}>
              <p className={styles.howStepLabel}>{t("lp_step_why")}</p>
              <div className={styles.howWhyCard}>
                <h4>{t("lp_why_title")}</h4>
                <p>{t("lp_why_body")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── EXPLORE ── */}
      <section className={`${styles.sec} ${styles.explore}`} id="explore" data-reveal="explore">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.explore ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>{t("lp_explore_eyebrow")}</span>
            </p>
            <h2 className={styles.secHeadH2}>{t("lp_explore_title")}</h2>
            <p className={styles.secHeadP}>{t("lp_explore_sub")}</p>
          </div>

          <div className={`${styles.marqueeWrap} ${styles.erasWrap}`}>
            <p className={styles.marqueeLabel}>{t("lp_eras_label")}</p>
            <div className={styles.marqueeTrack}>
              {doubleEras.map(([key, src], i) => (
                <div key={`${key}-${i}`} className={styles.marqueeCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={ERA_LABEL_KEYS[key] ? t(ERA_LABEL_KEYS[key]) : key} className={styles.marqueeImg} />
                  <span className={styles.marqueeOverlay} />
                  <span className={styles.marqueeText}>{ERA_LABEL_KEYS[key] ? t(ERA_LABEL_KEYS[key]) : key}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.marqueeWrap} ${styles.regionsWrap}`}>
            <p className={styles.marqueeLabel}>{t("lp_regions_label")}</p>
            <div className={`${styles.marqueeTrack} ${styles.marqueeReverse}`}>
              {doubleRegions.map(([key, src], i) => (
                <div key={`${key}-${i}`} className={styles.marqueeCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={REGION_LABEL_KEYS[key] ? t(REGION_LABEL_KEYS[key]) : key} className={styles.marqueeImg} />
                  <span className={styles.marqueeOverlay} />
                  <span className={styles.marqueeText}>{REGION_LABEL_KEYS[key] ? t(REGION_LABEL_KEYS[key]) : key}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FUN & PROGRESS ── */}
      <section className={`${styles.sec} ${styles.fun}`} id="fun" data-reveal="fun">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.fun ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>{t("lp_fun_eyebrow")}</span>
            </p>
            <h2 className={styles.secHeadH2}>{t("lp_fun_title_a")} <span className={styles.orangeText}>{t("lp_fun_title_b")}</span> {t("lp_fun_title_c")}</h2>
            <p className={styles.secHeadP}>{t("lp_fun_sub")}</p>
          </div>

          <div className={`${styles.funGrid} ${revealed.fun ? styles.in : ""}`}>
            <div className={styles.funCard}>
              <h4 className={styles.funCardH4}>{t("lp_badges_title")}</h4>
              <div className={styles.funBadges}>
                {FUN_BADGES.map(({ src, labelKey }, i) => (
                  <div key={src} className={styles.funBadgeWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={t(labelKey)} className={styles.funBadge} style={{ animationDelay: `${i * 0.15}s` }} />
                    <span className={styles.funBadgeLabel}>{t(labelKey)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.funCard}>
              <h4 className={styles.funCardH4}>{t("lp_tiers_title")}</h4>
              <div className={styles.tierRow}>
                {ACCURACY_TIERS.map((tier) => (
                  <div key={tier.nameKey} className={styles.tier}>
                    <span className={styles.tierDot} style={{ background: tier.color }} />
                    <span className={styles.tierLabel}>{tier.label}</span>
                    <span className={styles.tierName}>{t(tier.nameKey)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.funCol}>
              <div className={styles.funCard}>
                <h4 className={styles.funCardH4}>{t("lp_ranks_title")}</h4>
                <div className={styles.rankStrip}>
                  {RANK_PREVIEWS.map(({ key, titleKey }) => (
                    <div key={key} className={styles.rankItem}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/images/rank-titles/${key}.jpg`} alt={t(titleKey)} className={styles.rankThumb} />
                      <span className={styles.rankTitle}>{t(titleKey)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${styles.xpBar} ${styles.xpCard} ${revealed.fun ? styles.in : ""}`}>
                <div className={styles.xpBarHead}>
                  <span className={styles.xpBarTitle}>{t("lp_xp_title")}</span>
                  <span className={styles.examplePill}>{t("lp_example")}</span>
                  <span className={styles.xpBarValue} style={{ color: getAccuracyColor(92) }}>1,840 / 5,000</span>
                </div>
                <div className={styles.xpBarTrack}>
                  <div className={styles.xpBarFill} style={{ width: "37%" }} />
                </div>
                <p className={styles.xpBarHint}>{t("lp_xp_hint")}</p>
              </div>
            </div>

            <div className={styles.funCard}>
              <h4 className={styles.funCardH4}>{t("lp_avatars_title")}</h4>
              <p className={styles.funCardDesc}>{t("lp_avatars_desc")}</p>
              <div className={styles.avatarViewport}>
                <div
                  className={styles.avatarTrack}
                  style={{
                    width: `${AVATAR_PREVIEWS.length * 100}%`,
                    transform: `translateX(-${(avatarIndex * 100) / AVATAR_PREVIEWS.length}%)`,
                  }}
                >
                  {AVATAR_PREVIEWS.map((a) => (
                    <div
                      key={a.name}
                      className={styles.avatarSlide}
                      style={{ width: `${100 / AVATAR_PREVIEWS.length}%` }}
                    >
                      <div className={styles.avatarCard}>
                        <div className={styles.avatarRing}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={toProxiedImageUrl(a.url) ?? ""}
                            alt={a.name}
                            className={styles.avatarImg}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                        <h5 className={`font-bebas ${styles.avatarTitle}`}>{a.name}</h5>
                        <p className={styles.avatarDesc}>{t(a.descKey)}</p>
                        <p className={styles.avatarMeta}>{t("lp_born", a.born)}</p>
                        <p className={styles.avatarMeta}>{t("lp_died", a.died)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.avatarDots}>
                {AVATAR_PREVIEWS.map((a, i) => (
                  <button
                    key={a.name}
                    type="button"
                    aria-label={t("lp_avatar_show_aria", { name: a.name })}
                    onClick={() => setAvatarIndex(i)}
                    className={`${styles.avatarDot} ${i === avatarIndex ? styles.avatarDotActive : ""}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI IMAGES ── */}
      <section className={`${styles.sec} ${styles.ai}`} id="ai" data-reveal="ai">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.ai ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>{t("lp_ai_eyebrow")}</span>
            </p>
            <h2 className={styles.secHeadH2}>{t("lp_ai_title_a")} <span className={styles.orangeText}>{t("lp_ai_title_b")}</span></h2>
            <p className={styles.secHeadP}>{t("lp_ai_sub")}</p>
          </div>

          <div className={`${styles.pipeline} ${revealed.ai ? styles.in : ""}`}>
            <div className={styles.pipeLine} aria-hidden="true">
              <span className={styles.pipeDot} />
            </div>
            {PIPELINE.map((node, i) => (
              <div key={node.labelKey} className={styles.pipeNode}>
                <span className={styles.pipeRing}>{i + 1}</span>
                <h4 className={styles.pipeNodeH4}>{t(node.labelKey)}</h4>
                <p className={styles.pipeNodeP}>{t(node.descKey)}</p>
              </div>
            ))}
          </div>

          <div className={`${styles.aiNote} ${revealed.ai ? styles.in : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/when.webp" alt="" width={28} height={28} className={styles.aiNoteIcon} />
            <p>
              {t("lp_ai_note")}
            </p>
          </div>
        </div>
      </section>

      {/* ── LEADERBOARD ── */}
      <section className={styles.sec} id="leaderboard" data-reveal="leaderboard">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.leaderboard ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>{t("lp_lb_eyebrow")}</span>
            </p>
            <h2 className={lbStyles.title}>{t("lp_lb_title")}</h2>
            <p className={styles.secHeadP}>{t("lp_lb_sub")}</p>
            <span className={styles.examplePill}>{t("lp_example_preview")}</span>
          </div>
          <div className={`${styles.lbReveal} ${revealed.leaderboard ? styles.in : ""}`}>
            <MainLeaderboard />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={styles.sec} id="faq" data-reveal="faq">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.faq ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>{t("lp_faq_eyebrow")}</span>
            </p>
            <h2 className={styles.secHeadH2}>{t("lp_faq_title")}</h2>
            <p className={styles.secHeadP}>{t("lp_faq_sub")}</p>
          </div>

          <div className={`${styles.faqList} ${revealed.faq ? styles.in : ""}`}>
            {FAQ_HELP_ITEMS.map((n) => (
              <details key={n} className={styles.faqItem}>
                <summary className={styles.faqQ}>
                  {th(`faq_q${n}`)}
                  <span className={styles.faqChevron} aria-hidden="true" />
                </summary>
                <p className={styles.faqA}>{th(`faq_a${n}`)}</p>
              </details>
            ))}
            <details className={styles.faqItem}>
              <summary className={styles.faqQ}>
                {t("lp_faq_ai_q")}
                <span className={styles.faqChevron} aria-hidden="true" />
              </summary>
              <p className={styles.faqA}>{t("lp_faq_ai_a")}</p>
            </details>
            <details className={styles.faqItem}>
              <summary className={styles.faqQ}>
                {t("lp_faq_free_q")}
                <span className={styles.faqChevron} aria-hidden="true" />
              </summary>
              <p className={styles.faqA}>{t("lp_faq_free_a")}</p>
            </details>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className={styles.final} id="play" data-reveal="play">
        <div className={styles.finalBg}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/era-region/medieval.jpg" alt="" className={styles.finalBgImg} />
        </div>
        <div className={styles.finalScrim} aria-hidden="true" />
        <div className={`${styles.finalInner} ${revealed.play ? styles.in : ""}`}>
          <p className={styles.eyebrowCenter}>
            <span className={styles.eyebrow}>{t("lp_final_eyebrow")}</span>
          </p>
          <h2 className={styles.finalH2}>{t("lp_final_title")}</h2>
          <p className={styles.finalP}>{t("lp_final_sub")}</p>
          <div className={styles.finalCtaRow}>
            <button
              type="button"
              onClick={() => requireAuth('/home')}
              className={`${styles.playNowBtn} ${styles.ctaBig}`}
            >
              <span className={styles.ctaPulse} />
              {t("lp_play_now")}
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <p className={styles.footerDisc}>{t("lp_footer_disc")}</p>
        <div className={styles.footerLinks}>
          <a href="#how">{t("lp_nav_how")}</a>
          <a href="#modes">{t("lp_nav_modes")}</a>
          <a href="#ai">{t("lp_nav_ai")}</a>
          <a href="#explore">{t("lp_nav_explore")}</a>
          <a href="#faq">{t("lp_nav_faq")}</a>
          <Link href="/help">{t("lp_footer_help")}</Link>
          <Link href="/privacy">{t("lp_footer_privacy")}</Link>
          <Link href="/terms">{t("lp_footer_terms")}</Link>
          <a href="/" onClick={(e) => { e.preventDefault(); requireAuth('/home'); }}>{t("lp_play_now")}</a>
        </div>
        <p className={styles.footerCopy}>{t("lp_footer_copy", { year: new Date().getFullYear() })}</p>
      </footer>
      <AuthModal isOpen={isModalOpen} onClose={closeModal} required={false} />
    </div>
  );
}
