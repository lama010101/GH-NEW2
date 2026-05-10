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
import type { RoundEventContent, EventHint } from "@/core/types";

// Re-export for backwards compatibility
export { VALID_PHASE_TRANSITIONS, deriveStateFromEventStream, type RoundEvent };

// ═════════════════════════════════════════════════════════════════════════════
// TYPES — Deterministic State Reconstruction
// ═════════════════════════════════════════════════════════════════════════════

type DbExecutor = Pick<Pool, "query">;

/** Round result shape for client consumption (matches page.tsx) */
type RoundResultForClient = {
  playerId: string;
  score: number;
  rank: number;
  accuracy: number;
  locationScore: number;
  didSubmit: boolean;
  guessYear: number | null;
  guessLat: number | null;
  guessLng: number | null;
  timeScore: number;
  badges: Array<{ dimension: 'year' | 'location' | 'combo'; tier: 'gold' | 'silver' | 'bronze'; accuracy: number }>;
  nearMisses: Array<{ dimension: 'year' | 'location' | 'combo'; accuracy: number }>;
};

/** Player state reconstructed from session_players */
export type PlayerState = {
  playerId: string;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
  ready: boolean;
  isHost: boolean;
  avatarUrl: string | null;
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
};

/** Fully reconstructed game state — deterministic from DB only */
export type ReconstructedGameState = {
  session: SessionState;
  players: PlayerState[];
  currentRound: number;
  phase: string | null;
  rounds: RoundState[];
  events: RoundEvent[];
  roundEventContent: RoundEventContent[];
  roundResultsForClient?: RoundResultForClient[];
};

// ═════════════════════════════════════════════════════════════════════════════
// DATABASE QUERIES — Ordered for Deterministic Output
// ═════════════════════════════════════════════════════════════════════════════

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
    created_at: Date
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
  // SINGLE CTE QUERY — Load all state in one DB round-trip
  // ───────────────────────────────────────────────────────────────────────────
  const result = await dbPool.query<{
    session: unknown;
    players: unknown;
    commits: unknown;
    results: unknown;
    events: unknown;
  }>(
    `WITH
      session_data AS (
        SELECT game_id, mode, round_timer_sec, total_rounds, year_min, year_max,
               session_deadline, created_at, seed
        FROM sessions
        WHERE game_id = $1
      ),
      players_data AS (
        SELECT player_id, display_name, joined_at, left_at, ready, is_host, avatar_url
        FROM session_players
        WHERE game_id = $1
        ORDER BY joined_at ASC, player_id ASC
      ),
      commits_data AS (
        SELECT round_index, player_id, submitted_at, year_guess,
               location_lat, location_lng, hints_used, score
        FROM round_commits
        WHERE game_id = $1
        ORDER BY round_index ASC, submitted_at ASC, player_id ASC
      ),
      results_data AS (
        SELECT round_index, player_id, score, rank,
               distance_km, year_diff, location_score, time_score
        FROM round_results
        WHERE game_id = $1
        ORDER BY round_index ASC, rank ASC, player_id ASC
      ),
      events_data AS (
        SELECT id, round_index, event_type, payload, created_at
        FROM round_events
        WHERE game_id = $1
        ORDER BY created_at ASC, id ASC
      )
    SELECT
      (SELECT row_to_json(s) FROM session_data s) AS session,
      (SELECT json_agg(p ORDER BY p.joined_at ASC, p.player_id ASC) FROM players_data p) AS players,
      (SELECT json_agg(c ORDER BY c.round_index ASC, c.submitted_at ASC, c.player_id ASC) FROM commits_data c) AS commits,
      (SELECT json_agg(r ORDER BY r.round_index ASC, r.rank ASC, r.player_id ASC) FROM results_data r) AS results,
      (SELECT json_agg(e ORDER BY e.created_at ASC, e.id ASC) FROM events_data e) AS events`,
    [sessionId]
  );

  if (result.rows.length === 0 || !result.rows[0].session) {
    throw new Error(`[getGameState] Session not found: ${sessionId}`);
  }

  const row = result.rows[0];
  const sessionJson = row.session as Record<string, unknown>;
  const playersJson = (row.players as Record<string, unknown>[]) ?? [];
  const commitsJson = (row.commits as Record<string, unknown>[]) ?? [];
  const resultsJson = (row.results as Record<string, unknown>[]) ?? [];
  const eventsJson = (row.events as Record<string, unknown>[]) ?? [];

  // ───────────────────────────────────────────────────────────────────────────
  // PARSE SESSION
  // ───────────────────────────────────────────────────────────────────────────
  const session: SessionState = {
    gameId: sessionJson.game_id as string,
    mode: sessionJson.mode as "practice" | "sync" | "async",
    roundTimerSec: sessionJson.round_timer_sec as number,
    totalRounds: sessionJson.total_rounds as number,
    yearMin: sessionJson.year_min as number,
    yearMax: sessionJson.year_max as number,
    sessionDeadline: sessionJson.session_deadline ? new Date(sessionJson.session_deadline as string).toISOString() : null,
    createdAt: new Date(sessionJson.created_at as string).toISOString()
  };

  // ───────────────────────────────────────────────────────────────────────────
  // PARSE PLAYERS
  // ───────────────────────────────────────────────────────────────────────────
  const players: PlayerState[] = playersJson.map(p => ({
    playerId: p.player_id as string,
    displayName: (p.display_name as string) ?? "",
    joinedAt: new Date(p.joined_at as string).toISOString(),
    leftAt: p.left_at ? new Date(p.left_at as string).toISOString() : null,
    ready: p.ready as boolean,
    isHost: p.is_host as boolean,
    avatarUrl: (p.avatar_url as string) ?? null
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // PARSE COMMITS INTO MAP
  // ───────────────────────────────────────────────────────────────────────────
  const commitsByRound = new Map<number, SubmissionState[]>();
  for (const c of commitsJson) {
    const submission: SubmissionState = {
      playerId: c.player_id as string,
      submittedAt: new Date(c.submitted_at as string).toISOString(),
      yearGuess: c.year_guess as number | null,
      locationLat: c.location_lat as number | null,
      locationLng: c.location_lng as number | null,
      hintsUsed: (c.hints_used as number) ?? 0,
      score: c.score as number | null
    };
    const roundIndex = c.round_index as number;
    if (!commitsByRound.has(roundIndex)) {
      commitsByRound.set(roundIndex, []);
    }
    commitsByRound.get(roundIndex)!.push(submission);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PARSE RESULTS INTO MAP
  // ───────────────────────────────────────────────────────────────────────────
  const resultsByRound = new Map<number, ResultState[]>();
  for (const r of resultsJson) {
    const resultState: ResultState = {
      playerId: r.player_id as string,
      score: r.score as number,
      rank: r.rank as number,
      distanceKm: r.distance_km as number | null,
      yearDiff: r.year_diff as number | null,
      locationScore: r.location_score as number | null,
      timeScore: r.time_score as number | null
    };
    const roundIndex = r.round_index as number;
    if (!resultsByRound.has(roundIndex)) {
      resultsByRound.set(roundIndex, []);
    }
    resultsByRound.get(roundIndex)!.push(resultState);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PARSE EVENTS
  // ───────────────────────────────────────────────────────────────────────────
  const events: RoundEvent[] = eventsJson.map(e => ({
    id: e.id as number,
    roundIndex: e.round_index as number | null,
    eventType: e.event_type as string,
    payload: e.payload as Record<string, unknown>,
    createdAt: new Date(e.created_at as string).toISOString()
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // DERIVE EVENT ROUNDS FROM EVENTS (replaces loadEventRounds query)
  // ───────────────────────────────────────────────────────────────────────────
  const eventRounds = new Set<number>();
  for (const e of events) {
    if (e.roundIndex !== null) {
      eventRounds.add(e.roundIndex);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DERIVE CURRENT ROUND AND PHASE FROM FULL EVENT STREAM
  // ───────────────────────────────────────────────────────────────────────────
  const { currentRound, currentPhase } = deriveStateFromEventStream(events);
  const phase = currentPhase;

  // ─────────────────────────────────────────────────────────────────────────────
  // ASSEMBLE ROUNDS FROM EVENTS, COMMITS, AND RESULTS
  // ─────────────────────────────────────────────────────────────────────────────
  const rounds = assembleRounds(eventRounds, commitsByRound, resultsByRound);

  // ═════════════════════════════════════════════════════════════════════════════
  // POPULATE EVENT CONTENT FOR ROUNDS (MP-FIX-EVENT-DATA-001)
  // ═════════════════════════════════════════════════════════════════════════════
  // Extract ordered eventIds from SESSION_CREATED event
  const sessionCreatedEvent = events.find(e => e.eventType === "SESSION_CREATED");
  const eventIds: string[] = (
    (sessionCreatedEvent?.payload as Record<string, unknown>)?.eventIds as string[]
  ) ?? [];

  let roundEventContent: RoundEventContent[] = [];

  if (eventIds.length > 0) {
    const eventResult = await dbPool.query<{
      event_id: string;
      title: string;
      description: string | null;
      event_year: number;
      latitude: number | null;
      longitude: number | null;
      display_name: string | null;
      image_url: string | null;
    }>(
      `SELECT
        e.id AS event_id,
        e.title,
        e.description,
        e.event_year,
        l.latitude,
        l.longitude,
        l.display_name,
        (
          SELECT i.url
          FROM images i
          WHERE i.event_id = e.id
          ORDER BY i.display_order ASC NULLS LAST
          LIMIT 1
        ) AS image_url
      FROM events e
      LEFT JOIN locations l ON l.event_id = e.id
      WHERE e.id = ANY($1::uuid[])`,
      [eventIds]
    );

    // Fetch hints for all events in a single query
    const hintsResult = await dbPool.query<{
      event_id: string;
      id: string;
      tier: number;
      type: string;
      content: string;
      metadata: Record<string, unknown> | null;
      display_order: number;
    }>(
      `SELECT
        h.event_id,
        h.id,
        h.tier,
        h.type,
        h.content,
        h.metadata,
        h.display_order
      FROM hints h
      WHERE h.event_id = ANY($1::uuid[])
      ORDER BY h.display_order, h.tier`,
      [eventIds]
    );

    // Group hints by event_id
    const hintsByEventId = new Map<string, EventHint[]>();

    for (const row of hintsResult.rows) {
      const hint: EventHint = {
        id: row.id,
        event_id: row.event_id,
        tier: row.tier,
        type: row.type,
        content: row.content,
        metadata: row.metadata,
        display_order: row.display_order,
      };
      const existing = hintsByEventId.get(row.event_id) ?? [];
      hintsByEventId.set(row.event_id, [...existing, hint]);
    }

    const eventMap = new Map(eventResult.rows.map(row => [row.event_id, row]));
    const hiddenAnswerValue = null as unknown as number;
    roundEventContent = eventIds.map((id, roundIndex) => {
      const ev = eventMap.get(id);
      const latestRoundEvent = events
        .filter(event => event.roundIndex === roundIndex)
        .reduce<RoundEvent | null>(
          (latest, event) => latest === null || event.id > latest.id ? event : latest,
          null
        );
      const shouldRevealAnswer = latestRoundEvent?.eventType === "ROUND_COMPLETE" || latestRoundEvent?.eventType === "SESSION_COMPLETE";
      return {
        eventId: id,
        title: ev?.title ?? '',
        year: shouldRevealAnswer ? ev?.event_year ?? 0 : hiddenAnswerValue,
        latitude: shouldRevealAnswer ? ev?.latitude ?? 0 : hiddenAnswerValue,
        longitude: shouldRevealAnswer ? ev?.longitude ?? 0 : hiddenAnswerValue,
        locationName: shouldRevealAnswer ? ev?.display_name ?? null : null,
        imageUrl: ev?.image_url ?? null,
        description: ev?.description ?? null,
        hints: hintsByEventId.get(id) ?? [],
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RETURN FULLY RECONSTRUCTED STATE
  // ─────────────────────────────────────────────────────────────────────────────
  return {
    session,
    players,
    currentRound,
    phase,
    rounds,
    events,
    roundEventContent
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
