"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Lobby > Game Settings: Era & Region image buttons
// Route: /prototype/lobby-settings-images   (direct access, self-contained)
//
// DB IMAGES: fetches from /api/prototype/lobby-images (server-side route
//   that queries the `images` + `events` + `locations` tables via dbPool,
//   bypassing RLS). Falls back to local stock images when no DB image
//   is available.
//
// Visual language: dark bg image + scrim, glass cards, gh-* design tokens,
// matching the prod lobby era/region rail but with photo-backed buttons.
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import styles from "./lobby-settings-images.module.css";

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
  | "asia"
  | "europe"
  | "north_america"
  | "south_america"
  | "oceania_antarctica";

const REGIONS: {
  id: RegionId;
  label: string;
  continents: string[];
  stockImg: string;
  emoji: string;
}[] = [
  {
    id: "africa",
    label: "Africa",
    continents: ["Africa"],
    stockImg: "/prototype/lobby-settings-images/africa.jpg",
    emoji: "🌍",
  },
  {
    id: "asia",
    label: "Asia",
    continents: ["Asia"],
    stockImg: "/prototype/lobby-settings-images/asia.jpg",
    emoji: "🏯",
  },
  {
    id: "europe",
    label: "Europe",
    continents: ["Europe"],
    stockImg: "/prototype/lobby-settings-images/europe.jpg",
    emoji: "🏰",
  },
  {
    id: "north_america",
    label: "North America",
    continents: ["North America"],
    stockImg: "/prototype/lobby-settings-images/north_america.jpg",
    emoji: "🗽",
  },
  {
    id: "south_america",
    label: "South America",
    continents: ["South America"],
    stockImg: "/prototype/lobby-settings-images/south_america.jpg",
    emoji: "🦜",
  },
  {
    id: "oceania_antarctica",
    label: "Oceania & Antarctica",
    continents: ["Oceania", "Antarctica"],
    stockImg: "/prototype/lobby-settings-images/oceania_antarctica.jpg",
    emoji: "🏝️",
  },
];

// ── DB image result types ──

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

  // DB image state
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

  // ── Fetch representative DB images for each era & region ──
  const fetchDbImages = useCallback(async () => {
    setDbLoading(true);
    setDbError(null);
    try {
      const res = await fetch("/api/prototype/lobby-images");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        eras: Record<string, string>;
        regions: Record<string, string>;
      };
      setDbImages({
        eras: data.eras as Partial<Record<EraId, string>>,
        regions: data.regions as Partial<Record<RegionId, string>>,
      });
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
        <span className={styles.protoHint}>Prototype · DB images</span>
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
          {/* DB IMAGES                                                            */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <section className={styles.versionCard}>
            <div className={styles.versionHead}>
              <span className={styles.versionBadgeV2}>DB</span>
              <div className={styles.versionInfo}>
                <h2 className={styles.versionTitle}>Event Images</h2>
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
                Error: {dbError}. Showing fallback images.
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
                fallbacks
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
                      dbUrl={dbUrl}
                      stockImg={era.stockImg}
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
                  const dbUrl = dbImages?.regions[region.id];
                  return (
                    <ImageRegionButton
                      key={region.id}
                      label={region.label}
                      dbUrl={dbUrl}
                      stockImg={region.stockImg}
                      emoji={region.emoji}
                      selected={on}
                      onClick={() => toggleRegion(region.id)}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

// ── Image button sub-components ──

function ImageEraButton({
  label,
  span,
  dbUrl,
  stockImg,
  emoji,
  selected,
  onClick,
}: {
  label: string;
  span: string;
  dbUrl?: string;
  stockImg: string;
  emoji: string;
  selected: boolean;
  onClick: () => void;
}) {
  // Try DB url → stock image → emoji fallback
  const [src, setSrc] = useState<string | null>(dbUrl ?? stockImg ?? null);

  // Reset when dbUrl changes (e.g. after refresh)
  useEffect(() => {
    setSrc(dbUrl ?? stockImg ?? null);
  }, [dbUrl, stockImg]);

  return (
    <button
      type="button"
      className={`${styles.imgBtn} ${selected ? styles.imgBtnOn : styles.imgBtnOff}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          className={styles.imgPhoto}
          loading="lazy"
          onError={() => {
            if (src !== stockImg) setSrc(stockImg);
            else setSrc(null);
          }}
        />
      ) : (
        <div className={styles.imgFallback}>{emoji}</div>
      )}
      <div className={styles.imgOverlay} />
      <div className={styles.imgCaption}>
        <span className={styles.imgLabel}>{label}</span>
        <span className={styles.imgSpan}>{span}</span>
      </div>
    </button>
  );
}

function ImageRegionButton({
  label,
  dbUrl,
  stockImg,
  emoji,
  selected,
  onClick,
}: {
  label: string;
  dbUrl?: string;
  stockImg: string;
  emoji: string;
  selected: boolean;
  onClick: () => void;
}) {
  const [src, setSrc] = useState<string | null>(dbUrl ?? stockImg ?? null);

  useEffect(() => {
    setSrc(dbUrl ?? stockImg ?? null);
  }, [dbUrl, stockImg]);

  return (
    <button
      type="button"
      className={`${styles.imgBtn} ${selected ? styles.imgBtnOn : styles.imgBtnOff}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          className={styles.imgPhoto}
          loading="lazy"
          onError={() => {
            if (src !== stockImg) setSrc(stockImg);
            else setSrc(null);
          }}
        />
      ) : (
        <div className={styles.imgFallback}>{emoji}</div>
      )}
      <div className={styles.imgOverlay} />
      <div className={styles.imgCaption}>
        <span className={styles.imgLabel}>{label}</span>
      </div>
    </button>
  );
}
