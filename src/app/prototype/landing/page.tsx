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
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import WhenCard from "@/components/compete/WhenCard";
import { ERA_STOCK_IMAGES, REGION_STOCK_IMAGES } from "@/core/useEraRegionImages";
import { getAccuracyColor } from "@/core/accuracyColor";
import type { RoundResult } from "@/core/competeTypes";
import type { SessionPlayer } from "@/core/types";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import { YearPicker } from "@/components/YearPicker";
import { AuthModal } from "@/components/AuthModal";
import { useAuthGate } from "@/hooks/useAuthGate";
import styles from "./landing.module.css";

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

const HERO_IMAGES = [
  { src: "/prototype/landing/hero/hero-1.webp", label: "Hero 1" },
  { src: "/prototype/landing/hero/hero-2.webp", label: "Hero 2" },
  { src: "/prototype/landing/hero/hero-3.webp", label: "Hero 3" },
  { src: "/prototype/landing/hero/hero-5.webp", label: "Hero 5" },
  { src: "/prototype/landing/hero/hero-7.webp", label: "Hero 7" },
];

const PIPELINE = [
  { label: "Real event", desc: "A documented moment in history." },
  { label: "Research", desc: "Historians gather sources and facts." },
  { label: "AI paints", desc: "An AI creates the scene from the research." },
  { label: "Human check", desc: "Verified before it reaches you." },
];

const FUN_BADGES = [
  { src: "/badges/year_gold.webp", label: "Year" },
  { src: "/badges/location_gold.webp", label: "Location" },
  { src: "/badges/combo_gold.webp", label: "Combo" },
];

const RANK_PREVIEWS = [
  { key: "wanderer", title: "Wanderer" },
  { key: "pathfinder", title: "Pathfinder" },
  { key: "trailblazer", title: "Trailblazer" },
  { key: "cartographer", title: "Cartographer" },
  { key: "explorer", title: "Explorer" },
];

const AVATAR_PREVIEWS = [
  { name: "Albert Einstein", url: "https://im.runware.ai/image/ws/2/ii/28093021-6f59-4240-8ace-0a6e15f2672e.webp" },
  { name: "Marie Curie", url: "https://im.runware.ai/image/ws/2/ii/917583d3-87cd-4d55-a09d-7713a934180f.webp" },
  { name: "Nelson Mandela", url: "https://im.runware.ai/image/ws/2/ii/dc36c8d7-b0f9-4ea7-9f55-047909ed4bd5.webp" },
  { name: "Ada Lovelace", url: "https://im.runware.ai/image/ws/2/ii/46d4c144-2458-478d-bc8f-30737639e933.webp" },
  { name: "Amelia Earhart", url: "https://im.runware.ai/image/ws/2/ii/93cda3d3-b386-425b-8561-501d91868209.webp" },
  { name: "Charles Darwin", url: "https://im.runware.ai/image/ws/2/ii/13398bd8-f56e-4b34-ad8a-a0b97bad8543.webp" },
];

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

export default function LandingV2Prototype() {
  const [topbarSolid, setTopbarSolid] = useState(false);
  const [showTopbarExtras, setShowTopbarExtras] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
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

  const phaseTitle = ["A mysterious scene", "Drop a pin", "Pick a year", "Learn the story"][demoPhase];
  const phaseBody = [
    "No names. No dates. Just a picture from the past.",
    "Where on Earth do you think this happened?",
    "What year do you think this took place?",
    "The true event is revealed — and you earn XP for accuracy.",
  ][demoPhase];

  const eraPairs = useMemo(() => Object.entries(ERA_STOCK_IMAGES), []);
  const regionPairs = useMemo(() => Object.entries(REGION_STOCK_IMAGES), []);
  const doubleEras = useMemo(() => [...eraPairs, ...eraPairs], [eraPairs]);
  const doubleRegions = useMemo(() => [...regionPairs, ...regionPairs], [regionPairs]);

  return (
    <div className={styles.page}>
      <header
        ref={topbarRef}
        className={`${styles.topbar} ${topbarSolid ? styles.topbarSolid : ""} ${showTopbarExtras ? styles.topbarHasExtras : ""}`}
      >
        {showTopbarExtras && (
          <a className={styles.brand} href="#hero" aria-label="Back to top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt="Guess History" width={120} height={32} className={styles.brandImg} />
          </a>
        )}

        <nav className={styles.topnav} aria-label="Primary">
          <a href="#how" onClick={() => setMenuOpen(false)}>How to play</a>
          <a href="#ai" onClick={() => setMenuOpen(false)}>AI images</a>
          <a href="#explore" onClick={() => setMenuOpen(false)}>Explore</a>
          <a href="#fun" onClick={() => setMenuOpen(false)}>Why play</a>
        </nav>

        <button
          type="button"
          className={`${styles.hamburger} ${menuOpen ? styles.hamburgerOpen : ""}`}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
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
          aria-label="Primary"
        >
          <a href="#how" onClick={() => setMenuOpen(false)}>How to play</a>
          <a href="#ai" onClick={() => setMenuOpen(false)}>AI images</a>
          <a href="#explore" onClick={() => setMenuOpen(false)}>Explore</a>
          <a href="#fun" onClick={() => setMenuOpen(false)}>Why play</a>
        </nav>

        {showTopbarExtras && (
          <button
            type="button"
            onClick={() => requireAuth('/home')}
            className={`${styles.playNowBtn} ${styles.topbarCta}`}
          >
            Play Now
          </button>
        )}
      </header>

      {/* ── HERO ── */}
      <section className={styles.hero} id="hero" aria-label="Hero">
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
            <span className={styles.eyebrow}>Have fun. Learn history.</span>
          </p>
          <h1 ref={heroLogoRef} className={styles.heroLogo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt="Guess History" width={440} height={118} className={styles.heroLogoImg} />
          </h1>
          <p className={styles.heroSub}>Travel through time. Guess where and when.</p>
          <p className={styles.heroTagline}>
            A free game — look at a picture, guess the place and year, then learn the true story.
          </p>
          <button
            ref={heroCtaRef}
            type="button"
            onClick={() => requireAuth('/home')}
            className={`${styles.playNowBtn} ${styles.heroCta}`}
          >
            Play Now
          </button>
          <div className={styles.heroDots}>
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHeroIndex(i)}
                className={`${styles.heroDot} ${i === heroIndex ? styles.heroDotActive : ""}`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
        <div className={styles.scrollInd} aria-hidden="true">
          <span>Scroll</span>
          <span className={styles.mouse} />
        </div>
      </section>

      {/* ── HOW TO PLAY ── */}
      <section className={styles.sec} id="how" data-reveal="how">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.how ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>How to play</span>
            </p>
            <h2 className={styles.secHeadH2}>One scene. Three actions.</h2>
            <p className={styles.secHeadP}>Look at the picture. Guess where and when. Then learn the real story.</p>
          </div>

          <div className={`${styles.stepsRow} ${revealed.how ? styles.in : ""}`}>
            <div className={styles.stepCard}>
              <span className={styles.stepNum}>01</span>
              <h3 className={styles.stepTitle}>Look</h3>
              <p className={styles.stepDesc}>A mysterious scene appears. No names, no dates.</p>
            </div>
            <div className={styles.stepArrow} aria-hidden="true">→</div>
            <div className={styles.stepCard}>
              <span className={styles.stepNum}>02</span>
              <h3 className={styles.stepTitle}>Guess</h3>
              <p className={styles.stepDesc}>Drop a pin on the map and pick a year.</p>
            </div>
            <div className={styles.stepArrow} aria-hidden="true">→</div>
            <div className={styles.stepCard}>
              <span className={styles.stepNum}>03</span>
              <h3 className={styles.stepTitle}>Learn</h3>
              <p className={styles.stepDesc}>The event is revealed. Points go to the closest answers.</p>
            </div>
          </div>

          <div className={`${styles.demo} ${revealed.how ? styles.in : ""}`}>
            <div className={styles.demoCard}>
              <div className={styles.demoView}>
                {demoPhase === 0 && (
                  <div key={`see-${demoLoop}`} className={styles.demoScene}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/prototype/landing/berlinwall.webp" alt="Historical scene" className={styles.demoSceneImg} />
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
                    <p className={styles.demoWhereText}>You guess: Berlin</p>
                  </div>
                )}
                {demoPhase === 2 && (
                  <div key={`when-${demoLoop}`} className={styles.demoWhen}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/when.webp" alt="When" width={40} height={40} className={styles.demoWhenIcon} />
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
                    <p className={styles.demoWhenText}>You guess: {DEMO_YEAR_END}</p>
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
                      <p className={styles.demoRevealTitle}>Berlin Wall falls</p>
                      <p className={styles.demoRevealYear}>1989</p>
                      <div className={styles.demoRevealScore}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/badges/combo_gold.webp" alt="Gold badge" className={styles.demoBadge} />
                        <span className={styles.demoXp}>{demoXp} XP</span>
                      </div>
                      <p className={styles.demoFact}>A divided city reunited — the end of the Cold War began here.</p>
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
                    aria-label={`Phase ${p + 1}`}
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

      {/* ── REAL CARDS ── */}
      <section className={`${styles.sec} ${styles.how}`} id="cards" data-reveal="cards">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.cards ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>The real thing</span>
            </p>
            <h2 className={styles.secHeadH2}>How accurate can you be?</h2>
            <p className={styles.secHeadP}>After each round, players see exactly how close their where and when guesses were.</p>
          </div>

          <div className={`${styles.howCards} ${revealed.cards ? styles.in : ""}`}>
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

      {/* ── AI IMAGES ── */}
      <section className={`${styles.sec} ${styles.ai}`} id="ai" data-reveal="ai">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.ai ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>Painted by AI</span>
            </p>
            <h2 className={styles.secHeadH2}>Every image is an <span className={styles.orangeText}>AI reconstruction.</span></h2>
            <p className={styles.secHeadP}>No real photos. Each scene is generated by AI from real historical research, then checked by humans.</p>
          </div>

          <div className={`${styles.pipeline} ${revealed.ai ? styles.in : ""}`}>
            <div className={styles.pipeLine} aria-hidden="true">
              <span className={styles.pipeDot} />
            </div>
            {PIPELINE.map((node, i) => (
              <div key={node.label} className={styles.pipeNode}>
                <span className={styles.pipeRing}>{i + 1}</span>
                <h4 className={styles.pipeNodeH4}>{node.label}</h4>
                <p className={styles.pipeNodeP}>{node.desc}</p>
              </div>
            ))}
          </div>

          <div className={`${styles.aiNote} ${revealed.ai ? styles.in : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/when.webp" alt="" width={28} height={28} className={styles.aiNoteIcon} />
            <p>
              The illustrations help you imagine the moment, not replace primary sources.
            </p>
          </div>
        </div>
      </section>

      {/* ── EXPLORE ── */}
      <section className={`${styles.sec} ${styles.explore}`} id="explore" data-reveal="explore">
        <div className={styles.wrap}>
          <div className={`${styles.secHead} ${revealed.explore ? styles.in : ""}`}>
            <p className={styles.eyebrowCenter}>
              <span className={styles.eyebrow}>Explore all of history</span>
            </p>
            <h2 className={styles.secHeadH2}>5 eras. 6 regions.</h2>
            <p className={styles.secHeadP}>Pick an era or region to focus your investigation.</p>
          </div>

          <div className={`${styles.marqueeWrap} ${styles.erasWrap}`}>
            <p className={styles.marqueeLabel}>Eras</p>
            <div className={styles.marqueeTrack}>
              {doubleEras.map(([key, src], i) => (
                <div key={`${key}-${i}`} className={styles.marqueeCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={ERA_LABELS[key] ?? key} className={styles.marqueeImg} />
                  <span className={styles.marqueeOverlay} />
                  <span className={styles.marqueeText}>{ERA_LABELS[key] ?? key}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.marqueeWrap} ${styles.regionsWrap}`}>
            <p className={styles.marqueeLabel}>Regions</p>
            <div className={`${styles.marqueeTrack} ${styles.marqueeReverse}`}>
              {doubleRegions.map(([key, src], i) => (
                <div key={`${key}-${i}`} className={styles.marqueeCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={REGION_LABELS[key] ?? key} className={styles.marqueeImg} />
                  <span className={styles.marqueeOverlay} />
                  <span className={styles.marqueeText}>{REGION_LABELS[key] ?? key}</span>
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
              <span className={styles.eyebrow}>Have fun. Learn history.</span>
            </p>
            <h2 className={styles.secHeadH2}>Play. <span className={styles.orangeText}>Level up.</span> Learn a story.</h2>
            <p className={styles.secHeadP}>Earn XP, unlock rank titles, and collect badges for every kind of guess.</p>
          </div>

          <div className={`${styles.funGrid} ${revealed.fun ? styles.in : ""}`}>
            <div className={styles.funCard}>
              <h4 className={styles.funCardH4}>Badges</h4>
              <div className={styles.funBadges}>
                {FUN_BADGES.map(({ src, label }, i) => (
                  <div key={src} className={styles.funBadgeWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={label} className={styles.funBadge} style={{ animationDelay: `${i * 0.15}s` }} />
                    <span className={styles.funBadgeLabel}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.funCard}>
              <h4 className={styles.funCardH4}>Accuracy Tiers</h4>
              <div className={styles.tierRow}>
                {[
                  { label: "85%+", name: "Expert", color: "var(--gh-success)" },
                  { label: "60–84%", name: "Skilled", color: "var(--gh-gold)" },
                  { label: "40–59%", name: "Apprentice", color: "var(--gh-orange)" },
                  { label: "<40%", name: "Beginner", color: "var(--gh-danger)" },
                ].map((t) => (
                  <div key={t.name} className={styles.tier}>
                    <span className={styles.tierDot} style={{ background: t.color }} />
                    <span className={styles.tierLabel}>{t.label}</span>
                    <span className={styles.tierName}>{t.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.funCol}>
              <div className={styles.funCard}>
                <h4 className={styles.funCardH4}>Ranks</h4>
                <div className={styles.rankStrip}>
                  {RANK_PREVIEWS.map(({ key, title }) => (
                    <div key={key} className={styles.rankItem}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/images/rank-titles/${key}.jpg`} alt={title} className={styles.rankThumb} />
                      <span className={styles.rankTitle}>{title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${styles.xpBar} ${styles.xpCard} ${revealed.fun ? styles.in : ""}`}>
                <div className={styles.xpBarHead}>
                  <span className={styles.xpBarTitle}>Total XP</span>
                  <span className={styles.xpBarValue} style={{ color: getAccuracyColor(92) }}>1,840 / 5,000</span>
                </div>
                <div className={styles.xpBarTrack}>
                  <div className={styles.xpBarFill} style={{ width: "37%" }} />
                </div>
                <p className={styles.xpBarHint}>Keep playing to reach the next rank title.</p>
              </div>
            </div>

            <div className={styles.funCard}>
              <h4 className={styles.funCardH4}>Avatars</h4>
              <p className={styles.funCardDesc}>Play as a historical figure. These are the real avatars in the app.</p>
              <div className={styles.avatarStrip}>
                {AVATAR_PREVIEWS.map((a, i) => (
                  <div key={a.name} className={styles.avatarChip}>
                    <PlayerAvatar
                      avatarUrl={a.url}
                      displayName={a.name}
                      playerId={`preview-${i}`}
                      size={48}
                    />
                    <span className={styles.avatarName}>{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
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
            <span className={styles.eyebrow}>Ready when you are</span>
          </p>
          <h2 className={styles.finalH2}>Ready for your first trip through time?</h2>
          <p className={styles.finalP}>No download. No cost. Just curiosity.</p>
          <div className={styles.finalCtaRow}>
            <button
              type="button"
              onClick={() => requireAuth('/home')}
              className={`${styles.playNowBtn} ${styles.ctaBig}`}
            >
              <span className={styles.ctaPulse} />
              Play Now
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <p className={styles.footerDisc}>
          All event images are AI-generated reconstructions based on historical research. They are illustrations, not photographs.
        </p>
        <div className={styles.footerLinks}>
          <a href="#how">How to Play</a>
          <a href="#ai">AI Images</a>
          <a href="#explore">Explore</a>
          <a href="#fun">Why Play</a>
          <a href="/" onClick={(e) => { e.preventDefault(); requireAuth('/home'); }}>Play Now</a>
        </div>
        <p className={styles.footerCopy}>© {new Date().getFullYear()} Guess History</p>
      </footer>
      <AuthModal isOpen={isModalOpen} onClose={closeModal} required={false} />
    </div>
  );
}
