"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Lobby > Game Settings: Era & Region image buttons
// Route: /prototype/lobby-settings-images   (direct access, self-contained)
//
// Two versions side-by-side:
//  V1 — STOCK IMAGES: curated Unsplash photos that perfectly represent each
//       era / region concept (Pyramids for Ancient, Carcassonne for Medieval,
//       Great Wall for Asia, Colosseum for Europe, etc.)
//  V2 — DB IMAGES: queries the Supabase `images` + `events` + `locations`
//       tables to pull a representative event image for each era (by year
//       range) and region (by continent). Falls back to stock if no DB image.
//
// Visual language: dark bg image + scrim, glass cards, gh-* design tokens,
// matching the prod lobby era/region rail but with photo-backed buttons.
//
// Does NOT touch or import any existing app files except supabaseBrowser
// (needed for V2 DB queries).
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import styles from "./lobby-settings-images.module.css";
import { supabaseBrowser } from "@/core/supabaseBrowser";

// ── Era / Region definitions (mirrors prod LobbySection.tsx) ──

type EraId = "ancient" | "medieval" | "earlymodern" | "modern" | "contemporary";

const ERAS: {
  id: EraId;
  label: string;
  span: string;
  yearMin: number;
  yearMax: number;
  stockImg: string;
  emoji: string;
}[] = [
  {
    id: "ancient",
    label: "Ancient",
    span: "-3000 – 476",
    yearMin: -3000,
    yearMax: 476,
    stockImg: "/prototype/lobby-settings-images/ancient.jpg",
    emoji: "🏛️",
  },
  {
    id: "medieval",
    label: "Medieval",
    span: "476 – 1492",
    yearMin: 476,
    yearMax: 1492,
    stockImg: "/prototype/lobby-settings-images/medieval.jpg",
    emoji: "⚔️",
  },
  {
    id: "earlymodern",
    label: "Early Modern",
    span: "1492 – 1789",
    yearMin: 1492,
    yearMax: 1789,
    stockImg: "/prototype/lobby-settings-images/earlymodern.jpg",
    emoji: "⛵",
  },
  {
    id: "modern",
    label: "Modern",
    span: "1789 – 1945",
    yearMin: 1789,
    yearMax: 1945,
    stockImg: "/prototype/lobby-settings-images/modern.jpg",
    emoji: "🏭",
  },
  {
    id: "contemporary",
    label: "Contemporary",
    span: "1945 – 2025",
    yearMin: 1945,
    yearMax: new Date().getFullYear(),
    stockImg: "/prototype/lobby-settings-images/contemporary.jpg",
    emoji: "🚀",
  },
];

type RegionId =
  | "africa"
  | "antarctica"
  | "asia"
  | "europe"
  | "north_america"
  | "oceania"
  | "south_america";

const REGIONS: {
  id: RegionId;
  label: string;
  continent: string;
  stockImg: string;
  emoji: string;
}[] = [
  {
    id: "africa",
    label: "Africa",
    continent: "Africa",
    stockImg: "/prototype/lobby-settings-images/africa.jpg",
    emoji: "🌍",
  },
  {
    id: "antarctica",
    label: "Antarctica",
    continent: "Antarctica",
    stockImg: "/prototype/lobby-settings-images/antarctica.jpg",
    emoji: "🧊",
  },
  {
    id: "asia",
    label: "Asia",
    continent: "Asia",
    stockImg: "/prototype/lobby-settings-images/asia.jpg",
    emoji: "🏯",
  },
  {
    id: "europe",
    label: "Europe",
    continent: "Europe",
    stockImg: "/prototype/lobby-settings-images/europe.jpg",
    emoji: "🏰",
  },
  {
    id: "north_america",
    label: "North America",
    continent: "North America",
    stockImg: "/prototype/lobby-settings-images/north_america.jpg",
    emoji: "🗽",
  },
  {
    id: "oceania",
    label: "Oceania",
    continent: "Oceania",
    stockImg: "/prototype/lobby-settings-images/oceania.jpg",
    emoji: "🏝️",
  },
  {
    id: "south_america",
    label: "South America",
    continent: "South America",
    stockImg: "/prototype/lobby-settings-images/south_america.jpg",
    emoji: "🦜",
  },
];

// ── DB image result types ──

type DbImageRow = {
  url: string;
  event_id: string;
  display_order: number | null;
};

type DbEventRow = {
  id: string;
  event_year: number;
};

type DbLocationRow = {
  event_id: string;
  continent: string | null;
};

type DbImageMap = {
  eras: Partial<Record<EraId, string>>;
  regions: Partial<Record<RegionId, string>>;
};

export default function LobbySettingsImagesPrototypePage() {
  const [selectedEras, setSelectedEras] = useState<Set<EraId>>(
    () => new Set(ERAS.map((e) => e.id))
  );
  const [selectedRegions, setSelectedRegions] = useState<Set<RegionId>>(
    () => new Set(REGIONS.map((r) => r.id))
  );

  // V2 DB image state
  const [dbImages, setDbImages] = useState<DbImageMap | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const toggleEra = useCallback((id: EraId) => {
    setSelectedEras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleRegion = useCallback((id: RegionId) => {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllEras = useCallback(() => {
    setSelectedEras((prev) =>
      prev.size === ERAS.length ? new Set() : new Set(ERAS.map((e) => e.id))
    );
  }, []);

  const toggleAllRegions = useCallback(() => {
    setSelectedRegions((prev) =>
      prev.size === REGIONS.length ? new Set() : new Set(REGIONS.map((r) => r.id))
    );
  }, []);

  // ── V2: Fetch representative DB images for each era & region ──
  const fetchDbImages = useCallback(async () => {
    setDbLoading(true);
    setDbError(null);
    try {
      // Fetch images (with event_id for joining)
      const { data: imgData, error: imgErr } = await supabaseBrowser
        .from("images")
        .select("url,event_id,display_order")
        .order("display_order", { ascending: true })
        .limit(500);

      if (imgErr) throw imgErr;

      // Fetch events (for year filtering)
      const { data: evData, error: evErr } = await supabaseBrowser
        .from("events")
        .select("id,event_year")
        .limit(500);

      if (evErr) throw evErr;

      // Fetch locations (for continent filtering)
      const { data: locData, error: locErr } = await supabaseBrowser
        .from("locations")
        .select("event_id,continent")
        .limit(500);

      if (locErr) throw locErr;

      const images = (imgData ?? []) as DbImageRow[];
      const events = (evData ?? []) as DbEventRow[];
      const locations = (locData ?? []) as DbLocationRow[];

      // Build lookup maps
      const eventYearMap = new Map<string, number>();
      for (const ev of events) eventYearMap.set(ev.id, ev.event_year);

      const eventContinentMap = new Map<string, string>();
      for (const loc of locations) {
        if (loc.continent) eventContinentMap.set(loc.event_id, loc.continent);
      }

      // Group images by event_id (first image per event = primary)
      const eventImageMap = new Map<string, string>();
      for (const img of images) {
        if (img.url && !eventImageMap.has(img.event_id)) {
          eventImageMap.set(img.event_id, img.url);
        }
      }

      // Pick representative image for each era (first image whose event year falls in range)
      const eraImages: Partial<Record<EraId, string>> = {};
      for (const era of ERAS) {
        for (const img of images) {
          const year = eventYearMap.get(img.event_id);
          if (
            year !== undefined &&
            year >= era.yearMin &&
            year <= era.yearMax &&
            img.url
          ) {
            eraImages[era.id] = img.url;
            break;
          }
        }
      }

      // Pick representative image for each region (first image whose event continent matches)
      const regionImages: Partial<Record<RegionId, string>> = {};
      for (const region of REGIONS) {
        for (const img of images) {
          const continent = eventContinentMap.get(img.event_id);
          if (continent === region.continent && img.url) {
            regionImages[region.id] = img.url;
            break;
          }
        }
      }

      setDbImages({ eras: eraImages, regions: regionImages });
    } catch (err) {
      setDbError(err instanceof Error ? err.message : "Failed to load DB images");
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDbImages();
  }, [fetchDbImages]);

  const allErasSelected = selectedEras.size === ERAS.length;
  const allRegionsSelected = selectedRegions.size === REGIONS.length;

  return (
    <main className={styles.screen}>
      {/* Proto bar */}
      <div className={styles.protoBar}>
        <span className={styles.protoTitle}>
          Lobby Settings — Image Era & Region Buttons
        </span>
        <span className={styles.protoHint}>Prototype · V1 stock / V2 DB</span>
      </div>

      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/home_background.webp"
        alt=""
        className={styles.bgImg}
        draggable={false}
      />
      <div className={styles.bgScrim} />

      <div className={styles.scroll}>
        <div className={styles.content}>
          {/* ── Header ── */}
          <header className={styles.header}>
            <h1 className={styles.title}>Game Settings</h1>
            <p className={styles.subtitle}>
              Era & Region preset buttons with real images
            </p>
          </header>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* VERSION 1 — STOCK IMAGES                                            */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <section className={styles.versionCard}>
            <div className={styles.versionHead}>
              <span className={styles.versionBadge}>V1</span>
              <div className={styles.versionInfo}>
                <h2 className={styles.versionTitle}>Stock Images</h2>
                <p className={styles.versionDesc}>
                  Curated Unsplash photos representing each concept
                </p>
              </div>
            </div>

            {/* Era presets */}
            <div className={styles.settingBlock}>
              <div className={styles.settingHead}>
                <span className={styles.settingLabel}>Era presets</span>
                <button
                  type="button"
                  className={styles.selectAllBtn}
                  onClick={toggleAllEras}
                >
                  {allErasSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className={styles.imageRail}>
                {ERAS.map((era) => {
                  const on = selectedEras.has(era.id);
                  return (
                    <ImageEraButton
                      key={era.id}
                      label={era.label}
                      span={era.span}
                      src={era.stockImg}
                      emoji={era.emoji}
                      selected={on}
                      onClick={() => toggleEra(era.id)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Region presets */}
            <div className={styles.settingBlock}>
              <div className={styles.settingHead}>
                <span className={styles.settingLabel}>Region presets</span>
                <button
                  type="button"
                  className={styles.selectAllBtn}
                  onClick={toggleAllRegions}
                >
                  {allRegionsSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className={styles.imageRail}>
                {REGIONS.map((region) => {
                  const on = selectedRegions.has(region.id);
                  return (
                    <ImageRegionButton
                      key={region.id}
                      label={region.label}
                      src={region.stockImg}
                      emoji={region.emoji}
                      selected={on}
                      onClick={() => toggleRegion(region.id)}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* VERSION 2 — DB IMAGES                                               */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <section className={styles.versionCard}>
            <div className={styles.versionHead}>
              <span className={styles.versionBadgeV2}>V2</span>
              <div className={styles.versionInfo}>
                <h2 className={styles.versionTitle}>DB Images</h2>
                <p className={styles.versionDesc}>
                  Pulled from Supabase events/images/locations tables
                </p>
              </div>
              <button
                type="button"
                className={styles.refreshBtn}
                onClick={fetchDbImages}
                disabled={dbLoading}
              >
                {dbLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {dbError && (
              <div className={styles.dbStatusError}>
                Error: {dbError}. Showing stock fallbacks.
              </div>
            )}
            {!dbError && dbLoading && (
              <div className={styles.dbStatusLoading}>
                Querying images, events, locations…
              </div>
            )}
            {!dbError && !dbLoading && dbImages && (
              <div className={styles.dbStatusOk}>
                Loaded{" "}
                {Object.keys(dbImages.eras).length +
                  Object.keys(dbImages.regions).length}{" "}
                DB images ·{" "}
                {ERAS.length +
                  REGIONS.length -
                  (Object.keys(dbImages.eras).length +
                    Object.keys(dbImages.regions).length)}{" "}
                stock fallbacks
              </div>
            )}

            {/* Era presets */}
            <div className={styles.settingBlock}>
              <div className={styles.settingHead}>
                <span className={styles.settingLabel}>Era presets</span>
                <button
                  type="button"
                  className={styles.selectAllBtn}
                  onClick={toggleAllEras}
                >
                  {allErasSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className={styles.imageRail}>
                {ERAS.map((era) => {
                  const on = selectedEras.has(era.id);
                  const dbUrl = dbImages?.eras[era.id];
                  return (
                    <ImageEraButton
                      key={era.id}
                      label={era.label}
                      span={era.span}
                      src={dbUrl ?? era.stockImg}
                      emoji={era.emoji}
                      selected={on}
                      onClick={() => toggleEra(era.id)}
                      isDb={!!dbUrl}
                    />
                  );
                })}
              </div>
            </div>

            {/* Region presets */}
            <div className={styles.settingBlock}>
              <div className={styles.settingHead}>
                <span className={styles.settingLabel}>Region presets</span>
                <button
                  type="button"
                  className={styles.selectAllBtn}
                  onClick={toggleAllRegions}
                >
                  {allRegionsSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className={styles.imageRail}>
                {REGIONS.map((region) => {
                  const on = selectedRegions.has(region.id);
                  const dbUrl = dbImages?.regions[region.id];
                  return (
                    <ImageRegionButton
                      key={region.id}
                      label={region.label}
                      src={dbUrl ?? region.stockImg}
                      emoji={region.emoji}
                      selected={on}
                      onClick={() => toggleRegion(region.id)}
                      isDb={!!dbUrl}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Legend ── */}
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <span className={styles.legendDotSelected} />
              Selected (on)
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDotOff} />
              Deselected (off)
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendBadgeDb}>DB</span>
              Image from Supabase
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendBadgeStock}>S</span>
              Stock fallback
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Image button sub-components ──

function ImageEraButton({
  label,
  span,
  src,
  emoji,
  selected,
  onClick,
  isDb,
}: {
  label: string;
  span: string;
  src: string;
  emoji: string;
  selected: boolean;
  onClick: () => void;
  isDb?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      className={`${styles.imgBtn} ${selected ? styles.imgBtnOn : styles.imgBtnOff}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className={styles.imgThumb}>
        {imgError ? (
          <div className={styles.imgFallback}>{emoji}</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={label}
            className={styles.imgPhoto}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
        <div className={styles.imgOverlay} />
        {isDb !== undefined && (
          <span
            className={`${styles.sourceBadge} ${
              isDb ? styles.sourceBadgeDb : styles.sourceBadgeStock
            }`}
          >
            {isDb ? "DB" : "S"}
          </span>
        )}
      </div>
      <span className={styles.imgLabel}>{label}</span>
      <span className={styles.imgSpan}>{span}</span>
    </button>
  );
}

function ImageRegionButton({
  label,
  src,
  emoji,
  selected,
  onClick,
  isDb,
}: {
  label: string;
  src: string;
  emoji: string;
  selected: boolean;
  onClick: () => void;
  isDb?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      className={`${styles.imgBtn} ${selected ? styles.imgBtnOn : styles.imgBtnOff}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className={styles.imgThumb}>
        {imgError ? (
          <div className={styles.imgFallback}>{emoji}</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={label}
            className={styles.imgPhoto}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
        <div className={styles.imgOverlay} />
        {isDb !== undefined && (
          <span
            className={`${styles.sourceBadge} ${
              isDb ? styles.sourceBadgeDb : styles.sourceBadgeStock
            }`}
          >
            {isDb ? "DB" : "S"}
          </span>
        )}
      </div>
      <span className={styles.imgLabel}>{label}</span>
    </button>
  );
}
