"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TIMER_MIN_SEC, TIMER_MAX_SEC } from "@/core/types";
import lobbyStyles from "@/components/compete/LobbySection.module.css";
import modalStyles from "./PracticeSettingsModal.module.css";

export type PracticeModalSettings = {
  roundTimerSec: number;
  selectedEras: string[];
  selectedRegions: string[];
  yearMin: number;
  yearMax: number;
};

type EraId = "ancient" | "medieval" | "earlymodern" | "modern" | "contemporary";
const ERAS: { id: EraId; label: string; span: string; icon: string; yearMin: number; yearMax: number }[] = [
  { id: "ancient",      label: "Ancient",       span: "-3000 – 476",  icon: "🏛️", yearMin: -3000, yearMax: 476  },
  { id: "medieval",     label: "Medieval",      span: "476 – 1492",   icon: "⚔️", yearMin: 476,   yearMax: 1492 },
  { id: "earlymodern",  label: "Early Modern",  span: "1492 – 1789",  icon: "⛵", yearMin: 1492,  yearMax: 1789 },
  { id: "modern",       label: "Modern",        span: "1789 – 1945",  icon: "🏭", yearMin: 1789,  yearMax: 1945 },
  { id: "contemporary", label: "Contemporary",  span: "1945 – 2025",  icon: "🚀", yearMin: 1945,  yearMax: new Date().getFullYear() },
];
const ALL_ERA_IDS = ERAS.map(e => e.id);

type RegionId = 'africa' | 'antarctica' | 'asia' | 'europe' | 'north_america' | 'oceania' | 'south_america';
const REGIONS: { id: RegionId; label: string; icon: string; continent: string }[] = [
  { id: 'africa',          label: 'Africa',          icon: '🌍', continent: 'Africa' },
  { id: 'antarctica',      label: 'Antarctica',      icon: '🧊', continent: 'Antarctica' },
  { id: 'asia',            label: 'Asia',            icon: '🏯', continent: 'Asia' },
  { id: 'europe',          label: 'Europe',          icon: '🏰', continent: 'Europe' },
  { id: 'north_america',   label: 'North America',   icon: '🗽', continent: 'North America' },
  { id: 'oceania',         label: 'Oceania',         icon: '🏝️', continent: 'Oceania' },
  { id: 'south_america',   label: 'South America',   icon: '🦜', continent: 'South America' },
];
const ALL_REGION_IDS = REGIONS.map(r => r.id);

function formatTimerDisplay(sec: number, offLabel: string): string {
  if (sec === 0) return offLabel;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function erasToYearRange(eras: Set<EraId>): { yearMin: number; yearMax: number } {
  const selected = ERAS.filter(e => eras.has(e.id));
  if (selected.length === 0) {
    return { yearMin: ERAS[0].yearMin, yearMax: ERAS[ERAS.length - 1].yearMax };
  }
  return {
    yearMin: Math.min(...selected.map(e => e.yearMin)),
    yearMax: Math.max(...selected.map(e => e.yearMax)),
  };
}

function yearsToEras(yearMin: number, yearMax: number): Set<EraId> {
  // Derive which eras overlap the given year range, for round-tripping prior settings.
  const result = new Set<EraId>();
  for (const era of ERAS) {
    if (era.yearMax >= yearMin && era.yearMin <= yearMax) {
      result.add(era.id);
    }
  }
  return result.size > 0 ? result : new Set(ALL_ERA_IDS);
}

interface PracticeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (settings: PracticeModalSettings) => void;
  initialSettings?: Partial<PracticeModalSettings>;
  busy?: boolean;
}

export function PracticeSettingsModal({
  isOpen,
  onClose,
  onStart,
  initialSettings,
  busy,
}: PracticeSettingsModalProps) {
  const t = useTranslations();
  const tGame = useTranslations("game");

  const [sliderValue, setSliderValue] = useState<number>(
    typeof initialSettings?.roundTimerSec === "number" ? initialSettings.roundTimerSec : 0
  );
  const [selectedEras, setSelectedEras] = useState<Set<EraId>>(() => {
    if (initialSettings?.selectedEras && initialSettings.selectedEras.length > 0) {
      return new Set(initialSettings.selectedEras as EraId[]);
    }
    if (typeof initialSettings?.yearMin === "number" && typeof initialSettings?.yearMax === "number") {
      return yearsToEras(initialSettings.yearMin, initialSettings.yearMax);
    }
    return new Set(ALL_ERA_IDS);
  });

  /* ── Region selection state — mirrors Compete > Lobby ── */
  // Empty selectedRegions (DB/input) means "all regions" (no filter).
  // Internally we hold a Set of all selected region ids.
  const continentsToRegionIds = (continents: string[]): Set<RegionId> => {
    if (!Array.isArray(continents) || continents.length === 0) {
      return new Set(ALL_REGION_IDS);
    }
    const ids = REGIONS.filter(r => continents.includes(r.continent)).map(r => r.id);
    return ids.length > 0 ? new Set(ids) : new Set(ALL_REGION_IDS);
  };

  const [selectedRegions, setSelectedRegions] = useState<Set<RegionId>>(() => {
    if (Array.isArray(initialSettings?.selectedRegions)) {
      return continentsToRegionIds(initialSettings.selectedRegions);
    }
    return new Set(ALL_REGION_IDS);
  });

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
    : REGIONS.filter(r => availableRegionContinents.includes(r.continent));

  // Re-initialise when the modal (re)opens with new initial settings.
  useEffect(() => {
    if (!isOpen) return;
    setSliderValue(typeof initialSettings?.roundTimerSec === "number" ? initialSettings.roundTimerSec : 0);
    if (initialSettings?.selectedEras && initialSettings.selectedEras.length > 0) {
      setSelectedEras(new Set(initialSettings.selectedEras as EraId[]));
    } else if (typeof initialSettings?.yearMin === "number" && typeof initialSettings?.yearMax === "number") {
      setSelectedEras(yearsToEras(initialSettings.yearMin, initialSettings.yearMax));
    } else {
      setSelectedEras(new Set(ALL_ERA_IDS));
    }
    setSelectedRegions(
      Array.isArray(initialSettings?.selectedRegions)
        ? continentsToRegionIds(initialSettings.selectedRegions)
        : new Set(ALL_REGION_IDS)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const allErasSelected = selectedEras.size === ALL_ERA_IDS.length;

  const { yearMin, yearMax } = useMemo(() => erasToYearRange(selectedEras), [selectedEras]);

  const toggleEra = (id: EraId) => {
    if (selectedEras.has(id) && selectedEras.size === 1) return;
    setSelectedEras(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllEras = () => {
    setSelectedEras(prev => (prev.size === ALL_ERA_IDS.length ? new Set<EraId>([ALL_ERA_IDS[0]]) : new Set(ALL_ERA_IDS)));
  };

  const toggleRegion = (id: RegionId) => {
    setSelectedRegions(prev => {
      if (prev.has(id) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allRegionsSelected = visibleRegions.every(r => selectedRegions.has(r.id));
  const toggleAllRegions = () => {
    if (allRegionsSelected) {
      const last = visibleRegions[visibleRegions.length - 1];
      if (last) setSelectedRegions(new Set([last.id]));
    } else {
      setSelectedRegions(new Set(visibleRegions.map(r => r.id)));
    }
  };

  if (!isOpen) return null;

  const handleStart = () => {
    const selectedContinents = REGIONS
      .filter(r => selectedRegions.has(r.id))
      .map(r => r.continent);
    const allVisibleSelected = visibleRegions.every(r => selectedRegions.has(r.id));
    onStart({
      roundTimerSec: sliderValue,
      selectedEras: [...selectedEras],
      selectedRegions: allVisibleSelected ? [] : selectedContinents,
      yearMin,
      yearMax,
    });
  };

  return (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true">
      <div className={modalStyles.backdrop} onClick={onClose} />
      <div className={modalStyles.card}>
        <div className={modalStyles.header}>
          <span className={lobbyStyles["lobby-accent-bar"]} />
          <h3>{t("lobby.game_settings")}</h3>
          <button type="button" className={modalStyles.closeBtn} onClick={onClose} aria-label={t("lobby.back")}>✕</button>
        </div>

        <div className={lobbyStyles["lobby-settings-grid"]}>
          {/* Round Timer — identical UIX to Compete > Lobby */}
          <div className={`${lobbyStyles["lobby-setting-item"]} ${lobbyStyles["lobbyRowWrap"]}`}>
            <span className={lobbyStyles["lobby-setting-label"]}>{t("lobby.round_timer")}</span>
            <span className={lobbyStyles["lobbyRowLeftWrap"]}>
              <button
                type="button"
                onClick={() => setSliderValue(v => (v > 0 ? 0 : 120))}
                disabled={busy}
                className={sliderValue > 0 ? lobbyStyles["lobbyToggleBtnOn"] : lobbyStyles["lobbyToggleBtnOff"]}
              >
                <span className={lobbyStyles["lobbyToggleKnob"]} style={{ left: sliderValue > 0 ? 22 : 2 }} />
              </button>
              {sliderValue > 0 ? (
                <span className={lobbyStyles["lobbyRowLeft"]}>
                  <span className={lobbyStyles["lobby-timer-slider-wrap"]}>
                    <div className={lobbyStyles["lobby-timer-slider-track"]} />
                    <div
                      className={lobbyStyles["lobby-timer-slider-fill"]}
                      style={{ width: `${((sliderValue - TIMER_MIN_SEC) / (TIMER_MAX_SEC - TIMER_MIN_SEC)) * 100}%` }}
                    />
                    <input
                      type="range"
                      className={lobbyStyles["lobby-timer-slider"]}
                      min={TIMER_MIN_SEC}
                      max={TIMER_MAX_SEC}
                      step={5}
                      value={sliderValue}
                      disabled={busy}
                      onChange={(e) => setSliderValue(Number(e.target.value))}
                    />
                  </span>
                  <span className={`${lobbyStyles["lobby-setting-value"]} ${lobbyStyles["lobbyNoWrap"]}`}>
                    {formatTimerDisplay(sliderValue, t("lobby.timer_off"))}
                  </span>
                </span>
              ) : (
                <span className={`${lobbyStyles["lobby-setting-value"]} ${lobbyStyles["lobbyNoWrap"]}`}>
                  {t("lobby.timer_off")}
                </span>
              )}
            </span>
          </div>

          {/* Era Presets — identical UIX to Compete > Lobby */}
          <div className={`${lobbyStyles["lobby-setting-item"]} ${lobbyStyles["lobbySettingRowBlock"]}`}>
            <div className={lobbyStyles["lobbySettingRowHead"]}>
              <span className={lobbyStyles["lobby-setting-label"]}>{tGame("era_presets")}</span>
              <button type="button" className={lobbyStyles["lobbySelectAllBtn"]} onClick={toggleAllEras}>
                {allErasSelected ? t("lobby.deselect_all") : t("lobby.select_all")}
              </button>
            </div>
            <div className={lobbyStyles["lobbyEraRail"]}>
              {ERAS.map(era => {
                const on = selectedEras.has(era.id);
                return (
                  <button
                    key={era.id}
                    data-era={era.id}
                    type="button"
                    className={`${lobbyStyles["lobbyEraBtn"]} ${on ? lobbyStyles["lobbyEraBtnOn"] : lobbyStyles["lobbyEraBtnOff"]}`}
                    onClick={() => toggleEra(era.id)}
                    aria-pressed={on}
                  >
                    <span className={lobbyStyles["lobbyEraLabel"]}>{tGame(`era_${era.id}` as string)}</span>
                    <span className={lobbyStyles["lobbyEraIcon"]}>{era.icon}</span>
                    <span className={lobbyStyles["lobbyEraSpan"]}>{era.span}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Region Presets — identical UIX to Compete > Lobby */}
          <div className={`${lobbyStyles["lobby-setting-item"]} ${lobbyStyles["lobbySettingRowBlock"]}`}>
            <div className={lobbyStyles["lobbySettingRowHead"]}>
              <span className={lobbyStyles["lobby-setting-label"]}>{tGame("region_presets")}</span>
              <button type="button" className={lobbyStyles["lobbySelectAllBtn"]} onClick={toggleAllRegions}>
                {allRegionsSelected ? t("lobby.deselect_all") : t("lobby.select_all")}
              </button>
            </div>
            <div className={lobbyStyles["lobbyEraRail"]}>
              {visibleRegions.map(region => {
                const on = selectedRegions.has(region.id);
                return (
                  <button
                    key={region.id}
                    data-era={region.id}
                    type="button"
                    className={`${lobbyStyles["lobbyEraBtn"]} ${on ? lobbyStyles["lobbyEraBtnOn"] : lobbyStyles["lobbyEraBtnOff"]}`}
                    onClick={() => toggleRegion(region.id)}
                    disabled={busy}
                    aria-pressed={on}
                  >
                    <span className={lobbyStyles["lobbyEraLabel"]}>{tGame(`region_${region.id}` as string)}</span>
                    <span className={lobbyStyles["lobbyEraIcon"]}>{region.icon}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <button type="button" className={modalStyles.startBtn} onClick={handleStart} disabled={busy}>
          {t("home.practice_start")}
        </button>
      </div>
    </div>
  );
}
