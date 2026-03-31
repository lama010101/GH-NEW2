export const MAX_ROUNDS = 5;
export const REPEAT_PROTECTION_BUFFER = 500;
export const AUTOPAN_DURATION_SEC = 5;
export const TIMER_MIN_SEC = 5;
export const TIMER_MAX_SEC = 300;
export const HINT_TOTAL = 12;
export const MAX_HINT_PENALTY = 1;

export type GamePhase =
  | "INIT"
  | "PREFLIGHT_CHECK"
  | "READY"
  | "ROUND_START"
  | "ROUND_ACTIVE"
  | "ROUND_LOCK"
  | "ROUND_EVALUATE"
  | "ROUND_COMPLETE"
  | "SESSION_COMPLETE";
export type BadgeDimension = "location" | "year" | "combo";
export type BadgeTier = "gold" | "silver" | "bronze";

export type LatLng = {
  lat: number;
  lng: number;
};

export type EventRecord = {
  id: string;
  title: string;
  description: string;
  year: number;
  location: LatLng;
  region: string;
  imageLabel: string;
};

export type GuessState = {
  year: number | null;
  location: LatLng | null;
};

export type PenaltyState = {
  accuracy: number;
  xp: number;
};

export type PendingSubmission = {
  didTimeout: boolean;
};

export type Badge = {
  dimension: BadgeDimension;
  tier: BadgeTier;
  accuracy: number;
};

export type RoundResult = {
  roundIndex: number;
  event: EventRecord;
  guess: GuessState;
  distanceKm: number;
  yearDiff: number;
  yearAccuracy: number;
  locationAccuracy: number;
  comboAccuracy: number;
  roundAccuracy: number;
  roundXp: number;
  badges: Badge[];
  didTimeout: boolean;
};

export type SessionSummary = {
  totalRounds: number;
  totalAccuracy: number;
  totalXp: number;
  averageAccuracy: number;
};

export type PreflightResult = {
  passed: boolean;
  issues: string[];
};

export type GameState = {
  phase: GamePhase;
  preflightPassed: boolean;
  preflightIssues: string[];
  currentRoundIndex: number;
  timeRemaining: number | null;
  events: EventRecord[];
  currentGuess: GuessState;
  roundResults: RoundResult[];
  lastRoundResult: RoundResult | null;
  summary: SessionSummary | null;
  penalty: PenaltyState;
  pendingSubmission: PendingSubmission | null;
  pendingRoundResult: RoundResult | null;
};
