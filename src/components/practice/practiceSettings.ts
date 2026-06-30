export const PRACTICE_SETTINGS_KEY = "practice_settings";

export type PracticeSettings = {
  roundTimerSec: number;
  selectedEras: string[];
  yearMin: number;
  yearMax: number;
};

const ALL_ERAS = ["ancient", "medieval", "earlymodern", "modern", "contemporary"];
const CURRENT_YEAR = new Date().getFullYear();

export function loadPracticeSettings(): PracticeSettings {
  const fallback: PracticeSettings = {
    roundTimerSec: 0,
    selectedEras: [...ALL_ERAS],
    yearMin: -3000,
    yearMax: CURRENT_YEAR,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PRACTICE_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PracticeSettings>;
    return {
      roundTimerSec: typeof parsed.roundTimerSec === "number" ? parsed.roundTimerSec : fallback.roundTimerSec,
      selectedEras: Array.isArray(parsed.selectedEras) ? parsed.selectedEras : fallback.selectedEras,
      yearMin: typeof parsed.yearMin === "number" ? parsed.yearMin : fallback.yearMin,
      yearMax: typeof parsed.yearMax === "number" ? parsed.yearMax : fallback.yearMax,
    };
  } catch {
    return fallback;
  }
}

export function savePracticeSettings(settings: PracticeSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRACTICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
