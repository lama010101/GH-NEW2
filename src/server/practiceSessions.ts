import { randomUUID } from "crypto";
import { createInitialGameState } from "@/core/gameEngine";
import { evaluateRound } from "@/core/rules";
import type { EventRecord, GameState, LatLng, RoundResult, SessionPlayer } from "@/core/types";
import { MAX_ROUNDS } from "@/core/types";
import { dbPool } from "@/server/db";
import { fetchEventById, fetchRandomEventsForSession } from "@/server/events";
import {
  type DbExecutor,
  PRACTICE_PLAYER_ID,
  PRACTICE_PLAYER_NAME,
  getTransactionClient,
  loadSessionPlayerRows,
  loadSessionRow,
  mapSessionPlayerRowToPlayer,
  mapSessionRowToConfig
} from "@/server/sessionCore";

const ROUND_DURATION_SEC = 30;

type SessionEventRow = {
  round_index: number;
  event_id: string;
};

type RoundTimingRow = {
  round_index: number;
  started_at: Date;
};

type RoundCommitRow = {
  player_id: string;
  round_index: number;
  submitted_at: Date;
  year_guess: number | null;
  location_guess: LatLng | null;
  hints_used: unknown;
  result_payload: RoundResult;
};

function isLatLng(value: unknown): value is LatLng {
  return typeof value === "object" && value !== null && typeof (value as { lat?: unknown }).lat === "number" && Number.isFinite((value as { lat: number }).lat) && typeof (value as { lng?: unknown }).lng === "number" && Number.isFinite((value as { lng: number }).lng);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isRoundResult(value: unknown): value is RoundResult {
  return typeof value === "object" && value !== null && typeof (value as { roundIndex?: unknown }).roundIndex === "number" && Number.isFinite((value as { roundIndex: number }).roundIndex);
}

function computeTimeRemaining(startedAt: Date, now: Date): number {
  const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.max(0, ROUND_DURATION_SEC - elapsedSeconds);
}

function assertContiguousRoundIndices(roundIndices: number[]): void {
  for (let index = 0; index < roundIndices.length; index += 1) {
    if (roundIndices[index] !== index) {
      throw new Error("Round data is not contiguous");
    }
  }
}

async function loadSessionEventRows(gameId: string, client?: DbExecutor): Promise<SessionEventRow[]> {
  const executor = client ?? dbPool;
  const result = await executor.query<SessionEventRow>(
    `
      SELECT round_index, (payload->>'eventId')::text as event_id
      FROM round_events
      WHERE game_id = $1 AND event_type = 'ROUND_STARTED'
      ORDER BY round_index ASC
    `,
    [gameId]
  );
  return result.rows;
}

async function loadRoundTimingRows(gameId: string, client?: DbExecutor): Promise<RoundTimingRow[]> {
  const executor = client ?? dbPool;
  const result = await executor.query<RoundTimingRow>(
    `
      SELECT round_index, started_at
      FROM round_timing
      WHERE game_id = $1
      ORDER BY round_index ASC
    `,
    [gameId]
  );
  return result.rows;
}

async function loadRoundCommitRows(gameId: string, client?: DbExecutor): Promise<RoundCommitRow[]> {
  const executor = client ?? dbPool;
  const result = await executor.query<RoundCommitRow>(
    `
      SELECT player_id, round_index, submitted_at, year_guess, location_guess, hints_used, result_payload
      FROM round_commits
      WHERE game_id = $1 AND player_id = $2
      ORDER BY round_index ASC
    `,
    [gameId, PRACTICE_PLAYER_ID]
  );
  return result.rows;
}

async function loadSessionEvents(gameId: string, expectedRounds: number, client: DbExecutor = dbPool): Promise<EventRecord[]> {
  const eventRows = await loadSessionEventRows(gameId, client);
  assertContiguousRoundIndices(eventRows.map((row) => row.round_index));

  if (eventRows.length !== expectedRounds) {
    throw new Error("Session does not contain the required number of events");
  }

  const events = await Promise.all(eventRows.map((row) => fetchEventById(row.event_id, client)));
  if (events.some((event) => event === null)) {
    throw new Error("Session contains an event that can no longer be loaded");
  }

  return events as EventRecord[];
}

function normalizeStoredRoundResult(value: unknown, expectedEvent: EventRecord, roundIndex: number): RoundResult {
  if (!isRoundResult(value)) {
    throw new Error("Stored round result is invalid");
  }

  if (value.roundIndex !== roundIndex || value.event.id !== expectedEvent.id) {
    throw new Error("Stored round result does not match the canonical session event mapping");
  }

  return value;
}

function buildProjectedState({
  gameId,
  events,
  timings,
  commits,
  totalRounds,
  sessionConfig,
  sessionPlayers,
  now
}: {
  gameId: string;
  events: EventRecord[];
  timings: RoundTimingRow[];
  commits: RoundCommitRow[];
  totalRounds: number;
  sessionConfig: GameState["sessionConfig"];
  sessionPlayers: SessionPlayer[];
  now: Date;
}): GameState {
  assertContiguousRoundIndices(commits.map((row) => row.round_index));

  const state = createInitialGameState(events, gameId);
  const roundResults = commits.map((commit) => normalizeStoredRoundResult(commit.result_payload, events[commit.round_index], commit.round_index));
  const nextRoundIndex = Math.min(roundResults.length, Math.max(totalRounds - 1, 0));
  const activeTiming = timings.find((timing) => timing.round_index === roundResults.length) ?? null;

  if (roundResults.length >= totalRounds) {
    return {
      ...state,
      phase: "SESSION_COMPLETE",
      currentRoundIndex: Math.max(totalRounds - 1, 0),
      timeRemaining: null,
      roundResults,
      sessionConfig,
      sessionPlayers,
      viewerPlayerId: PRACTICE_PLAYER_ID
    };
  }

  if (activeTiming) {
    return {
      ...state,
      phase: "ROUND_ACTIVE",
      currentRoundIndex: roundResults.length,
      timeRemaining: computeTimeRemaining(new Date(activeTiming.started_at), now),
      roundResults,
      sessionConfig,
      sessionPlayers,
      viewerPlayerId: PRACTICE_PLAYER_ID
    };
  }

  if (roundResults.length > 0) {
    return {
      ...state,
      phase: "ROUND_COMPLETE",
      currentRoundIndex: nextRoundIndex - 1,
      timeRemaining: null,
      roundResults,
      sessionConfig,
      sessionPlayers,
      viewerPlayerId: PRACTICE_PLAYER_ID
    };
  }

  return {
    ...state,
    phase: "INIT",
    currentRoundIndex: 0,
    timeRemaining: null,
    roundResults,
    sessionConfig,
    sessionPlayers,
    viewerPlayerId: PRACTICE_PLAYER_ID
  };
}

function validateRoundIndex(roundIndex: number): void {
  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= MAX_ROUNDS) {
    throw new Error("roundIndex must be an integer between 0 and 4");
  }
}

async function materializeExpiredRoundCommit(gameId: string): Promise<void> {
  const client = await getTransactionClient();

  try {
    await client.query("BEGIN");

    const commitRows = await loadRoundCommitRows(gameId, client);
    assertContiguousRoundIndices(commitRows.map((row) => row.round_index));

    if (commitRows.length >= MAX_ROUNDS) {
      await client.query("COMMIT");
      return;
    }

    const nextRoundIndex = commitRows.length;
    const timingResult = await client.query<RoundTimingRow>(
      `
        SELECT round_index, started_at
        FROM round_timing
        WHERE game_id = $1 AND round_index = $2
        LIMIT 1
        FOR UPDATE
      `,
      [gameId, nextRoundIndex]
    );

    const timing = timingResult.rows[0];
    if (!timing) {
      await client.query("COMMIT");
      return;
    }

    const timeRemaining = computeTimeRemaining(new Date(timing.started_at), new Date());
    if (timeRemaining > 0) {
      await client.query("COMMIT");
      return;
    }

    const eventRows = await loadSessionEventRows(gameId, client);
    const eventId = eventRows.find((row) => row.round_index === nextRoundIndex)?.event_id;
    if (!eventId) {
      throw new Error("Canonical session event mapping is missing for the active round");
    }

    const event = await fetchEventById(eventId, client);
    if (!event) {
      throw new Error("Canonical session event could not be loaded");
    }

    const resultPayload = evaluateRound(event, { year: null, location: null }, nextRoundIndex, true, { accuracy: 0, xp: 0 });

    await client.query(
      `
        INSERT INTO round_commits (game_id, player_id, round_index, submitted_at, year_guess, location_guess, hints_used, result_payload)
        VALUES ($1, $2, $3, now(), $4, $5::jsonb, $6::jsonb, $7::jsonb)
        ON CONFLICT (game_id, player_id, round_index) DO NOTHING
      `,
      [gameId, PRACTICE_PLAYER_ID, nextRoundIndex, null, null, JSON.stringify([]), JSON.stringify(resultPayload)]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadPracticeSessionState(gameId: string): Promise<GameState | null> {
  await materializeExpiredRoundCommit(gameId);

  const session = await loadSessionRow(gameId);
  if (!session) {
    return null;
  }

  const [events, timings, commits, playerRows] = await Promise.all([
    loadSessionEvents(gameId, session.total_rounds),
    loadRoundTimingRows(gameId),
    loadRoundCommitRows(gameId),
    loadSessionPlayerRows(gameId)
  ]);

  const sessionPlayers = playerRows.map(mapSessionPlayerRowToPlayer);

  return buildProjectedState({
    gameId: session.game_id,
    events,
    timings,
    commits,
    totalRounds: session.total_rounds,
    sessionConfig: mapSessionRowToConfig(session),
    sessionPlayers,
    now: new Date()
  });
}

export async function createPracticeSession(): Promise<GameState> {
  const events = await fetchRandomEventsForSession(MAX_ROUNDS);

  if (events.length !== MAX_ROUNDS) {
    throw new Error(`Expected ${MAX_ROUNDS} real events from the database, received ${events.length}`);
  }

  const gameId = randomUUID();
  const seed = BigInt(Date.now()) ^ BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
  const client = await getTransactionClient();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO sessions (
          game_id,
          mode,
          round_timer_sec,
          total_rounds,
          year_min,
          year_max,
          created_at,
          seed
        )
        VALUES ($1, 'practice', $2, $3, $4, $5, now(), $6)
      `,
      [gameId, ROUND_DURATION_SEC, MAX_ROUNDS, -100, 2026, seed]
    );

    await client.query(
      `
        INSERT INTO session_players (game_id, player_id, joined_at)
        VALUES ($1, $2, now())
      `,
      [gameId, PRACTICE_PLAYER_ID]
    );

    for (let roundIndex = 0; roundIndex < events.length; roundIndex += 1) {
      await client.query(
        "INSERT INTO round_events (game_id, round_index, event_type, payload) VALUES ($1, $2, 'ROUND_STARTED', $3::jsonb)",
        [gameId, roundIndex, JSON.stringify({ eventId: events[roundIndex].id })]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const state = await loadPracticeSessionState(gameId);
  if (!state) {
    throw new Error("Unable to load the newly created practice session");
  }

  return state;
}

export async function startPracticeRound(gameId: string, roundIndex: number): Promise<GameState> {
  validateRoundIndex(roundIndex);
  await materializeExpiredRoundCommit(gameId);

  const client = await getTransactionClient();

  try {
    await client.query("BEGIN");

    const session = await loadSessionRow(gameId, client);
    if (!session) {
      throw new Error("Session not found");
    }

    const commitRows = await loadRoundCommitRows(gameId, client);
    assertContiguousRoundIndices(commitRows.map((row) => row.round_index));

    const nextRoundIndex = commitRows.length;
    if (roundIndex !== nextRoundIndex) {
      throw new Error(`Round ${roundIndex} is not the next expected round`);
    }

    const existingTiming = await client.query<RoundTimingRow>(
      "SELECT round_index, started_at FROM round_timing WHERE game_id = $1 AND round_index = $2 LIMIT 1 FOR UPDATE",
      [gameId, roundIndex]
    );

    if (existingTiming.rows.length === 0) {
      await client.query(
        "INSERT INTO round_timing (game_id, round_index, started_at) VALUES ($1, $2, now())",
        [gameId, roundIndex]
      );

      await client.query(
        `
          UPDATE sessions
          SET started_at = COALESCE(started_at, now())
          WHERE game_id = $1
        `,
        [gameId]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const state = await loadPracticeSessionState(gameId);
  if (!state) {
    throw new Error("Session not found");
  }

  return state;
}

export async function commitPracticeRound(input: {
  gameId: string;
  roundIndex: number;
  yearGuess: number | null;
  locationGuess: LatLng | null;
  hintsUsed: string[];
}): Promise<GameState> {
  const { gameId, roundIndex, yearGuess, locationGuess, hintsUsed } = input;

  validateRoundIndex(roundIndex);
  if (yearGuess !== null && (!Number.isInteger(yearGuess) || !Number.isFinite(yearGuess))) {
    throw new Error("yearGuess must be null or a finite integer");
  }
  if (locationGuess !== null && !isLatLng(locationGuess)) {
    throw new Error("locationGuess must be null or a finite latitude/longitude pair");
  }
  if (!isStringArray(hintsUsed)) {
    throw new Error("hintsUsed must be an array of non-empty strings");
  }
  if (hintsUsed.length > 0) {
    throw new Error("Hints are not yet enabled for secure server commits");
  }

  await materializeExpiredRoundCommit(gameId);
  const client = await getTransactionClient();

  try {
    await client.query("BEGIN");

    const session = await loadSessionRow(gameId, client);
    if (!session) {
      throw new Error("Session not found");
    }

    const existingCommitResult = await client.query<RoundCommitRow>(
      `
        SELECT player_id, round_index, submitted_at, year_guess, location_guess, hints_used, result_payload
        FROM round_commits
        WHERE game_id = $1 AND player_id = $2 AND round_index = $3
        LIMIT 1
        FOR UPDATE
      `,
      [gameId, PRACTICE_PLAYER_ID, roundIndex]
    );

    if (existingCommitResult.rows.length > 0) {
      await client.query("COMMIT");
      const state = await loadPracticeSessionState(gameId);
      if (!state) {
        throw new Error("Session not found");
      }
      return state;
    }

    const commitRows = await loadRoundCommitRows(gameId, client);
    assertContiguousRoundIndices(commitRows.map((row) => row.round_index));

    const nextRoundIndex = commitRows.length;
    if (roundIndex !== nextRoundIndex) {
      throw new Error(`Round ${roundIndex} is not the next expected round`);
    }

    const timingResult = await client.query<RoundTimingRow>(
      "SELECT round_index, started_at FROM round_timing WHERE game_id = $1 AND round_index = $2 LIMIT 1 FOR UPDATE",
      [gameId, roundIndex]
    );
    const timing = timingResult.rows[0];

    if (!timing) {
      throw new Error("Round has not been started");
    }

    const eventRows = await loadSessionEventRows(gameId, client);
    const eventId = eventRows.find((row) => row.round_index === roundIndex)?.event_id;
    if (!eventId) {
      throw new Error("Canonical session event mapping is missing for this round");
    }

    const event = await fetchEventById(eventId, client);
    if (!event) {
      throw new Error("Canonical session event could not be loaded");
    }

    const didTimeout = computeTimeRemaining(new Date(timing.started_at), new Date()) === 0;
    if (!didTimeout && (yearGuess === null || locationGuess === null)) {
      throw new Error("Manual submissions require both yearGuess and locationGuess");
    }

    const effectiveGuess = didTimeout
      ? { year: null, location: null }
      : { year: yearGuess, location: locationGuess };

    const resultPayload = evaluateRound(event, effectiveGuess, roundIndex, didTimeout, { accuracy: 0, xp: 0 });

    await client.query(
      `
        INSERT INTO round_commits (game_id, player_id, round_index, submitted_at, year_guess, location_guess, hints_used, result_payload)
        VALUES ($1, $2, $3, now(), $4, $5::jsonb, $6::jsonb, $7::jsonb)
      `,
      [
        gameId,
        PRACTICE_PLAYER_ID,
        roundIndex,
        effectiveGuess.year,
        effectiveGuess.location === null ? null : JSON.stringify(effectiveGuess.location),
        JSON.stringify(hintsUsed),
        JSON.stringify(resultPayload)
      ]
    );

    if (roundIndex === session.total_rounds - 1) {
      await client.query(
        `
          UPDATE sessions
          SET completed_at = now()
          WHERE game_id = $1
        `,
        [gameId]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const state = await loadPracticeSessionState(gameId);
  if (!state) {
    throw new Error("Session not found");
  }

  return state;
}
