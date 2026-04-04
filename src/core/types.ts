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

export type HintType = "where" | "when" | "what";

export type EventHint = {
  id: string;
  level: number;
  type: HintType;
  text: string;
  distanceKm: number | null;
  timeDiffYears: number | null;
  penaltyBp: number; // Basis points: 1000 = 10%, max 10000 = 100%
};

export type EventRecord = {
  id: string;
  title: string;
  description: string;
  year: number;
  location: LatLng;
  locationName: string;
  region: string;
  imageUrl: string | null;
  thumbUrl: string | null;
  hints: EventHint[];
  category?: string;
  difficulty?: number;
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
  gameId: string;
  phase: GamePhase;
  preflightIssues: string[];
  currentRoundIndex: number;
  timeRemaining: number | null;
  events: EventRecord[];
  currentGuess: GuessState;
  roundResults: RoundResult[];
  penalty: PenaltyState;
  pendingSubmission: PendingSubmission | null;
  pendingRoundResult: RoundResult | null;
};
