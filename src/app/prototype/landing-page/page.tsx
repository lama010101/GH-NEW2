"use client";

// ============================================================================
// LANDING PAGE PROTOTYPE — converted from static HTML to Next.js
// Route: /prototype/landing-page
//
// Uses REAL game components:
//   - WhereCard from @/components/compete/WhereCard
//   - WhenCard from @/components/compete/WhenCard
//   - MODE_CARD_GRADIENT / icons from @/components/home/types
//   - ERA_STOCK_IMAGES / REGION_STOCK_IMAGES from @/core/useEraRegionImages
//   - getAccuracyColor from @/core/accuracyColor
//   - RANKS from @/core/rank
//   - Real leaderboard data from /api/leaderboard
//
// Only modifies files inside /prototype.
// ============================================================================

import { useState, useEffect, useRef } from "react";
import WhereCard from "@/components/compete/WhereCard";
import WhenCard from "@/components/compete/WhenCard";
import { MODE_CARD_GRADIENT, MODE_CARD_TITLE, MODE_CARD_SUBTITLE, VERTICAL_CARD_ORDER, type Mode } from "@/components/home/types";
import { ERA_STOCK_IMAGES, REGION_STOCK_IMAGES } from "@/core/useEraRegionImages";
import { getAccuracyColor } from "@/core/accuracyColor";
import { RANKS } from "@/core/rank";
import type { RoundResult } from "@/core/competeTypes";
import type { SessionPlayer } from "@/core/types";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import styles from "./landing-page.module.css";

// ── Mock data for WhereCard + WhenCard (Fall of the Berlin Wall, 1989) ──
const CORRECT_LAT = 52.5163;
const CORRECT_LNG = 13.3777;
const CORRECT_NAME = "Berlin, Germany";
const CORRECT_YEAR = 1989;

const MOCK_PLAYERS: SessionPlayer[] = [
  {
    playerId: "p1",
    displayName: "Alex Rivera",
    joinedAt: "2024-01-01T00:00:00Z",
    leftAt: null,
    ready: true,
    isHost: true,
    avatarUrl: null,
    hasSubmitted: true,
  },
  {
    playerId: "p2",
    displayName: "Mina Kovač",
    joinedAt: "2024-01-01T00:00:00Z",
    leftAt: null,
    ready: true,
    isHost: false,
    avatarUrl: null,
    hasSubmitted: true,
  },
  {
    playerId: "p3",
    displayName: "Theo Lambert",
    joinedAt: "2024-01-01T00:00:00Z",
    leftAt: null,
    ready: true,
    isHost: false,
    avatarUrl: null,
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

// ── Era/region labels ──
const ERA_LABELS: Record<string, string> = {
  ancient: "Ancient",
  medieval: "Medieval",
  earlymodern: "Early Modern",
  modern: "Modern",
  contemporary: "Contemporary",
};

const REGION_LABELS: Record<string, string> = {
  africa: "Africa",
  asia: "Asia",
  europe: "Europe",
  north_america: "North America",
  south_america: "South America",
  oceania_antarctica: "Oceania & Antarctica",
};

// ── Pipeline nodes ──
const PIPE_NODES = [
  { title: "Historical Event", desc: "A documented moment.", icon: "M12 7v5l3 2" },
  { title: "Historical Research", desc: "Sources & archives.", icon: "M4 4h12a2 2 0 012 2v14H6a2 2 0 01-2-2V4z" },
  { title: "Prompt Engineering", desc: "Scene described precisely.", icon: "M12 3l2 5h5l-4 3 1.5 5L12 13l-4.5 3L9 11 5 8h5z" },
  { title: "AI Reconstruction", desc: "Image from research.", icon: "M4 6h16v12H4z" },
  { title: "Human Fact Check", desc: "Verified before release.", icon: "M9 12l2 2 4-4" },
];

// ── Leaderboard types ──
type LbRow = {
  rank: number;
  player_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avg_accuracy: number;
  total_xp: number;
};

const FALLBACK_ROWS: LbRow[] = [
  { rank: 1, player_id: "f1", display_name: "Devin Test", avatar_url: null, avg_accuracy: 100, total_xp: 999999 },
  { rank: 2, player_id: "f2", display_name: "Italo Calvino", avatar_url: null, avg_accuracy: 75, total_xp: 1365 },
  { rank: 3, player_id: "f3", display_name: "John Lennon", avatar_url: null, avg_accuracy: 66, total_xp: 1413 },
  { rank: 4, player_id: "f4", display_name: "Indira Gandhi", avatar_url: null, avg_accuracy: 65, total_xp: 5451 },
  { rank: 5, player_id: "f5", display_name: "Mahatma Gandhi", avatar_url: null, avg_accuracy: 64, total_xp: 871 },
];

// ── Mode card icon helper ──
function getModeIconSrc(mode: Mode): string {
  switch (mode) {
    case "compete": return "/icons/compete_large.webp";
    case "daily": return "/icons/daily_large.webp";
    case "levelup": return "/icons/levels_large.webp";
    case "practice": return "/icons/practice_large.webp";
    default: return "/icons/daily_large.webp";
  }
}

export default function LandingPagePrototype() {
  const [topbarSolid, setTopbarSolid] = useState(false);
  const [whereLbExpanded, setWhereLbExpanded] = useState(false);
  const [whereCluesExpanded, setWhereCluesExpanded] = useState(false);
  const [whenLbExpanded, setWhenLbExpanded] = useState(false);
  const [whenCluesExpanded, setWhenCluesExpanded] = useState(false);
  const [lbRows, setLbRows] = useState<LbRow[]>(FALLBACK_ROWS);
  const [lbOwnEntry, setLbOwnEntry] = useState<LbRow | null>(null);
  const [lbLoading, setLbLoading] = useState(true);
  const topbarRef = useRef<HTMLElement>(null);

  // Scroll handler
  useEffect(() => {
    const onScroll = () => {
      setTopbarSolid((window.scrollY || window.pageYOffset) > 40);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fetch real leaderboard data
  useEffect(() => {
    let cancelled = false;
    fetch("/api/leaderboard?tab=overall&filter=all")
      .then((res) => { if (!res.ok) throw new Error("auth"); return res.json(); })
      .then((data: { rows: LbRow[]; ownEntry: LbRow | null }) => {
        if (cancelled) return;
        if (data.rows && data.rows.length > 0) {
          setLbRows(data.rows);
          setLbOwnEntry(data.ownEntry ?? null);
        }
        setLbLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLbLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const maxAcc = Math.max(100, ...lbRows.map((r) => r.avg_accuracy));

  return (
    <div className={styles.page}>
      {/* ── TOP BAR ── */}
      <header
        ref={topbarRef}
        className={`${styles.topbar} ${topbarSolid ? styles.topbarSolid : ""}`}
      >
        <a className={styles.brand} href="#hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.webp" alt="Guess History logo" width={120} height={32} className={styles.brandImg} />
        </a>
        <nav className={styles.topnav} aria-label="Primary">
          <a href="#premise">Premise</a>
          <a href="#explore">Explore</a>
          <a href="#how">How to Play</a>
          <a href="#accuracy">Scoring</a>
          <a href="#trust">Trust</a>
          <a href="#compete">Compete</a>
          <a href="#play" className={styles.playNowBtn}>Play Now →</a>
        </nav>
      </header>

      {/* ── 1. HERO ── */}
      <section className={styles.hero} id="hero" aria-label="Hero">
        <div className={styles.heroBg} aria-hidden="true" />
        <div className={styles.heroInner}>
          <h1 className={styles.heroH1}>GUESS HISTORY</h1>
          <p className={styles.heroSub}>Where and when did it happen?</p>
          <p className={styles.heroTagline}>Learn History by guessing world events</p>
        </div>
        <div className={styles.scrollInd} aria-hidden="true">
          <span>Scroll</span>
          <span className={styles.mouse} />
        </div>
      </section>

      {/* ── 2. PREMISE ── */}
      <section className={styles.sec} id="premise" aria-label="The Premise">
        <div className={styles.secNum}>02 — The Premise</div>
        <div className={styles.wrap}>
          <div className={styles.premiseCopy}>
            <p className={styles.eyebrow} style={{ justifyContent: "center" }}>The Premise</p>
            <h2 className={styles.secHeadH2} style={{ marginTop: 18 }}>
              History becomes <span className={styles.orangeText}>a game.</span>
            </h2>
            <div className={styles.premiseLines}>
              <p className={styles.premiseLine}>Every round begins with a mysterious scene.</p>
              <p className={`${styles.premiseLine} ${styles.premiseLineMuted}`}>No names. No dates. No clues.</p>
              <p className={styles.premiseLine}>Just your curiosity.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. EXPLORE (real era/region preselect images) ── */}
      <section className={`${styles.sec} ${styles.explore}`} id="explore" aria-label="Explore all of history">
        <div className={styles.secNum}>03 — Explore</div>
        <div className={styles.wrap}>
          <div className={styles.secHead}>
            <p className={`${styles.eyebrow} ${styles.eyebrowCenter}`}>Explore all of history</p>
            <h2 className={styles.secHeadH2}>Every era. Every corner of the world.</h2>
            <p className={styles.secHeadP}>Pick an era or region to focus your investigation.</p>
          </div>

          <p className={styles.exploreSectionLabel}>ERAS</p>
          <div className={styles.exploreGrid}>
            {Object.entries(ERA_STOCK_IMAGES).map(([key, src]) => (
              <div key={key} className={styles.exploreCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={ERA_LABELS[key] ?? key} className={styles.exploreCardImg} loading="lazy" />
                <div className={styles.exploreCardOverlay} />
                <span className={styles.exploreCardLabel}>{ERA_LABELS[key] ?? key}</span>
              </div>
            ))}
          </div>

          <p className={styles.exploreSectionLabel}>REGIONS</p>
          <div className={styles.exploreGrid}>
            {Object.entries(REGION_STOCK_IMAGES).map(([key, src]) => (
              <div key={key} className={styles.exploreCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={REGION_LABELS[key] ?? key} className={styles.exploreCardImg} loading="lazy" />
                <div className={styles.exploreCardOverlay} />
                <span className={styles.exploreCardLabel}>{REGION_LABELS[key] ?? key}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. HOW YOU PLAY (real WhereCard + WhenCard) ── */}
      <section className={`${styles.sec} ${styles.how}`} id="how" aria-label="How you play">
        <div className={styles.secNum}>04 — How to Play</div>
        <div className={styles.wrap}>
          <div className={styles.secHead}>
            <p className={`${styles.eyebrow} ${styles.eyebrowCenter}`}>How you play</p>
            <h2 className={styles.secHeadH2}>One scene. Three questions.</h2>
            <p className={styles.secHeadP}>Real game components below — the same cards players see after each round.</p>
          </div>

          <div className={styles.howCards}>
            <p className={styles.howStepLabel}>STEP 01 — WHERE?</p>
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

            <p className={styles.howStepLabel}>STEP 02 — WHEN?</p>
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

            <p className={styles.howStepLabel}>STEP 03 — WHY?</p>
            <div className={styles.howWhyCard}>
              <h4>The Fall of the Berlin Wall</h4>
              <p>In 1989, crowds gathered at the Brandenburg Gate as the barrier dividing East and West Berlin was opened — a turning point that hastened German reunification and the end of the Cold War.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4b. HOME MODE CARDS (real gradients + icons) ── */}
      <section className={styles.modeCardsSection}>
        <div className={styles.wrap}>
          <div className={styles.secHead}>
            <p className={`${styles.eyebrow} ${styles.eyebrowCenter}`}>Game Modes</p>
            <h2 className={styles.secHeadH2}>Choose how to play.</h2>
          </div>
          <div className={styles.modeCardsGrid}>
            {VERTICAL_CARD_ORDER.map((mode) => (
              <div key={mode} className={styles.modeCard} style={{ background: MODE_CARD_GRADIENT[mode] }}>
                <div className={styles.modeCardInner}>
                  <div className={styles.modeCardIcon}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getModeIconSrc(mode)} alt="" className={styles.modeCardIconImg} draggable={false} />
                  </div>
                  <div className={styles.modeCardText}>
                    <h2 className={styles.modeCardTitle}>{MODE_CARD_TITLE[mode]}</h2>
                    <p className={styles.modeCardDesc}>{MODE_CARD_SUBTITLE[mode]}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. ACCURACY & SCORE ── */}
      <section className={styles.sec} id="accuracy" aria-label="Accuracy and scoring">
        <div className={styles.secNum}>05 — Scoring</div>
        <div className={styles.wrap}>
          <div className={styles.secHead}>
            <p className={`${styles.eyebrow} ${styles.eyebrowCenter}`}>How scoring works</p>
            <h2 className={styles.secHeadH2} style={{ whiteSpace: "normal" }}>Accuracy is everything.</h2>
            <p className={styles.secHeadP}>Every round rewards precision. The closer your guess, the higher your score. Your average accuracy across all rounds determines your rank.</p>
          </div>
          <div className={styles.scoreGrid}>
            <div className={styles.scoreCard}>
              <div className={`${styles.scoreIcon} ${styles.scoreIconWhere}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/where.webp" alt="" className={styles.scoreIconImg} />
              </div>
              <h3 className={styles.scoreCardH3}>Location Score</h3>
              <p className={styles.scoreVal}>up to 100 XP</p>
              <p className={styles.scoreDesc}>Earn 100 XP for a perfect pin drop. Score decays with distance from the actual place — down to 0 at 20,000 km.</p>
            </div>
            <div className={styles.scoreCard}>
              <div className={`${styles.scoreIcon} ${styles.scoreIconWhen}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/when.webp" alt="" className={styles.scoreIconImg} />
              </div>
              <h3 className={styles.scoreCardH3}>Year Score</h3>
              <p className={styles.scoreVal}>up to 100 XP</p>
              <p className={styles.scoreDesc}>Earn 100 XP for the exact year. Score decays with the difference from the actual year — down to 0 at 200 years off.</p>
            </div>
            <div className={styles.scoreCard}>
              <div className={`${styles.scoreIcon} ${styles.scoreIconTotal}`}>
                <span className={styles.scoreTotalNum}>200</span>
              </div>
              <h3 className={styles.scoreCardH3}>Total per Round</h3>
              <p className={styles.scoreVal}>up to 200 XP</p>
              <p className={styles.scoreDesc}>Location + Year = your round score. Hint penalties are subtracted after the round. Total XP accumulates across all games.</p>
            </div>
          </div>
          <div className={styles.accuracyTiers}>
            <h4 className={styles.accuracyTiersH4}>Average Accuracy Tiers</h4>
            <div className={styles.tierRow}>
              <div className={styles.tier} style={{ borderColor: "rgba(34,197,94,.4)" }}>
                <span className={styles.tierDot} style={{ background: "var(--gh-success)" }} />
                <span className={styles.tierLabel}>85%+</span>
                <span className={styles.tierName}>Expert</span>
              </div>
              <div className={styles.tier} style={{ borderColor: "rgba(240,192,96,.4)" }}>
                <span className={styles.tierDot} style={{ background: "var(--gh-gold)" }} />
                <span className={styles.tierLabel}>60–84%</span>
                <span className={styles.tierName}>Skilled</span>
              </div>
              <div className={styles.tier} style={{ borderColor: "rgba(251,146,60,.4)" }}>
                <span className={styles.tierDot} style={{ background: "var(--gh-orange)" }} />
                <span className={styles.tierLabel}>40–59%</span>
                <span className={styles.tierName}>Apprentice</span>
              </div>
              <div className={styles.tier} style={{ borderColor: "rgba(239,68,68,.4)" }}>
                <span className={styles.tierDot} style={{ background: "var(--gh-danger)" }} />
                <span className={styles.tierLabel}>&lt;40%</span>
                <span className={styles.tierName}>Beginner</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. TRUST PIPELINE ── */}
      <section className={styles.sec} id="trust" aria-label="Why you can trust it">
        <div className={styles.secNum}>06 — Trust</div>
        <div className={styles.wrap}>
          <div className={styles.secHead}>
            <p className={`${styles.eyebrow} ${styles.eyebrowCenter}`}>Why you can trust it</p>
            <h2 className={styles.secHeadH2}>Every image passes through <span className={styles.orangeText}>five gates.</span></h2>
            <p className={styles.secHeadP}>No scene is invented. Each one is reconstructed from research, then checked by humans before it reaches you.</p>
          </div>
          <div className={styles.pipeline}>
            <div className={styles.pipeLine} />
            {PIPE_NODES.map((node) => (
              <div key={node.title} className={styles.pipeNode}>
                <div className={styles.pipeRing}>
                  <svg className={styles.pipeRingSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    {node.icon === "M12 7v5l3 2" && <><circle cx="12" cy="12" r="9" /><path d={node.icon} /></>}
                    {node.icon === "M4 4h12a2 2 0 012 2v14H6a2 2 0 01-2-2V4z" && <><path d={node.icon} /><path d="M8 8h6M8 12h6M8 16h4" /></>}
                    {node.icon === "M12 3l2 5h5l-4 3 1.5 5L12 13l-4.5 3L9 11 5 8h5z" && <path d={node.icon} />}
                    {node.icon === "M4 6h16v12H4z" && <><rect x="4" y="6" width="16" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>}
                    {node.icon === "M9 12l2 2 4-4" && <><path d={node.icon} /><circle cx="12" cy="12" r="9" /></>}
                  </svg>
                </div>
                <h4 className={styles.pipeNodeH4}>{node.title}</h4>
                <p className={styles.pipeNodeP}>{node.desc}</p>
              </div>
            ))}
          </div>
          <p className={styles.trustCredits}>Historian and institution credits appear with each scene where available.</p>
        </div>
      </section>

      {/* ── 7. COMPETE (real leaderboard) ── */}
      <section className={styles.sec} id="compete" aria-label="Compete and progress">
        <div className={styles.secNum}>07 — Compete</div>
        <div className={styles.wrap}>
          <div className={styles.secHead}>
            <p className={`${styles.eyebrow} ${styles.eyebrowCenter}`}>Compete & progress</p>
            <h2 className={styles.secHeadH2}>History is <span className={styles.orangeText}>better together.</span></h2>
            <p className={styles.secHeadP}>Climb the leaderboard, earn badges, gain XP, and unlock titles as your instincts sharpen.</p>
          </div>
          <div className={styles.competeGrid}>
            {/* Real leaderboard */}
            <div className={styles.leaderboard}>
              <div className={styles.lbHead}>
                <h3 className={styles.lbHeadH3}>Top Performers</h3>
                <span className={styles.lbHeadTag}>Overall</span>
              </div>
              {lbLoading ? (
                <div className={styles.lbLoading}>Loading leaderboard…</div>
              ) : (
                lbRows.slice(0, 8).map((r, idx) => {
                  const isMe = lbOwnEntry?.player_id === r.player_id;
                  const acc = typeof r.avg_accuracy === "number" ? r.avg_accuracy : parseFloat(String(r.avg_accuracy)) || 0;
                  const barW = Math.round((acc / maxAcc) * 100);
                  return (
                    <div
                      key={r.player_id}
                      className={`${styles.lbRow} ${isMe ? styles.lbRowMe : ""} ${idx === lbRows.slice(0, 8).length - 1 ? styles.lbRowLast : ""}`}
                    >
                      <span className={styles.lbRank}>{r.rank}</span>
                      <PlayerAvatar
                        avatarUrl={r.avatar_url}
                        displayName={r.display_name ?? "Anonymous"}
                        size={36}
                      />
                      <span className={styles.lbName}>{r.display_name ?? "Anonymous"}</span>
                      <span className={styles.lbXp} style={{ color: getAccuracyColor(acc) }}>
                        {acc.toFixed(0)}% · {Number(r.total_xp).toLocaleString()} XP
                      </span>
                      <span className={styles.lbBar}>
                        <span className={styles.lbBarFill} style={{ width: `${barW}%` }} />
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Progress side */}
            <div className={styles.progressSide}>
              <div className={styles.progCard}>
                <h4 className={styles.progCardH4}>Rank Titles</h4>
                <div className={styles.titlesStrip}>
                  {RANKS.map((rank) => (
                    <span
                      key={rank.tier}
                      className={`${styles.titleChip} ${rank.tier === 8 ? styles.titleChipOn : ""}`}
                    >
                      {rank.tier === 1 && "Wanderer"}
                      {rank.tier === 2 && "Pathfinder"}
                      {rank.tier === 3 && "Trailblazer"}
                      {rank.tier === 4 && "Cartographer"}
                      {rank.tier === 5 && "Explorer"}
                      {rank.tier === 6 && "Navigator"}
                      {rank.tier === 7 && "Chronicler"}
                      {rank.tier === 8 && "Historian"}
                      {rank.tier === 9 && "Scholar"}
                      {rank.tier === 10 && "Cartographer Royal"}
                    </span>
                  ))}
                </div>
              </div>
              <div className={styles.progCard}>
                <h4 className={styles.progCardH4}>Achievement Badges</h4>
                <div className={styles.badgesRow}>
                  <div className={styles.badge}><img src="/badges/location_gold.webp" alt="Location gold" className={styles.badgeImg} /></div>
                  <div className={styles.badge}><img src="/badges/year_silver.webp" alt="Year silver" className={styles.badgeImg} /></div>
                  <div className={styles.badge}><img src="/badges/combo_bronze.webp" alt="Combo bronze" className={styles.badgeImg} /></div>
                  <div className={styles.badge}><img src="/badges/where.webp" alt="Where" className={styles.badgeImg} /></div>
                  <div className={styles.badge}><img src="/badges/when.webp" alt="When" className={styles.badgeImg} /></div>
                  <div className={`${styles.badge} ${styles.badgeLocked}`}><img src="/badges/location_silver.webp" alt="Locked" className={styles.badgeImg} /></div>
                  <div className={`${styles.badge} ${styles.badgeLocked}`}><img src="/badges/year_gold.webp" alt="Locked" className={styles.badgeImg} /></div>
                  <div className={`${styles.badge} ${styles.badgeLocked}`}><img src="/badges/combo_gold.webp" alt="Locked" className={styles.badgeImg} /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. FINAL CTA ── */}
      <section className={styles.final} id="play" aria-label="Play now">
        <div className={styles.finalBg}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/era-region/medieval.jpg" alt="" className={styles.finalBgImg} />
        </div>
        <div className={styles.finalInner}>
          <p className={`${styles.eyebrow} ${styles.eyebrowCenter}`}>Ready when you are</p>
          <h2 className={styles.finalH2}>Ready to test your <span className={styles.orangeText}>history instincts?</span></h2>
          <p className={styles.finalP}>No download. No cost. Just curiosity.</p>
          <div className={styles.finalCtaRow}>
            <a href="#play" className={styles.playNowBtn}>Play Now →</a>
            <a href="#hero" className={styles.btnOutline}>Watch Trailer</a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <p className={styles.footerDisc}>AI-generated historical reconstructions based on verified historical research. Images are illustrative reconstructions, not primary-source photographs.</p>
        <div className={styles.footerLinks}>
          <a href="#premise">Premise</a>
          <a href="#how">How to Play</a>
          <a href="#accuracy">Scoring</a>
          <a href="#trust">Trust</a>
          <a href="#compete">Compete</a>
          <a href="#play">Play Now</a>
        </div>
        <p className={styles.footerCopy}>© {new Date().getFullYear()} Guess History — guess-history.com</p>
      </footer>
    </div>
  );
}
