import type { TransitionCause } from "./transitionCause";

export const MAX_ROUNDS = 5;
export const REPEAT_PROTECTION_BUFFER = 500;
export const AUTOPAN_DURATION_SEC = 5;
export const TIMER_MIN_SEC = 5;
export const TIMER_MAX_SEC = 300;
export const HINT_TOTAL = 12;
export const MAX_HINT_PENALTY = 1;

export type SessionMode = "practice" | "sync" | "async";
export type SessionStatus = "LOBBY" | "ROUND_ACTIVE" | "ROUND_COMPLETE" | "SESSION_COMPLETE";

export type GamePhase =
  | "INIT"
  | "PREFLIGHT_CHECK"
  | "READY"
  | "ROUND_START"
  | "ROUND_ACTIVE"
  | "ROUND_LOCK"
  | "ROUND_COMPLETE"
  | "SESSION_COMPLETE";
export type BadgeDimension = "location" | "year" | "combo";
export type BadgeTier = "gold" | "silver" | "bronze";

export type Location = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

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
  location: Location;
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

export type SessionPlayer = {
  playerId: string;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
  ready: boolean;
  isHost: boolean;
  /**
   * Derived per snapshot: true iff a row exists in round_commits for
   * (game_id, player_id, currentRoundIndex). NOT stored in session_players.
   */
  hasSubmitted: boolean;
};

export type SessionConfig = {
  mode: SessionMode;
  roundTimerSec: number;
  totalRounds: number;
  yearMin: number;
  yearMax: number;
  hostPlayerId: string | null;
  sessionDeadline: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type RoundLockMeta = {
  didTimeout: boolean;
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
  roundLockMeta?: RoundLockMeta;
  sessionConfig?: SessionConfig;
  sessionPlayers?: SessionPlayer[];
  viewerPlayerId?: string | null;
  /**
   * Integrity hash for detecting state corruption.
   * Computed from critical fields to detect tampering.
   */
  stateIntegrityHash?: string;
  /**
   * Flag to explicitly allow loading corrupted state (requires dev acknowledgment).
   * When true, integrity violations are logged but not thrown.
   */
  _allowCorruptedState?: boolean;
};

export type CompeteSessionSnapshot = {
  gameId: string;
  status: SessionStatus;
  config: SessionConfig;
  players: SessionPlayer[];
  currentRoundIndex: number;
  allPlayersReady: boolean;
  roundStartsAt: string | null;
  roundEndsAt: string | null;
  viewerPlayerId: string | null;
  timeRemaining?: number | null;
};

export type CreateCompeteSessionInput = {
  displayName: string;
  playerId: string;
  mode?: Exclude<SessionMode, "practice">;
  roundTimerSec?: number;
  totalRounds?: number;
  yearMin?: number;
  yearMax?: number;
};

export type JoinCompeteSessionInput = {
  gameId: string;
  displayName: string;
  playerId: string;
};

export type SetCompeteReadyInput = {
  gameId: string;
  playerId: string;
  ready: boolean;
};

export type StartCompeteSessionInput = {
  gameId: string;
  playerId: string;
  cause: TransitionCause;
};
