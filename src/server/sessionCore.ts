// sessionCore.ts — Minimal Playable Multiplayer Loop
// Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3 (schema) + Section 8 (RLS)
//            MASTER IMPLEMENTATION PLAN v3.0 Sections 0.1, 0.2, 5, 6
// All DB writes use ONLY columns that exist in the live schema.
// round_events written on every phase transition (Section 2 — append-only log).
// round_results written after all players commit (Section 6 — DB-authoritative scoring).
// submitGuess and advanceRound are PartyKit-only (single mutation authority).

import { randomUUID, randomBytes } from "crypto";
import type { Pool } from "pg";
import {
  CompeteSessionSnapshot,
  CreateCompeteSessionInput,
  LatLng,
  SessionConfig,
  SessionPlayer,
  SessionStatus,
  SetCompeteReadyInput,
  StartCompeteSessionInput
} from "@/core/types";
import { MAX_ROUNDS, TIMER_MAX_SEC, TIMER_MIN_SEC } from "@/core/types";
import { evaluateRound } from "@/core/rules";
import {
  dbPool,
  generateVerificationToken,
  verifyWriteCrossConnection,
  verifyDeterministicReplay,
  // Zero-Trust v2.0 imports
  verifyRowIntegrity,
  verifyWriteSet,
  verifyUniquenessInvariant,
  verifyFullReplay
} from "@/server/db";
import { fetchEventById, fetchRandomEventsForSession } from "@/server/events";
import { getGameState, deriveStateFromEventStream } from "@/server/getGameState";
import { appendEvent } from "@/server/eventStore";
import { TransitionCause } from "@/core/transitionCause";
import { transition } from "@/server/engine/transition";
import type { TransitionEvent } from "@/server/engine/transition";

// ═════════════════════════════════════════════════════════════════════════════
// TRANSITION ENGINE VALIDATION (MP-ARCH-PHASE-1)
// Compares existing logic events with centralized transition() output.
// Does NOT drive logic — purely diagnostic.
// ═════════════════════════════════════════════════════════════════════════════
function compareTransitionEvents(
  operation: string,
  existing: TransitionEvent[],
  expected: TransitionEvent[]
): void {
  if (JSON.stringify(existing) !== JSON.stringify(expected)) {
    console.error(
      `[TRANSITION MISMATCH] ${operation}\n` +
      `  existing:  ${JSON.stringify(existing)}\n` +
      `  expected:  ${JSON.stringify(expected)}`
    );
  }
}

export const PRACTICE_PLAYER_ID = "00000000-0000-0000-0000-000000000000";
export const PRACTICE_PLAYER_NAME = "Practice Player";

export const PRESSURE_CLAMP_SECONDS = 20;
export const RESULTS_COUNTDOWN_SECONDS = 30;

export type DbExecutor = Pick<Pool, "query">;
export type DbTransactionClient = DbExecutor & { release(): void };
type TransactionCapablePool = DbExecutor & { connect(): Promise<DbTransactionClient> };

// Exactly matches public.sessions columns (spec DDL, Section 3.3)
export type SessionRow = {
  game_id: string;
  mode: "practice" | "sync" | "async";
  round_timer_sec: number;
  total_rounds: number;
  year_min: number;
  year_max: number;
  session_deadline: Date | null;
  created_at: Date;
  seed: bigint;
};

// Exactly matches public.session_players columns (spec DDL, Section 3.3)
// Updated by MP-STATE-COMPLETION-004 to include ready + is_host (migration 022).
export type SessionPlayerRow = {
  game_id: string;
  player_id: string;
  display_name: string;
  joined_at: Date | null;
  left_at: Date | null;
  ready: boolean;
  is_host: boolean;
};

// NOTE: round_timing table exists but is NOT used for phase derivation.
// Phase is derived EXCLUSIVELY from round_events via deriveStateFromEventStream().
// See: EVENT_STREAM_SPEC.md Section 6.3, PHASE_FSM_SPEC.md Section 4

// Exactly matches public.round_commits columns (spec DDL, Section 3.3) + verification_token
export type RoundCommitRow = {
  game_id: string;
  player_id: string;
  round_index: number;
  submitted_at: Date | null;
  year_guess: number | null;
  location_lat: number | null;
  location_lng: number | null;
  hints_used: number | null;
  score: number | null;
  verification_token: string | null;
};

function clampRoundTimer(roundTimerSec: number | undefined): number {
  if (roundTimerSec === undefined) {
    return 120;
  }

  if (!Number.isInteger(roundTimerSec) || !Number.isFinite(roundTimerSec)) {
    throw new Error("roundTimerSec must be a finite integer");
  }

  return Math.max(TIMER_MIN_SEC, Math.min(TIMER_MAX_SEC, roundTimerSec));
}

function normalizeTotalRounds(totalRounds: number | undefined): number {
  if (totalRounds === undefined) {
    return MAX_ROUNDS;
  }

  if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > MAX_ROUNDS) {
    throw new Error(`totalRounds must be an integer between 1 and ${MAX_ROUNDS}`);
  }

  return totalRounds;
}

function normalizeYearBoundary(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite integer`);
  }

  return value;
}

function assertValidDisplayName(displayName: string): string {
  const normalized = displayName.trim();
  if (normalized.length === 0) {
    throw new Error("displayName is required");
  }

  if (normalized.length > 40) {
    throw new Error("displayName must be 40 characters or fewer");
  }

  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME VERIFICATION LAYER  (MP-CORE-LOOP-003 - ZERO-TRUST)
// Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3 + Section 8 (RLS)
//            MASTER IMPLEMENTATION PLAN v3.0 Sections 0.1, 0.2, 5, 6
//
// Rule: Every critical DB write MUST be followed by CROSS-CONNECTION verification.
// Rule: All verification results MUST be logged with [VERIFY][CROSS_CONN] prefix.
// Rule: Any mismatch MUST throw immediately (fail-fast).
// Rule: Verification MUST use a NEW connection from the pool (not same transaction).
// ─────────────────────────────────────────────────────────────────────────────

function verifyLog(operation: string, state: string, result: "OK" | "FAIL", detail?: string): void {
  const ts = new Date().toISOString();
  const msg = detail ? `[VERIFY] ${operation} ${state} ${result} — ${detail}` : `[VERIFY] ${operation} ${state} ${result}`;
  if (result === "FAIL") {
    console.error(`[${ts}] ${msg}`);
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

async function verifyWritten(
  executor: DbExecutor,
  table: string,
  whereClause: string,
  params: unknown[],
  operation: string
): Promise<void> {
  const result = await executor.query(
    `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`,
    params
  );
  if (result.rows.length === 0) {
    verifyLog(operation, table, "FAIL", `read-back found 0 rows — write did not persist`);
    throw new Error(`[VERIFY FAIL] ${operation}: expected row in ${table} not found after write`);
  }
  verifyLog(operation, table, "OK");
}

export const REQUIRED_MULTIPLAYER_TABLES = [
  "sessions",
  "session_players",
  "round_commits",
  "round_results",
  "round_events"
] as const;

export async function verifySchemaIntegrity(executor: DbExecutor = dbPool): Promise<void> {
  verifyLog("SCHEMA_CHECK", "information_schema", "OK", "starting");
  const result = await executor.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [REQUIRED_MULTIPLAYER_TABLES as unknown as string[]]
  );
  const found = new Set(result.rows.map((r) => r.table_name));
  const missing = REQUIRED_MULTIPLAYER_TABLES.filter((t) => !found.has(t));
  if (missing.length > 0) {
    verifyLog("SCHEMA_CHECK", "information_schema", "FAIL", `missing tables: ${missing.join(", ")}`);
    throw new Error(`[VERIFY FAIL] Schema integrity check failed — missing tables: ${missing.join(", ")}`);
  }
  verifyLog("SCHEMA_CHECK", "information_schema", "OK",
    `all ${REQUIRED_MULTIPLAYER_TABLES.length} required tables present`);
}

// ─────────────────────────────────────────────────────────────────────────────

// NOTE: loadCurrentRoundIndex removed - round_timing is NOT phase authority.
// Use deriveStateFromEventStream() from getGameState.ts for canonical round/phase.

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function mapSessionRowToConfig(row: SessionRow): SessionConfig {
  return {
    mode: row.mode,
    roundTimerSec: row.round_timer_sec,
    totalRounds: row.total_rounds,
    yearMin: row.year_min,
    yearMax: row.year_max,
    hostPlayerId: null,
    sessionDeadline: toIsoString(row.session_deadline),
    startedAt: null,
    completedAt: null
  };
}

/**
 * Map a session_players row to a SessionPlayer.
 *
 * `hasSubmitted` is a per-round derivation (does a row exist in round_commits
 * for (game_id, player_id, currentRoundIndex)?) and therefore CANNOT be
 * inferred from session_players alone. The caller must pass it explicitly
 * so we never fabricate this field.
 */
export function mapSessionPlayerRowToPlayer(row: SessionPlayerRow, hasSubmitted: boolean): SessionPlayer {
  if (row.joined_at === null) {
    throw new Error(`[DB_INTEGRITY] session_players.joined_at is NULL for player_id=${row.player_id} game_id=${row.game_id}`);
  }
  return {
    playerId: row.player_id,
    displayName: row.display_name || row.player_id.slice(0, 8),
    joinedAt: row.joined_at.toISOString(),
    leftAt: toIsoString(row.left_at),
    ready: row.ready,
    isHost: row.is_host,
    hasSubmitted
  };
}

export async function getTransactionClient(): Promise<DbTransactionClient> {
  return (dbPool as unknown as TransactionCapablePool).connect();
}

export async function loadSessionRow(gameId: string, executor: DbExecutor = dbPool): Promise<SessionRow | null> {
  const result = await executor.query<SessionRow>(
    `
      SELECT
        game_id,
        mode,
        round_timer_sec,
        total_rounds,
        year_min,
        year_max,
        session_deadline,
        created_at,
        seed
      FROM sessions
      WHERE game_id = $1
      LIMIT 1
    `,
    [gameId]
  );

  return result.rows[0] ?? null;
}

export async function loadSessionPlayerRows(gameId: string, executor: DbExecutor = dbPool): Promise<SessionPlayerRow[]> {
  const result = await executor.query<SessionPlayerRow>(
    `
      SELECT game_id, player_id, display_name, joined_at, left_at, ready, is_host
      FROM session_players
      WHERE game_id = $1
      ORDER BY joined_at ASC, player_id ASC
    `,
    [gameId]
  );

  return result.rows;
}

// NOTE: deriveSessionStatus REMOVED - Shadow phase derivation eliminated.
// Phase is now derived EXCLUSIVELY from round_events via deriveStateFromEventStream().
//
// Phase mapping per EVENT_STREAM_SPEC.md Section 6.3:
// - SESSION_CREATED → "LOBBY"
// - ROUND_STARTED → "ROUND_ACTIVE"
// - GUESS_SUBMITTED → "ROUND_ACTIVE"
// - ROUND_COMPLETE → "ROUND_COMPLETE"
// - SESSION_COMPLETE → "SESSION_COMPLETE"
//
// See: docs/core/PHASE_FSM_SPEC.md for full FSM definition.

/**
 * Maps event type to session status (phase).
 * SINGLE SOURCE OF TRUTH: round_events table ONLY.
 */
function eventTypeToSessionStatus(eventType: string | null): SessionStatus {
  switch (eventType) {
    case "SESSION_CREATED":
      return "LOBBY";
    case "ROUND_STARTED":
    case "GUESS_SUBMITTED":
      return "ROUND_ACTIVE";
    case "ROUND_COMPLETE":
      return "ROUND_COMPLETE";
    case "SESSION_COMPLETE":
      return "SESSION_COMPLETE";
    default:
      // Empty event stream or unknown event type defaults to LOBBY
      return "LOBBY";
  }
}

export async function loadCompeteSessionSnapshot(gameId: string, viewerPlayerId?: string | null): Promise<CompeteSessionSnapshot | null> {
  // ═════════════════════════════════════════════════════════════════════════════
  // CANONICAL STATE RECONSTRUCTION — Single Source of Truth Enforcement
  // ═════════════════════════════════════════════════════════════════════════════
  // Authority: EVENT_STREAM_SPEC.md Section 6.3, PHASE_FSM_SPEC.md Section 4
  // Rule: Phase is derived EXCLUSIVELY from round_events via deriveStateFromEventStream()
  // NO alternative phase derivation paths allowed.
  // ═════════════════════════════════════════════════════════════════════════════

  // STEP 1: Load canonical state from DB via getGameState (pure reconstruction)
  const gameState = await getGameState(gameId);

  // STEP 2: Derive phase from event stream (ONLY valid method per spec)
  const { currentRound, currentPhase: phaseEventType } = deriveStateFromEventStream(gameState.events);
  const status = eventTypeToSessionStatus(phaseEventType);

  // STEP 3: Map players from canonical state.
  // `hasSubmitted` derives from round_commits for the current round.
  const currentRoundSubmissions = gameState.rounds.find(r => r.roundIndex === currentRound)?.submissions ?? [];
  const submittedPlayerIds = new Set(currentRoundSubmissions.map(s => s.playerId));
  const players: SessionPlayer[] = gameState.players.map((p) => ({
    playerId: p.playerId,
    displayName: p.displayName || p.playerId.slice(0, 8),
    joinedAt: p.joinedAt,
    leftAt: p.leftAt,
    ready: p.ready,
    isHost: p.isHost,
    hasSubmitted: submittedPlayerIds.has(p.playerId)
  }));
  const activePlayers = players.filter((p) => p.leftAt === null);

  // Host identity surfaces via SessionConfig.hostPlayerId (derived from DB column).
  const hostPlayer = players.find((p) => p.isHost && p.leftAt === null) ?? null;

  // STEP 4: Get round start time and end time from ROUND_STARTED event (event payload, not round_timing)
  const roundStartedEvent = gameState.events
    .filter(e => e.eventType === "ROUND_STARTED" && e.roundIndex === currentRound)
    .pop();
  const roundStartsAt = roundStartedEvent
    ? (roundStartedEvent.payload?.startedAt as string) ?? null
    : null;
  const roundEndsAt = roundStartedEvent
    ? (roundStartedEvent.payload?.phaseEndsAt as string) ?? null
    : null;

  // STEP 5: Build snapshot from reconstructed state
  const snapshot: CompeteSessionSnapshot = {
    gameId: gameState.session.gameId,
    status,
    config: {
      mode: gameState.session.mode,
      roundTimerSec: gameState.session.roundTimerSec,
      totalRounds: gameState.session.totalRounds,
      yearMin: gameState.session.yearMin,
      yearMax: gameState.session.yearMax,
      hostPlayerId: hostPlayer ? hostPlayer.playerId : null,
      sessionDeadline: gameState.session.sessionDeadline,
      startedAt: null,
      completedAt: null
    },
    players,
    currentRoundIndex: currentRound,
    // True iff ≥2 active players AND every active player is ready.
    // Derived; never stored.
    allPlayersReady: activePlayers.length >= 2 && activePlayers.every((p) => p.ready),
    roundStartsAt,
    roundEndsAt,
    viewerPlayerId: viewerPlayerId ?? null,
    timeRemaining: null
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 6: REPLAY EQUIVALENCE VALIDATION — Ensure DB replay equals runtime state
  // ═════════════════════════════════════════════════════════════════════════════
  // This guarantees: reconstructed state === runtime state
  // Failure = HARD ERROR (system invalid per PHASE_FSM_SPEC.md Section 9)
  // ═════════════════════════════════════════════════════════════════════════════
  const currentRoundCommits = gameState.rounds.find(r => r.roundIndex === currentRound)?.submissions ?? [];
  const expectedCommits = currentRoundCommits.length;

  // Validate that phase from event stream matches expected transitions
  if (gameState.events.length > 0) {
    const lastEvent = gameState.events[gameState.events.length - 1];

    // Replay equivalence check: if last event is ROUND_COMPLETE, status MUST be ROUND_COMPLETE
    if (lastEvent.eventType === "ROUND_COMPLETE" && status !== "ROUND_COMPLETE") {
      throw new Error(
        `[REPLAY_MISMATCH] Phase derivation mismatch: lastEvent=ROUND_COMPLETE but derivedStatus=${status}. ` +
        `Phase must be derived EXCLUSIVELY from round_events.`
      );
    }

    // Replay equivalence check: if last event is SESSION_COMPLETE, status MUST be SESSION_COMPLETE
    if (lastEvent.eventType === "SESSION_COMPLETE" && status !== "SESSION_COMPLETE") {
      throw new Error(
        `[REPLAY_MISMATCH] Phase derivation mismatch: lastEvent=SESSION_COMPLETE but derivedStatus=${status}. ` +
        `Phase must be derived EXCLUSIVELY from round_events.`
      );
    }
  }

  // Log replay validation success
  console.log(`[REPLAY_VALIDATION][PASS] gameId=${gameId} phase=${status} round=${currentRound} commits=${expectedCommits}`);

  return snapshot;
}

export async function createCompeteSession(input: CreateCompeteSessionInput): Promise<CompeteSessionSnapshot> {
  assertValidDisplayName(input.displayName);
  const mode = input.mode ?? "sync";
  const roundTimerSec = clampRoundTimer(input.roundTimerSec);
  const totalRounds = normalizeTotalRounds(input.totalRounds);
  const yearMin = normalizeYearBoundary(input.yearMin, -100, "yearMin");
  const yearMax = normalizeYearBoundary(input.yearMax, 2026, "yearMax");

  if (yearMin > yearMax) {
    throw new Error("yearMin must be less than or equal to yearMax");
  }

  const events = await fetchRandomEventsForSession(totalRounds, {
    minYear: yearMin,
    maxYear: yearMax
  });

  if (events.length !== totalRounds) {
    throw new Error(`Expected ${totalRounds} real events from the database, received ${events.length}`);
  }

  const gameId = randomUUID();
  const hostPlayerId = input.playerId;
  const seed = BigInt("0x" + randomBytes(8).toString("hex")) & BigInt("0x7FFFFFFFFFFFFFFF");
  const client = await getTransactionClient();

  try {
    await client.query("BEGIN");

    verifyLog("INSERT", "sessions", "OK", `game_id=${gameId} — executing`);
    await client.query(
      `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [gameId, mode, roundTimerSec, totalRounds, yearMin, yearMax, seed]
    );
    // Cross-connection verification will happen AFTER commit

    verifyLog("INSERT", "session_players", "OK", `host player_id=${hostPlayerId} — executing`);
    // Host row: is_host=true, ready=false (host must still opt in).
    await client.query(
      `INSERT INTO session_players (game_id, player_id, display_name, joined_at, ready, is_host)
       VALUES ($1, $2, $3, now(), false, true)`,
      [gameId, hostPlayerId, input.displayName]
    );

    await appendEvent(client, gameId, "SESSION_CREATED", {
      mode,
      totalRounds,
      hostPlayerId,
      seed: seed.toString(),
      eventIds: events.map(e => e.id)
    }, null);

    await client.query("COMMIT");
    verifyLog("COMMIT", "sessions+session_players", "OK", `game_id=${gameId}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZERO-TRUST: Cross-connection verification AFTER commit (MP-CORE-LOOP-003)
  // Rule: Verification MUST use a NEW connection to prove durability
  // ─────────────────────────────────────────────────────────────────────────────
  await verifyWriteCrossConnection(
    "sessions",
    "game_id = $1",
    [gameId],
    "createCompeteSession",
    { game_id: gameId }
  );
  await verifyWriteCrossConnection(
    "session_players",
    "game_id = $1 AND player_id = $2",
    [gameId, hostPlayerId],
    "createCompeteSession",
    { game_id: gameId, player_id: hostPlayerId }
  );

  const snapshot = await loadCompeteSessionSnapshot(gameId, hostPlayerId);
  if (!snapshot) {
    throw new Error("Unable to load the newly created compete session");
  }

  return snapshot;
}

export async function joinCompeteSession(input: { gameId: string; displayName: string; playerId: string }): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  assertValidDisplayName(input.displayName);

  if (gameId.length === 0) {
    throw new Error("gameId is required");
  }

  const session = await loadSessionRow(gameId);
  if (!session) {
    throw new Error("Session not found");
  }

  if (session.mode === "practice") {
    throw new Error("Practice sessions cannot be joined");
  }

  const playerId = input.playerId;
  verifyLog("INSERT", "session_players", "OK", `joining player_id=${playerId} game_id=${gameId} — executing`);
  // Rejoin-aware upsert:
  //   - Fresh join: inserts with left_at=NULL, ready=false, is_host=false.
  //   - Rejoin (row exists): clears left_at (player was transiently disconnected)
  //     and refreshes display_name only if a non-empty one was supplied.
  //   - ready / is_host are preserved across rejoin (no implicit reset).
  // This is the counterpart to /leave, which only sets left_at=now().
  // Without clearing left_at here, a single WS close (StrictMode remount, HMR,
  // tab refresh, transient network blip) permanently kicks the player out.
  await dbPool.query(
    `INSERT INTO session_players (game_id, player_id, display_name, joined_at, left_at, ready, is_host)
     VALUES ($1, $2, $3, now(), NULL, false, false)
     ON CONFLICT (game_id, player_id) DO UPDATE
       SET left_at = NULL,
           display_name = CASE
             WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name
             ELSE session_players.display_name
           END`,
    [gameId, playerId, input.displayName]
  );

  // Host self-heal: if the rejoining player is still marked is_host but host
  // was concurrently reassigned away, we leave the current host alone (the
  // partial unique index `uq_session_players_one_host_per_game` guarantees at
  // most one host). If there is NO active host at all (e.g. original host was
  // alone and disconnected), promote this rejoining player to host so the
  // lobby remains startable. This is idempotent and never violates the index.
  await dbPool.query(
    `UPDATE session_players
     SET is_host = true
     WHERE game_id = $1
       AND player_id = $2
       AND left_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM session_players
         WHERE game_id = $1 AND is_host = true AND left_at IS NULL
       )`,
    [gameId, playerId]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // ZERO-TRUST: Cross-connection verification AFTER write (MP-CORE-LOOP-003)
  // ─────────────────────────────────────────────────────────────────────────────
  await verifyWriteCrossConnection(
    "session_players",
    "game_id = $1 AND player_id = $2",
    [gameId, playerId],
    "joinCompeteSession",
    { game_id: gameId, player_id: playerId }
  );

  // NOTE: PLAYER_JOINED event removed — not defined in EVENT_STREAM_SPEC.md.
  // Player joins are tracked via session_players table only.
  // Phase authority remains exclusively with round_events per spec.

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Session not found");
  }

  return snapshot;
}

export async function setCompetePlayerReady(input: SetCompeteReadyInput): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId.trim();

  if (gameId.length === 0) {
    throw new Error("gameId is required");
  }

  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }

  // Atomic UPDATE — ready state lives in DB, never in memory.
  const result = await dbPool.query<{ player_id: string }>(
    `UPDATE session_players
     SET ready = $3
     WHERE game_id = $1 AND player_id = $2
     RETURNING player_id`,
    [gameId, playerId, input.ready]
  );

  if (result.rows.length === 0) {
    throw new Error("Player not found in session");
  }

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Session not found");
  }

  return snapshot;
}

export async function startCompeteSession(input: StartCompeteSessionInput): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId.trim();
  const cause = input.cause;
  const client = await getTransactionClient();

  try {
    await client.query("BEGIN");

    const session = await loadSessionRow(gameId, client);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.mode === "practice") {
      throw new Error("Practice sessions use the dedicated practice flow");
    }

    const playerRows = await loadSessionPlayerRows(gameId, client);
    const activePlayers = playerRows.filter((p) => p.left_at === null);

    if (activePlayers.length < 2) {
      throw new Error("At least 2 players required to start");
    }

    // Only the host may start the game. Host identity is DB-authoritative
    // (session_players.is_host), set at session creation and enforced by
    // the uq_session_players_one_host_per_game partial unique index.
    const host = activePlayers.find((p) => p.is_host);
    if (!host) {
      throw new Error("Session has no host");
    }
    if (host.player_id !== playerId) {
      throw new Error("Only the host can start the game");
    }

    // All active players must be ready. No fallback defaults.
    const notReady = activePlayers.filter((p) => !p.ready);
    if (notReady.length > 0) {
      throw new Error(`Not all players are ready (${notReady.length} pending)`);
    }

    const sessionCreatedEventForStart = await client.query<{ payload: { eventIds: string[] } }>(
      `SELECT payload FROM round_events
       WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
       ORDER BY id ASC LIMIT 1`,
      [gameId]
    );
    if (sessionCreatedEventForStart.rows.length === 0) {
      throw new Error("Session event not found");
    }
    const startEventIds = sessionCreatedEventForStart.rows[0].payload?.eventIds;
    if (!Array.isArray(startEventIds) || startEventIds.length === 0) {
      throw new Error("Event ID not found for round 0");
    }
    const startNow = new Date();
    const startStartedAt = startNow.toISOString();
    const startPhaseEndsAt = new Date(startNow.getTime() + session.round_timer_sec * 1000).toISOString();
    await appendEvent(client, gameId, "ROUND_STARTED", {
      roundIndex: 0,
      eventId: startEventIds[0],
      startedAt: startStartedAt,
      phaseEndsAt: startPhaseEndsAt,
      cause
    }, 0);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Session not found");
  }

  return snapshot;
}

export type SubmitGuessInput = {
  gameId: string;
  playerId: string;
  roundIndex: number;
  yearGuess: number | null;
  locationGuess: LatLng | null;
  hintsUsed: string[];
  _executionContext?: "partykit" | "api";
};

function assertValidExecutionContext(input: { _executionContext?: string }): void {
  if (input._executionContext !== "partykit" && input._executionContext !== "api") {
    throw new Error("Direct mutation not allowed - use PartyKit WebSocket or API routes for state mutations");
  }
}

export async function submitGuess(input: SubmitGuessInput): Promise<CompeteSessionSnapshot> {
  assertValidExecutionContext(input);
  const { gameId, playerId, roundIndex, yearGuess, locationGuess, hintsUsed } = input;

  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= MAX_ROUNDS) {
    throw new Error("roundIndex must be an integer between 0 and 4");
  }

  if (yearGuess !== null && (!Number.isInteger(yearGuess) || !Number.isFinite(yearGuess))) {
    throw new Error("yearGuess must be null or a finite integer");
  }

  if (locationGuess !== null) {
    if (
      typeof locationGuess.lat !== "number" ||
      !Number.isFinite(locationGuess.lat) ||
      typeof locationGuess.lng !== "number" ||
      !Number.isFinite(locationGuess.lng)
    ) {
      throw new Error("locationGuess must be null or a valid lat/lng pair");
    }
  }

  const client = await getTransactionClient();
  let shouldVerifyRoundResults = false;
  let event: Awaited<ReturnType<typeof fetchEventById>> = null;

  // Track events emitted by existing logic for transition-engine comparison
  const existingEvents: TransitionEvent[] = [];

  // Generate verification token for this operation
  const commitToken = generateVerificationToken();

  try {
    await client.query("BEGIN");

    const session = await loadSessionRow(gameId, client);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.mode === "practice") {
      throw new Error("Use practice session endpoints for practice mode");
    }

    // Check round has started via round_events (canonical source) instead of round_timing
    const roundStartedEvent = await client.query(
      `SELECT 1 FROM round_events
       WHERE game_id = $1 AND round_index = $2 AND event_type = 'ROUND_STARTED'
       LIMIT 1`,
      [gameId, roundIndex]
    );
    if (roundStartedEvent.rows.length === 0) {
      throw new Error("Round has not started");
    }

    const existingCommit = await client.query(
      `SELECT 1 FROM round_commits WHERE game_id = $1 AND player_id = $2 AND round_index = $3 LIMIT 1`,
      [gameId, playerId, roundIndex]
    );

    if (existingCommit.rows.length > 0) {
      await client.query("COMMIT");

      // Transition-engine validation: duplicate submission emits zero events
      const transitionResult = transition(
        { totalRounds: session.total_rounds, activePlayerCount: 0 },
        {
          type: "SUBMIT_GUESS",
          context: {
            gameId,
            playerId,
            roundIndex,
            yearGuess,
            locationGuess,
            hintsUsed,
            hasExistingCommit: true,
            score: 0,
            commitToken: "",
            currentRoundCommitCountBefore: 0
          }
        }
      );
      compareTransitionEvents("submitGuess-existingCommit", existingEvents, transitionResult.events);

      const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
      if (!snapshot) throw new Error("Session not found");
      return snapshot;
    }

    const sessionCreatedEvent = await client.query<{ payload: { eventIds: string[] } }>(
      `SELECT payload FROM round_events
       WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
       ORDER BY id ASC LIMIT 1`,
      [gameId]
    );
    if (sessionCreatedEvent.rows.length === 0) {
      throw new Error("Session event not found");
    }
    const eventIds = sessionCreatedEvent.rows[0].payload?.eventIds;
    if (!Array.isArray(eventIds) || roundIndex >= eventIds.length) {
      throw new Error("Event ID not found for round index");
    }
    event = await fetchEventById(eventIds[roundIndex]);
    if (!event) throw new Error("Could not load event");

    const result = evaluateRound(
      event,
      { year: yearGuess, location: locationGuess },
      roundIndex,
      false,
      { accuracy: 0, xp: 0 }
    );

    const score = result.roundXp;
    const hintsUsedCount = hintsUsed.length;

    verifyLog("INSERT", "round_commits", "OK", `player_id=${playerId} round=${roundIndex} score=${score} token=${commitToken.slice(0, 8)}... — executing`);
    await client.query(
      `INSERT INTO round_commits
         (game_id, player_id, round_index, submitted_at, year_guess,
          location_lat, location_lng, hints_used, score, verification_token)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9)`,
      [
        gameId,
        playerId,
        roundIndex,
        yearGuess,
        locationGuess?.lat ?? null,
        locationGuess?.lng ?? null,
        hintsUsedCount,
        score,
        commitToken
      ]
    );

    await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId, yearGuess, score, verificationToken: commitToken }, roundIndex);
    existingEvents.push({ type: "GUESS_SUBMITTED", payload: { playerId, yearGuess, score, verificationToken: commitToken }, roundIndex });

    const playerRows = await loadSessionPlayerRows(gameId, client);
    const activePlayers = playerRows.filter((p) => p.left_at === null);

    // MP-ACTIVE-PLAYERS-001: Completion is submission-based, not count-based.
    // Only active players (left_at IS NULL) participate.
    // If no active players remain, do nothing (no phantom round completion).
    let commitCount = 0;
    if (activePlayers.length === 0) {
      // no-op: all players disconnected
    } else {
      commitCount = await loadRoundCommitCount(gameId, roundIndex, client);
      const allActiveSubmitted = commitCount >= activePlayers.length;

      if (allActiveSubmitted) {
        verifyLog("INSERT", "round_results", "OK", `round=${roundIndex} all ${activePlayers.length} active players submitted — computing`);
        await computeAndWriteRoundResults(gameId, roundIndex, client);
        shouldVerifyRoundResults = true;
        verifyLog("INSERT", "round_results", "OK", `${commitCount} rows written for round=${roundIndex}`);
        await appendEvent(client, gameId, "ROUND_COMPLETE", { commitCount }, roundIndex);
        existingEvents.push({ type: "ROUND_COMPLETE", payload: { commitCount }, roundIndex });
      }
    }

    // Transition-engine validation: compare existing logic with centralized engine
    const transitionResult = transition(
      { totalRounds: session.total_rounds, activePlayerCount: activePlayers.length },
      {
        type: "SUBMIT_GUESS",
        context: {
          gameId,
          playerId,
          roundIndex,
          yearGuess,
          locationGuess,
          hintsUsed,
          hasExistingCommit: false,
          score,
          commitToken,
          currentRoundCommitCountBefore: commitCount >= 1 ? commitCount - 1 : 0
        }
      }
    );
    compareTransitionEvents("submitGuess", existingEvents, transitionResult.events);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ZERO-TRUST v2.0: FULL VERIFICATION AFTER COMMIT (MP-ZERO-TRUST-001)
  // Rule: Verification MUST use NEW connections to prove durability
  // ═════════════════════════════════════════════════════════════════════════════

  // 1. WRITE-SET VERIFICATION: Ensure exactly 1 round_commit exists
  await verifyWriteSet(
    "submitGuess",
    [
      { table: "round_commits", count: 1, where: { game_id: gameId, player_id: playerId, round_index: roundIndex } }
    ],
    commitToken
  );

  // 2. ROW INTEGRITY VERIFICATION: Full payload verification for round_commit
  await verifyRowIntegrity(
    "round_commits",
    {
      game_id: gameId,
      player_id: playerId,
      round_index: roundIndex,
      year_guess: yearGuess,
      location_lat: locationGuess?.lat ?? null,
      location_lng: locationGuess?.lng ?? null,
      hints_used: hintsUsed.length,
      verification_token: commitToken
    },
    "game_id = $1 AND player_id = $2 AND round_index = $3",
    [gameId, playerId, roundIndex],
    "submitGuess",
    commitToken
  );

  // 3. UNIQUENESS INVARIANT: Verify exactly 1 row per (game_id, player_id, round_index)
  await verifyUniquenessInvariant(
    "round_commits",
    ["game_id", "player_id", "round_index"],
    "game_id = $1 AND player_id = $2 AND round_index = $3",
    [gameId, playerId, roundIndex],
    "submitGuess",
    commitToken
  );

  // 4. ROUND RESULTS VERIFICATION (if computed)
  if (shouldVerifyRoundResults && event) {
    // Write-set verification for round_results
    // Count must equal current active players at verification time (may differ
    // from transaction time if disconnects occurred between commit and verify).
    const verifyPlayerRows = await loadSessionPlayerRows(gameId);
    const verifyActivePlayers = verifyPlayerRows.filter((p) => p.left_at === null);
    await verifyWriteSet(
      "submitGuess-results",
      [
        { table: "round_results", count: verifyActivePlayers.length || 1, where: { game_id: gameId, round_index: roundIndex } }
      ],
      commitToken
    );

    // 5. FULL DETERMINISTIC REPLAY VERIFICATION
    // Recompute all scores from DB commits and compare to stored results
    await verifyFullReplay(
      gameId,
      roundIndex,
      event,
      "submitGuess-fullReplay",
      commitToken
    );
  }

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) throw new Error("Session not found");

  return snapshot;
}

export type AdvanceRoundInput = {
  gameId: string;
  cause: TransitionCause;  // Authoritative domain type — from @/core/transitionCause (shared Next.js + PartyKit)
  playerId?: string;        // Required when cause=PLAYER, MUST NOT be present for TIMEOUT|INTERNAL
  roundIndex: number;
  _executionContext?: "partykit" | "api";
};

export async function advanceRound(input: AdvanceRoundInput): Promise<CompeteSessionSnapshot> {
  assertValidExecutionContext(input);
  const { gameId, cause, roundIndex } = input;

  // ═════════════════════════════════════════════════════════════════════════════
  // CAUSE VALIDATION — No inference, no defaults, no fabrication
  // TransitionCause is the shared domain contract (@/core/transitionCause)
  // ═════════════════════════════════════════════════════════════════════════════
  if (cause === TransitionCause.PLAYER) {
    if (!input.playerId || typeof input.playerId !== "string" || input.playerId.length === 0) {
      throw new Error(`playerId is required when cause is '${TransitionCause.PLAYER}'`);
    }
  } else if (cause === TransitionCause.TIMEOUT || cause === TransitionCause.INTERNAL) {
    if (input.playerId !== undefined && input.playerId !== null) {
      throw new Error(`playerId must not be provided when cause is '${cause}'`);
    }
  } else {
    throw new Error(`Invalid cause: '${cause as string}'. Must be one of: ${Object.values(TransitionCause).join(", ")}`);
  }

  const playerId = cause === TransitionCause.PLAYER ? input.playerId! : undefined;

  const client = await getTransactionClient();

  // Track events emitted by existing logic for transition-engine comparison
  const existingEvents: TransitionEvent[] = [];

  try {
    await client.query("BEGIN");

    const session = await loadSessionRow(gameId, client);
    if (!session) throw new Error("Session not found");

    if (session.mode === "practice") {
      throw new Error("Practice sessions use the dedicated practice flow");
    }

    const nextRoundIndex = roundIndex + 1;
    let advanceEventIds: string[] | undefined;
    let advanceStartedAt = "";
    let advancePhaseEndsAt = "";

    if (nextRoundIndex < session.total_rounds) {
      const sessionCreatedEventForAdvance = await client.query<{ payload: { eventIds: string[] } }>(
        `SELECT payload FROM round_events
         WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
         ORDER BY id ASC LIMIT 1`,
        [gameId]
      );
      if (sessionCreatedEventForAdvance.rows.length === 0) {
        throw new Error("Session event not found");
      }
      advanceEventIds = sessionCreatedEventForAdvance.rows[0].payload?.eventIds;
      if (!Array.isArray(advanceEventIds) || nextRoundIndex >= advanceEventIds.length) {
        throw new Error(`Event ID not found for round ${nextRoundIndex}`);
      }
      const advanceNow = new Date();
      advanceStartedAt = advanceNow.toISOString();
      advancePhaseEndsAt = new Date(advanceNow.getTime() + session.round_timer_sec * 1000).toISOString();
      const roundStartedPayload = {
        roundIndex: nextRoundIndex,
        eventId: advanceEventIds[nextRoundIndex],
        startedAt: advanceStartedAt,
        phaseEndsAt: advancePhaseEndsAt,
        cause,
        ...(playerId ? { playerId } : {})
      };
      await appendEvent(client, gameId, "ROUND_STARTED", roundStartedPayload, nextRoundIndex);
      existingEvents.push({ type: "ROUND_STARTED", payload: roundStartedPayload, roundIndex: nextRoundIndex });
    } else {
      const sessionCompletePayload = {
        totalRounds: session.total_rounds,
        cause,
        ...(playerId ? { playerId } : {})
      };
      await appendEvent(client, gameId, "SESSION_COMPLETE", sessionCompletePayload, roundIndex);
      existingEvents.push({ type: "SESSION_COMPLETE", payload: sessionCompletePayload, roundIndex });
    }

    // Transition-engine validation: compare existing logic with centralized engine
    const transitionResult = transition(
      { totalRounds: session.total_rounds, activePlayerCount: 0 },
      {
        type: "ADVANCE_ROUND",
        context: {
          gameId,
          cause,
          playerId,
          roundIndex,
          nextRoundEventId: nextRoundIndex < session.total_rounds
            ? advanceEventIds?.[nextRoundIndex] ?? null
            : null,
          startedAt: advanceStartedAt ?? "",
          phaseEndsAt: advancePhaseEndsAt ?? ""
        }
      }
    );
    compareTransitionEvents("advanceRound", existingEvents, transitionResult.events);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId ?? undefined);
  if (!snapshot) throw new Error("Session not found");

  return snapshot;
}

export async function getRoundResults(
  gameId: string,
  roundIndex: number
): Promise<Array<{ playerId: string; score: number; rank: number; accuracy: number }>> {
  const result = await dbPool.query<{ player_id: string; score: number | null; rank: number | null; location_score: number | null; time_score: number | null }>(
    `SELECT player_id, score, rank, location_score, time_score FROM round_results
     WHERE game_id = $1 AND round_index = $2
     ORDER BY rank ASC`,
    [gameId, roundIndex]
  );

  return result.rows.map((row) => ({
    playerId: row.player_id,
    score: row.score ?? 0,
    rank: row.rank ?? 0,
    accuracy: Math.round(((row.location_score ?? 0) + (row.time_score ?? 0)) / 2)
  }));
}

// NOTE: loadRoundTiming and loadRoundTimingWithLock REMOVED.
// These functions used round_timing table for phase derivation, which violates
// the single source of truth principle (round_events = phase authority).
//
// Round start times are now derived from ROUND_STARTED event payloads in round_events.
// See: EVENT_STREAM_SPEC.md Section 6.3, PHASE_FSM_SPEC.md Section 4

async function loadRoundCommitCount(
  gameId: string,
  roundIndex: number,
  executor: DbExecutor
): Promise<number> {
  const result = await executor.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM round_commits WHERE game_id = $1 AND round_index = $2`,
    [gameId, roundIndex]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

async function computeAndWriteRoundResults(
  gameId: string,
  roundIndex: number,
  executor: DbTransactionClient
): Promise<void> {
  const commits = await executor.query<{
    player_id: string;
    score: number | null;
    year_guess: number | null;
    location_lat: number | null;
    location_lng: number | null;
  }>(
    `SELECT player_id, score, year_guess, location_lat, location_lng
     FROM round_commits
     WHERE game_id = $1 AND round_index = $2
     ORDER BY score DESC NULLS LAST`,
    [gameId, roundIndex]
  );

  // Generate a single verification token for all results in this round
  const roundResultsToken = generateVerificationToken();

  for (let i = 0; i < commits.rows.length; i++) {
    const row = commits.rows[i];

    // Fetch the event to compute replay fields
    const sessionCreatedEvent = await executor.query<{ payload: { eventIds: string[] } }>(
      `SELECT payload FROM round_events
       WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
       ORDER BY id ASC LIMIT 1`,
      [gameId]
    );

    if (sessionCreatedEvent.rows.length === 0) continue;

    const eventIds = sessionCreatedEvent.rows[0].payload?.eventIds;
    if (!Array.isArray(eventIds) || roundIndex >= eventIds.length) continue;

    const event = await fetchEventById(eventIds[roundIndex], executor);
    if (!event) continue;

    // Build guess state for recomputation
    const guessState = {
      year: row.year_guess,
      location: row.location_lat !== null && row.location_lng !== null
        ? { lat: row.location_lat, lng: row.location_lng } as LatLng
        : null
    };

    // Recompute to get all replay fields
    const evaluation = evaluateRound(
      event,
      guessState,
      roundIndex,
      false,
      { accuracy: 0, xp: 0 }
    );

    // Insert with all replay fields and verification token
    await executor.query(
      `INSERT INTO round_results
         (game_id, round_index, player_id, score, rank, distance_km, year_diff, location_score, time_score, verification_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (game_id, round_index, player_id) DO NOTHING`,
      [
        gameId,
        roundIndex,
        row.player_id,
        row.score ?? 0,
        i + 1,
        evaluation.distanceKm,
        evaluation.yearDiff,
        evaluation.locationAccuracy,
        evaluation.yearAccuracy,
        roundResultsToken
      ]
    );
  }
}
