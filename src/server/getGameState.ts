// getGameState.ts — Deterministic DB Reconstruction Layer
// TASK: MP-CORE-LOOP-005
// Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
//            MASTER IMPLEMENTATION PLAN v3.0 Section 0.2, Section 2
//
// CRITICAL INVARIANTS:
// - DB = single source of truth (no in-memory fallback)
// - round_events = phase authority (no inference shortcuts)
// - Append-only logs → deterministic replay
// - Pure read function (NO mutations, NO side effects)

import { dbPool } from "@/server/db";
import type { Pool } from "pg";
import {
  VALID_PHASE_TRANSITIONS,
  deriveStateFromEventStream,
  type RoundEvent
} from "./eventStream";

// Re-export for backwards compatibility
export { VALID_PHASE_TRANSITIONS, deriveStateFromEventStream, type RoundEvent };

// ═════════════════════════════════════════════════════════════════════════════
// TYPES — Deterministic State Reconstruction
// ═════════════════════════════════════════════════════════════════════════════

type DbExecutor = Pick<Pool, "query">;

/** Player state reconstructed from session_players */
export type PlayerState = {
  playerId: string;
  joinedAt: string;
  leftAt: string | null;
};

/** Single submission reconstructed from round_commits */
export type SubmissionState = {
  playerId: string;
  submittedAt: string;
  yearGuess: number | null;
  locationLat: number | null;
  locationLng: number | null;
  hintsUsed: number;
  score: number | null;
};

/** Single result reconstructed from round_results */
export type ResultState = {
  playerId: string;
  score: number;
  rank: number;
  distanceKm: number | null;
  yearDiff: number | null;
  locationScore: number | null;
  timeScore: number | null;
};

/** Round state with all DB-derived data */
export type RoundState = {
  roundIndex: number;
  submissions: SubmissionState[];
  results: ResultState[];
};

/** Session configuration from sessions table */
export type SessionState = {
  gameId: string;
  mode: "practice" | "sync" | "async";
  roundTimerSec: number;
  totalRounds: number;
  yearMin: number;
  yearMax: number;
  sessionDeadline: string | null;
  createdAt: string;
  currentPhase: string | null;
};

/** Fully reconstructed game state — deterministic from DB only */
export type ReconstructedGameState = {
  session: SessionState;
  players: PlayerState[];
  currentRound: number;
  phase: string | null;
  rounds: RoundState[];
  events: RoundEvent[];
};

// ═════════════════════════════════════════════════════════════════════════════
// DATABASE QUERIES — Ordered for Deterministic Output
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Load session configuration from sessions table.
 * 
 * Schema per migration 013_create_multiplayer_schema_spec_exact.sql
 */
async function loadSession(
  gameId: string,
  executor: DbExecutor = dbPool
): Promise<SessionState | null> {
  const result = await executor.query<{
    game_id: string;
    mode: "practice" | "sync" | "async";
    round_timer_sec: number;
    total_rounds: number;
    year_min: number;
    year_max: number;
    session_deadline: Date | null;
    created_at: Date;
    current_phase: string | null;
  }>(
    `SELECT 
      game_id,
      mode,
      round_timer_sec,
      total_rounds,
      year_min,
      year_max,
      session_deadline,
      created_at,
      current_phase
    FROM sessions
    WHERE game_id = $1
    LIMIT 1`,
    [gameId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    gameId: row.game_id,
    mode: row.mode,
    roundTimerSec: row.round_timer_sec,
    totalRounds: row.total_rounds,
    yearMin: row.year_min,
    yearMax: row.year_max,
    sessionDeadline: row.session_deadline?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    currentPhase: row.current_phase
  };
}

/**
 * Load all players from session_players table.
 * 
 * Schema: composite PK (game_id, player_id)
 * Ordering: joined_at ASC, player_id ASC (deterministic)
 */
async function loadPlayers(
  gameId: string,
  executor: DbExecutor = dbPool
): Promise<PlayerState[]> {
  const result = await executor.query<{
    player_id: string;
    joined_at: Date;
    left_at: Date | null;
  }>(
    `SELECT 
      player_id,
      joined_at,
      left_at
    FROM session_players
    WHERE game_id = $1
    ORDER BY joined_at ASC, player_id ASC`,
    [gameId]
  );

  return result.rows.map(row => ({
    playerId: row.player_id,
    joinedAt: row.joined_at.toISOString(),
    leftAt: row.left_at?.toISOString() ?? null
  }));
}

/**
 * Load all round commits grouped by round_index.
 * 
 * Schema: composite PK (game_id, player_id, round_index)
 * Ordering: round_index ASC, submitted_at ASC (deterministic)
 */
async function loadRoundCommits(
  gameId: string,
  executor: DbExecutor = dbPool
): Promise<Map<number, SubmissionState[]>> {
  const result = await executor.query<{
    round_index: number;
    player_id: string;
    submitted_at: Date;
    year_guess: number | null;
    location_lat: number | null;
    location_lng: number | null;
    hints_used: number | null;
    score: number | null;
  }>(
    `SELECT 
      round_index,
      player_id,
      submitted_at,
      year_guess,
      location_lat,
      location_lng,
      hints_used,
      score
    FROM round_commits
    WHERE game_id = $1
    ORDER BY round_index ASC, submitted_at ASC, player_id ASC`,
    [gameId]
  );

  const rounds = new Map<number, SubmissionState[]>();

  for (const row of result.rows) {
    const submission: SubmissionState = {
      playerId: row.player_id,
      submittedAt: row.submitted_at.toISOString(),
      yearGuess: row.year_guess,
      locationLat: row.location_lat,
      locationLng: row.location_lng,
      hintsUsed: row.hints_used ?? 0,
      score: row.score
    };

    if (!rounds.has(row.round_index)) {
      rounds.set(row.round_index, []);
    }
    rounds.get(row.round_index)!.push(submission);
  }

  return rounds;
}


/**
 * Load all round results grouped by round_index.
 * 
 * Schema: composite PK (game_id, round_index, player_id)
 * Ordering: round_index ASC, rank ASC, player_id ASC (deterministic)
 * 
 * Includes extended replay fields from migration 016.
 */
async function loadRoundResults(
  gameId: string,
  executor: DbExecutor = dbPool
): Promise<Map<number, ResultState[]>> {
  const result = await executor.query<{
    round_index: number;
    player_id: string;
    score: number;
    rank: number;
    distance_km: number | null;
    year_diff: number | null;
    location_score: number | null;
    time_score: number | null;
  }>(
    `SELECT 
      round_index,
      player_id,
      score,
      rank,
      distance_km,
      year_diff,
      location_score,
      time_score
    FROM round_results
    WHERE game_id = $1
    ORDER BY round_index ASC, rank ASC, player_id ASC`,
    [gameId]
  );

  const rounds = new Map<number, ResultState[]>();

  for (const row of result.rows) {
    const resultState: ResultState = {
      playerId: row.player_id,
      score: row.score,
      rank: row.rank,
      distanceKm: row.distance_km,
      yearDiff: row.year_diff,
      locationScore: row.location_score,
      timeScore: row.time_score
    };

    if (!rounds.has(row.round_index)) {
      rounds.set(row.round_index, []);
    }
    rounds.get(row.round_index)!.push(resultState);
  }

  return rounds;
}

/**
 * Load all round_events — phase authority.
 * 
 * Schema: PK id BIGSERIAL, append-only log
 * Ordering: created_at ASC, id ASC (deterministic — chronology)
 */
async function loadRoundEvents(
  gameId: string,
  executor: DbExecutor = dbPool
): Promise<RoundEvent[]> {
  const result = await executor.query<{
    id: number;
    round_index: number | null;
    event_type: string;
    payload: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT 
      id,
      round_index,
      event_type,
      payload,
      created_at
    FROM round_events
    WHERE game_id = $1
    ORDER BY created_at ASC, id ASC`,
    [gameId]
  );

  return result.rows.map(row => ({
    id: row.id,
    roundIndex: row.round_index,
    eventType: row.event_type,
    payload: row.payload,
    createdAt: row.created_at.toISOString()
  }));
}

/**
 * Load all round indices from events.
 */
async function loadEventRounds(
  gameId: string,
  executor: DbExecutor = dbPool
): Promise<Set<number>> {
  const result = await executor.query<{ round_index: number }>(
    `SELECT DISTINCT round_index
    FROM round_events
    WHERE game_id = $1
    AND round_index IS NOT NULL
    ORDER BY round_index ASC`,
    [gameId]
  );

  return new Set(result.rows.map(r => r.round_index));
}

// ═════════════════════════════════════════════════════════════════════════════
// STATE ASSEMBLY — Deterministic Reconstruction
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Assemble complete round state from events, commits, and results.
 * 
 * Deterministic ordering:
 * - Rounds sorted by round_index ASC
 * - Submissions sorted by submitted_at ASC, player_id ASC
 * - Results sorted by rank ASC, player_id ASC
 */
function assembleRounds(
  eventRounds: Set<number>,
  commitsByRound: Map<number, SubmissionState[]>,
  resultsByRound: Map<number, ResultState[]>
): RoundState[] {
  // Get all unique round indices from events, commits, and results
  const allRounds = new Set<number>([
    ...eventRounds,
    ...commitsByRound.keys(),
    ...resultsByRound.keys()
  ]);

  // Sort deterministically
  const sortedRounds = Array.from(allRounds).sort((a, b) => a - b);

  return sortedRounds.map(roundIndex => ({
    roundIndex,
    submissions: commitsByRound.get(roundIndex) ?? [],
    results: resultsByRound.get(roundIndex) ?? []
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API — getGameState
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Reconstruct complete game state from database.
 * 
 * RULE: This is the ONLY read model for game state.
 * Used by: client polling, DO recovery, debugging/replay.
 * 
 * COMPLIANCE:
 * - DB = source of truth → no derived mutation
 * - round_events = phase authority → no inference shortcuts  
 * - append-only logs → replay must be deterministic
 * - Pure function → no side effects, no mutations
 * 
 * THROWS: If session not found (explicit error)
 * 
 * @param sessionId — game_id from sessions table
 * @returns Fully reconstructed state
 */
export async function getGameState(
  sessionId: string
): Promise<ReconstructedGameState> {
  // ───────────────────────────────────────────────────────────────────────────
  // STEP 1: Load session (fail-fast if not found)
  // ───────────────────────────────────────────────────────────────────────────
  const session = await loadSession(sessionId, dbPool);
  if (!session) {
    throw new Error(`[getGameState] Session not found: ${sessionId}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 2: Parallel load of all state sources (all independent reads)
  // ───────────────────────────────────────────────────────────────────────────
  const [
    players,
    commitsByRound,
    resultsByRound,
    events,
    eventRounds
  ] = await Promise.all([
    loadPlayers(sessionId, dbPool),
    loadRoundCommits(sessionId, dbPool),
    loadRoundResults(sessionId, dbPool),
    loadRoundEvents(sessionId, dbPool),
    loadEventRounds(sessionId, dbPool)
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 3: Derive current round from FULL event stream; phase from sessions table
  // ───────────────────────────────────────────────────────────────────────────
  // Uses deterministic event stream processor — validates ordering,
  // round continuity, and phase sequence correctness
  const { currentRound } = deriveStateFromEventStream(events);
  const phase = session.currentPhase;

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 5: Assemble rounds from events, commits, and results
  // ───────────────────────────────────────────────────────────────────────────
  const rounds = assembleRounds(eventRounds, commitsByRound, resultsByRound);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 6: Return fully reconstructed state
  // ───────────────────────────────────────────────────────────────────────────
  return {
    session,
    players,
    currentRound,
    phase,
    rounds,
    events
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS — For specific use cases
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get phase only (lightweight for polling).
 * Still uses round_events as authority.
 */
export async function getCurrentPhase(
  sessionId: string
): Promise<{ currentRound: number; phase: string | null }> {
  // Load full event stream — ordering guaranteed by SQL (created_at ASC, id ASC)
  const events = await loadRoundEvents(sessionId, dbPool);

  // Deterministic derivation with full validation
  const { currentRound, currentPhase } = deriveStateFromEventStream(events);
  return { currentRound, phase: currentPhase };
}

/**
 * Check if session exists.
 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  const result = await dbPool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM sessions WHERE game_id = $1) as exists`,
    [sessionId]
  );
  return result.rows[0]?.exists ?? false;
}
