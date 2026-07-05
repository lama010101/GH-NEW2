"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Rank Title Images
// Route: /prototype/rank-images   (direct access, self-contained)
//
// Lists all 10 rank titles (from src/core/rank.ts) with their related
// Unsplash images. Each card shows: rank tier number, title, XP threshold,
// icon name, and the associated image. Images are sourced from the local
// /images/era-region/ collection (originally downloaded from Unsplash).
//
// Rank titles mirror src/core/rank.ts RANKS array (single source of truth).
// ============================================================================

import React from "react";
import styles from "./rank-images.module.css";

// ── Rank model (mock copy of src/core/rank.ts) ──
type RankIconName =
  | "footprint"
  | "compass"
  | "trail"
  | "map"
  | "telescope"
  | "astrolabe"
  | "scroll"
  | "tome"
  | "owl"
  | "crown";

interface RankEntry {
  tier: number;
  title: string;
  titleKey: string;
  threshold: number;
  iconName: RankIconName;
  image: string;
  imageLabel: string;
  unsplashQuery: string;
}

// All 10 rank tiers mapped to a thematically-related image.
// Images are downloaded from Unsplash, compressed, and stored locally in
// /public/images/rank-titles/ (same approach as era-region preset images).
const RANKS: RankEntry[] = [
  {
    tier: 1,
    title: "Wanderer",
    titleKey: "rank_1",
    threshold: 0,
    iconName: "footprint",
    image: "/images/rank-titles/wanderer.jpg",
    imageLabel: "Lone traveler on a forest path",
    unsplashQuery: "person walking alone forest path",
  },
  {
    tier: 2,
    title: "Pathfinder",
    titleKey: "rank_2",
    threshold: 1_000,
    iconName: "compass",
    image: "/images/rank-titles/pathfinder.jpg",
    imageLabel: "Antique compass face showing directions",
    unsplashQuery: "antique compass navigation direction",
  },
  {
    tier: 3,
    title: "Trailblazer",
    titleKey: "rank_3",
    threshold: 5_000,
    iconName: "trail",
    image: "/images/rank-titles/trailblazer.jpg",
    imageLabel: "Hiker on a mountain trail towards a peak",
    unsplashQuery: "mountain trail hiking wilderness peak",
  },
  {
    tier: 4,
    title: "Cartographer",
    titleKey: "rank_4",
    threshold: 20_000,
    iconName: "map",
    image: "/images/rank-titles/cartographer.jpg",
    imageLabel: "Old world map showing continents and oceans",
    unsplashQuery: "vintage world map cartography old map",
  },
  {
    tier: 5,
    title: "Explorer",
    titleKey: "rank_5",
    threshold: 50_000,
    iconName: "telescope",
    image: "/images/rank-titles/explorer.jpg",
    imageLabel: "Telescope under the night sky with stars",
    unsplashQuery: "telescope night sky stars exploration",
  },
  {
    tier: 6,
    title: "Navigator",
    titleKey: "rank_6",
    threshold: 125_000,
    iconName: "astrolabe",
    image: "/images/rank-titles/navigator.jpg",
    imageLabel: "Milky way over mountain landscape at night",
    unsplashQuery: "milky way night sky stars navigation celestial",
  },
  {
    tier: 7,
    title: "Chronicler",
    titleKey: "rank_7",
    threshold: 300_000,
    iconName: "scroll",
    image: "/images/rank-titles/chronicler.jpg",
    imageLabel: "Ancient parchment map with intricate details",
    unsplashQuery: "ancient parchment manuscript scroll",
  },
  {
    tier: 8,
    title: "Historian",
    titleKey: "rank_8",
    threshold: 600_000,
    iconName: "tome",
    image: "/images/rank-titles/historian.jpg",
    imageLabel: "Shelf filled with old leather-bound books",
    unsplashQuery: "old library leather bound books tome",
  },
  {
    tier: 9,
    title: "Scholar",
    titleKey: "rank_9",
    threshold: 1_200_000,
    iconName: "owl",
    image: "/images/rank-titles/scholar.jpg",
    imageLabel: "Owl perched on a tree branch in a forest",
    unsplashQuery: "owl perched tree branch wisdom",
  },
  {
    tier: 10,
    title: "Cartographer Royal",
    titleKey: "rank_10",
    threshold: 2_500_000,
    iconName: "crown",
    image: "/images/rank-titles/cartographer_royal.jpg",
    imageLabel: "Royal golden crown displayed in a case",
    unsplashQuery: "golden crown royal majestic",
  },
];

const fmt = (n: number) => n.toLocaleString();

export default function RankImagesPage() {
  return (
    <>
      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #080c14; }
      `}</style>
      <main className={styles.screen}>
        {/* Proto bar */}
        <div className={styles.protoBar}>
          <span className={styles.protoTitle}>Rank Title Images</span>
          <div className={styles.protoLinks}>
            <a href="/prototype/home-list" className={styles.protoLink}>Home List</a>
            <a href="/prototype/home-icon-bg" className={styles.protoLink}>Icon BG</a>
            <a href="/prototype/home-grid" className={styles.protoLink}>Grid</a>
          </div>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>Rank Titles &amp; Images</h1>
          <p className={styles.headerSub}>
            All 10 rank tiers from <code className={styles.code}>src/core/rank.ts</code> with their
            thematically-matched Unsplash images.
          </p>
        </div>

        {/* Grid of rank cards */}
        <div className={styles.grid}>
          {RANKS.map((r) => (
            <div key={r.tier} className={styles.rankCard} data-tier={r.tier}>
              <div className={styles.cardImageWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.image}
                  alt={r.title}
                  className={styles.cardImage}
                  draggable={false}
                />
                <span className={styles.tierBadge}>T{r.tier}</span>
              </div>
              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>{r.title}</h2>
                <div className={styles.cardMeta}>
                  <span className={styles.metaItem}>
                    <span className={styles.metaLabel}>XP</span>
                    <span className={styles.metaVal}>{fmt(r.threshold)}</span>
                  </span>
                  <span className={styles.metaItem}>
                    <span className={styles.metaLabel}>Icon</span>
                    <span className={styles.metaVal}>{r.iconName}</span>
                  </span>
                </div>
                <div className={styles.cardImageLabel}>
                  <span className={styles.imgLabel}>Image:</span>
                  <span className={styles.imgVal}>{r.imageLabel}</span>
                </div>
                <div className={styles.cardUnsplash}>
                  <span className={styles.unsplashLabel}>Unsplash query:</span>
                  <code className={styles.unsplashQuery}>{r.unsplashQuery}</code>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
