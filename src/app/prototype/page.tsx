// ============================================================================
// PROTOTYPE INDEX — catalog of every /prototype/* page, grouped by theme
// Route: /prototype   (direct access, static server component)
//
// - Card = title + description + visual thumbnail + whole-card link that
//   opens the prototype in a new tab (target="_blank").
// - Visual language follows the prototype family: dark background image +
//   scrim, glass cards, gh-* design tokens, cyan (WHERE) / violet (WHEN)
//   / gold (XP) accents.
// - Self-contained: one file, no app imports beyond lucide icons.
//   Does NOT touch or modify any existing file.
// ============================================================================

import type { Metadata } from "next";
import {
  ArrowUpRight,
  Clock,
  Crown,
  Flag,
  FlaskConical,
  Home,
  Image as ImageIcon,
  Images,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  List,
  MapPin,
  Medal,
  PlusCircle,
  Rocket,
  Send,
  Sparkles,
  Trophy,
  User,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Prototypes · Guess History",
  description: "Index of every UI prototype in the app, grouped by theme.",
};

type ProtoItem = {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  tint: string;
  thumb?: string;
  fit?: "cover" | "contain";
};

type ProtoGroup = {
  label: string;
  blurb: string;
  items: ProtoItem[];
};

const GROUPS: ProtoGroup[] = [
  {
    label: "Home & Landing",
    blurb: "Entry points and home-screen mode-card explorations.",
    items: [
      {
        href: "/prototype/landing",
        title: "Landing V2",
        desc: "Animated, newbie-friendly landing built from real game components: Where/When cards, map, year picker, auth gate.",
        icon: Rocket,
        tint: "linear-gradient(135deg, #155e75 0%, #0ea5e9 100%)",
        thumb: "/prototype/landing/hero/hero-1.webp",
      },
      {
        href: "/prototype/home",
        title: "Home · Progress Hero",
        desc: "Prod home visual language plus a progress hero: accuracy ring, level badge + bar, stat strip, WHERE/WHEN breakdown.",
        icon: Home,
        tint: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
        thumb: "/desktop-home_background.webp",
      },
      {
        href: "/prototype/home-list",
        title: "Home · List Variant",
        desc: "Full-width compete card on top; daily / level-up / practice as wide horizontal rows with PLAY pill. 11 locales + RTL.",
        icon: List,
        tint: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
      },
      {
        href: "/prototype/home-grid",
        title: "Home · Grid Variant",
        desc: "Compete card on top; compact vertical mode cards in a grid below — centered icon, title, clamped desc, PLAY pill. i18n + RTL.",
        icon: LayoutGrid,
        tint: "linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)",
      },
      {
        href: "/prototype/home-icon-bg",
        title: "Home · Icon Watermark",
        desc: "Mode icon blended into each card gradient as a large corner watermark; play button centered over it. i18n + RTL.",
        icon: ImageIcon,
        tint: "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
      },
      {
        href: "/prototype/home-create-pill",
        title: "Home · Create Pill",
        desc: "Pixel copy of the prod home; the compete card's JOIN/CREATE CTAs are replaced by a single round plus-icon pill.",
        icon: PlusCircle,
        tint: "linear-gradient(135deg, #9f1239 0%, #f43f5e 100%)",
      },
      {
        href: "/prototype/home-v2",
        title: "Home · V2 — Journey & Daily",
        desc: "Responsive home focused on Your Journey (up-next stage, accuracy gate, tier path with badges, resume) and Daily (state-aware CTA, streak week strip, rank & countdown). Real desktop grid + container queries.",
        icon: Sparkles,
        tint: "linear-gradient(135deg, #3b0764 0%, #9333ea 100%)",
        thumb: "/icons/ranks/rank-02.png",
        fit: "contain",
      },
      {
        href: "/prototype/home-v3",
        title: "Home · V3 — Journey & Daily (Bento)",
        desc: "Bento dashboard: Journey route-map tile (badged waypoints, up-next panel), Daily countdown tile, streak / leaders / stats tiles. Grid-area responsive — daily-first on mobile, 8/4 + thirds on desktop.",
        icon: LayoutGrid,
        tint: "linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)",
        thumb: "/icons/ranks/rank-02.png",
        fit: "contain",
      },
    ],
  },
  {
    label: "Compete Lobby",
    blurb: "Pre-game room and game-settings treatments.",
    items: [
      {
        href: "/prototype/lobby",
        title: "Compete Lobby",
        desc: "1:1 mirror of the prod LobbySection — players, ready toggles, tabs, era/region rails, sliders — on local mock state.",
        icon: Users,
        tint: "linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)",
        thumb: "/desktop-home_background.webp",
      },
      {
        href: "/prototype/lobby-v2",
        title: "Compete Lobby · V2",
        desc: "Re-thought lobby UIX: room-code hero tiles, 8-slot roster with ready progress, invite rail, ANYTIME/LIVE pills, chip-stepper timers, photo era/region chips, sticky ready dock.",
        icon: Sparkles,
        tint: "linear-gradient(135deg, #7c2d12 0%, #e6502b 100%)",
        thumb: "/prototype/lobby-settings-images/ancient.jpg",
      },
      {
        href: "/prototype/lobby-v3",
        title: "Compete Lobby · V3",
        desc: "Prod lobby mirror + V2 UIX: v2-style ANYTIME/LIVE cards with prod icons, share-link tile in the invite rail, semi-transparent blurred ready dock, LIVE round timer defaults ON at 90s.",
        icon: Zap,
        tint: "linear-gradient(135deg, #155e75 0%, #22d3ee 100%)",
        thumb: "/icons/live_256.png",
        fit: "contain",
      },
      {
        href: "/prototype/lobby-settings-images",
        title: "Lobby Settings · Era & Region Images",
        desc: "Era/region pickers as photo-backed buttons fed by the /api/prototype/lobby-images DB route, with stock fallbacks.",
        icon: Images,
        tint: "linear-gradient(135deg, #44403c 0%, #78716c 100%)",
        thumb: "/prototype/lobby-settings-images/medieval.jpg",
      },
    ],
  },
  {
    label: "In-Round Gameplay",
    blurb: "What the player touches while guessing WHERE and WHEN.",
    items: [
      {
        href: "/prototype/guess-modal",
        title: "Merged Guess Modals",
        desc: "WHERE + WHEN bottom sheets on one screen, WHEN left of WHERE; drag-up expands the WHERE sheet with bottom search.",
        icon: MapPin,
        tint: "linear-gradient(135deg, #0369a1 0%, #22d3ee 100%)",
      },
      {
        href: "/prototype/when-timeline",
        title: "WHEN Timeline · 4 Players",
        desc: "Interactive year-timeline simulation — move your marker relative to three opponents' guesses.",
        icon: Clock,
        tint: "linear-gradient(135deg, #5b21b6 0%, #8b5cf6 100%)",
      },
      {
        href: "/prototype/submit-animations",
        title: "Submit CTA Animations",
        desc: "Five alternative attention animations for the ready-state submit button, plus hint-button nudge scenarios.",
        icon: Send,
        tint: "linear-gradient(135deg, #c2410c 0%, #fb923c 100%)",
      },
    ],
  },
  {
    label: "Results & Headers",
    blurb: "Round-complete, session-complete and top-section concepts.",
    items: [
      {
        href: "/prototype/round-results",
        title: "Round Results",
        desc: "Real prod RoundCompleteSection fed a deterministic mock session snapshot — prod pixels without WebSocket/DB.",
        icon: Flag,
        tint: "linear-gradient(135deg, #14532d 0%, #22c55e 100%)",
        thumb: "/badges/year_gold.webp",
        fit: "contain",
      },
      {
        href: "/prototype/final-results",
        title: "Final Results",
        desc: "Session-complete screen mirroring the prod results shell: rainbow ring, badges, XP + rank, per-player rows.",
        icon: Trophy,
        tint: "linear-gradient(135deg, #78350f 0%, #f0c060 100%)",
        thumb: "/badges/combo_gold.webp",
        fit: "contain",
      },
      {
        href: "/prototype/final-results-v2",
        title: "Final Results · V2",
        desc: "Re-thought session-complete flow: result moment with count-up ring + delta vs your average, session XP on the rank bar, standings with per-round pips, highlights, rounds carousel, sticky dock.",
        icon: Sparkles,
        tint: "linear-gradient(135deg, #7c2d12 0%, #fb923c 100%)",
        thumb: "/prototype/landing/hero/hero-2.webp",
      },
      {
        href: "/prototype/results-header-concepts",
        title: "Results Header Concepts",
        desc: "Three original top-section concepts for results screens: accuracy ring, XP, badge, WHERE/WHEN split.",
        icon: Layers,
        tint: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
        thumb: "/badges/location_gold.webp",
        fit: "contain",
      },
      {
        href: "/prototype/top-section-alternatives",
        title: "Top-Section Alternatives",
        desc: "Alternative header layouts — ring, XP, badge, WHERE/WHEN icons — for round and final results.",
        icon: LayoutTemplate,
        tint: "linear-gradient(135deg, #581c87 0%, #e879f9 100%)",
        thumb: "/badges/where.webp",
        fit: "contain",
      },
    ],
  },
  {
    label: "Rank & Progression",
    blurb: "Tier badges, XP ladders and rank-title imagery.",
    items: [
      {
        href: "/prototype/rank-badge-concepts",
        title: "Rank Tier Badges",
        desc: "Per-tier badges replace the medallion; global / WHERE / WHEN XP rendered as tier progress across three layouts.",
        icon: Medal,
        tint: "linear-gradient(135deg, #713f12 0%, #eab308 100%)",
      },
      {
        href: "/prototype/rank-card-concepts",
        title: "Progress Card · Dan Pips",
        desc: "Expandable Voyager card: main XP bar, WHERE/WHEN dan pips with title ladder, full 10-title list.",
        icon: Crown,
        tint: "linear-gradient(135deg, #4a044e 0%, #a21caf 100%)",
        thumb: "/images/rank-titles/explorer.jpg",
      },
      {
        href: "/prototype/rank-images",
        title: "Rank Title Images",
        desc: "All 10 rank titles with their imagery, XP thresholds and icon names from the rank model.",
        icon: ImageIcon,
        tint: "linear-gradient(135deg, #312e81 0%, #6366f1 100%)",
        thumb: "/images/rank-titles/chronicler.jpg",
      },
      {
        href: "/prototype/rank-badges-svg",
        title: "Rank Badges · SVG",
        desc: "Hand-drawn SVG tier badges (shield, metal rim, emblem, ribbon) — no photos; scales from 24px to 200px.",
        icon: Medal,
        tint: "linear-gradient(135deg, #78350f 0%, #f59e0b 100%)",
      },
    ],
  },
  {
    label: "Profile & Leaderboard",
    blurb: "Player identity and competitive standing surfaces.",
    items: [
      {
        href: "/prototype/leaderboard",
        title: "Leaderboard",
        desc: "Podium + ranked-list treatment with session / all-time / friends tabs.",
        icon: Crown,
        tint: "linear-gradient(135deg, #7c2d12 0%, #f97316 100%)",
      },
      {
        href: "/prototype/profile",
        title: "Profile",
        desc: "Improved profile UI: glass hero card, SVG accuracy ring, level bar, stat strip, WHERE/WHEN bars, badge shelf.",
        icon: User,
        tint: "linear-gradient(135deg, #164e63 0%, #06b6d4 100%)",
      },
      {
        href: "/prototype/profile-v2",
        title: "Profile · V2",
        desc: "Re-thought profile: avatar accuracy ring, rank+weekly XP strip, WHERE/WHEN skill split with errors and insights, sparkline stats, merged era/region matrix, public-view mode.",
        icon: Sparkles,
        tint: "linear-gradient(135deg, #164e63 0%, #22d3ee 100%)",
        thumb: "/images/rank-titles/cartographer.jpg",
      },
    ],
  },
];

const CSS = `
  .pidx {
    min-height: 100vh;
    color: var(--gh-text-primary, #fff);
    font-family: inherit;
  }
  .pidx::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -2;
    background: url("/desktop-home_background.webp") center / cover no-repeat;
  }
  .pidx::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background: linear-gradient(180deg, rgba(8, 12, 20, 0.80) 0%, rgba(8, 12, 20, 0.94) 100%);
  }
  .pidxWrap {
    max-width: 1200px;
    margin: 0 auto;
    padding: 36px clamp(16px, 4vw, 40px) 72px;
  }
  .pidxHead {
    margin-bottom: 36px;
  }
  .pidxKicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    border-radius: var(--gh-radius-pill, 999px);
    background: rgba(34, 211, 238, 0.10);
    border: 1px solid rgba(34, 211, 238, 0.35);
    color: var(--gh-teal, #22d3ee);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .pidxKicker svg {
    display: block;
  }
  .pidxHead h1 {
    margin: 14px 0 8px;
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .pidxHead p {
    margin: 0;
    color: var(--gh-text-secondary, rgba(255, 255, 255, 0.60));
    font-size: 14px;
    max-width: 640px;
    line-height: 1.55;
  }
  .pidxGroup {
    margin-top: 40px;
  }
  .pidxGroupHead {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pidxGroupHead h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gh-gold, #f0c060);
  }
  .pidxGroupHead .pidxCount {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: var(--gh-radius-pill, 999px);
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid var(--gh-border-default, rgba(255, 255, 255, 0.12));
    color: var(--gh-text-secondary, rgba(255, 255, 255, 0.60));
  }
  .pidxGroupBlurb {
    margin: 6px 0 18px;
    font-size: 13px;
    color: var(--gh-text-muted, rgba(255, 255, 255, 0.50));
  }
  .pidxGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 18px;
  }
  .pidxCard {
    display: flex;
    flex-direction: column;
    border-radius: var(--gh-glass-radius, 18px);
    background: var(--gh-glass-bg, linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03)));
    border: 1px solid var(--gh-glass-border, rgba(255,255,255,0.10));
    box-shadow: var(--gh-glass-shadow, 0 8px 30px rgba(0,0,0,0.35));
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition: transform 0.18s ease, border-color 0.18s ease;
  }
  .pidxCard:hover {
    transform: translateY(-3px);
    border-color: var(--gh-glass-border-hover, rgba(255,255,255,0.22));
  }
  .pidxThumb {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-bottom: 1px solid var(--gh-border-subtle, rgba(255,255,255,0.08));
  }
  .pidxThumbImg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.25s ease;
  }
  .pidxThumbImg.pidxContain {
    object-fit: contain;
    padding: 18px;
    filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.45));
  }
  .pidxCard:hover .pidxThumbImg {
    transform: scale(1.04);
  }
  .pidxThumbScrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(8, 12, 20, 0.05) 40%, rgba(8, 12, 20, 0.55) 100%);
  }
  .pidxThumbIcon {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: rgba(8, 12, 20, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #fff;
    backdrop-filter: blur(6px);
  }
  .pidxRoute {
    position: absolute;
    left: 12px;
    bottom: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5px;
    padding: 3px 9px;
    border-radius: var(--gh-radius-pill, 999px);
    background: rgba(8, 12, 20, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(6px);
  }
  .pidxBody {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 16px 14px;
    flex: 1;
  }
  .pidxBody h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }
  .pidxBody p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--gh-text-secondary, rgba(255, 255, 255, 0.60));
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex: 1;
  }
  .pidxOpen {
    align-self: flex-end;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
    padding: 4px 12px;
    border-radius: var(--gh-radius-pill, 999px);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--gh-teal, #22d3ee);
    border: 1px solid rgba(34, 211, 238, 0.35);
    background: rgba(34, 211, 238, 0.08);
    transition: background 0.18s ease;
  }
  .pidxCard:hover .pidxOpen {
    background: rgba(34, 211, 238, 0.18);
  }
  .pidxFoot {
    margin-top: 48px;
    font-size: 12px;
    color: var(--gh-text-muted, rgba(255, 255, 255, 0.50));
    text-align: center;
  }
`;

export default function PrototypeIndexPage() {
  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <main className="pidx">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pidxWrap">
        <header className="pidxHead">
          <span className="pidxKicker">
            <FlaskConical size={13} />
            Prototype Index
          </span>
          <h1>Prototypes</h1>
          <p>
            {total} self-contained UI explorations living under /prototype, grouped
            by theme. Every card opens its prototype in a new tab — no auth, no
            real data.
          </p>
        </header>

        {GROUPS.map((group) => (
          <section className="pidxGroup" key={group.label}>
            <div className="pidxGroupHead">
              <h2>{group.label}</h2>
              <span className="pidxCount">{group.items.length}</span>
            </div>
            <p className="pidxGroupBlurb">{group.blurb}</p>

            <div className="pidxGrid">
              {group.items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pidxCard"
                >
                  <div className="pidxThumb" style={{ background: item.tint }}>
                    {item.thumb && (
                      <img
                        src={item.thumb}
                        alt=""
                        className={
                          item.fit === "contain"
                            ? "pidxThumbImg pidxContain"
                            : "pidxThumbImg"
                        }
                      />
                    )}
                    <div className="pidxThumbScrim" />
                    <span className="pidxThumbIcon">
                      <item.icon size={17} strokeWidth={2.1} />
                    </span>
                    <span className="pidxRoute">{item.href}</span>
                  </div>
                  <div className="pidxBody">
                    <h3>{item.title}</h3>
                    <p>{item.desc}</p>
                    <span className="pidxOpen">
                      Open
                      <ArrowUpRight size={13} />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))}

        <p className="pidxFoot">
          Mock data only — prototypes never touch production state.
        </p>
      </div>
    </main>
  );
}
