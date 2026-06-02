import { Badge, EventRecord, GuessState, LatLng, SessionSummary } from "./types";

const MAX_DISTANCE_KM = 20000;
const MAX_YEAR_DIFF = 200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(b.lat - a.lat);
  let dLng = toRad(b.lng - a.lng);
  if (dLng > Math.PI) dLng -= 2 * Math.PI;
  else if (dLng < -Math.PI) dLng += 2 * Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function getEventCoordinates(event: EventRecord): LatLng {
  const { lat, lng } = event.location;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("[GEO_HARD_FAIL] Invalid geo coordinates from API - location.lat or location.lng is not finite");
  }

  return { lat, lng };
}

export function calculateLocationAccuracy(distanceKm: number): number {
  return Math.round(clamp(100 * Math.exp(-distanceKm / 1500), 0, 100));
}

export function calculateYearAccuracy(yearDiff: number, eventYear: number): number {
  const CURRENT_YEAR = 2025;
  const age = Math.max(50, CURRENT_YEAR - eventYear);
  const eraScale = Math.sqrt(age / 50);
  const effectiveDiff = Math.abs(yearDiff) / eraScale;
  return Math.round(clamp(100 * Math.exp(-effectiveDiff / 40), 0, 100));
}

export function calculateBadges(round: Pick<import("./types").RoundResult, "yearAccuracy" | "locationAccuracy" | "comboAccuracy">): Badge[] {
  const getTier = (accuracy: number) => {
    if (accuracy === 100) return "gold" as const;
    if (accuracy >= 95) return "silver" as const;
    if (accuracy >= 90) return "bronze" as const;
    return null;
  };

  const badges: Badge[] = [];
  const locationTier = getTier(round.locationAccuracy);
  const yearTier = getTier(round.yearAccuracy);
  const comboTier = getTier(round.comboAccuracy);

  if (locationTier) {
    badges.push({ dimension: "location", tier: locationTier, accuracy: round.locationAccuracy });
  }
  if (yearTier) {
    badges.push({ dimension: "year", tier: yearTier, accuracy: round.yearAccuracy });
  }
  if (comboTier) {
    badges.push({ dimension: "combo", tier: comboTier, accuracy: round.comboAccuracy });
  }

  return badges;
}

export function evaluateNearMisses(
  yearAccuracy: number,
  locationAccuracy: number,
  comboAccuracy: number,
  badges: Badge[]
): { dimension: 'year' | 'location' | 'combo'; accuracy: number }[] {
  const hasBadge = (dim: string) => badges.some(b => b.dimension === dim);
  const isNearMiss = (acc: number) => acc >= 88 && acc <= 89;
  const result = [];
  if (!hasBadge('year') && isNearMiss(yearAccuracy))
    result.push({ dimension: 'year' as const, accuracy: yearAccuracy });
  if (!hasBadge('location') && isNearMiss(locationAccuracy))
    result.push({ dimension: 'location' as const, accuracy: locationAccuracy });
  if (!hasBadge('combo') && isNearMiss(comboAccuracy))
    result.push({ dimension: 'combo' as const, accuracy: comboAccuracy });
  return result;
}

export function evaluateRound(
  event: EventRecord,
  guess: GuessState,
  roundIndex: number,
  didTimeout = false,
  penaltyWhen: number = 0,
  penaltyWhere: number = 0
) {
  const fallbackGuess: GuessState = {
    year: guess.year,
    location: guess.location
  };

  if (fallbackGuess.year === null && fallbackGuess.location === null) {
    return {
      roundIndex,
      event,
      guess: fallbackGuess,
      distanceKm: 0,
      yearDiff: 0,
      yearAccuracy: 0,
      locationAccuracy: 0,
      comboAccuracy: 0,
      roundAccuracy: 0,
      roundXp: 0,
      badges: [] as Badge[],
      didTimeout
    };
  }

  const eventCoordinates = getEventCoordinates(event);

  const yearDiff = fallbackGuess.year === null ? MAX_YEAR_DIFF : fallbackGuess.year - event.year;
  const distanceKm = fallbackGuess.location === null ? MAX_DISTANCE_KM : haversineDistanceKm(fallbackGuess.location, eventCoordinates);

  const yearAccuracy = fallbackGuess.year === null
    ? 0
    : calculateYearAccuracy(yearDiff, event.year);
  const locationAccuracy = calculateLocationAccuracy(distanceKm);

  const yearAccuracyFinal   = Math.max(0, yearAccuracy - penaltyWhen);
  const locationAccuracyFinal = Math.max(0, locationAccuracy - penaltyWhere);
  const comboAccuracy = Math.min(yearAccuracyFinal, locationAccuracyFinal);
  const roundAccuracy = Math.round((yearAccuracyFinal + locationAccuracyFinal) / 2);
  const roundXp       = yearAccuracyFinal + locationAccuracyFinal;

  const result = {
    roundIndex,
    event,
    guess: fallbackGuess,
    distanceKm,
    yearDiff: Math.abs(yearDiff),
    yearAccuracy: yearAccuracyFinal,
    locationAccuracy: locationAccuracyFinal,
    comboAccuracy,
    roundAccuracy,
    roundXp,
    badges: [] as Badge[],
    didTimeout
  };

  result.badges = calculateBadges(result);
  return result;
}

export function summarizeRounds(rounds: Array<{ roundAccuracy: number; roundXp: number }>): SessionSummary {
  const totalRounds = rounds.length;
  const totalAccuracy = rounds.reduce((sum, round) => sum + round.roundAccuracy, 0);
  const totalXp = rounds.reduce((sum, round) => sum + round.roundXp, 0);

  return {
    totalRounds,
    totalAccuracy,
    totalXp,
    averageAccuracy: totalRounds === 0 ? 0 : Math.round(totalAccuracy / totalRounds)
  };
}
