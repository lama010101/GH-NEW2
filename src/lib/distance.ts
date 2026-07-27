const LS_KEY = 'gh_distance_unit';
const MILE_REGIONS = new Set(['US', 'LR', 'MM']);
const KM_TO_MILES = 0.621371192;

export type DistanceUnit = 'km' | 'mi';

function mileRegionFromTag(tag: string): boolean {
  try {
    const Locale = (Intl as unknown as { Locale?: new (tag: string) => { region?: string } }).Locale;
    if (typeof Locale === 'function') {
      const locale = new Locale(tag);
      if (locale.region && MILE_REGIONS.has(locale.region.toUpperCase())) {
        return true;
      }
    }
  } catch {
    // fall through
  }

  const lower = tag.toLowerCase();
  if (lower === 'en-us') return true;
  const match = /^[a-z]{2}-([a-zA-Z]{2})$/.exec(lower);
  if (match && MILE_REGIONS.has(match[1].toUpperCase())) return true;
  return false;
}

export function getDistanceUnitPreference(): DistanceUnit {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(LS_KEY);
      if (saved === 'km' || saved === 'mi') return saved;
    } catch {
      // ignore
    }
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    if (mileRegionFromTag(navigator.language)) return 'mi';
  }

  return 'km';
}

export function setDistanceUnitPreference(unit: DistanceUnit): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_KEY, unit);
    } catch {
      // ignore
    }
  }
}

function roundDistance(raw: number): number {
  return raw < 10 ? Number(raw.toFixed(1)) : Math.round(raw);
}

export function formatDistance(
  distanceInKm: number | null | undefined,
  unit: DistanceUnit = 'km'
): string {
  if (distanceInKm == null || Number.isNaN(Number(distanceInKm))) return '—';
  const km = Number(distanceInKm);
  const raw = unit === 'mi' ? km * KM_TO_MILES : km;
  return `${roundDistance(raw)} ${unit}`;
}
