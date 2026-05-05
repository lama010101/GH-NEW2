import { Badge, EventRecord, GuessState, LatLng, MAX_HINT_PENALTY, SessionSummary } from "./types";

const MAX_DISTANCE_KM = 20000;
const MAX_YEAR_DIFF = 200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
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

export function calculateYearAccuracy(yearDiff: number): number {
  return Math.round(clamp(100 * Math.exp(-Math.abs(yearDiff) / 40), 0, 100));
}

export function calculateBadges(round: Pick<import("./types").RoundResult, "yearAccuracy" | "locationAccuracy" | "comboAccuracy">): Badge[] {
  const getTier = (accuracy: number) => {
    if (accuracy === 100) return "gold" as const;
    if (accuracy === 99) return "silver" as const;
    if (accuracy === 98) return "bronze" as const;
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

export function evaluateRound(event: EventRecord, guess: GuessState, roundIndex: number, didTimeout = false, penalty: { accuracy: number; xp: number } = { accuracy: 0, xp: 0 }) {
  const fallbackGuess: GuessState = {
    year: guess.year,
    location: guess.location
  };
  const eventCoordinates = getEventCoordinates(event);

  const yearDiff = fallbackGuess.year === null ? MAX_YEAR_DIFF : fallbackGuess.year - event.year;
  const distanceKm = fallbackGuess.location === null ? MAX_DISTANCE_KM : haversineDistanceKm(fallbackGuess.location, eventCoordinates);

  const yearAccuracy = calculateYearAccuracy(yearDiff);
  const locationAccuracy = calculateLocationAccuracy(distanceKm);
  const comboAccuracy = Math.floor((yearAccuracy + locationAccuracy) / 2);

  const rawRoundAccuracy = Math.floor((yearAccuracy + locationAccuracy) / 2);
  const rawRoundXp = Math.round(yearAccuracy + locationAccuracy);

  const roundAccuracy = Math.max(0, rawRoundAccuracy - Math.round(clamp(penalty.accuracy, 0, MAX_HINT_PENALTY * 100)));
  const roundXp = Math.max(0, rawRoundXp - Math.round(clamp(penalty.xp, 0, Number.MAX_SAFE_INTEGER)));

  const result = {
    roundIndex,
    event,
    guess: fallbackGuess,
    distanceKm,
    yearDiff: Math.abs(yearDiff),
    yearAccuracy,
    locationAccuracy,
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
