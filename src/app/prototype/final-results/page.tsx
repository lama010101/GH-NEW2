"use client";

// ============================================================================
// PROTOTYPE — Final Results (standalone, prototype-only design)
// Route: /prototype/final-results   (direct access, mock data)
//
// Mirrors the prod /daily/game/[gameId]/results shell + SessionComplete layout,
// with the prototype-specific design changes requested for this prototype.
// Only files inside src/app/prototype/final-results are touched. Prod components
// are imported read-only (RainbowRing, PlayerAvatar, icons, helpers) — never
// modified.
// ============================================================================

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import TopBar from "@/components/layout/TopBar";
import { NavModal } from "@/components/NavModal";
import RainbowRing from "@/components/compete/RainbowRing";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import FullscreenImageViewer from "@/components/FullscreenImageViewer";
import AccuracySuffix from "@/components/AccuracySuffix";
import WhereIcon from "@/components/icons/WhereIcon";
import WhenIcon from "@/components/icons/WhenIcon";
import { Trophy, Layers } from "lucide-react";
import { rankForXp } from "@/core/rank";
import { calculateBadges } from "@/core/rules";
import { getAccuracyColor } from "@/core/accuracyColor";
import { formatDistance, getDistanceUnitPreference } from "@/lib/distance";
import { toProxiedImageUrl } from "@/lib/imageProxy";
import { ERA_STOCK_IMAGES, REGION_STOCK_IMAGES } from "@/core/useEraRegionImages";
import pageStyles from "@/app/practice/[gameId]/page.module.css";
import styles from "./final-results.module.css";

const VIEWER_ID = "p1";
const TOTAL_XP_GLOBAL = 25000; // mock viewer global XP (drives rank tier + xpToNext)

type MockPlayer = { id: string; name: string; isHost: boolean };

const PLAYERS: MockPlayer[] = [
  { id: "p1", name: "Alex Rivera", isHost: true },
  { id: "p2", name: "Mina Kovač", isHost: false },
  { id: "p3", name: "Theo Lambert", isHost: false },
  { id: "p4", name: "Sara Bianchi", isHost: false },
];

type MockRound = {
  title: string;
  year: number;
  locationName: string;
  region: string;
  lat: number;
  lng: number;
  imageUrl: string | null;
};

const ROUNDS: MockRound[] = [
  { title: "Fall of the Berlin Wall", year: 1989, locationName: "Berlin, Germany", region: "Europe", lat: 52.52, lng: 13.405, imageUrl: null },
  { title: "Apollo 11 Moon Landing", year: 1969, locationName: "Cape Canaveral, USA", region: "North America", lat: 28.39, lng: -80.61, imageUrl: null },
  { title: "Coronation of Elizabeth II", year: 1953, locationName: "London, UK", region: "Europe", lat: 51.5, lng: -0.12, imageUrl: null },
  { title: "Eiffel Tower Inauguration", year: 1889, locationName: "Paris, France", region: "Europe", lat: 48.86, lng: 2.29, imageUrl: null },
  { title: "Sydney Opera House Opening", year: 1973, locationName: "Sydney, Australia", region: "Oceania", lat: -33.86, lng: 151.21, imageUrl: null },
];

type Result = {
  playerId: string;
  roundIndex: number;
  score: number;
  locationScore: number;
  timeScore: number;
  distanceKm: number;
  yearDiff: number;
};

const RESULTS: Result[] = (() => {
  const skill: Record<string, number> = { p1: 88, p2: 95, p3: 72, p4: 83 };
  const out: Result[] = [];
  for (const p of PLAYERS) {
    for (let ri = 0; ri < ROUNDS.length; ri++) {
      const seed = (p.id.charCodeAt(1) * 13 + ri * 31) % 17;
      const loc = Math.max(20, Math.min(100, skill[p.id] + (seed - 8)));
      const time = Math.max(20, Math.min(100, skill[p.id] + ((seed * 2) % 17) - 8));
      const score = Math.round((loc + time) * 1);
      const distanceKm = Math.round((100 - loc) * 9);
      const yearDiff = Math.round((100 - time) / 4);
      out.push({ playerId: p.id, roundIndex: ri, score, locationScore: loc, timeScore: time, distanceKm, yearDiff });
    }
  }
  return out;
})();

const RANK_IMAGE: Record<number, string> = {
  1: "/images/rank-titles/wanderer.jpg",
  2: "/images/rank-titles/pathfinder.jpg",
  3: "/images/rank-titles/trailblazer.jpg",
  4: "/images/rank-titles/cartographer.jpg",
  5: "/images/rank-titles/explorer.jpg",
  6: "/images/rank-titles/navigator.jpg",
  7: "/images/rank-titles/chronicler.jpg",
  8: "/images/rank-titles/historian.jpg",
  9: "/images/rank-titles/scholar.jpg",
  10: "/images/rank-titles/cartographer_royal.jpg",
};

const ERA_META: Record<string, { icon: string; span: string; order: number; stockImg: string }> = {
  era_ancient: { icon: "🏛️", span: "-3000 – 476", order: 0, stockImg: ERA_STOCK_IMAGES.ancient },
  era_medieval: { icon: "⚔️", span: "476 – 1492", order: 1, stockImg: ERA_STOCK_IMAGES.medieval },
  era_earlymodern: { icon: "⛵", span: "1492 – 1789", order: 2, stockImg: ERA_STOCK_IMAGES.earlymodern },
  era_modern: { icon: "🏭", span: "1789 – 1945", order: 3, stockImg: ERA_STOCK_IMAGES.modern },
  era_contemporary: { icon: "🚀", span: "1945 – 2025", order: 4, stockImg: ERA_STOCK_IMAGES.contemporary },
};

const REGION_META: Record<string, { icon: string; stockImg: string; order: number }> = {
  Europe: { icon: "🏰", stockImg: REGION_STOCK_IMAGES.europe, order: 0 },
  Asia: { icon: "🏯", stockImg: REGION_STOCK_IMAGES.asia, order: 1 },
  "North America": { icon: "🗽", stockImg: REGION_STOCK_IMAGES.north_america, order: 2 },
  "South America": { icon: "🦜", stockImg: REGION_STOCK_IMAGES.south_america, order: 3 },
  Africa: { icon: "🌍", stockImg: REGION_STOCK_IMAGES.africa, order: 4 },
  Oceania: { icon: "🏝️", stockImg: REGION_STOCK_IMAGES.oceania_antarctica, order: 5 },
};

function eraForYear(year: number): string {
  if (year < 476) return "era_ancient";
  if (year < 1492) return "era_medieval";
  if (year < 1789) return "era_earlymodern";
  if (year < 1945) return "era_modern";
  return "era_contemporary";
}

// MiniRing — local copy of the prod RoundCompleteSection MiniRing visual.
function MiniRing({ value, color }: { value: number; color: string }) {
  const size = 56;
  const sw = 5;
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className={styles.miniRingWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gh-border-medium)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.miniRingVal} style={{ color }}>{Math.round(value)}</span>
    </div>
  );
}

export default function FinalResultsPrototypePage() {
  const t = useTranslations("game");
  const tRank = useTranslations("rank");
  const distanceUnit = getDistanceUnitPreference();

  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set([0]));
  const [showNavModal, setShowNavModal] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerAlt, setViewerAlt] = useState<string>("");
  const [progTab, setProgTab] = useState<"when" | "where">("when");

  // ── Per-player aggregates ──
  const playerStats = useMemo(() => {
    return PLAYERS.map((p) => {
      const rows = RESULTS.filter((r) => r.playerId === p.id);
      const n = rows.length;
      const totalScore = rows.reduce((s, r) => s + r.score, 0);
      const totalLocationScore = rows.reduce((s, r) => s + r.locationScore, 0);
      const totalYearScore = rows.reduce((s, r) => s + r.timeScore, 0);
      const avgLocation = Math.round(totalLocationScore / n);
      const avgTime = Math.round(totalYearScore / n);
      const avgAccuracy = Math.round((avgLocation + avgTime) / 2);
      const avgConsistency = Math.round(rows.reduce((s, r) => s + Math.min(r.locationScore, r.timeScore), 0) / n);
      const avgDistanceKm = rows.reduce((s, r) => s + r.distanceKm, 0) / n;
      const avgYearDiff = rows.reduce((s, r) => s + r.yearDiff, 0) / n;
      const bestRoundResult = rows.reduce((b, r) => (r.score > b.score ? r : b), rows[0]);
      const bestRoundScore = bestRoundResult.score;
      const bestRoundAccuracy = Math.round((bestRoundResult.locationScore + bestRoundResult.timeScore) / 2);
      const bestYearAccuracy = Math.max(...rows.map((r) => r.timeScore));
      const bestLocationAccuracy = Math.max(...rows.map((r) => r.locationScore));
      return {
        ...p, isMe: p.id === VIEWER_ID, totalScore, totalLocationScore, totalYearScore, avgLocation, avgTime, avgAccuracy,
        avgConsistency, avgDistanceKm, avgYearDiff, bestRoundScore, bestRoundAccuracy,
        bestYearAccuracy, bestLocationAccuracy, roundCount: n,
      };
    });
  }, []);

  const roundWinner = useMemo(() => {
    const map = new Map<number, string>();
    for (let i = 0; i < ROUNDS.length; i++) {
      const rows = RESULTS.filter((r) => r.roundIndex === i);
      const best = rows.reduce((b, r) => (r.score > b.score ? r : b), rows[0]);
      map.set(i, best.playerId);
    }
    return map;
  }, []);

  const leaderboard = useMemo(
    () =>
      [...playerStats].sort((a, b) =>
        b.avgAccuracy !== a.avgAccuracy ? b.avgAccuracy - a.avgAccuracy : b.totalScore - a.totalScore
      ),
    [playerStats]
  );

  const me = playerStats.find((p) => p.isMe)!;
  const myRank = leaderboard.findIndex((p) => p.isMe) + 1;
  const wonRoundsByMe = [...roundWinner.entries()].filter(([, pid]) => pid === VIEWER_ID).length;

  const rankSuffix = (n: number) => (n === 1 ? t("rank_st") : n === 2 ? t("rank_nd") : n === 3 ? t("rank_rd") : t("rank_th"));
  const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? id;

  const roundStats = (idx: number) => {
    const rows = RESULTS.filter((r) => r.roundIndex === idx);
    const n = rows.length;
    return {
      avgAccuracy: Math.round(rows.reduce((s, r) => s + (r.locationScore + r.timeScore) / 2, 0) / n),
      avgLocation: Math.round(rows.reduce((s, r) => s + r.locationScore, 0) / n),
      avgTime: Math.round(rows.reduce((s, r) => s + r.timeScore, 0) / n),
      avgDistanceKm: rows.reduce((s, r) => s + r.distanceKm, 0) / n,
      avgYearDiff: rows.reduce((s, r) => s + r.yearDiff, 0) / n,
      totalScore: rows.reduce((s, r) => s + r.score, 0),
      bestPlayerId: roundWinner.get(idx) ?? null,
    };
  };

  // ── Badges (viewer) ──
  const myRoundResults = RESULTS.filter((r) => r.playerId === VIEWER_ID);
  const badgeCounts = { combo: 0, when: 0, where: 0 };
  for (const r of myRoundResults) {
    const combo = (r.locationScore + r.timeScore) / 2;
    const badges = calculateBadges({ yearAccuracy: r.timeScore, locationAccuracy: r.locationScore, comboAccuracy: combo });
    for (const b of badges) {
      if (b.dimension === "combo") badgeCounts.combo++;
      else if (b.dimension === "year") badgeCounts.when++;
      else if (b.dimension === "location") badgeCounts.where++;
    }
  }
  const totalBadges = badgeCounts.combo + badgeCounts.when + badgeCounts.where;

  // ── Best player (MVP) — order: round, combo, year, location ──
  type MvpCat = {
    key: "round" | "combo" | "year" | "location";
    label: string;
    Icon: React.ComponentType<{ size?: number | string; className?: string }>;
    diskCls: string;
    getValue: (p: typeof playerStats[number]) => number;
  };
  const mvpCategories: MvpCat[] = [
    { key: "round", label: t("mvp_best_round") === "Best Round" ? "Round" : t("mvp_best_round"), Icon: Trophy, diskCls: styles.mvpDiskRound, getValue: (p) => p.bestRoundAccuracy },
    { key: "combo", label: t("mvp_consistency") === "Consistency" ? "Combo" : t("mvp_consistency"), Icon: Layers, diskCls: styles.mvpDiskCombo, getValue: (p) => p.avgConsistency },
    { key: "year", label: t("mvp_year"), Icon: WhenIcon, diskCls: styles.mvpDiskYear, getValue: (p) => p.avgTime },
    { key: "location", label: t("mvp_location"), Icon: WhereIcon, diskCls: styles.mvpDiskLocation, getValue: (p) => p.avgLocation },
  ];
  const mvpAwards = mvpCategories.map((cat) => {
    const sorted = [...playerStats].sort((a, b) => {
      const av = cat.getValue(a);
      const bv = cat.getValue(b);
      if (bv !== av) return bv - av;
      return b.totalScore - a.totalScore;
    });
    const first = sorted[0];
    const winners = sorted.filter((p) => cat.getValue(p) === cat.getValue(first) && p.totalScore === first.totalScore);
    return { ...cat, winners };
  });

  // ── Where / When progression ──
  const byWhen = useMemo(() => {
    const map = new Map<string, { totalXp: number; totalAcc: number; roundCount: number }>();
    for (const r of myRoundResults) {
      const round = ROUNDS[r.roundIndex];
      const eraKey = eraForYear(round.year);
      const acc = (r.locationScore + r.timeScore) / 2;
      const ex = map.get(eraKey) ?? { totalXp: 0, totalAcc: 0, roundCount: 0 };
      ex.totalXp += r.score;
      ex.totalAcc += acc;
      ex.roundCount++;
      map.set(eraKey, ex);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b.totalXp - a.totalXp)
      .map(([eraKey, val]) => ({
        label: t(eraKey),
        avgAccuracy: Math.round(val.totalAcc / val.roundCount),
        totalXp: val.totalXp,
        roundCount: val.roundCount,
        icon: ERA_META[eraKey]?.icon,
        span: ERA_META[eraKey]?.span,
        stockImg: ERA_META[eraKey]?.stockImg,
      }));
  }, [myRoundResults, t]);

  const byWhere = useMemo(() => {
    const map = new Map<string, { totalXp: number; totalAcc: number; roundCount: number }>();
    for (const r of myRoundResults) {
      const region = ROUNDS[r.roundIndex].region ?? "unknown_region";
      const acc = (r.locationScore + r.timeScore) / 2;
      const ex = map.get(region) ?? { totalXp: 0, totalAcc: 0, roundCount: 0 };
      ex.totalXp += r.score;
      ex.totalAcc += acc;
      ex.roundCount++;
      map.set(region, ex);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b.totalXp - a.totalXp)
      .map(([regionKey, val]) => {
        const meta = REGION_META[regionKey];
        const i18nKey = `region_${regionKey.toLowerCase().replace(/\s+/g, "_")}`;
        return {
          label: meta ? t(i18nKey) : regionKey === "unknown_region" ? t("unknown_region") : regionKey,
          avgAccuracy: Math.round(val.totalAcc / val.roundCount),
          totalXp: val.totalXp,
          roundCount: val.roundCount,
          icon: meta?.icon,
          span: undefined,
          stockImg: meta?.stockImg,
        };
      });
  }, [myRoundResults, t]);

  const maxWhenXp = Math.max(...byWhen.map((i) => i.totalXp), 1);
  const maxWhereXp = Math.max(...byWhere.map((i) => i.totalXp), 1);

  // ── Rank title ──
  const rankInfo = rankForXp(TOTAL_XP_GLOBAL);
  const rankTitle = tRank(rankInfo.titleKey);
  const rankNextTitle = rankInfo.nextTitleKey ? tRank(rankInfo.nextTitleKey) : "";
  const rankImg = RANK_IMAGE[rankInfo.tier] ?? RANK_IMAGE[1];

  const progData = progTab === "when" ? byWhen : byWhere;
  const maxProgXp = progTab === "when" ? maxWhenXp : maxWhereXp;

  return (
    <main className={`app-shell ${pageStyles.pageShell}`}>
      <TopBar
        accuracy="88"
        xp={TOTAL_XP_GLOBAL.toLocaleString()}
        avatarUrl={null}
        initials="AL"
        onAvatarClick={() => setShowNavModal(true)}
      />
      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={null}
        initials="AL"
        displayName={nameOf(VIEWER_ID)}
      />
      <div className={pageStyles.bgImage} />
      <div className={styles.bgScrim} />
      <div className={pageStyles.pageContent}>
        <div className="shell-grid">
          <section className={styles.section}>
            {/* PROD: the real TopBar component above renders the global top bar.
                Do NOT render a second in-content top bar here — it duplicates the avatar/logo. */}
            <div className={styles.content}>
              {/* HERO SCORE CARD — banner (rank/XP/rounds) at top + accuracy ring + Where/When mini cards */}
              <div className={styles.heroCard}>
                <div className={styles.banner}>
                  <span className={styles.bannerKicker}>GAME COMPLETED</span>
                  <h1 className={styles.bannerTitle}>
                    You finished <span className={styles.bannerRank}>{myRank}{rankSuffix(myRank)}</span>
                  </h1>
                </div>
                <span className={styles.gameAccLabel}>Game Accuracy (%)</span>
                <div className={styles.heroTop}>
                  <div className={styles.accuracyRingWrap}>
                    <RainbowRing value={me.avgAccuracy} />
                  </div>
                  <div className={styles.totalXpRow}>
                    <span className={styles.totalXpVal}>+{me.totalScore.toLocaleString()} {t("xp_unit")}</span>
                  </div>
                </div>
                <div className={styles.miniCardsRow}>
                  <div className={styles.miniCard}>
                    <div className={styles.miniCardHead}>
                      <WhereIcon className={styles.miniCardIcon} size={16} style={{ color: "var(--gh-teal)" }} />
                      <span className={styles.miniCardTitle}>{t("where")}</span>
                    </div>
                    <MiniRing value={me.avgLocation} color={getAccuracyColor(me.avgLocation)} />
                    <div className={styles.miniXp}>
                      <span className={styles.miniXpVal}>+{Math.round(me.totalLocationScore)}</span>
                      <span className={styles.miniXpLabel}>{t("xp_unit")}</span>
                    </div>
                    <div className={styles.miniBadges} />
                  </div>
                  <div className={styles.miniCard}>
                    <div className={styles.miniCardHead}>
                      <WhenIcon className={styles.miniCardIcon} size={16} style={{ color: "var(--gh-violet)" }} />
                      <span className={styles.miniCardTitle}>{t("when")}</span>
                    </div>
                    <MiniRing value={me.avgTime} color={getAccuracyColor(me.avgTime)} />
                    <div className={styles.miniXp}>
                      <span className={styles.miniXpVal}>+{Math.round(me.totalYearScore)}</span>
                      <span className={styles.miniXpLabel}>{t("xp_unit")}</span>
                    </div>
                    <div className={styles.miniBadges} />
                  </div>
                </div>
              </div>

              {/* RESPONSIVE GRID ZONE — single column on mobile, multi-column on tablet/desktop */}
              <div className={styles.gridZone}>
              {/* FINAL RANKINGS */}
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{t("final_rankings")}</h2>
                </div>
                <div className={styles.ranks}>
                  {leaderboard.map((player, index) => {
                    const isMe = player.isMe;
                    return (
                      <div key={player.id} className={`${styles.rankRow} ${isMe ? styles.rankRowMe : ""}`}>
                        <span className={`${styles.medal} ${index === 0 ? styles.medalGold : index === 1 ? styles.medalSilver : index === 2 ? styles.medalBronze : ""}`}>
                          <span>{index + 1}</span>
                        </span>
                        <div className={styles.avatarWrap}>
                          <PlayerAvatar avatarUrl={null} displayName={player.name} playerId={player.id} size={38} />
                        </div>
                        <div className={styles.rankMain}>
                          <div className={styles.rankNameLine}>
                            <span className={styles.rankName}>{player.name}</span>
                            {isMe && <span className={styles.youTag}>{t("you")}</span>}
                          </div>
                          <div className={styles.bar}>
                            <div className={styles.barFill} style={{ width: `${Math.max(0, Math.min(100, player.avgAccuracy))}%` }} />
                          </div>
                        </div>
                        <div className={styles.rankScore}>
                          <span className={styles.rankAcc} style={{ color: getAccuracyColor(player.avgAccuracy) }}>
                            {player.avgAccuracy}<span className={styles.rankPctSuffix}>%</span>
                          </span>
                          <span className={styles.rankXp}>+{player.totalScore.toLocaleString()} {t("xp_unit")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* BEST PLAYER (was Top Performers) */}
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>Best player</h2>
                </div>
                <div className={styles.mvpList}>
                  {mvpAwards.map((award) => (
                    <div key={award.key} className={styles.mvpRow}>
                      <span className={`${styles.mvpDisk} ${award.diskCls}`}>
                        <award.Icon size={18} />
                      </span>
                      <span className={styles.mvpLabel}>{award.label}</span>
                      <span className={styles.mvpNames}>
                        {award.winners.map((w, i) => (
                          <span key={w.id} className={styles.mvpWinner}>
                            <span className={`${styles.mvpAvatarWrap} ${w.isMe ? styles.mvpAvatarMe : ""}`}>
                              <PlayerAvatar avatarUrl={null} displayName={w.name} playerId={w.id} size={24} />
                            </span>
                            <span className={styles.mvpName}>
                              {w.name}
                            </span>
                            <span className={styles.mvpValue} style={{ color: getAccuracyColor(award.getValue(w)) }}>
                              {award.getValue(w)}<AccuracySuffix />
                            </span>
                            {i < award.winners.length - 1 && <span className={styles.mvpAnd}> & </span>}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* BADGES CARD — only when at least one badge won */}
              {totalBadges > 0 && (
                <section className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.accentBar} />
                    <h2 className={styles.cardTitle}>{t("badges_won")}</h2>
                  </div>
                  <div className={styles.badgesBody}>
                    <div className={styles.badgeSummary}>
                      <div className={styles.badgeTally}>
                        {badgeCounts.combo > 0 && (
                          <span className={styles.badgeTallyItem}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/badges/combo_gold.webp" alt={t("combo_badges")} width={28} height={28} />
                            <span className={styles.badgeTallyCount}>{badgeCounts.combo}</span>
                            <span className={styles.badgeTallyTier}>{t("combo_badges")}</span>
                          </span>
                        )}
                        {badgeCounts.when > 0 && (
                          <span className={styles.badgeTallyItem}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/badges/year_gold.webp" alt={t("when_badges")} width={28} height={28} />
                            <span className={styles.badgeTallyCount}>{badgeCounts.when}</span>
                            <span className={styles.badgeTallyTier}>{t("when_badges")}</span>
                          </span>
                        )}
                        {badgeCounts.where > 0 && (
                          <span className={styles.badgeTallyItem}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/badges/location_gold.webp" alt={t("where_badges")} width={28} height={28} />
                            <span className={styles.badgeTallyCount}>{badgeCounts.where}</span>
                            <span className={styles.badgeTallyTier}>{t("where_badges")}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* STATS CARD */}
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>Stats</h2>
                </div>
                <div className={styles.statsGrid}>
                  <div className={styles.statTile}>
                    <span className={styles.statVal}>{wonRoundsByMe}</span>
                    <span className={styles.statLabel}>Rounds Won</span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statVal}>{formatDistance(me.avgDistanceKm, distanceUnit)}</span>
                    <span className={styles.statLabel}>Avg Distance Away</span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statVal}>{Math.round(me.avgYearDiff)}</span>
                    <span className={styles.statLabel}>Avg Years Off</span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statVal}>{me.bestRoundAccuracy}<AccuracySuffix /></span>
                    <span className={styles.statLabel}>Best Round %</span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statVal}>{me.bestYearAccuracy}<AccuracySuffix /></span>
                    <span className={styles.statLabel}>Best Year %</span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statVal}>{me.bestLocationAccuracy}<AccuracySuffix /></span>
                    <span className={styles.statLabel}>Best Location %</span>
                  </div>
                </div>
              </section>

              {/* EXPERIENCE — rank title at top, then when/where tabs */}
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>Experience</h2>
                </div>

                {/* RANK TITLE — at top of Experience card */}
                <div className={styles.rankCard}>
                  <div className={styles.rankMainRow}>
                    <div className={styles.rankMedallion}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={rankImg} alt={rankTitle} className={styles.rankMedImg} draggable={false} />
                      <span className={styles.rankMedTier}>T{rankInfo.tier}</span>
                    </div>
                    <div className={styles.rankBody}>
                      <div className={styles.rankHead}>
                        <div className={styles.rankTitleWrap}>
                          <h3 className={styles.rankTitle}>{rankTitle}</h3>
                          <span className={styles.rankSessionXp}>+{me.totalScore.toLocaleString()}XP</span>
                        </div>
                        <span className={styles.rankGlobalXp}>{TOTAL_XP_GLOBAL.toLocaleString()}XP</span>
                      </div>
                      <div className={styles.rankNextLine}>
                        <span className={styles.rankNextLabel}>{tRank("next_label")}</span>
                        <span className={styles.rankNextTitle}>
                          {rankInfo.isMaxRank ? tRank("max_rank") : rankNextTitle}
                        </span>
                        {!rankInfo.isMaxRank && (
                          <span className={styles.rankNextXp}>{rankInfo.xpToNext?.toLocaleString()} XP</span>
                        )}
                      </div>
                      <div className={styles.rankBarMain}>
                        <span className={styles.rankBarFillMain} style={{ width: `${rankInfo.progressPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.progTabs}>
                  <button
                    type="button"
                    className={`${styles.progTab} ${progTab === "when" ? styles.progTabActiveWhen : ""}`}
                    onClick={() => setProgTab("when")}
                  >
                    <WhenIcon size={14} /> {t("when")}
                  </button>
                  <button
                    type="button"
                    className={`${styles.progTab} ${progTab === "where" ? styles.progTabActiveWhere : ""}`}
                    onClick={() => setProgTab("where")}
                  >
                    <WhereIcon size={14} /> {t("where")}
                  </button>
                </div>
                <div className={styles.progList}>
                  {progData.length === 0 ? (
                    <div className={styles.dynamicStatement}>No data yet.</div>
                  ) : (
                    progData.map((item) => (
                      <div key={item.label} className={styles.progRow}>
                        {item.stockImg ? (
                          <span className={styles.progImage}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.stockImg} alt="" className={styles.progImageImg} />
                          </span>
                        ) : item.icon ? (
                          <span className={styles.progIcon}>{item.icon}</span>
                        ) : (
                          <span className={styles.progIcon} />
                        )}
                        <div className={styles.progLabelWrap}>
                          <div className={styles.progLabelHead}>
                            <span className={styles.progLabel}>{item.label}</span>
                            {item.span && <span className={styles.progSpan}>{item.span}</span>}
                          </div>
                          <div className={styles.progBar}>
                            <div
                              className={`${styles.progBarFill} ${progTab === "when" ? styles.progBarFillWhen : styles.progBarFillWhere}`}
                              style={{ width: `${(Math.round(item.totalXp / 10) / Math.round(maxProgXp / 10)) * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className={styles.progRight}>
                          <span className={styles.progXp}>+{Math.round(item.totalXp / 10).toLocaleString()} XP</span>
                          <span className={styles.progRounds}>
                            {item.roundCount} {item.roundCount === 1 ? "round" : "rounds"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{t("round_breakdown")}</h2>
                </div>
                <div className={styles.roundList}>
                  {ROUNDS.map((round, i) => {
                    const rs = roundStats(i);
                    const isCurrentBest = rs.bestPlayerId === VIEWER_ID;
                    const myRound = RESULTS.find((r) => r.roundIndex === i && r.playerId === VIEWER_ID);
                    const myRoundAcc = myRound ? Math.round((myRound.locationScore + myRound.timeScore) / 2) : null;
                    const open = openRounds.has(i);
                    return (
                      <div key={i} className={styles.roundItem}>
                        <button
                          type="button"
                          className={styles.roundTop}
                          onClick={() => setOpenRounds((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })}
                          aria-expanded={open}
                        >
                          <span className={styles.roundNum}>R{i + 1}</span>
                          <div className={styles.roundInfo}>
                            <span className={styles.roundTitle}>{round.title}</span>
                            <span className={styles.roundMeta}>{round.year} · {round.locationName}</span>
                          </div>
                          {myRoundAcc != null && (
                            <span className={styles.roundMyAcc} style={{ color: getAccuracyColor(myRoundAcc) }}>
                              {myRoundAcc}<AccuracySuffix />
                            </span>
                          )}
                          <span className={styles.chev} style={{ transform: open ? "rotate(90deg)" : "none" }}>›</span>
                        </button>
                        {open && (
                          <div className={styles.roundDetail}>
                            {round.imageUrl && (
                              <div className={styles.photo}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={toProxiedImageUrl(round.imageUrl) ?? ""}
                                  alt={round.title}
                                  onClick={() => { setViewerSrc(toProxiedImageUrl(round.imageUrl) ?? ""); setViewerAlt(round.title); }}
                                />
                              </div>
                            )}
                            <div className={styles.miniGrid}>
                              <div className={styles.miniTile}>
                                <span className={styles.miniVal} style={{ color: getAccuracyColor(rs.avgAccuracy) }}>
                                  {rs.avgAccuracy}<AccuracySuffix />
                                </span>
                                <span className={styles.miniLabel}>Total</span>
                                <span className={styles.miniSub}>{rs.totalScore.toLocaleString()} {t("xp_unit")}</span>
                              </div>
                              <div className={styles.miniTile}>
                                <span className={styles.miniVal} style={{ color: getAccuracyColor(rs.avgLocation) }}>
                                  {rs.avgLocation}<AccuracySuffix />
                                </span>
                                <span className={styles.miniLabelWhere}><WhereIcon size={14} className={styles.miniIconWhere} />{t("where")}</span>
                                <span className={styles.miniSub}>{t("distance_label", { distance: formatDistance(rs.avgDistanceKm, distanceUnit) })}</span>
                              </div>
                              <div className={styles.miniTile}>
                                <span className={styles.miniVal} style={{ color: getAccuracyColor(rs.avgTime) }}>
                                  {rs.avgTime}<AccuracySuffix />
                                </span>
                                <span className={styles.miniLabelWhen}><WhenIcon size={14} className={styles.miniIconWhen} />{t("when")}</span>
                                <span className={styles.miniSub}>{t("year_diff_label", { n: Math.round(rs.avgYearDiff) })}</span>
                              </div>
                            </div>
                            {rs.bestPlayerId && (
                              <div className={styles.bestRow}>
                                <span className={styles.bestLabel}>🏆 Best Player</span>
                                <span className={styles.bestPlayerRight}>
                                  <span className={`${styles.bestAvatarWrap} ${isCurrentBest ? styles.bestAvatarMe : ""}`}>
                                    <PlayerAvatar avatarUrl={null} displayName={nameOf(rs.bestPlayerId)} playerId={rs.bestPlayerId} size={24} />
                                  </span>
                                  <span className={`${styles.bestName} ${isCurrentBest ? styles.bestNameMe : ""}`}>
                                    {nameOf(rs.bestPlayerId)}
                                  </span>
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
              </div>{/* end gridZone */}

              <div className={styles.dockSpacer} />

              {/* BOTTOM CTA */}
              <div className={styles.cta}>
                <button type="button" className={styles.homeBtn}>Home</button>
                <button type="button" className={styles.playBtn}>Play Again</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {viewerSrc && (
        <FullscreenImageViewer src={viewerSrc} alt={viewerAlt} onClose={() => setViewerSrc(null)} />
      )}
    </main>
  );
}
