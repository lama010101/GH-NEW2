// sessionCore.ts — Minimal Playable Multiplayer Loop
// Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3 (schema) + Section 8 (RLS)
//            MASTER IMPLEMENTATION PLAN v3.0 Sections 0.1, 0.2, 5, 6
// All DB writes use ONLY columns that exist in the live schema.
// round_events written on every phase transition (Section 2 — append-only log).
// round_results written after all players commit (Section 6 — DB-authoritative scoring).
// submitGuess and advanceRound are PartyKit-only (single mutation authority).

import { randomUUID, randomBytes } from "crypto";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import type { Pool } from "pg";
import {
  CompeteSessionSnapshot,
  CreateCompeteSessionInput,
  EventHint,
  LatLng,
  PendingInvitee,
  PlayerRoundResult,
  RoundEventContent,
  SessionConfig,
  SessionPlayer,
  SessionStatus,
  KickCompetePlayerInput,
  CancelCompeteInviteInput,
  SetCompeteReadyInput,
  SetCompeteResultsTimerInput,
  SetCompeteSubModeInput,
  SetCompeteTimerInput,
  SetCompeteYearRangeInput,
  StartCompeteSessionInput
} from "@/core/types";
import { MAX_ROUNDS, TIMER_MAX_SEC, TIMER_MIN_SEC } from "@/core/types";
import { calculateBadges, evaluateNearMisses, evaluateRound } from "@/core/rules";
import {
  dbPool,
  generateVerificationToken,
  verifyWriteCrossConnection,
  // Zero-Trust v2.0 imports
  verifyRowIntegrity,
  verifyWriteSet,
  verifyUniquenessInvariant
} from "@/server/db";
import { fetchEventById, fetchRandomEventsForSession } from "@/server/events";
import { getOrCreateDailyChallenge } from "@/server/dailyChallenge";
import { dailySeed } from "@/core/dailySeed";
import { getGameState, deriveStateFromEventStream, loadPendingInvitees, type ReconstructedGameState } from "@/server/getGameState";
import {
  derivePlayerStateFromEventStream,
  type PlayerRoundEvent
} from "@/server/eventStream";
import { appendEvent, loadLastEventWithLock } from "@/server/eventStore";
import { TransitionCause } from "@/core/transitionCause";
import { transition } from "@/server/engine/transition";
import type { TransitionEvent } from "@/server/engine/transition";
import { createSupabaseServerClient, createAuthenticatedServerClient } from "@/core/supabaseServer";

// ═════════════════════════════════════════════════════════════════════════════
// TRANSITION ENGINE VALIDATION (MP-ARCH-PHASE-1)
// Compares existing logic events with centralized transition() output.
// Does NOT drive logic — purely diagnostic.
// ═════════════════════════════════════════════════════════════════════════════
function normalizeForComparison(events: TransitionEvent[]): string {
  return JSON.stringify(events.map(e => ({
    ...e,
    payload: e.type === "ROUND_COMPLETE"
      ? { ...e.payload, resultPhaseStartedAt: "__timestamp__" }
      : e.payload
  })));
}

function compareTransitionEvents(
  operation: string,
  existing: TransitionEvent[],
  expected: TransitionEvent[]
): void {
  if (normalizeForComparison(existing) !== normalizeForComparison(expected)) {
    console.error(
      `[TRANSITION MISMATCH] ${operation}\n` +
      `  existing:  ${JSON.stringify(existing)}\n` +
      `  expected:  ${JSON.stringify(expected)}`
    );
  }
}

export const PRACTICE_PLAYER_ID = "00000000-0000-0000-0000-000000000000";
export const PRACTICE_PLAYER_NAME = "Practice Player";

export const PRESSURE_CLAMP_SECONDS = 30;

// Hint tier penalty RATES (0-100 integer = 0%-100% of raw accuracy).
// Applied proportionally in evaluateRound (not flat point subtraction).
// WHEN (year) rates are age-discounted by eraScale inside evaluateRound.
const TIER_PENALTY_RATE: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };

export type DbExecutor = Pick<Pool, "query">;
export type DbTransactionClient = DbExecutor & { release(): void };
type TransactionCapablePool = DbExecutor & { connect(): Promise<DbTransactionClient> };

// Exactly matches public.sessions columns (spec DDL, Section 3.3)
export type SessionRow = {
  game_id: string;
  mode: "practice" | "sync" | "async" | "daily";
  round_timer_sec: number;
  total_rounds: number;
  year_min: number;
  year_max: number;
  results_auto_advance_sec: number;
  selected_eras: string[];
  selected_regions: string[];
  session_deadline: Date | null;
  session_deadline_days: number | null;
  created_at: Date;
  seed: bigint;
  room_code: string;
  scoring_reference_year: number;
};

// Exactly matches public.session_players columns (spec DDL, Section 3.3)
// Updated by MP-STATE-COMPLETION-004 to include ready + is_host (migration 022).
// Updated by MP-TYPE-AVATAR-001 to include avatar_url (migration 20260507100600).
export type SessionPlayerRow = {
  game_id: string;
  player_id: string;
  display_name: string;
  joined_at: Date | null;
  left_at: Date | null;
  ready: boolean;
  is_host: boolean;
  avatar_url: string | null;
  kicked: boolean;
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

function generateRoomCode(seed: bigint): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = Number(seed % BigInt(2 ** 31))
  let code = ''
  for (let i = 0; i < 6; i++) {
    s = (s * 1664525 + 1013904223) % (2 ** 32)
    code += chars[Math.floor(s / 134217728) % chars.length]
  }
  return code
}

function clampRoundTimer(roundTimerSec: number | undefined): number {
  if (roundTimerSec === undefined) {
    return 120;
  }

  if (!Number.isInteger(roundTimerSec) || !Number.isFinite(roundTimerSec)) {
    throw new Error("roundTimerSec must be a finite integer");
  }

  if (roundTimerSec === 0) {
    return 0; // 0 = timer disabled
  }

  return Math.max(TIMER_MIN_SEC, Math.min(TIMER_MAX_SEC, roundTimerSec));
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
    selectedEras: Array.isArray(row.selected_eras) ? row.selected_eras : ['ancient','medieval','earlymodern','modern','contemporary'],
    selectedRegions: Array.isArray(row.selected_regions) ? row.selected_regions : [],
    resultsAutoAdvanceSec: row.results_auto_advance_sec,
    hostPlayerId: null,
    sessionDeadline: toIsoString(row.session_deadline),
    sessionDeadlineDays: row.session_deadline_days,
    startedAt: null,
    completedAt: null,
    referenceYear: row.scoring_reference_year
  };
}

type CompeteSessionSnapshotWithPlayerSnapshots = CompeteSessionSnapshot & {
  playerSnapshots?: Record<string, CompeteSessionSnapshot>;
};

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
    avatarUrl: row.avatar_url ?? null,
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
        results_auto_advance_sec,
        session_deadline,
        session_deadline_days,
        created_at,
        seed,
        room_code,
        selected_eras,
        selected_regions,
        scoring_reference_year
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
      SELECT game_id, player_id, display_name, joined_at, left_at, ready, is_host, avatar_url, kicked
      FROM session_players
      WHERE game_id = $1
      ORDER BY joined_at ASC, player_id ASC
    `,
    [gameId]
  );

  return result.rows;
}

export type AsyncPlayerHomeState = {
  status: "your_turn" | "waiting" | "completed";
  currentRoundIndex: number;
};

export async function deriveAsyncPlayerHomeState(
  gameId: string,
  playerId: string,
  executor: DbExecutor
): Promise<AsyncPlayerHomeState> {
  const eventResult = await executor.query<{
    id: number;
    round_index: number;
    event_type: string;
    payload: Record<string, unknown>;
    occurred_at: Date;
    phase_ends_at: Date | null;
  }>(
    `SELECT id, round_index, event_type, payload, occurred_at, phase_ends_at
     FROM player_round_events
     WHERE game_id = $1 AND player_id = $2
     ORDER BY id ASC`,
    [gameId, playerId]
  );

  const playerEvents: PlayerRoundEvent[] = eventResult.rows.map((row) => ({
    id: row.id,
    roundIndex: row.round_index,
    eventType: row.event_type,
    payload: row.payload,
    createdAt: row.occurred_at.toISOString(),
    phaseEndsAt: row.phase_ends_at ? row.phase_ends_at.toISOString() : null,
  }));

  const state = derivePlayerStateFromEventStream(playerEvents);

  const sessionResult = await executor.query<{ session_deadline: Date | null }>(
    `SELECT session_deadline FROM sessions WHERE game_id = $1`,
    [gameId]
  );
  const sessionDeadline = sessionResult.rows[0]?.session_deadline ?? null;
  const deadlinePassed = sessionDeadline !== null && sessionDeadline.getTime() < Date.now();

  const isCompleted =
    state.currentPhase === "PLAYER_SESSION_COMPLETE" ||
    state.currentPhase === "SESSION_COMPLETE" ||
    deadlinePassed;

  return {
    status: isCompleted ? "completed" : "your_turn",
    currentRoundIndex: state.currentRound,
  };
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
    case "PRESSURE_APPLIED":
      return "ROUND_ACTIVE";
    case "ROUND_COMPLETE":
    case "READY_NEXT":
    case "RESULT_STARTED":
      return "ROUND_COMPLETE";
    case "PLAYER_SESSION_COMPLETE":
    case "SESSION_COMPLETE":
      return "SESSION_COMPLETE";
    default:
      // Empty event stream or unknown event type defaults to LOBBY
      return "LOBBY";
  }
}

type PlayerRoundState = {
  currentRound: number;
  phase: string | null;
  roundStartsAt: string | null;
  roundEndsAt: string | null;
  resultPhaseStartedAt: string | null;
  reachedRounds: Set<number>;
  completedRounds: Set<number>;
  submittedRounds: Set<number>;
};

type RoundResultDetail = { score: number; locationScore: number; timeScore: number; guessYear: number | null; guessLat: number | null; guessLng: number | null; distanceKm: number | null; yearDiff: number | null; absent: boolean; };

type AsyncSnapshotBase = {
  session: SessionRow;
  players: SessionPlayerRow[];
  eventIds: string[];
  globalRoundStartedAt: string | null;
  globalPhaseEndsAt: string | null;
  allPlayerEvents: Map<string, PlayerRoundEvent[]>;
  roundResultScores: Map<string, RoundResultDetail>;
  roundEventContent: RoundEventContent[];
  eventContentMap: Map<string, RoundEventContent>;
  roundEventsForViewer: (viewerPlayerId: string) => PlayerRoundEvent[];
  pendingInvitees: PendingInvitee[];
  dbVersion: {
    roundEventVersion: number;
    playerEventVersions: Record<string, number>;
  };
};

async function loadGlobalRoundEventsForAsync(
  gameId: string,
  executor: DbExecutor
): Promise<{ eventIds: string[]; globalRoundStartedAt: string | null; globalPhaseEndsAt: string | null; maxRoundEventId: number }> {
  const result = await executor.query<{
    event_type: string;
    round_index: number | null;
    payload: Record<string, unknown>;
    max_round_event_id: number;
  }>(
    `SELECT event_type, round_index, payload,
            COALESCE((SELECT MAX(id) FROM round_events WHERE game_id = $1), 0)::float8 AS max_round_event_id
     FROM round_events
     WHERE game_id = $1
       AND event_type IN ('SESSION_CREATED', 'ROUND_STARTED')
       AND (event_type != 'ROUND_STARTED' OR round_index = 0)
     ORDER BY id ASC`,
    [gameId]
  );

  const sessionCreated = result.rows.find(r => r.event_type === "SESSION_CREATED");
  const roundStarted = result.rows.find(r => r.event_type === "ROUND_STARTED");
  const eventIds = ((sessionCreated?.payload as Record<string, unknown>)?.eventIds as string[]) ?? [];
  const globalRoundStartedAt = (roundStarted?.payload?.startedAt as string) ?? null;
  const globalPhaseEndsAt = (roundStarted?.payload?.phaseEndsAt as string) ?? null;
  const maxRoundEventId = result.rows[0]?.max_round_event_id ?? 0;
  return { eventIds, globalRoundStartedAt, globalPhaseEndsAt, maxRoundEventId };
}

async function loadPlayerRoundEventsForAsync(
  gameId: string,
  executor: DbExecutor
): Promise<Map<string, PlayerRoundEvent[]>> {
  const result = await executor.query<{
    id: number;
    player_id: string;
    round_index: number;
    event_type: string;
    payload: Record<string, unknown>;
    occurred_at: Date;
    phase_ends_at: Date | null;
  }>(
    `SELECT id, player_id, round_index, event_type, payload, occurred_at, phase_ends_at
     FROM player_round_events
     WHERE game_id = $1
     ORDER BY id ASC`,
    [gameId]
  );

  const map = new Map<string, PlayerRoundEvent[]>();
  for (const row of result.rows) {
    const event: PlayerRoundEvent = {
      id: row.id,
      roundIndex: row.round_index,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.occurred_at.toISOString(),
      phaseEndsAt: row.phase_ends_at ? row.phase_ends_at.toISOString() : null,
    };
    const existing = map.get(row.player_id) ?? [];
    existing.push(event);
    map.set(row.player_id, existing);
  }
  return map;
}

async function loadRoundResultScoresForAsync(
  gameId: string,
  executor: DbExecutor
): Promise<Map<string, RoundResultDetail>> {
  const result = await executor.query<{
    player_id: string;
    round_index: number;
    score: number | null;
    location_score: number | null;
    time_score: number | null;
    year_guess: number | null;
    location_lat: number | null;
    location_lng: number | null;
    distance_km: number | null;
    year_diff: number | null;
    absent: boolean | null;
  }>(
    `SELECT rr.player_id, rr.round_index, rr.score, rr.location_score, rr.time_score,
            rr.distance_km, rr.year_diff,
            rc.year_guess, rc.location_lat, rc.location_lng,
            COALESCE(rc.absent, FALSE) AS absent
     FROM round_results rr
     LEFT JOIN round_commits rc
       ON rc.game_id = rr.game_id
      AND rc.round_index = rr.round_index
      AND rc.player_id = rr.player_id
     WHERE rr.game_id = $1`,
    [gameId]
  );

  const map = new Map<string, RoundResultDetail>();
  for (const row of result.rows) {
    map.set(`${row.player_id}:${row.round_index}`, {
      score: row.score ?? 0,
      locationScore: row.location_score ?? 0,
      timeScore: row.time_score ?? 0,
      guessYear: row.year_guess ?? null,
      guessLat: row.location_lat ?? null,
      guessLng: row.location_lng ?? null,
      distanceKm: row.distance_km ?? null,
      yearDiff: row.year_diff ?? null,
      absent: row.absent ?? false,
    });
  }
  return map;
}

async function loadRoundEventContentForAsync(
  eventIds: string[],
  executor: DbExecutor
): Promise<RoundEventContent[]> {
  if (eventIds.length === 0) {
    return [];
  }

  const eventResult = await executor.query<{
    event_id: string;
    title: string;
    description: string | null;
    event_year: number;
    latitude: number | null;
    longitude: number | null;
    display_name: string | null;
    continent: string | null;
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
      l.continent,
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

  const hintsResult = await executor.query<{
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
    existing.push(hint);
    hintsByEventId.set(row.event_id, existing);
  }

  const eventMap = new Map(eventResult.rows.map(row => [row.event_id, row]));
  return eventIds.map(id => {
    const ev = eventMap.get(id);
    return {
      eventId: id,
      title: ev?.title ?? '',
      year: ev?.event_year ?? (null as unknown as number),
      latitude: ev?.latitude ?? (null as unknown as number),
      longitude: ev?.longitude ?? (null as unknown as number),
      locationName: ev?.display_name ?? null,
      region: ev?.continent ?? null,
      imageUrl: ev?.image_url ?? null,
      description: ev?.description ?? null,
      hints: hintsByEventId.get(id) ?? [],
    };
  });
}

function derivePlayerRoundState(
  playerEvents: PlayerRoundEvent[],
  globalRoundStartedAt: string | null,
  globalPhaseEndsAt: string | null,
  gameId?: string,
  playerId?: string
): PlayerRoundState {
  const reached = new Set<number>();
  const completed = new Set<number>();
  const submitted = new Set<number>();

  if (globalRoundStartedAt !== null) {
    reached.add(0);
  }

  if (playerEvents.length === 0) {
    return {
      currentRound: 0,
      phase: globalRoundStartedAt !== null ? "ROUND_STARTED" : null,
      roundStartsAt: globalRoundStartedAt,
      roundEndsAt: globalPhaseEndsAt,
      resultPhaseStartedAt: null,
      reachedRounds: reached,
      completedRounds: completed,
      submittedRounds: submitted,
    };
  }

  let currentRound: number;
  let phase: string | null;
  try {
    const state = derivePlayerStateFromEventStream(playerEvents);
    currentRound = state.currentRound;
    phase = state.currentPhase;
  } catch (error) {
    const sequence = playerEvents.map(e => `${e.roundIndex ?? '?'}:${e.eventType}`).join(" -> ");
    const context = gameId && playerId ? ` gameId=${gameId} playerId=${playerId}` : "";
    console.error(
      `[derivePlayerRoundState] malformed player_round_events stream${context}; sequence=[${sequence}]; ${error instanceof Error ? error.message : String(error)}. Falling back to degraded state.`
    );
    const lastRoundIndex = playerEvents[playerEvents.length - 1]?.roundIndex ?? 0;
    currentRound = typeof lastRoundIndex === "number" && lastRoundIndex >= 0 ? lastRoundIndex : 0;
    phase = null;
  }

  let roundStartsAt: string | null = globalRoundStartedAt;
  let roundEndsAt: string | null = globalPhaseEndsAt;
  let resultPhaseStartedAt: string | null = null;

  for (const ev of playerEvents) {
    const roundIndex = ev.roundIndex;
    if (ev.eventType === "ROUND_STARTED") {
      roundStartsAt = (ev.payload?.startedAt as string) ?? roundStartsAt;
      roundEndsAt = ev.phaseEndsAt ?? (ev.payload?.phaseEndsAt as string) ?? roundEndsAt;
      reached.add(roundIndex);
    } else if (ev.eventType === "GUESS_SUBMITTED") {
      submitted.add(roundIndex);
    } else if (ev.eventType === "ROUND_COMPLETE") {
      resultPhaseStartedAt = (ev.payload?.resultPhaseStartedAt as string) ?? null;
      completed.add(roundIndex);
    } else if (ev.eventType === "PLAYER_SESSION_COMPLETE") {
      completed.add(roundIndex);
    }
  }

  return {
    currentRound,
    phase,
    roundStartsAt,
    roundEndsAt,
    resultPhaseStartedAt,
    reachedRounds: reached,
    completedRounds: completed,
    submittedRounds: submitted,
  };
}

function buildAsyncPlayerSnapshotFromBase(
  gameId: string,
  viewerPlayerId: string,
  base: AsyncSnapshotBase
): CompeteSessionSnapshot {
  const { session, players: playerRows, eventIds, globalRoundStartedAt, globalPhaseEndsAt, allPlayerEvents, roundResultScores, eventContentMap } = base;
  const viewerEvents = allPlayerEvents.get(viewerPlayerId) ?? [];
  const playerState = derivePlayerRoundState(viewerEvents, globalRoundStartedAt, globalPhaseEndsAt, gameId, viewerPlayerId);

  const activePlayerRows = playerRows.filter(p => p.left_at === null && p.kicked !== true);
  const allPlayersReady = false;
  const finalRoundIndex = session.total_rounds - 1;

  const players: SessionPlayer[] = playerRows.map(row => {
    const events = allPlayerEvents.get(row.player_id) ?? [];
    const state = derivePlayerRoundState(events, globalRoundStartedAt, globalPhaseEndsAt, gameId, row.player_id);
    const hasSubmitted = state.submittedRounds.has(playerState.currentRound);
    const player = mapSessionPlayerRowToPlayer(row, hasSubmitted);

    if (state.reachedRounds.size === 0) {
      return { ...player, roundStatus: row.ready ? 'ready' : 'joined', currentRoundIndex: null };
    }
    if (state.completedRounds.has(finalRoundIndex) || state.phase === 'PLAYER_SESSION_COMPLETE') {
      return { ...player, roundStatus: 'finished', currentRoundIndex: state.currentRound };
    }
    return { ...player, roundStatus: 'playing', currentRoundIndex: state.currentRound };
  });

  const guessSubmittedSet = new Set<string>();
  for (const [playerId, events] of allPlayerEvents.entries()) {
    for (const ev of events) {
      if (ev.eventType === "GUESS_SUBMITTED") {
        guessSubmittedSet.add(`${playerId}:${ev.roundIndex}`);
      }
    }
  }

  const roundResultDetailsByPlayer = new Map<string, Array<{ roundIndex: number } & RoundResultDetail>>();
  for (const [key, detail] of roundResultScores.entries()) {
    const sep = key.lastIndexOf(':');
    const playerId = key.slice(0, sep);
    const roundIndex = parseInt(key.slice(sep + 1), 10);
    const arr = roundResultDetailsByPlayer.get(playerId) ?? [];
    arr.push({ roundIndex, ...detail });
    roundResultDetailsByPlayer.set(playerId, arr);
  }

  const playerRoundResultsByRound = new Map<string, Map<number, PlayerRoundResult>>();
  for (const [playerId, rows] of roundResultDetailsByPlayer.entries()) {
    rows.sort((a, b) => a.roundIndex - b.roundIndex);
    const byRound = new Map<number, PlayerRoundResult>();
    let cumulativeScore = 0;
    let cumulativeAccRawSum = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      cumulativeScore += row.score;
      const accRaw = (row.locationScore + row.timeScore) / 2;
      cumulativeAccRawSum += accRaw;
      const accuracy = Math.round(accRaw);
      const cumulativeAccuracy = Math.round(cumulativeAccRawSum / (i + 1));
      const didSubmit = guessSubmittedSet.has(`${playerId}:${row.roundIndex}`);
      const locationAccuracy = row.locationScore;
      const yearAccuracy = row.timeScore;
      const comboAccuracy = Math.min(locationAccuracy, yearAccuracy);
      const badges = calculateBadges({ yearAccuracy, locationAccuracy, comboAccuracy });
      const nearMisses = evaluateNearMisses(yearAccuracy, locationAccuracy, comboAccuracy, badges);
      const eventId = eventIds[row.roundIndex];
      const ev = eventId ? eventContentMap.get(eventId) : undefined;
      const revealAnswer = playerState.completedRounds.has(row.roundIndex);
      byRound.set(row.roundIndex, {
        score: row.score,
        accuracy,
        cumulativeScore,
        cumulativeAccuracy,
        didSubmit,
        locationScore: row.locationScore,
        timeScore: row.timeScore,
        guessYear: row.guessYear,
        guessLat: row.guessLat,
        guessLng: row.guessLng,
        distanceKm: row.distanceKm,
        yearDiff: row.yearDiff,
        region: revealAnswer ? ev?.region ?? null : null,
        absent: row.absent,
        rank: 0,
        badges,
        nearMisses,
      });
    }
    playerRoundResultsByRound.set(playerId, byRound);
  }

  const getPlayerRoundResult = (playerId: string, roundIndex: number): PlayerRoundResult => {
    const byRound = playerRoundResultsByRound.get(playerId);
    const exact = byRound?.get(roundIndex);
    if (exact) return exact;
    const rows = roundResultDetailsByPlayer.get(playerId) ?? [];
    const priorRows = rows.filter(r => r.roundIndex <= roundIndex);
    const cumulativeScore = priorRows.reduce((sum, r) => sum + r.score, 0);
    const cumulativeAccRawSum = priorRows.reduce((sum, r) => sum + (r.locationScore + r.timeScore) / 2, 0);
    const cumulativeAccuracy = priorRows.length > 0 ? Math.round(cumulativeAccRawSum / priorRows.length) : 0;
    return {
      score: 0,
      accuracy: 0,
      cumulativeScore,
      cumulativeAccuracy,
      didSubmit: false,
      locationScore: 0,
      timeScore: 0,
      guessYear: null,
      guessLat: null,
      guessLng: null,
      distanceKm: null,
      yearDiff: null,
      region: null,
      absent: false,
      rank: 0,
      badges: [],
      nearMisses: [],
    };
  };

  const hiddenAnswerValue = null as unknown as number;

  const rounds = eventIds.map((id, roundIndex) => {
    const ev = eventContentMap.get(id);
    const revealContent = playerState.reachedRounds.has(roundIndex);
    const revealAnswer = playerState.completedRounds.has(roundIndex);
    const playerRoundResults: Record<string, PlayerRoundResult> = {};
    if (revealContent) {
      for (const row of activePlayerRows) {
        playerRoundResults[row.player_id] = getPlayerRoundResult(row.player_id, roundIndex);
      }
    }
    return {
      eventId: id,
      title: revealContent ? (ev?.title ?? '') : '',
      year: revealAnswer ? ev?.year ?? 0 : hiddenAnswerValue,
      latitude: revealAnswer ? ev?.latitude ?? 0 : hiddenAnswerValue,
      longitude: revealAnswer ? ev?.longitude ?? 0 : hiddenAnswerValue,
      locationName: revealAnswer ? ev?.locationName ?? null : null,
      region: revealAnswer ? ev?.region ?? null : null,
      imageUrl: revealContent ? (ev?.imageUrl ?? null) : null,
      description: revealContent ? (ev?.description ?? null) : null,
      hints: revealContent ? (ev?.hints ?? []) : [],
      playerRoundResults,
    };
  });

  const events = viewerEvents.map(ev => ({
    id: ev.id,
    roundIndex: ev.roundIndex,
    eventType: ev.eventType,
    payload: ev.payload,
    createdAt: ev.createdAt,
  }));

  return {
    gameId,
    status: eventTypeToSessionStatus(playerState.phase),
    config: mapSessionRowToConfig(session),
    players,
    currentRoundIndex: playerState.currentRound,
    allPlayersReady,
    roundStartsAt: playerState.roundStartsAt,
    roundEndsAt: playerState.roundEndsAt,
    viewerPlayerId: viewerPlayerId,
    timeRemaining: null,
    rounds: rounds as unknown as RoundEventContent[],
    events,
    readyForNext: [],
    resultPhaseStartedAt: playerState.resultPhaseStartedAt,
    roomCode: session.room_code,
    pendingInvitees: base.pendingInvitees,
    dbVersion: base.dbVersion,
  };
}

async function loadAsyncSnapshotBase(
  gameId: string,
  executor: DbExecutor
): Promise<AsyncSnapshotBase> {
  const globalEvents = await loadGlobalRoundEventsForAsync(gameId, executor);
  const [session, players, allPlayerEvents, roundResultScores, roundEventContent, pendingInvitees] = await Promise.all([
    loadSessionRow(gameId, executor),
    loadSessionPlayerRows(gameId, executor),
    loadPlayerRoundEventsForAsync(gameId, executor),
    loadRoundResultScoresForAsync(gameId, executor),
    loadRoundEventContentForAsync(globalEvents.eventIds, executor),
    loadPendingInvitees(gameId, executor),
  ]);

  if (!session) {
    throw new Error(`[loadAsyncSnapshotBase] Session not found: ${gameId}`);
  }

  const eventContentMap = new Map(roundEventContent.map(r => [r.eventId, r]));

  const playerEventVersions: Record<string, number> = {};
  for (const [playerId, events] of allPlayerEvents.entries()) {
    playerEventVersions[playerId] = events.length > 0 ? Math.max(...events.map((e) => e.id)) : 0;
  }
  for (const player of players) {
    // 0 is a safe floor — a new/late-joining player's first real event will have
    // id > 0 and will correctly be treated as newer than this baseline.
    if (!(player.player_id in playerEventVersions)) {
      playerEventVersions[player.player_id] = 0;
    }
  }

  const dbVersion = {
    roundEventVersion: globalEvents.maxRoundEventId,
    playerEventVersions,
  };

  return {
    session,
    players,
    eventIds: globalEvents.eventIds,
    globalRoundStartedAt: globalEvents.globalRoundStartedAt,
    globalPhaseEndsAt: globalEvents.globalPhaseEndsAt,
    allPlayerEvents,
    roundResultScores,
    roundEventContent,
    eventContentMap,
    roundEventsForViewer: (viewerPlayerId: string) => allPlayerEvents.get(viewerPlayerId) ?? [],
    pendingInvitees,
    dbVersion,
  };
}

async function ensurePlayerRoundStarted(
  gameId: string,
  playerId: string,
  base: AsyncSnapshotBase,
  executor: DbExecutor
): Promise<boolean> {
  if (base.session.mode !== "async") return false;
  if (base.globalRoundStartedAt === null) return false;

  const playerEvents = base.allPlayerEvents.get(playerId) ?? [];
  let currentRound = 0;
  let currentPhase: string | null = null;

  if (playerEvents.length === 0) {
    currentRound = 0;
    currentPhase = "ROUND_STARTED";
  } else {
    try {
      const state = derivePlayerStateFromEventStream(playerEvents);
      currentRound = state.currentRound;
      currentPhase = state.currentPhase;
    } catch (err) {
      console.error(
        `[ensurePlayerRoundStarted] derivePlayerStateFromEventStream failed: gameId=${gameId} playerId=${playerId.slice(0, 8)} globalRoundStartedAt=${base.globalRoundStartedAt} events=${JSON.stringify(playerEvents.map(e => e.eventType))} error=${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  // Only backfill a missing ROUND_STARTED for the round the player is actively
  // expected to be playing. Never start the next round while they are still in
  // the result phase of the previous round.
  if (currentPhase !== "ROUND_STARTED" && currentPhase !== "GUESS_SUBMITTED") {
    return false;
  }

  const existsResult = await executor.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM player_round_events
       WHERE game_id = $1 AND player_id = $2 AND round_index = $3 AND event_type = 'ROUND_STARTED'
     ) AS exists`,
    [gameId, playerId, currentRound]
  );
  if (existsResult.rows[0].exists) return false;

  const startedAt = new Date();
  const phaseEndsAt = base.session.round_timer_sec > 0
    ? new Date(startedAt.getTime() + base.session.round_timer_sec * 1000).toISOString()
    : null;
  const token = generateVerificationToken();
  const insertResult = await executor.query(
    `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, phase_ends_at, verification_token)
     VALUES ($1, $2, $3, 'ROUND_STARTED', $4::jsonb, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      gameId,
      playerId,
      currentRound,
      JSON.stringify({ startedAt: startedAt.toISOString() }),
      startedAt,
      phaseEndsAt ? new Date(phaseEndsAt) : null,
      token,
    ]
  );
  return ((insertResult as unknown as { rowCount: number | null }).rowCount ?? 0) === 1;
}

async function buildAsyncPlayerSnapshotForViewer(
  gameId: string,
  viewerPlayerId: string,
  executor: DbExecutor
): Promise<CompeteSessionSnapshot> {
  const base = await loadAsyncSnapshotBase(gameId, executor);
  const isActiveMember = base.players.some(
    (p) => p.player_id === viewerPlayerId && p.left_at === null && p.kicked !== true
  );
  if (!isActiveMember) {
    // Non-member viewers must not receive per-player state and must not have
    // player_round_events backfilled for them. Fall back to the base/LOBBY-shaped view.
    const fallback = await loadCompeteSessionSnapshot(gameId, null);
    if (!fallback) {
      throw new Error(`Session not found: ${gameId}`);
    }
    return fallback;
  }
  const inserted = await ensurePlayerRoundStarted(gameId, viewerPlayerId, base, executor);
  const refreshedBase = inserted ? await loadAsyncSnapshotBase(gameId, executor) : base;
  return buildAsyncPlayerSnapshotFromBase(gameId, viewerPlayerId, refreshedBase);
}

async function loadAsyncSnapshotBaseForActivePlayers(
  gameId: string,
  executor: DbExecutor
): Promise<AsyncSnapshotBase> {
  const base = await loadAsyncSnapshotBase(gameId, executor);
  const activePlayerRows = base.players.filter(p => p.left_at === null && p.kicked !== true);
  let anyInserted = false;
  for (const player of activePlayerRows) {
    const inserted = await ensurePlayerRoundStarted(gameId, player.player_id, base, executor);
    if (inserted) anyInserted = true;
  }
  return anyInserted ? await loadAsyncSnapshotBase(gameId, executor) : base;
}

function buildAsyncPlayerSnapshotsFromBase(
  gameId: string,
  base: AsyncSnapshotBase
): Record<string, CompeteSessionSnapshot> {
  const activePlayerRows = base.players.filter(p => p.left_at === null && p.kicked !== true);
  const playerSnapshots: Record<string, CompeteSessionSnapshot> = {};
  for (const player of activePlayerRows) {
    playerSnapshots[player.player_id] = buildAsyncPlayerSnapshotFromBase(gameId, player.player_id, base);
  }
  return playerSnapshots;
}

async function buildAsyncPlayerSnapshotsForActivePlayers(
  gameId: string,
  executor: DbExecutor
): Promise<Record<string, CompeteSessionSnapshot>> {
  const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, executor);
  return buildAsyncPlayerSnapshotsFromBase(gameId, base);
}

function buildAsyncBaseSnapshot(gameState: ReconstructedGameState): CompeteSessionSnapshot {
  const session = gameState.session;
  const { currentRound, currentPhase: phaseEventType } = deriveStateFromEventStream(gameState.events);
  const status = eventTypeToSessionStatus(phaseEventType);
  const players: SessionPlayer[] = gameState.players.map((p) => ({
    playerId: p.playerId,
    displayName: p.displayName || p.playerId.slice(0, 8),
    joinedAt: p.joinedAt,
    leftAt: p.leftAt,
    ready: p.ready,
    isHost: p.isHost,
    avatarUrl: p.avatarUrl ?? null,
    hasSubmitted: false,
  }));
  const activePlayers = players.filter((p) => p.leftAt === null);
  const roundStartedEvent = gameState.events
    .filter(e => e.eventType === "ROUND_STARTED" && e.roundIndex === currentRound)
    .pop();
  const roundStartsAt = (roundStartedEvent?.payload?.startedAt as string) ?? null;
  const roundCompleteEvent = gameState.events
    .filter(e => e.eventType === "ROUND_COMPLETE" && e.roundIndex === currentRound)
    .pop();
  const resultPhaseStartedAt = (roundCompleteEvent?.payload?.resultPhaseStartedAt as string) ?? null;
  const hiddenAnswerValue = null as unknown as number;
  const rounds = gameState.roundEventContent.map(r => ({
    ...r,
    title: '',
    year: hiddenAnswerValue,
    latitude: hiddenAnswerValue,
    longitude: hiddenAnswerValue,
    locationName: null,
    region: null,
    imageUrl: null,
    description: null,
    hints: [],
  }));
  const config: SessionConfig = {
    mode: session.mode,
    roundTimerSec: session.roundTimerSec,
    totalRounds: session.totalRounds,
    yearMin: session.yearMin,
    yearMax: session.yearMax,
    resultsAutoAdvanceSec: session.resultsAutoAdvanceSec,
    selectedEras: session.selectedEras,
    selectedRegions: session.selectedRegions,
    hostPlayerId: activePlayers.find(p => p.isHost)?.playerId ?? null,
    sessionDeadline: session.sessionDeadline,
    sessionDeadlineDays: session.sessionDeadlineDays,
    startedAt: null,
    completedAt: null,
    referenceYear: session.referenceYear,
  };
  return {
    gameId: session.gameId,
    status,
    config,
    players,
    currentRoundIndex: currentRound,
    allPlayersReady: false,
    roundStartsAt,
    roundEndsAt: null,
    viewerPlayerId: null,
    timeRemaining: null,
    rounds: rounds as RoundEventContent[],
    events: gameState.events,
    readyForNext: [],
    resultPhaseStartedAt,
    roomCode: session.roomCode,
    pendingInvitees: gameState.pendingInvitees,
  };
}

export async function loadCompeteSessionSnapshot(gameId: string, viewerPlayerId?: string | null): Promise<CompeteSessionSnapshot | null> {
  // ═════════════════════════════════════════════════════════════════════════════
  // CANONICAL STATE RECONSTRUCTION — Single Source of Truth Enforcement
  // ═════════════════════════════════════════════════════════════════════════════
  // Authority: EVENT_STREAM_SPEC.md Section 6.3, PHASE_FSM_SPEC.md Section 4
  // Rule: Phase is derived EXCLUSIVELY from round_events via deriveStateFromEventStream()
  // NO alternative phase derivation paths allowed.
  // ═════════════════════════════════════════════════════════════════════════════

  // Lazy-check fallback for async (Relax) session deadline enforcement.
  // This is cheap insurance (guard is read-only and only fires when the
  // session_deadline has passed) for the edge case where the DO alarm did not.
  await maybeFinalizeAsyncSessionDeadline(gameId);

  // STEP 1: Load canonical state from DB via getGameState (pure reconstruction)
  const gameState = await getGameState(gameId);

  // Async sessions use per-player event streams for state derivation.
  if (gameState.session.mode === "async") {
    if (viewerPlayerId) {
      return buildAsyncPlayerSnapshotForViewer(gameId, viewerPlayerId, dbPool);
    }
    return buildAsyncBaseSnapshot(gameState);
  }

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
    avatarUrl: p.avatarUrl ?? null,
    hasSubmitted: submittedPlayerIds.has(p.playerId)
  }));
  const activePlayers = players.filter((p) => p.leftAt === null);

  // Host identity surfaces via SessionConfig.hostPlayerId (derived from DB column).
  const hostPlayer = players.find((p) => p.isHost && p.leftAt === null) ?? null;

  // STEP 4: Get round start time and end time from ROUND_STARTED event (event payload, not round_timing)
  const roundStartedEvent = gameState.events
    .filter(e => e.eventType === "ROUND_STARTED" && e.roundIndex === currentRound)
    .pop();
  const pressureAppliedEvent = gameState.events
    .filter(e => e.eventType === "PRESSURE_APPLIED" && e.roundIndex === currentRound)
    .pop();

  const roundStartsAt = roundStartedEvent
    ? (roundStartedEvent.payload?.startedAt as string) ?? null
    : null;

  const roundEndsAt = roundStartedEvent
    ? (pressureAppliedEvent?.payload?.newRoundEndsAt as string) ?? (roundStartedEvent.payload?.phaseEndsAt as string) ?? null
    : null;

  const roundCompleteEvent = gameState.events
    .filter(e => e.eventType === "ROUND_COMPLETE" && e.roundIndex === currentRound)
    .pop();
  const resultPhaseStartedAt = roundCompleteEvent
    ? (roundCompleteEvent.payload?.resultPhaseStartedAt as string) ?? null
    : null;

  console.log("[SNAPSHOT_PLAYERS]", {
    gameId,
    totalPlayers: players.length,
    players: players.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      leftAt: p.leftAt,
      ready: p.ready,
      isHost: p.isHost,
    })),
  });

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
      resultsAutoAdvanceSec: gameState.session.resultsAutoAdvanceSec,
      selectedEras: Array.isArray(gameState.session.selectedEras) ? gameState.session.selectedEras : ['ancient','medieval','earlymodern','modern','contemporary'],
      selectedRegions: Array.isArray(gameState.session.selectedRegions) ? gameState.session.selectedRegions : [],
      hostPlayerId: hostPlayer ? hostPlayer.playerId : null,
      sessionDeadline: gameState.session.sessionDeadline,
      sessionDeadlineDays: gameState.session.sessionDeadlineDays,
      startedAt: null,
      completedAt: null,
      referenceYear: gameState.session.referenceYear
    },
    players,
    currentRoundIndex: currentRound,
    // True iff ≥1 active players AND every active player is ready.
    // Derived; never stored.
    allPlayersReady: activePlayers.length >= (gameState.session.mode === "sync" ? 2 : 1) && activePlayers.every((p) => p.ready),
    roundStartsAt,
    roundEndsAt,
    viewerPlayerId: viewerPlayerId ?? null,
    timeRemaining: null,
    rounds: gameState.roundEventContent,
    events: gameState.events,
    // readyForNext and resultPhaseEndsAt are in-memory PartyKit state
    // These are initialized to empty/undefined here and populated by PartyKit server when broadcasting
    readyForNext: [],
    resultPhaseEndsAt: undefined,
    resultPhaseStartedAt,
    roomCode: gameState.session.roomCode,
    pendingInvitees: gameState.pendingInvitees,
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
      // Transient: ROUND_COMPLETE event written but round_results not yet committed.
      // Return null so caller can retry. Callers (e.g. submitGuess) already retry
      // on null — do not retry here (see sessionCore.ts submitGuess 2-attempt
      // retry loop). Adding an internal retry would create a second retry layer
      // (nested waits → unpredictable latency) and violate single-retry-location
      // discipline.
      return null;
    }

    // Replay equivalence check: if last event is SESSION_COMPLETE, status MUST be SESSION_COMPLETE
    if (lastEvent.eventType === "SESSION_COMPLETE" && status !== "SESSION_COMPLETE") {
      // Same pattern for SESSION_COMPLETE. Callers retry on null — do not retry here.
      return null;
    }
  }

  // Log replay validation success
  console.log(`[REPLAY_VALIDATION][PASS] gameId=${gameId} phase=${status} round=${currentRound} commits=${expectedCommits}`);

  return snapshot;
}

// ═════════════════════════════════════════════════════════════════════════════
// PARTICIPANT AUTHORIZATION HELPER (MP-EXEC-COMPETE-CONSOLIDATED-001 B2)
// Single shared function for Broken Object-Level Authorization (BOLA) checks
// on GET routes that return game data. Verifies the caller's playerId is an
// active row in session_players for that gameId. PartyKit DO server-to-server
// calls bypass via x-partykit-secret (mirrors middleware.ts:100-107).
//
// NOTE: player_id is client-supplied and NOT bound to auth uid (join route
// accepts playerId from request body with no auth-uid binding). This is a
// partial BOLA mitigation — full binding is a separate effort.
// ═════════════════════════════════════════════════════════════════════════════
export async function assertParticipantOrPartyKit(
  request: Request,
  gameId: string
): Promise<{ ok: true; playerId: string | null } | { ok: false; status: number; error: string }> {
  // PartyKit DO bypass
  if (verifyPartyKitSecret(request.headers.get("x-partykit-secret"))) {
    // Optional per-socket viewer id for async cold-start snapshot. Only
    // trusted server-side callers (PartyKit) can supply this header.
    const viewerHeader = request.headers.get("x-viewer-player-id");
    if (viewerHeader && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(viewerHeader)) {
      return { ok: true, playerId: viewerHeader };
    }
    return { ok: true, playerId: null };
  }

  // Bind playerId to the authenticated user's uid — do NOT trust
  // client-supplied playerId from headers/query params (BOLA fix).
  // The client's ?playerId= is now ignored for authorization.
  const supabase = createAuthenticatedServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "authentication required" };
  }

  const playerId = user.id;

  // Verify active participation
  const result = await dbPool.query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM session_players
      WHERE game_id = $1 AND player_id = $2 AND left_at IS NULL
    ) AS exists`,
    [gameId, playerId]
  );

  if (!result.rows[0]?.exists) {
    return { ok: false, status: 403, error: "not a participant" };
  }

  return { ok: true, playerId };
}

export async function isActiveSessionPlayer(
  gameId: string,
  playerId: string,
  executor: DbExecutor = dbPool
): Promise<boolean> {
  const result = await executor.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM session_players
       WHERE game_id = $1 AND player_id = $2 AND left_at IS NULL AND kicked IS NOT TRUE
     ) AS exists`,
    [gameId, playerId]
  );
  return result.rows[0]?.exists ?? false;
}

const RESULTS_AUTO_ADVANCE_DEFAULT = 90;
const RESULTS_AUTO_ADVANCE_MIN = 0;
const RESULTS_AUTO_ADVANCE_MAX = 300;

// Relax (async) session deadline duration bounds (GAME_MODES_SPEC.md v1.4 §5.3).
// session_deadline_days stores the host-configured duration; the absolute
// session_deadline is computed at START_GAME (see startCompeteSession).
const SESSION_DEADLINE_DAYS_MIN = 1;
const SESSION_DEADLINE_DAYS_MAX = 14;
const SESSION_DEADLINE_DAYS_DEFAULT = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clampSessionDeadlineDays(value: number | undefined): number {
  if (value === undefined || value === null) return SESSION_DEADLINE_DAYS_DEFAULT;
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return SESSION_DEADLINE_DAYS_DEFAULT;
  return Math.max(SESSION_DEADLINE_DAYS_MIN, Math.min(SESSION_DEADLINE_DAYS_MAX, num));
}

function clampResultsAutoAdvanceSec(value: number | undefined): number {
  if (value === undefined || value === null) return RESULTS_AUTO_ADVANCE_DEFAULT;
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return RESULTS_AUTO_ADVANCE_DEFAULT;
  return Math.max(RESULTS_AUTO_ADVANCE_MIN, Math.min(RESULTS_AUTO_ADVANCE_MAX, num));
}

export async function createCompeteSession(input: CreateCompeteSessionInput): Promise<CompeteSessionSnapshot> {
  const mode = input.mode ?? "async";
  // Default async per-round timer to OFF (0); sync retains the 120s default.
  const roundTimerSec = clampRoundTimer(
    input.roundTimerSec === undefined && mode === "async" ? 0 : input.roundTimerSec
  );
  // All compete/practice/daily sessions are always MAX_ROUNDS (5) by product decision.
  const totalRounds = MAX_ROUNDS;
  const yearMin = normalizeYearBoundary(input.yearMin, -400, "yearMin");
  const yearMax = normalizeYearBoundary(input.yearMax, 2026, "yearMax");
  const resultsAutoAdvanceSec = clampResultsAutoAdvanceSec(input.resultsAutoAdvanceSec);

  if (yearMin > yearMax) {
    throw new Error("yearMin must be less than or equal to yearMax");
  }

  let events: Awaited<ReturnType<typeof fetchRandomEventsForSession>> = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.time("[PERF] createCompeteSession:fetchEvents");
      const regionFilter = Array.isArray(input.selectedRegions)
        ? input.selectedRegions.filter(r => typeof r === "string" && r.length > 0)
        : [];
      events = await fetchRandomEventsForSession(totalRounds, {
        minYear: yearMin,
        maxYear: yearMax,
        regions: regionFilter.length > 0 ? regionFilter : undefined,
      });
      console.timeEnd("[PERF] createCompeteSession:fetchEvents");
      break;
    } catch (err) {
      console.error(`[createCompeteSession] fetchEvents attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }

  if (events.length !== totalRounds) {
    throw new Error(`Expected ${totalRounds} real events from the database, received ${events.length}`);
  }

  const gameId = randomUUID();
  const hostPlayerId = input.playerId;
  const seed = BigInt("0x" + randomBytes(8).toString("hex")) & BigInt("0x7FFFFFFFFFFFFFFF");
  let client: DbTransactionClient | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      client = await getTransactionClient();
      break;
    } catch (err) {
      console.error(`[createCompeteSession] getTransactionClient attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  if (!client) throw new Error("Failed to acquire DB transaction client after 3 attempts");

  try {
    console.time("[PERF] createCompeteSession:transaction");
    await client.query("BEGIN");

    // Retry loop for room code unique violation
    let roomCode = generateRoomCode(seed);
    let roomCodeAttempts = 0;
    const maxRoomCodeAttempts = 5;
    let roomCodeInsertSuccess = false;

    while (!roomCodeInsertSuccess && roomCodeAttempts < maxRoomCodeAttempts) {
      try {
        await client.query(`SAVEPOINT room_code_attempt`);
        verifyLog("INSERT", "sessions", "OK", `game_id=${gameId} — executing`);
        const sessionDeadlineDays = mode === "async" ? 3 : null;
        await client.query(
          `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, results_auto_advance_sec, seed, room_code, session_deadline_days, scoring_reference_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, EXTRACT(YEAR FROM now())::INT)`,
          [gameId, mode, roundTimerSec, totalRounds, yearMin, yearMax, resultsAutoAdvanceSec, seed, roomCode, sessionDeadlineDays]
        );
        await client.query(`RELEASE SAVEPOINT room_code_attempt`);
        roomCodeInsertSuccess = true;
      } catch (err: unknown) {
        await client.query(`ROLLBACK TO SAVEPOINT room_code_attempt`);
        roomCodeAttempts++;
        if (roomCodeAttempts >= maxRoomCodeAttempts) {
          throw new Error("Failed to generate unique room code after 5 attempts");
        }
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === "23505" && pgErr.constraint === "sessions_room_code_key") {
          roomCode = generateRoomCode(seed + BigInt(roomCodeAttempts));
        } else {
          throw err; // Re-throw all other errors immediately (including game_id PK violations)
        }
      }
    }
    // Cross-connection verification will happen AFTER commit

    verifyLog("INSERT", "session_players", "OK", `host player_id=${hostPlayerId} — executing`);
    // Host row: is_host=true, ready=false (host must still opt in).
    const hostAvatarResult = await client.query<{ display_name: string; avatar_url: string }>(
      `SELECT p.display_name, p.avatar_url
       FROM public.profiles p
       WHERE p.id = $1`,
      [hostPlayerId]
    );
    const hostProfileName: string | null = hostAvatarResult.rows[0]?.display_name ?? null;
    const hostDisplayName = (hostProfileName && hostProfileName.trim().length > 0)
      ? hostProfileName.trim()
      : ((input.displayName && input.displayName.trim().length > 0) ? input.displayName.trim() : `Player-${hostPlayerId.slice(0, 6)}`);
    assertValidDisplayName(hostDisplayName);
    let hostAvatarUrl = hostAvatarResult.rows[0]?.avatar_url ?? null;
    if (!hostAvatarUrl) {
      const fallbackResult = await client.query<{ avatar_url: string }>(
        `SELECT COALESCE(firebase_url, image_url) AS avatar_url
         FROM public.avatars WHERE ready = true ORDER BY random() LIMIT 1`
      );
      hostAvatarUrl = fallbackResult.rows[0]?.avatar_url ?? null;
    }
    await client.query(
      `INSERT INTO session_players (game_id, player_id, display_name, joined_at, ready, is_host, avatar_url)
       VALUES ($1, $2, $3, now(), $5, true, $4)`,
      [gameId, hostPlayerId, hostDisplayName, hostAvatarUrl, mode === "practice"]
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
    console.timeEnd("[PERF] createCompeteSession:transaction");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZERO-TRUST: Cross-connection verification AFTER commit (MP-CORE-LOOP-003)
  // Rule: Verification MUST use a NEW connection to prove durability
  // NOTE: Verification failures are logged but do NOT cause request failure
  //       since the main transaction already committed successfully.
  // ─────────────────────────────────────────────────────────────────────────────
  console.time("[PERF] createCompeteSession:verify");
  try {
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
  } catch (verifyError) {
    console.error(
      `[VERIFY][POST_COMMIT_FAIL] createCompeteSession game_id=${gameId} - ` +
      `Verification failed but transaction committed: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`
    );
  }
  console.timeEnd("[PERF] createCompeteSession:verify");

  console.time("[PERF] createCompeteSession:snapshot");
  const snapshot = await loadCompeteSessionSnapshot(gameId, hostPlayerId);
  console.timeEnd("[PERF] createCompeteSession:snapshot");
  if (!snapshot) {
    throw new Error("Unable to load the newly created compete session");
  }

  return snapshot;
}

// ═════════════════════════════════════════════════════════════════════════════
// DAILY MODE — Session creation (DAILY_MODE_SPEC.md §6)
// Creates a sessions row with mode='daily', pinned event_ids from
// daily_challenges (§4), and a session_players host row. Auto-starts round 0
// via ensureDailyRoundStarted so Daily never lands in a permanent LOBBY.
// room_code: per-session random seed (A1 ruling — NOT daily seed, NOT date),
// with the same collision-retry loop as createCompeteSession.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Idempotently ensure a Daily session has a ROUND_STARTED event for round 0.
 * Must be called inside an existing transaction.
 */
export async function ensureDailyRoundStarted(
  client: DbTransactionClient,
  gameId: string,
  playerId: string
): Promise<void> {
  const started = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM round_events
       WHERE game_id = $1 AND event_type = 'ROUND_STARTED' AND round_index = 0
     ) AS exists`,
    [gameId]
  );
  if (started.rows[0]?.exists) {
    return;
  }

  const session = await loadSessionRow(gameId, client);
  if (!session) {
    throw new Error("Session not found");
  }

  const playerRows = await loadSessionPlayerRows(gameId, client);
  const activePlayers = playerRows.filter((p) => p.left_at === null);
  const host = activePlayers.find((p) => p.is_host);
  if (host?.player_id !== playerId) {
    throw new Error("Only the host can start the game");
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
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    throw new Error("Event ID not found for round 0");
  }

  const startNow = new Date();
  const startStartedAt = startNow.toISOString();
  const startPhaseEndsAt = session.round_timer_sec === 0
    ? null
    : new Date(startNow.getTime() + session.round_timer_sec * 1000).toISOString();

  await appendEvent(client, gameId, "ROUND_STARTED", {
    roundIndex: 0,
    eventId: eventIds[0],
    startedAt: startStartedAt,
    phaseEndsAt: startPhaseEndsAt,
    cause: TransitionCause.PLAYER,
  }, 0);
}

/**
 * Finalize a stale in-progress Daily attempt by zero-filling unsubmitted rounds
 * and running the canonical daily game-end transaction. Idempotent.
 * Must be called inside an existing transaction.
 */
export async function finalizeDailyStaleAttempt(
  client: DbTransactionClient,
  gameId: string,
  playerId: string,
  challengeDate: string
): Promise<void> {
  const attempt = await client.query<{ status: string; player_id: string }>(
    `SELECT status, player_id FROM daily_attempts WHERE game_id = $1`,
    [gameId]
  );
  if (attempt.rows.length === 0) {
    throw new Error(`No daily_attempts row for gameId=${gameId}`);
  }
  const attemptRow = attempt.rows[0];
  if (attemptRow.player_id !== playerId) {
    throw new Error("Stale Daily attempt does not belong to this player");
  }
  if (attemptRow.status === "completed" || attemptRow.status === "expired") {
    return;
  }

  const session = await loadSessionRow(gameId, client);
  if (!session || session.mode !== "daily") {
    throw new Error("Daily session not found for stale finalization");
  }

  const challenge = await client.query<{ event_ids: string[] }>(
    `SELECT event_ids FROM daily_challenges WHERE date = $1`,
    [challengeDate]
  );
  if (challenge.rows.length === 0) {
    throw new Error(`daily_challenges row not found for date=${challengeDate}`);
  }
  const eventIds = challenge.rows[0].event_ids;
  const totalRounds = eventIds.length;
  if (totalRounds === 0) {
    throw new Error("daily_challenges has no event_ids");
  }

  const existingResults = await client.query<{ round_index: number }>(
    `SELECT round_index FROM round_results WHERE game_id = $1 AND player_id = $2`,
    [gameId, playerId]
  );
  const existingRounds = new Set(existingResults.rows.map((r) => r.round_index));

  const referenceYear = session.scoring_reference_year;
  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex++) {
    if (existingRounds.has(roundIndex)) continue;

    const event = await fetchEventById(eventIds[roundIndex], client);
    if (!event) {
      throw new Error(`Event not found for round ${roundIndex} (gameId=${gameId})`);
    }
    const evaluation = evaluateRound(
      event,
      { year: null, location: null },
      roundIndex,
      false,
      0,
      0,
      referenceYear
    );

    await client.query(
      `INSERT INTO round_results
        (game_id, round_index, player_id, score, rank, distance_km, year_diff, location_score, time_score, verification_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (game_id, round_index, player_id) DO NOTHING`,
      [
        gameId,
        roundIndex,
        playerId,
        0,
        1,
        evaluation.distanceKm,
        evaluation.yearDiff,
        evaluation.locationAccuracy,
        evaluation.yearAccuracy,
        generateVerificationToken()
      ]
    );
  }

  await dailyGameEndTransaction(client, gameId, challengeDate);

  const after = await client.query<{ status: string }>(
    `SELECT status FROM daily_attempts WHERE game_id = $1`,
    [gameId]
  );
  const terminal = after.rows[0]?.status;
  if (terminal !== "completed" && terminal !== "expired") {
    await client.query(
      `UPDATE daily_attempts SET status = 'expired', completed_at = now() WHERE game_id = $1`,
      [gameId]
    );
  }
}

export async function createDailySession(input: {
  playerId: string;
  displayName?: string;
  dateIso: string;
}): Promise<CompeteSessionSnapshot> {
  const { playerId, dateIso } = input;

  // Load or generate the pinned daily challenge (§4.3)
  const challenge = await getOrCreateDailyChallenge(dateIso);

  const gameId = randomUUID();
  // Per-session random seed for room_code — NOT the daily seed (A1 ruling)
  const roomSeed = BigInt("0x" + randomBytes(8).toString("hex")) & BigInt("0x7FFFFFFFFFFFFFFF");
  const dailySeedValue = dailySeed(dateIso);

  let client: DbTransactionClient | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      client = await getTransactionClient();
      break;
    } catch (err) {
      console.error(`[createDailySession] getTransactionClient attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  if (!client) throw new Error("Failed to acquire DB transaction client after 3 attempts");

  try {
    await client.query("BEGIN");

    // Room code collision-retry loop (same mechanism as createCompeteSession)
    let roomCode = generateRoomCode(roomSeed);
    let roomCodeAttempts = 0;
    const maxRoomCodeAttempts = 5;
    let roomCodeInsertSuccess = false;

    while (!roomCodeInsertSuccess && roomCodeAttempts < maxRoomCodeAttempts) {
      try {
        await client.query(`SAVEPOINT room_code_attempt`);
        await client.query(
          `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, results_auto_advance_sec, seed, room_code, scoring_reference_year)
           VALUES ($1, 'daily', 90, 5, -100, EXTRACT(YEAR FROM now())::INT, 0, $2, $3, EXTRACT(YEAR FROM now())::INT)`,
          [gameId, dailySeedValue, roomCode]
        );
        await client.query(`RELEASE SAVEPOINT room_code_attempt`);
        roomCodeInsertSuccess = true;
      } catch (err: unknown) {
        await client.query(`ROLLBACK TO SAVEPOINT room_code_attempt`);
        roomCodeAttempts++;
        if (roomCodeAttempts >= maxRoomCodeAttempts) {
          throw new Error("Failed to generate unique room code after 5 attempts");
        }
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === "23505" && pgErr.constraint === "sessions_room_code_key") {
          roomCode = generateRoomCode(roomSeed + BigInt(roomCodeAttempts));
        } else {
          throw err;
        }
      }
    }

    // Host player row — ready=true (like practice) so startCompeteSession works
    const hostAvatarResult = await client.query<{ display_name: string; avatar_url: string }>(
      `SELECT p.display_name, p.avatar_url
       FROM public.profiles p
       WHERE p.id = $1`,
      [playerId]
    );
    const hostProfileName: string | null = hostAvatarResult.rows[0]?.display_name ?? null;
    const hostDisplayName = (hostProfileName && hostProfileName.trim().length > 0)
      ? hostProfileName.trim()
      : ((input.displayName && input.displayName.trim().length > 0) ? input.displayName.trim() : `Player-${playerId.slice(0, 6)}`);
    assertValidDisplayName(hostDisplayName);
    let hostAvatarUrl = hostAvatarResult.rows[0]?.avatar_url ?? null;
    if (!hostAvatarUrl) {
      const fallbackResult = await client.query<{ avatar_url: string }>(
        `SELECT COALESCE(firebase_url, image_url) AS avatar_url
         FROM public.avatars WHERE ready = true ORDER BY random() LIMIT 1`
      );
      hostAvatarUrl = fallbackResult.rows[0]?.avatar_url ?? null;
    }
    await client.query(
      `INSERT INTO session_players (game_id, player_id, display_name, joined_at, ready, is_host, avatar_url)
       VALUES ($1, $2, $3, now(), true, true, $4)`,
      [gameId, playerId, hostDisplayName, hostAvatarUrl]
    );

    // SESSION_CREATED with pinned event_ids — the round loop reads these
    await appendEvent(client, gameId, "SESSION_CREATED", {
      mode: "daily",
      totalRounds: 5,
      hostPlayerId: playerId,
      seed: dailySeedValue.toString(),
      eventIds: challenge.event_ids,
    }, null);

    // Auto-start round 0 so the session is ROUND_ACTIVE, not stuck in LOBBY
    await ensureDailyRoundStarted(client, gameId, playerId);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Unable to load the newly created daily session");
  }
  return snapshot;
}

export async function joinCompeteSession(input: { gameId: string; displayName: string; playerId: string }): Promise<CompeteSessionSnapshotWithPlayerSnapshots> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId;

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

  // Late join guard snapshot: used inside the transaction to avoid repeated
  // heavy state reconstruction. Reconnect checks happen under the lock.
  const currentSnapshot = await loadCompeteSessionSnapshot(gameId, null);

  // Resolve display name + avatar outside the transaction to keep the lock short.
  const joiningAvatarResult = await dbPool.query<{ display_name: string; avatar_url: string }>(
    `SELECT p.display_name, p.avatar_url
     FROM public.profiles p
     WHERE p.id = $1`,
    [playerId]
  );
  const joinProfileName: string | null = joiningAvatarResult.rows[0]?.display_name ?? null;
  const joinDisplayName = (joinProfileName && joinProfileName.trim().length > 0)
    ? joinProfileName.trim()
    : ((input.displayName && input.displayName.trim().length > 0) ? input.displayName.trim() : `Player-${playerId.slice(0, 6)}`);
  assertValidDisplayName(joinDisplayName);
  let joiningAvatarUrl = joiningAvatarResult.rows[0]?.avatar_url ?? null;
  if (!joiningAvatarUrl) {
    const fallbackResult = await dbPool.query<{ avatar_url: string }>(
      `SELECT COALESCE(firebase_url, image_url) AS avatar_url
       FROM public.avatars WHERE ready = true ORDER BY random() LIMIT 1`
    );
    joiningAvatarUrl = fallbackResult.rows[0]?.avatar_url ?? null;
  }

  // Atomic join transaction:
  // - pg_advisory_xact_lock serializes all joins for this game.
  // - player row FOR UPDATE blocks concurrent kick/leave.
  // - active count FOR UPDATE locks the current active player set so the cap
  //   is evaluated against a stable snapshot and enforced at exactly 8.
  let client: DbTransactionClient | null = null;
  try {
    client = await getTransactionClient();
    await client.query("BEGIN");

    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
      [gameId]
    );

    const playerRowResult = await client.query<{ kicked: boolean; left_at: Date | null }>(
      `SELECT kicked, left_at FROM session_players WHERE game_id = $1 AND player_id = $2 FOR UPDATE`,
      [gameId, playerId]
    );
    const playerRow = playerRowResult.rows[0];

    if (playerRow?.kicked === true) {
      await client.query("ROLLBACK");
      const err = new Error("You were removed from this game by the host") as Error & { code?: string };
      err.code = "PLAYER_KICKED";
      throw err;
    }

    const isActiveRejoiner = playerRow !== undefined && playerRow.left_at === null;

    // 8-player cap per GAME_MODES_SPEC.md Section 5.13. Active rejoiners are
    // already counted in the active set and therefore bypass the check.
    // Computed before the late-join guard so async (Relax) late joins can be
    // validated against the cap at the same time.
    let activeCount = 0;
    if (!isActiveRejoiner) {
      // Row-level FOR UPDATE on the actual active rows (no aggregate), then
      // count in application code. Postgres rejects `SELECT COUNT(*) FOR UPDATE`;
      // this is equivalent and also locks the active set so concurrent
      // kick/leave cannot mutate it while the cap is evaluated.
      const activeCountResult = await client.query<{ player_id: string }>(
        `SELECT player_id FROM session_players WHERE game_id = $1 AND left_at IS NULL FOR UPDATE`,
        [gameId]
      );
      activeCount = activeCountResult.rows.length;
      if (activeCount >= 8) {
        await client.query("ROLLBACK");
        throw new Error("Session is full (8 players max)");
      }
    }

    // Late join guard: if the game is no longer in the lobby, only active
    // reconnecting players are allowed through — except in async (Relax),
    // where players may join any time before the session deadline and player cap.
    if (currentSnapshot && currentSnapshot.status !== "LOBBY" && !isActiveRejoiner) {
      if (session.mode === "async") {
        if (session.session_deadline !== null && session.session_deadline < new Date()) {
          await client.query("ROLLBACK");
          throw new Error("Session deadline has passed");
        }
      } else {
        await client.query("ROLLBACK");
        throw new Error("Game already in progress");
      }
    }

    verifyLog("INSERT", "session_players", "OK", `joining player_id=${playerId} game_id=${gameId} — executing`);

    await client.query(
      `INSERT INTO session_players (game_id, player_id, display_name, joined_at, left_at, ready, is_host, avatar_url)
       VALUES ($1, $2, $3, now(), NULL, false, false, $4)
       ON CONFLICT (game_id, player_id) DO UPDATE
         SET left_at = NULL,
             display_name = CASE
               WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name
               ELSE session_players.display_name
             END,
             avatar_url = EXCLUDED.avatar_url`,
      [gameId, playerId, joinDisplayName, joiningAvatarUrl]
    );

    // Host self-heal: if the rejoining player is still marked is_host but host
    // was concurrently reassigned away, we leave the current host alone (the
    // partial unique index `uq_session_players_one_host_per_game` guarantees at
    // most one host). If there is NO active host at all (e.g. original host was
    // alone and disconnected), promote this rejoining player to host so the
    // lobby remains startable. This is idempotent and never violates the index.
    await client.query(
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

    await client.query("COMMIT");
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
  }

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

  // Auto-favorite: the active host follows any player added to the roster.
  const hostResult = await dbPool.query<{ player_id: string }>(
    `SELECT player_id FROM session_players
     WHERE game_id = $1 AND is_host = true AND left_at IS NULL
     LIMIT 1`,
    [gameId]
  );
  const hostPlayerId = hostResult.rows[0]?.player_id;
  if (hostPlayerId && hostPlayerId !== playerId) {
    await dbPool.query(
      `INSERT INTO public.player_follows (follower_id, followed_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_id, followed_id) DO NOTHING`,
      [hostPlayerId, playerId]
    );
  }

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Session not found");
  }

  if (session.mode === "async") {
    const playerSnapshots = await buildAsyncPlayerSnapshotsForActivePlayers(gameId, dbPool);
    return { ...snapshot, playerSnapshots };
  }

  return snapshot;
}

export async function setCompetePlayerReady(input: SetCompeteReadyInput): Promise<CompeteSessionSnapshotWithPlayerSnapshots> {
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

  if (snapshot.config?.mode === "async") {
    const playerSnapshots = await buildAsyncPlayerSnapshotsForActivePlayers(gameId, dbPool);
    return { ...snapshot, playerSnapshots };
  }

  return snapshot;
}

export async function setCompeteTimer(input: SetCompeteTimerInput): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId.trim();

  if (gameId.length === 0) {
    throw new Error("gameId is required");
  }

  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }

  const clamped = clampRoundTimer(input.roundTimerSec);

  // Verify host authority
  const hostCheck = await dbPool.query<{ player_id: string }>(
    `SELECT player_id FROM session_players
     WHERE game_id = $1 AND player_id = $2 AND is_host = true`,
    [gameId, playerId]
  );

  if (hostCheck.rows.length === 0) {
    throw new Error("Only the host can change the timer");
  }

  await dbPool.query(
    `UPDATE sessions SET round_timer_sec = $2 WHERE game_id = $1`,
    [gameId, clamped]
  );

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Session not found");
  }

  return snapshot;
}

export async function setCompeteSubMode(input: SetCompeteSubModeInput): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId.trim();

  if (gameId.length === 0) {
    throw new Error("gameId is required");
  }

  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }

  if (input.mode !== "sync" && input.mode !== "async") {
    throw new Error("mode must be 'sync' or 'async'");
  }

  // Verify host authority
  const hostCheck = await dbPool.query<{ player_id: string }>(
    `SELECT player_id FROM session_players
     WHERE game_id = $1 AND player_id = $2 AND is_host = true`,
    [gameId, playerId]
  );

  if (hostCheck.rows.length === 0) {
    throw new Error("Only the host can change the sub-mode");
  }

  // sync → no deadline duration (NULL); async → clamped 1-14 days
  const deadlineDays = input.mode === "async" ? clampSessionDeadlineDays(input.sessionDeadlineDays) : null;

  await dbPool.query(
    `UPDATE sessions SET mode = $2, session_deadline_days = $3 WHERE game_id = $1`,
    [gameId, input.mode, deadlineDays]
  );

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Session not found");
  }

  return snapshot;
}

export async function setCompeteYearRange(input: SetCompeteYearRangeInput): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId.trim();

  if (gameId.length === 0) {
    throw new Error("gameId is required");
  }

  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }

  const yearMin = Math.round(input.yearMin);
  const yearMax = Math.round(input.yearMax);

  if (!Number.isInteger(yearMin) || !Number.isInteger(yearMax)) {
    throw new Error("yearMin and yearMax must be integers");
  }

  if (yearMin > yearMax) {
    throw new Error("yearMin must be less than or equal to yearMax");
  }

  // Verify host authority
  const hostCheck = await dbPool.query<{ player_id: string }>(
    `SELECT player_id FROM session_players
     WHERE game_id = $1 AND player_id = $2 AND is_host = true`,
    [gameId, playerId]
  );

  if (hostCheck.rows.length === 0) {
    throw new Error("Only the host can change the year range");
  }

  await dbPool.query(
    `UPDATE sessions SET year_min = $2, year_max = $3 WHERE game_id = $1`,
    [gameId, yearMin, yearMax]
  );

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Session not found");
  }

  return snapshot;
}

export async function setCompeteResultsTimer(input: SetCompeteResultsTimerInput): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId.trim();

  if (gameId.length === 0) {
    throw new Error("gameId is required");
  }

  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }

  const clamped = clampResultsAutoAdvanceSec(input.resultsAutoAdvanceSec);

  // Verify host authority
  const hostCheck = await dbPool.query<{ player_id: string }>(
    `SELECT player_id FROM session_players
     WHERE game_id = $1 AND player_id = $2 AND is_host = true`,
    [gameId, playerId]
  );

  if (hostCheck.rows.length === 0) {
    throw new Error("Only the host can change the results auto-advance timer");
  }

  await dbPool.query(
    `UPDATE sessions SET results_auto_advance_sec = $2 WHERE game_id = $1`,
    [gameId, clamped]
  );

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error("Session not found");
  }

  return snapshot;
}

export async function setCompeteEraSelection(input: {
  gameId: string;
  playerId: string;
  selectedEras: string[];
  yearMin: number;
  yearMax: number;
}): Promise<CompeteSessionSnapshot> {
  const client = createSupabaseServerClient();
  const { gameId, playerId, selectedEras, yearMin, yearMax } = input;

  const { data: session, error: sessionError } = await client
    .from("sessions")
    .select("game_id, mode")
    .eq("game_id", gameId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Session not found: ${gameId}`);
  }

  const { data: player, error: playerError } = await client
    .from("session_players")
    .select("player_id, is_host")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .single();

  if (playerError || !player) {
    throw new Error(`Player not found: ${playerId}`);
  }

  if (!player.is_host) {
    throw new Error("Only the host can change era selection");
  }

  const validEras = ['ancient','medieval','earlymodern','modern','contemporary'];
  const sanitized = selectedEras.filter(e => validEras.includes(e));
  if (sanitized.length === 0) {
    throw new Error("At least one era must be selected");
  }

  const yearMinRounded = Math.round(yearMin);
  const yearMaxRounded = Math.round(yearMax);

  const { error: updateError } = await client
    .from("sessions")
    .update({
      selected_eras: sanitized,
      year_min: yearMinRounded,
      year_max: yearMaxRounded,
    })
    .eq("game_id", gameId);

  if (updateError) {
    throw new Error(`Failed to update era selection: ${updateError.message}`);
  }

  // Re-fetch events for the new year range and update SESSION_CREATED eventIds
  // so startCompeteSession uses the correct events when the game begins.
  // Also apply the current region filter so era changes don't drop the region selection.
  const { data: sessionRow, error: sessionRowError } = await client
    .from("sessions")
    .select("total_rounds, selected_regions")
    .eq("game_id", gameId)
    .single();

  if (sessionRowError || !sessionRow) {
    throw new Error("Failed to read total_rounds for event refetch");
  }

  const currentRegions: string[] = Array.isArray(sessionRow.selected_regions)
    ? (sessionRow.selected_regions as string[])
    : [];

  const freshEvents = await fetchRandomEventsForSession(sessionRow.total_rounds, {
    minYear: yearMinRounded,
    maxYear: yearMaxRounded,
    regions: currentRegions.length > 0 ? currentRegions : undefined,
  });

  if (freshEvents.length !== sessionRow.total_rounds) {
    throw new Error(
      `Era filter produced only ${freshEvents.length} events for year range ${yearMinRounded}–${yearMaxRounded}, need ${sessionRow.total_rounds}. Try selecting more eras.`
    );
  }

  // Use raw SQL to update the JSONB payload since Supabase JS client does not
  // handle nested JSONB merges cleanly.
  await dbPool.query(
    `UPDATE round_events
     SET payload = payload || jsonb_build_object('eventIds', $2::jsonb)
     WHERE game_id = $1
       AND event_type = 'SESSION_CREATED'`,
    [gameId, JSON.stringify(freshEvents.map(e => e.id))]
  );

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error(`Failed to load snapshot after era selection update: ${gameId}`);
  }
  return snapshot;
}

export async function setCompeteRegionSelection(input: {
  gameId: string;
  playerId: string;
  selectedRegions: string[];
}): Promise<CompeteSessionSnapshot> {
  const client = createSupabaseServerClient();
  const { gameId, playerId, selectedRegions } = input;

  const { data: session, error: sessionError } = await client
    .from("sessions")
    .select("game_id, mode")
    .eq("game_id", gameId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Session not found: ${gameId}`);
  }

  const { data: player, error: playerError } = await client
    .from("session_players")
    .select("player_id, is_host")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .single();

  if (playerError || !player) {
    throw new Error(`Player not found: ${playerId}`);
  }

  if (!player.is_host) {
    throw new Error("Only the host can change region selection");
  }

  // Sanitize: empty array means "all regions" (no filter).
  // Non-empty arrays are passed as-is; unknown continent names simply
  // won't match any events and will be caught by the event count check below.
  const sanitized = selectedRegions.filter(r => typeof r === 'string' && r.length > 0);

  const { error: updateError } = await client
    .from("sessions")
    .update({
      selected_regions: sanitized,
    })
    .eq("game_id", gameId);

  if (updateError) {
    throw new Error(`Failed to update region selection: ${updateError.message}`);
  }

  // Re-fetch events for the current year range + new region filter and update
  // SESSION_CREATED eventIds so startCompeteSession uses the correct events.
  const { data: sessionRow, error: sessionRowError } = await client
    .from("sessions")
    .select("total_rounds, year_min, year_max")
    .eq("game_id", gameId)
    .single();

  if (sessionRowError || !sessionRow) {
    throw new Error("Failed to read session for event refetch");
  }

  const freshEvents = await fetchRandomEventsForSession(sessionRow.total_rounds, {
    minYear: sessionRow.year_min,
    maxYear: sessionRow.year_max,
    regions: sanitized.length > 0 ? sanitized : undefined,
  });

  if (freshEvents.length !== sessionRow.total_rounds) {
    throw new Error(
      `Region filter produced only ${freshEvents.length} events for year range ${sessionRow.year_min}–${sessionRow.year_max}, need ${sessionRow.total_rounds}. Try selecting more regions.`
    );
  }

  await dbPool.query(
    `UPDATE round_events
     SET payload = payload || jsonb_build_object('eventIds', $2::jsonb)
     WHERE game_id = $1
       AND event_type = 'SESSION_CREATED'`,
    [gameId, JSON.stringify(freshEvents.map(e => e.id))]
  );

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    throw new Error(`Failed to load snapshot after region selection update: ${gameId}`);
  }
  return snapshot;
}

export async function kickCompetePlayer(input: KickCompetePlayerInput): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId.trim();
  const targetPlayerId = input.targetPlayerId.trim();

  if (gameId.length === 0) {
    throw new Error("gameId is required");
  }

  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }

  if (targetPlayerId.length === 0) {
    throw new Error("targetPlayerId is required");
  }

  if (playerId === targetPlayerId) {
    throw new Error("Cannot kick yourself");
  }

  const client = await getTransactionClient();
  try {
    await client.query("BEGIN");

    // Verify host authority
    const hostCheck = await client.query<{ player_id: string }>(
      `SELECT player_id FROM session_players
       WHERE game_id = $1 AND player_id = $2 AND is_host = true AND left_at IS NULL`,
      [gameId, playerId]
    );

    if (hostCheck.rows.length === 0) {
      throw new Error("Only the host can kick players");
    }

    // Verify target is an active player and not the host
    const targetCheck = await client.query<{ player_id: string; is_host: boolean }>(
      `SELECT player_id, is_host FROM session_players
       WHERE game_id = $1 AND player_id = $2 AND left_at IS NULL`,
      [gameId, targetPlayerId]
    );

    if (targetCheck.rows.length === 0) {
      throw new Error("Target player not found or already left");
    }

    if (targetCheck.rows[0].is_host) {
      throw new Error("Cannot kick the host");
    }

    // Kick: set left_at AND kicked=TRUE (distinguishes kick from graceful disconnect)
    await client.query(
      `UPDATE session_players
       SET left_at = now(), kicked = TRUE
       WHERE game_id = $1 AND player_id = $2`,
      [gameId, targetPlayerId]
    );

    // Cancel any pending invitation for the kicked player so it disappears
    // from their Home page pending-invitation list.
    await client.query(
      `UPDATE game_invitations
       SET status = 'cancelled'
       WHERE game_id = $1 AND invitee_id = $2 AND status = 'pending'`,
      [gameId, targetPlayerId]
    );

    // Auto-unfavorite: remove the kicked player from the host's follows.
    await client.query(
      `DELETE FROM public.player_follows
       WHERE follower_id = $1 AND followed_id = $2`,
      [playerId, targetPlayerId]
    );

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

export async function cancelCompeteInvite(input: CancelCompeteInviteInput): Promise<CompeteSessionSnapshot> {
  const gameId = input.gameId.trim();
  const playerId = input.playerId.trim();
  const inviteeId = input.inviteeId.trim();

  if (gameId.length === 0) {
    throw new Error("gameId is required");
  }

  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }

  if (inviteeId.length === 0) {
    throw new Error("inviteeId is required");
  }

  const client = await getTransactionClient();
  try {
    await client.query("BEGIN");

    // Verify host authority
    const hostCheck = await client.query<{ player_id: string }>(
      `SELECT player_id FROM session_players
       WHERE game_id = $1 AND player_id = $2 AND is_host = true AND left_at IS NULL`,
      [gameId, playerId]
    );

    if (hostCheck.rows.length === 0) {
      throw new Error("Only the host can cancel invites");
    }

    // Cancel pending invitation for the target invitee
    await client.query(
      `UPDATE game_invitations
       SET status = 'cancelled'
       WHERE game_id = $1 AND invitee_id = $2 AND status = 'pending'`,
      [gameId, inviteeId]
    );

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

async function startRelaxPlayer(input: { gameId: string; playerId: string; cause: TransitionCause }): Promise<CompeteSessionSnapshotWithPlayerSnapshots> {
  const { gameId, playerId, cause } = input;
  const client = await getTransactionClient();
  let clientReleased = false;

  try {
    await client.query("BEGIN");

    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':async-start'))`,
      [gameId, playerId]
    );

    const sessionResult = await client.query<Pick<SessionRow, "mode" | "round_timer_sec" | "session_deadline_days">>(
      `SELECT mode, round_timer_sec, session_deadline_days
       FROM sessions
       WHERE game_id = $1
       FOR UPDATE`,
      [gameId]
    );
    if (sessionResult.rows.length === 0) {
      throw new Error("Session not found");
    }
    const session = sessionResult.rows[0];
    if (session.mode !== "async") {
      throw new Error("startRelaxPlayer can only be used in async sessions");
    }

    const membershipResult = await client.query<Pick<SessionPlayerRow, "left_at" | "kicked">>(
      `SELECT left_at, kicked
       FROM session_players
       WHERE game_id = $1 AND player_id = $2
       LIMIT 1`,
      [gameId, playerId]
    );
    if (
      membershipResult.rows.length === 0 ||
      membershipResult.rows[0].left_at !== null ||
      membershipResult.rows[0].kicked
    ) {
      throw new Error("Player is not an active member of this session");
    }

    const existingStart = await client.query<{ id: string }>(
      `SELECT id FROM player_round_events
       WHERE game_id = $1 AND player_id = $2 AND round_index = 0 AND event_type = 'ROUND_STARTED'
       LIMIT 1`,
      [gameId, playerId]
    );
    if (existingStart.rows.length > 0) {
      await client.query("COMMIT");
      clientReleased = true;
      client.release();
      const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, dbPool);
      const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
      const actingPlayerSnapshot = playerSnapshots[playerId];
      if (!actingPlayerSnapshot) throw new Error("Session not found");
      return { ...actingPlayerSnapshot, playerSnapshots };
    }

    const firstStartResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM player_round_events pre
         JOIN session_players sp ON pre.game_id = sp.game_id AND pre.player_id = sp.player_id
         WHERE pre.game_id = $1
           AND pre.round_index = 0
           AND pre.event_type = 'ROUND_STARTED'
           AND sp.left_at IS NULL
       ) AS exists`,
      [gameId]
    );
    if (!firstStartResult.rows[0].exists && session.session_deadline_days !== null) {
      const startNow = new Date();
      const deadlineMs = startNow.getTime() + session.session_deadline_days * MS_PER_DAY;
      await client.query(
        `UPDATE sessions SET session_deadline = $2 WHERE game_id = $1`,
        [gameId, new Date(deadlineMs)]
      );
    }

    const startNow = new Date();
    const startStartedAt = startNow.toISOString();
    const startPhaseEndsAt = session.round_timer_sec > 0
      ? new Date(startNow.getTime() + session.round_timer_sec * 1000).toISOString()
      : null;

    const playerToken = generateVerificationToken();
    await client.query(
      `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, phase_ends_at, verification_token)
       VALUES ($1, $2, 0, 'ROUND_STARTED', $3::jsonb, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        gameId,
        playerId,
        JSON.stringify({ startedAt: startStartedAt, cause }),
        startNow,
        startPhaseEndsAt ? new Date(startPhaseEndsAt) : null,
        playerToken,
      ]
    );

    await client.query("COMMIT");
    clientReleased = true;
    client.release();

    const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, dbPool);
    const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
    const actingPlayerSnapshot = playerSnapshots[playerId];
    if (!actingPlayerSnapshot) throw new Error("Session not found");
    return { ...actingPlayerSnapshot, playerSnapshots };
  } catch (error) {
    if (!clientReleased) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      clientReleased = true;
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

export async function startCompeteSession(input: StartCompeteSessionInput): Promise<CompeteSessionSnapshotWithPlayerSnapshots> {
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

    if (session.mode === "async") {
      await client.query("ROLLBACK");
      return startRelaxPlayer({ gameId, playerId, cause });
    }

    const playerRows = await loadSessionPlayerRows(gameId, client);
    const activePlayers = playerRows.filter((p) => p.left_at === null);

    const minPlayers = session.mode === "sync" ? 2 : 1;
    if (activePlayers.length < minPlayers) {
      throw new Error(
        session.mode === "sync"
          ? "At least 2 players required to start a sync game"
          : "At least 1 player required to start"
      );
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
    // Practice mode: host is auto-ready at creation, so this always passes.
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
    const startPhaseEndsAt = session.round_timer_sec === 0
      ? null
      : new Date(startNow.getTime() + session.round_timer_sec * 1000).toISOString();

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
  // Optional hint from callers (e.g. PartyKit DO) that already know session.mode.
  // submitGuess still re-verifies mode inside its transaction; this only avoids
  // an extra preflight query on the sync hot path.
  sessionMode?: "sync" | "async";
};

function assertValidExecutionContext(input: { _executionContext?: string }): void {
  const validContexts = new Set(["partykit", "api"]);
  if (!input._executionContext || !validContexts.has(input._executionContext)) {
    console.error("[EXEC_CONTEXT_REJECT]", { received: input._executionContext });
    throw new Error("Direct mutation not allowed - use PartyKit WebSocket or API routes for state mutations");
  }
}

export async function submitGuess(input: SubmitGuessInput): Promise<CompeteSessionSnapshotWithPlayerSnapshots> {
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

  // Route async (Relax) submissions to isolated per-player round authority.
  // If a trusted caller (e.g. PartyKit DO) already knows the session mode, use
  // the hint to avoid an extra preflight DB read on the sync hot path. The mode
  // is re-verified inside the transaction before any writes occur.
  if (input.sessionMode === "async") {
    return submitGuessAsync(input);
  }

  const client = await getTransactionClient();
  let clientReleased = false;
  let shouldVerifyRoundResults = false;
  let event: Awaited<ReturnType<typeof fetchEventById>> = null;

  // Track events emitted by existing logic for transition-engine comparison
  const existingEvents: TransitionEvent[] = [];

  // Generate verification token for this operation
  const commitToken = generateVerificationToken();

  // Variables needed after transaction completes
  let activePlayers: Awaited<ReturnType<typeof loadSessionPlayerRows>> = [];
  let commitCount = 0;
  let roundResultsToken: string | null = null;

  try {
    console.time("[PERF] submitGuess:transaction");
    await client.query("BEGIN");

    // Acquire advisory lock on (gameId, roundIndex) to prevent race with
    // completeRound. Without this lock, completeRound can insert ROUND_COMPLETE
    // via appendEventIfNotExists (which bypasses FSM validation) while
    // submitGuess is between its guard check and appendEvent call. This creates
    // an invalid event sequence: ...GUESS_SUBMITTED, ROUND_COMPLETE, GUESS_SUBMITTED
    // which causes deriveStateFromEventStream to throw INVALID_PHASE_TRANSITION
    // on subsequent snapshot loads.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2::text))`,
      [gameId, roundIndex]
    );

    const session = await loadSessionRow(gameId, client);
    if (!session) {
      throw new Error("Session not found");
    }

    // If the mode hint was missing/wrong and this is actually an async session,
    // delegate to the per-player authority. This keeps the sync hot path from
    // paying for an extra preflight query while never writing round_events for
    // an async session.
    if (session.mode === "async") {
      await client.query("ROLLBACK");
      client.release();
      clientReleased = true;
      return submitGuessAsync(input);
    }

    // Consolidated guard queries — single CTE to check round start, round complete, existing commit, fetch session event IDs, fetch the ROUND_STARTED phaseEndsAt (needed for the inline pressure clamp on the first submission), and fetch scoring_reference_year (frozen at session creation for deterministic era scaling).
    const guardResult = await client.query<{
      round_started: boolean;
      round_complete: boolean;
      has_existing_commit: boolean;
      session_event_ids: string[] | null;
      round_started_phase_ends_at: string | null;
      scoring_reference_year: number;
    }>(
      `WITH
        round_started AS (
          SELECT payload->>'phaseEndsAt' AS phase_ends_at FROM round_events
          WHERE game_id = $1 AND round_index = $2 AND event_type = 'ROUND_STARTED'
          ORDER BY id ASC LIMIT 1
        ),
        round_complete AS (
          SELECT 1 FROM round_events
          WHERE game_id = $1 AND round_index = $2 AND event_type = 'ROUND_COMPLETE'
          LIMIT 1
        ),
        existing_commit AS (
          SELECT 1 FROM round_commits
          WHERE game_id = $1 AND player_id = $3 AND round_index = $2
          LIMIT 1
        ),
        session_created AS (
          SELECT payload FROM round_events
          WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
          ORDER BY id ASC LIMIT 1
        ),
        session_meta AS (
          SELECT scoring_reference_year FROM sessions WHERE game_id = $1
        )
      SELECT
        EXISTS(SELECT 1 FROM round_started)     AS round_started,
        EXISTS(SELECT 1 FROM round_complete)    AS round_complete,
        EXISTS(SELECT 1 FROM existing_commit)   AS has_existing_commit,
        (SELECT payload->'eventIds' FROM session_created)::jsonb AS session_event_ids,
        (SELECT phase_ends_at FROM round_started) AS round_started_phase_ends_at,
        (SELECT scoring_reference_year FROM session_meta) AS scoring_reference_year`,
      [gameId, roundIndex, playerId]
    );

    const guard = guardResult.rows[0];

    if (!guard.round_started) {
      throw new Error("Round has not started");
    }

    if (guard.round_complete) {
      // Round already complete — commit and load snapshot (round_results already written)
      await client.query("COMMIT");
      client.release();
      clientReleased = true;
      const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
      if (!snapshot) throw new Error("Session not found");
      return snapshot;
    }

    if (guard.has_existing_commit) {
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

      client.release();
      clientReleased = true;
      const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
      if (!snapshot) throw new Error("Session not found");
      return snapshot;
    }

    const eventIds = guard.session_event_ids;
    if (!Array.isArray(eventIds) || roundIndex >= eventIds.length) {
      throw new Error("Event ID not found for round index");
    }
    event = await fetchEventById(eventIds[roundIndex]);
    if (!event) throw new Error("Could not load event");

    const hintRows = hintsUsed.length > 0
      ? (await client.query<{ id: string; type: string; tier: number }>(
          `SELECT id, type, tier FROM hints WHERE id = ANY($1::uuid[])`,
          [hintsUsed]
        )).rows
      : [];

    let whenPenaltyRate = 0;
    let wherePenaltyRate = 0;
    for (const h of hintRows) {
      const p = TIER_PENALTY_RATE[h.tier] ?? 0;
      if (h.type === 'when')  whenPenaltyRate  += p;
      if (h.type === 'where') wherePenaltyRate += p;
    }
    whenPenaltyRate  = Math.min(whenPenaltyRate,  100);
    wherePenaltyRate = Math.min(wherePenaltyRate, 100);

    const referenceYear = guard.scoring_reference_year;

    const result = evaluateRound(
      event,
      { year: yearGuess, location: locationGuess },
      roundIndex,
      false,
      whenPenaltyRate,
      wherePenaltyRate,
      referenceYear
    );

    const score = result.roundXp;
    const hintsUsedCount = hintsUsed.length;

    // Persist hint IDs to round_hints table (MP-FEAT-ROUND-HINTS-PERSIST-001)
    if (hintRows.length > 0) {
      const hintValues = hintRows.map((_, i) => {
        const base = i * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      }).join(', ');

      const hintParams = hintRows.flatMap(h => [gameId, playerId, roundIndex, h.id]);

      await client.query(
        `INSERT INTO round_hints (game_id, player_id, round_index, hint_id)
         VALUES ${hintValues}
         ON CONFLICT DO NOTHING`,
        hintParams
      );
    }

    verifyLog("INSERT", "round_commits", "OK", `player_id=${playerId} round=${roundIndex} score=${score} token=${commitToken.slice(0, 8)}... — executing`);
    const insertResult = await client.query(
      `INSERT INTO round_commits
         (game_id, player_id, round_index, submitted_at, year_guess,
          location_lat, location_lng, hints_used, score,
          acc_penalty, acc_penalty_when, acc_penalty_where,
          acc_penalty_when_rate, acc_penalty_where_rate,
          verification_token)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (game_id, player_id, round_index) DO NOTHING`,
      [
        gameId,
        playerId,
        roundIndex,
        yearGuess,
        locationGuess?.lat ?? null,
        locationGuess?.lng ?? null,
        hintsUsedCount,
        score,
        whenPenaltyRate + wherePenaltyRate,
        whenPenaltyRate,
        wherePenaltyRate,
        whenPenaltyRate,
        wherePenaltyRate,
        commitToken
      ]
    );
    console.timeLog("[PERF] submitGuess:transaction", "after INSERT round_commits");

    if ((insertResult as unknown as { rowCount: number | null }).rowCount === 0) {
      // Commit already exists (concurrent submission) — return current snapshot
      await client.query("COMMIT");
      client.release();
      clientReleased = true;
      const snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
      if (!snapshot) throw new Error("Session not found");
      return snapshot;
    }

    await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId, yearGuess, score, verificationToken: commitToken }, roundIndex);
    console.timeLog("[PERF] submitGuess:transaction", "after appendEvent GUESS_SUBMITTED");
    existingEvents.push({ type: "GUESS_SUBMITTED", payload: { playerId, yearGuess, score, verificationToken: commitToken }, roundIndex });

    const playerRows = await loadSessionPlayerRows(gameId, client);
    activePlayers = playerRows.filter((p) => p.left_at === null);

    // MP-ACTIVE-PLAYERS-001: Completion is submission-based, not count-based.
    // Only active players (left_at IS NULL) participate.
    // If no active players remain, do nothing (no phantom round completion).
    if (activePlayers.length === 0) {
      // no-op: all players disconnected
    } else {
      commitCount = await loadRoundCommitCount(gameId, roundIndex, client);
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

    // ═════════════════════════════════════════════════════════════════════════════
    // INLINE PRESSURE CLAMP (MP-EXEC-COMPETE-CONSOLIDATED-001 A2)
    // Applied atomically inside the same transaction as the first round_commit,
    // so the clamp is committed before any concurrent/later submitGuess can read
    // the snapshot. Single source of truth: ONE PRESSURE_APPLIED event per round
    // (idempotency via idx_round_events_unique_pressure partial unique index +
    // appendPressureAppliedIfNotExists ON CONFLICT DO NOTHING). Replaces the old
    // separate clamp HTTP write that was rejected by the FSM trigger (root
    // cause of the pressure-clamp race — see A0/A1).
    // ═════════════════════════════════════════════════════════════════════════════
    if (commitCount === 1 && guard.round_started_phase_ends_at && session.mode === "sync") {
      const remainingMs = Date.parse(guard.round_started_phase_ends_at) - Date.now();
      if (remainingMs > PRESSURE_CLAMP_SECONDS * 1000) {
        const newRoundEndsAt = new Date(Date.now() + PRESSURE_CLAMP_SECONDS * 1000).toISOString();
        const inserted = await appendPressureAppliedIfNotExists(
          client, gameId, roundIndex,
          { newRoundEndsAt, clampedToSec: PRESSURE_CLAMP_SECONDS }
        );
        if (inserted) {
          console.log(`[PRESSURE_CLAMP] gameId=${gameId} round=${roundIndex} clamped to ${PRESSURE_CLAMP_SECONDS}s (newRoundEndsAt=${newRoundEndsAt})`);
        }
      }
    }

    await client.query("COMMIT");
    console.timeEnd("[PERF] submitGuess:transaction");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (!clientReleased) client.release();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ROUND COMPLETION (outside main transaction for performance)
  // ═════════════════════════════════════════════════════════════════════════════
  // Re-check commit count after commit to close race where concurrent
  // submissions each saw < total commits inside their transaction.
  const finalCommitCount = await loadRoundCommitCount(gameId, roundIndex, dbPool);
  const finalPlayerRows = await loadSessionPlayerRows(gameId, dbPool);
  const finalActivePlayers = finalPlayerRows.filter((p) => p.left_at === null);
  // H2 FIX: Gate on whether every ACTIVE player has a commit row, not raw commit
  // count (which includes left players' commits). Prevents premature round
  // completion when a player submits then leaves — consistent with the
  // timer-expiry path (insertMissingCommits) which checks active players only.
  const finalCommittedPlayerIds = new Set(
    (await dbPool.query<{ player_id: string }>(
      `SELECT player_id FROM round_commits WHERE game_id = $1 AND round_index = $2`,
      [gameId, roundIndex]
    )).rows.map(r => r.player_id)
  );
  const finalAllActiveSubmitted = finalActivePlayers.length > 0 &&
    finalActivePlayers.every(p => finalCommittedPlayerIds.has(p.player_id));

  if (finalAllActiveSubmitted) {
    verifyLog("INSERT", "round_results", "OK", `round=${roundIndex} all ${finalActivePlayers.length} active players submitted — computing`);
    const resultsClient = await getTransactionClient();
    try {
      await resultsClient.query("BEGIN");
      await resultsClient.query(
        `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2::text))`,
        [gameId, roundIndex]
      );
      // Atomic insert with idempotency via unique partial index
      const roundCompleteInserted = await appendEventIfNotExists(
        resultsClient, gameId, "ROUND_COMPLETE",
        { commitCount: finalCommitCount, resultPhaseStartedAt: new Date().toISOString() },
        roundIndex
      );
      if (roundCompleteInserted) {
        roundResultsToken = await computeAndWriteRoundResults(gameId, roundIndex, resultsClient);
        shouldVerifyRoundResults = true;
        verifyLog("INSERT", "round_results", "OK", `${finalCommitCount} rows written for round=${roundIndex} token=${roundResultsToken.slice(0, 8)}...`);
      }
      // If !roundCompleteInserted: concurrent caller won, this caller skips compute — both paths commit cleanly
      await resultsClient.query("COMMIT");
    } catch (error) {
      await resultsClient.query("ROLLBACK");
      throw error;
    } finally {
      resultsClient.release();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ZERO-TRUST v2.0: FULL VERIFICATION AFTER COMMIT (MP-ZERO-TRUST-001)
  // Rule: Verification MUST use NEW connections to prove durability
  // ═════════════════════════════════════════════════════════════════════════════

  // 1. WRITE-SET VERIFICATION: Ensure exactly 1 round_commit exists
  if (process.env.ENABLE_ZERO_TRUST === "true") {
    await verifyWriteSet(
      "submitGuess",
      [
        { table: "round_commits", count: 1, where: { game_id: gameId, player_id: playerId, round_index: roundIndex } }
      ],
      commitToken
    );
  }

  // 2. ROW INTEGRITY VERIFICATION: Full payload verification for round_commit
  if (process.env.ENABLE_ZERO_TRUST === "true") {
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
  }

  // 3. UNIQUENESS INVARIANT: Verify exactly 1 row per (game_id, player_id, round_index)
  if (process.env.ENABLE_ZERO_TRUST === "true") {
    await verifyUniquenessInvariant(
      "round_commits",
      ["game_id", "player_id", "round_index"],
      "game_id = $1 AND player_id = $2 AND round_index = $3",
      [gameId, playerId, roundIndex],
      "submitGuess",
      commitToken
    );
  }

  // 4. ROUND RESULTS VERIFICATION (if computed)
  if (shouldVerifyRoundResults && event) {
    // Write-set verification for round_results
    // Count must equal current active players at verification time (may differ
    // from transaction time if disconnects occurred between commit and verify).
    const verifyPlayerRows = await loadSessionPlayerRows(gameId);
    const verifyActivePlayers = verifyPlayerRows.filter((p) => p.left_at === null);
    if (process.env.ENABLE_ZERO_TRUST === "true") {
      await verifyWriteSet(
        "submitGuess-results",
        [
          { table: "round_results", count: verifyActivePlayers.length || 1, where: { game_id: gameId, round_index: roundIndex } }
        ],
        commitToken
      );
    }

    // Row integrity verification for each round_result entry
    if (process.env.ENABLE_ZERO_TRUST === "true" && roundResultsToken) {
      const resultsRows = await dbPool.query<{
        player_id: string;
        score: number;
        rank: number;
        distance_km: number;
        year_diff: number;
        location_score: number;
        time_score: number;
        verification_token: string;
      }>(
        `SELECT player_id, score, rank, distance_km, year_diff, location_score, time_score, verification_token
         FROM round_results
         WHERE game_id = $1 AND round_index = $2
         ORDER BY player_id`,
        [gameId, roundIndex]
      );

      for (const row of resultsRows.rows) {
        await verifyRowIntegrity(
          "round_results",
          {
            game_id: gameId,
            round_index: roundIndex,
            player_id: row.player_id,
            score: row.score,
            rank: row.rank,
            distance_km: row.distance_km,
            year_diff: row.year_diff,
            location_score: row.location_score,
            time_score: row.time_score,
            verification_token: roundResultsToken
          },
          "game_id = $1 AND round_index = $2 AND player_id = $3",
          [gameId, roundIndex, row.player_id],
          "submitGuess-results",
          roundResultsToken
        );
      }
    }

    // 5. FULL DETERMINISTIC REPLAY VERIFICATION
    // Recompute all scores from DB commits and compare to stored results
    if (process.env.ENABLE_ZERO_TRUST === "true") {
      // MP-PERF-001: removed from hot path — replay is O(n), must not block request
      // await verifyFullReplay(
      //   gameId,
      //   roundIndex,
      //   event,
      //   "submitGuess-fullReplay",
      //   commitToken
      // );
    }
  }

  console.time("[PERF] submitGuess:snapshot");
  let snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  if (!snapshot) {
    await new Promise(r => setTimeout(r, 300));
    snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  }
  if (!snapshot) {
    await new Promise(r => setTimeout(r, 500));
    snapshot = await loadCompeteSessionSnapshot(gameId, playerId);
  }
  console.timeEnd("[PERF] submitGuess:snapshot");
  if (!snapshot) throw new Error("Session not found");

  return snapshot;
}

// ═════════════════════════════════════════════════════════════════════════════
// ASYNC (RELAX) PER-PLAYER ROUND AUTHORITY — MP-FEAT-RELAX-SOLO-PACING-PHASE1-001
// All functions below write ONLY to player_round_events and shared tables;
// they never write to round_events and never read other players' state.
// ═════════════════════════════════════════════════════════════════════════════

// INVARIANT: pressure clamp must never apply here — async has no shared
// countdown. See MP-RELAX-PRESSURE-001.
async function submitGuessAsync(input: SubmitGuessInput): Promise<CompeteSessionSnapshotWithPlayerSnapshots> {
  assertValidExecutionContext(input);
  const { gameId, playerId, roundIndex, yearGuess, locationGuess, hintsUsed } = input;

  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= MAX_ROUNDS) {
    throw new Error("roundIndex must be an integer between 0 and 4");
  }

  const client = await getTransactionClient();
  let clientReleased = false;
  try {
    await client.query("BEGIN");

    // Serialize per-player round events for this game+player.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':async'))`,
      [gameId, playerId]
    );

    const guardResult = await client.query<{
      mode: "practice" | "sync" | "async" | "daily";
      total_rounds: number;
      round_timer_sec: number;
      scoring_reference_year: number;
      has_existing_commit: boolean;
      round_complete: boolean;
      session_event_ids: string[] | null;
      last_complete_round: number | null;
    }>(
      `WITH
        session_meta AS (
          SELECT mode, total_rounds, round_timer_sec, scoring_reference_year FROM sessions WHERE game_id = $1
        ),
        existing_commit AS (
          SELECT 1 FROM round_commits
          WHERE game_id = $1 AND player_id = $2 AND round_index = $3
          LIMIT 1
        ),
        round_complete AS (
          SELECT 1 FROM player_round_events
          WHERE game_id = $1 AND player_id = $2 AND round_index = $3 AND event_type = 'ROUND_COMPLETE'
          LIMIT 1
        ),
        last_complete AS (
          SELECT MAX(round_index) AS round_index FROM player_round_events
          WHERE game_id = $1 AND player_id = $2 AND event_type = 'ROUND_COMPLETE'
        ),
        session_created AS (
          SELECT payload FROM round_events
          WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
          ORDER BY id ASC LIMIT 1
        )
      SELECT
        (SELECT mode FROM session_meta) AS mode,
        (SELECT total_rounds FROM session_meta) AS total_rounds,
        (SELECT round_timer_sec FROM session_meta) AS round_timer_sec,
        (SELECT scoring_reference_year FROM session_meta) AS scoring_reference_year,
        EXISTS(SELECT 1 FROM existing_commit) AS has_existing_commit,
        EXISTS(SELECT 1 FROM round_complete) AS round_complete,
        (SELECT (SELECT payload->'eventIds' FROM session_created)::jsonb) AS session_event_ids,
        (SELECT round_index FROM last_complete) AS last_complete_round`,
      [gameId, playerId, roundIndex]
    );

    const guard = guardResult.rows[0];
    if (!guard || guard.total_rounds === null || guard.total_rounds === undefined) {
      throw new Error("Session not found");
    }
    if (guard.mode !== "async") {
      throw new Error("submitGuessAsync can only be used in async sessions");
    }
    if (roundIndex >= guard.total_rounds) {
      throw new Error("roundIndex out of bounds for this session");
    }

    // Idempotent return if this round is already complete.
    if (guard.round_complete) {
      const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, client);
      await client.query("COMMIT");
      client.release();
      clientReleased = true;
      const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
      const snapshot = playerSnapshots[playerId];
      if (!snapshot) throw new Error("Session not found");
      return { ...snapshot, playerSnapshots };
    }

    // Idempotent return if a commit already exists (concurrent submission).
    if (guard.has_existing_commit) {
      const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, client);
      await client.query("COMMIT");
      client.release();
      clientReleased = true;
      const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
      const snapshot = playerSnapshots[playerId];
      if (!snapshot) throw new Error("Session not found");
      return { ...snapshot, playerSnapshots };
    }

    // The requested round must be the player's current expected round.
    const expectedRoundIndex = (guard.last_complete_round ?? -1) + 1;
    if (roundIndex !== expectedRoundIndex) {
      throw new Error(`Round ${roundIndex} is not the player's current round (expected ${expectedRoundIndex})`);
    }

    // Ensure the per-player ROUND_STARTED row exists for this round.
    const startedResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM player_round_events
         WHERE game_id = $1 AND player_id = $2 AND round_index = $3 AND event_type = 'ROUND_STARTED'
       ) AS exists`,
      [gameId, playerId, roundIndex]
    );
    if (!startedResult.rows[0].exists) {
      const startedAt = new Date();
      const phaseEndsAt = guard.round_timer_sec > 0
        ? new Date(startedAt.getTime() + guard.round_timer_sec * 1000).toISOString()
        : null;
      const startedToken = generateVerificationToken();
      await client.query(
        `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, phase_ends_at, verification_token)
         VALUES ($1, $2, $3, 'ROUND_STARTED', $4::jsonb, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          gameId,
          playerId,
          roundIndex,
          JSON.stringify({ startedAt: startedAt.toISOString() }),
          startedAt,
          phaseEndsAt ? new Date(phaseEndsAt) : null,
          startedToken,
        ]
      );
    }

    const eventIds = guard.session_event_ids;
    if (!Array.isArray(eventIds) || roundIndex >= eventIds.length) {
      throw new Error("Event ID not found for round index");
    }

    const event = await fetchEventById(eventIds[roundIndex], client);
    if (!event) throw new Error("Could not load event");

    const hintRows = hintsUsed.length > 0
      ? (await client.query<{ id: string; type: string; tier: number }>(
          `SELECT id, type, tier FROM hints WHERE id = ANY($1::uuid[])`,
          [hintsUsed]
        )).rows
      : [];

    let whenPenaltyRate = 0;
    let wherePenaltyRate = 0;
    for (const h of hintRows) {
      const p = TIER_PENALTY_RATE[h.tier] ?? 0;
      if (h.type === 'when') whenPenaltyRate += p;
      if (h.type === 'where') wherePenaltyRate += p;
    }
    whenPenaltyRate = Math.min(whenPenaltyRate, 100);
    wherePenaltyRate = Math.min(wherePenaltyRate, 100);

    const referenceYear = guard.scoring_reference_year;

    const result = evaluateRound(
      event,
      { year: yearGuess, location: locationGuess },
      roundIndex,
      false,
      whenPenaltyRate,
      wherePenaltyRate,
      referenceYear
    );

    const score = result.roundXp;
    const hintsUsedCount = hintsUsed.length;

    if (hintRows.length > 0) {
      const hintValues = hintRows.map((_, i) => {
        const base = i * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      }).join(', ');
      const hintParams = hintRows.flatMap(h => [gameId, playerId, roundIndex, h.id]);
      await client.query(
        `INSERT INTO round_hints (game_id, player_id, round_index, hint_id)
         VALUES ${hintValues}
         ON CONFLICT DO NOTHING`,
        hintParams
      );
    }

    const commitToken = generateVerificationToken();
    verifyLog("INSERT", "round_commits", "OK", `player_id=${playerId} round=${roundIndex} score=${score} token=${commitToken.slice(0, 8)}... — async executing`);
    const insertResult = await client.query(
      `INSERT INTO round_commits
         (game_id, player_id, round_index, submitted_at, year_guess,
          location_lat, location_lng, hints_used, score,
          acc_penalty, acc_penalty_when, acc_penalty_where,
          acc_penalty_when_rate, acc_penalty_where_rate,
          verification_token)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (game_id, player_id, round_index) DO NOTHING`,
      [
        gameId,
        playerId,
        roundIndex,
        yearGuess,
        locationGuess?.lat ?? null,
        locationGuess?.lng ?? null,
        hintsUsedCount,
        score,
        whenPenaltyRate + wherePenaltyRate,
        whenPenaltyRate,
        wherePenaltyRate,
        whenPenaltyRate,
        wherePenaltyRate,
        commitToken
      ]
    );

    if ((insertResult as unknown as { rowCount: number | null }).rowCount === 0) {
      const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, client);
      await client.query("COMMIT");
      client.release();
      clientReleased = true;
      const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
      const snapshot = playerSnapshots[playerId];
      if (!snapshot) throw new Error("Session not found");
      return { ...snapshot, playerSnapshots };
    }

    const guessToken = generateVerificationToken();
    await client.query(
      `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, verification_token)
       VALUES ($1, $2, $3, 'GUESS_SUBMITTED', $4::jsonb, now(), $5)`,
      [gameId, playerId, roundIndex, JSON.stringify({ playerId, yearGuess, score, verificationToken: commitToken }), guessToken]
    );

    const resultToken = generateVerificationToken();
    await client.query(
      `INSERT INTO round_results
         (game_id, round_index, player_id, score, rank, distance_km, year_diff, location_score, time_score, verification_token)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9)
       ON CONFLICT (game_id, round_index, player_id) DO NOTHING`,
      [
        gameId,
        roundIndex,
        playerId,
        score,
        result.distanceKm,
        result.yearDiff,
        result.locationAccuracy,
        result.yearAccuracy,
        resultToken
      ]
    );

    await tryFinalizeAsyncRound(gameId, roundIndex, client);

    const completeToken = generateVerificationToken();
    await client.query(
      `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, verification_token)
       VALUES ($1, $2, $3, 'ROUND_COMPLETE', $4::jsonb, now(), $5)`,
      [gameId, playerId, roundIndex, JSON.stringify({ score, resultPhaseStartedAt: new Date().toISOString() }), completeToken]
    );

    if (roundIndex === guard.total_rounds - 1) {
      const sessionCompleteToken = generateVerificationToken();
      const sessionCompleteResult = await client.query(
        `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, verification_token)
         VALUES ($1, $2, $3, 'PLAYER_SESSION_COMPLETE', $4::jsonb, now(), $5)
         ON CONFLICT DO NOTHING`,
        [gameId, playerId, roundIndex, JSON.stringify({ totalRounds: guard.total_rounds }), sessionCompleteToken]
      );
      if ((sessionCompleteResult as unknown as { rowCount: number | null }).rowCount === 1) {
        await updatePlayerGlobalStats(gameId, guard.mode as "practice" | "sync" | "async", playerId, client);
      }
    }

    const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, client);
    await client.query("COMMIT");
    client.release();
    clientReleased = true;
    const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
    const actingPlayerSnapshot = playerSnapshots[playerId];
    if (!actingPlayerSnapshot) throw new Error("Session not found");
    return { ...actingPlayerSnapshot, playerSnapshots };
  } catch (error) {
    if (!clientReleased) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

export async function advancePlayerRoundAsync(
  gameId: string,
  playerId: string,
  _executionContext?: "partykit" | "api"
): Promise<CompeteSessionSnapshotWithPlayerSnapshots> {
  assertValidExecutionContext({ _executionContext });

  const client = await getTransactionClient();
  let clientReleased = false;
  try {
    await client.query("BEGIN");

    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':async'))`,
      [gameId, playerId]
    );

    const session = await loadSessionRow(gameId, client);
    if (!session) throw new Error("Session not found");
    if (session.mode !== "async") {
      throw new Error("advancePlayerRoundAsync can only be used in async sessions");
    }

    const lastCompleteResult = await client.query<{ round_index: number | null }>(
      `SELECT MAX(round_index) AS round_index FROM player_round_events
       WHERE game_id = $1 AND player_id = $2 AND event_type = 'ROUND_COMPLETE'`,
      [gameId, playerId]
    );
    const lastCompleteRound = lastCompleteResult.rows[0]?.round_index ?? null;
    const nextRoundIndex = (lastCompleteRound ?? -1) + 1;

    if (nextRoundIndex < session.total_rounds) {
      const startedAt = new Date();
      const phaseEndsAt = session.round_timer_sec > 0
        ? new Date(startedAt.getTime() + session.round_timer_sec * 1000).toISOString()
        : null;
      const token = generateVerificationToken();
      await client.query(
        `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, phase_ends_at, verification_token)
         VALUES ($1, $2, $3, 'ROUND_STARTED', $4::jsonb, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          gameId,
          playerId,
          nextRoundIndex,
          JSON.stringify({ startedAt: startedAt.toISOString() }),
          startedAt,
          phaseEndsAt ? new Date(phaseEndsAt) : null,
          token,
        ]
      );
    }

    const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, client);
    await client.query("COMMIT");
    client.release();
    clientReleased = true;
    const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
    const actingPlayerSnapshot = playerSnapshots[playerId];
    if (!actingPlayerSnapshot) throw new Error("Session not found");
    return { ...actingPlayerSnapshot, playerSnapshots };
  } catch (error) {
    if (!clientReleased) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

export async function markPlayerRoundAbsent(
  gameId: string,
  playerId: string,
  roundIndex: number,
  _executionContext?: "partykit" | "api"
): Promise<CompeteSessionSnapshotWithPlayerSnapshots> {
  assertValidExecutionContext({ _executionContext });

  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= MAX_ROUNDS) {
    throw new Error("roundIndex must be an integer between 0 and 4");
  }

  const client = await getTransactionClient();
  let clientReleased = false;
  try {
    await client.query("BEGIN");

    // Serialize with submitGuessAsync and advancePlayerRoundAsync on the same
    // per-player async key so a last-second submission and timer expiry cannot
    // both win.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':async'))`,
      [gameId, playerId]
    );

    const guardResult = await client.query<{
      mode: "practice" | "sync" | "async" | "daily";
      total_rounds: number;
      scoring_reference_year: number;
      round_complete: boolean;
      session_event_ids: string[] | null;
    }>(
      `WITH
        session_meta AS (
          SELECT mode, total_rounds, scoring_reference_year FROM sessions WHERE game_id = $1
        ),
        round_complete AS (
          SELECT 1 FROM player_round_events
          WHERE game_id = $1 AND player_id = $2 AND round_index = $3 AND event_type = 'ROUND_COMPLETE'
          LIMIT 1
        ),
        session_created AS (
          SELECT payload FROM round_events
          WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
          ORDER BY id ASC LIMIT 1
        )
      SELECT
        (SELECT mode FROM session_meta) AS mode,
        (SELECT total_rounds FROM session_meta) AS total_rounds,
        (SELECT scoring_reference_year FROM session_meta) AS scoring_reference_year,
        EXISTS(SELECT 1 FROM round_complete) AS round_complete,
        (SELECT (SELECT payload->'eventIds' FROM session_created)::jsonb) AS session_event_ids`,
      [gameId, playerId, roundIndex]
    );

    const guard = guardResult.rows[0];
    if (!guard || guard.total_rounds === null || guard.total_rounds === undefined) {
      throw new Error("Session not found");
    }
    if (guard.mode !== "async") {
      throw new Error("markPlayerRoundAbsent can only be used in async sessions");
    }

    if (guard.round_complete) {
      const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, client);
      await client.query("COMMIT");
      client.release();
      clientReleased = true;
      const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
      const actingPlayerSnapshot = playerSnapshots[playerId];
      if (!actingPlayerSnapshot) throw new Error("Session not found");
      return { ...actingPlayerSnapshot, playerSnapshots };
    }

    const eventIds = guard.session_event_ids;
    if (!Array.isArray(eventIds) || roundIndex >= eventIds.length) {
      throw new Error("Event ID not found for round index");
    }
    const event = await fetchEventById(eventIds[roundIndex], client);
    if (!event) throw new Error("Could not load event");

    const referenceYear = guard.scoring_reference_year;
    const result = evaluateRound(
      event,
      { year: null, location: null },
      roundIndex,
      false,
      0,
      0,
      referenceYear
    );

    const commitToken = generateVerificationToken();
    await client.query(
      `INSERT INTO round_commits
         (game_id, player_id, round_index, submitted_at, year_guess,
          location_lat, location_lng, hints_used, score, absent,
          acc_penalty, acc_penalty_when, acc_penalty_where,
          acc_penalty_when_rate, acc_penalty_where_rate,
          verification_token)
       VALUES ($1, $2, $3, now(), NULL, NULL, NULL, 0, 0, TRUE, 0, 0, 0, 0, 0, $4)
       ON CONFLICT (game_id, player_id, round_index) DO NOTHING`,
      [gameId, playerId, roundIndex, commitToken]
    );

    const resultToken = generateVerificationToken();
    await client.query(
      `INSERT INTO round_results
         (game_id, round_index, player_id, score, rank, distance_km, year_diff, location_score, time_score, verification_token)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9)
       ON CONFLICT (game_id, round_index, player_id) DO NOTHING`,
      [gameId, roundIndex, playerId, 0, result.distanceKm, result.yearDiff, result.locationAccuracy, result.yearAccuracy, resultToken]
    );

    await tryFinalizeAsyncRound(gameId, roundIndex, client);

    const completeToken = generateVerificationToken();
    await client.query(
      `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, verification_token)
       VALUES ($1, $2, $3, 'ROUND_COMPLETE', $4::jsonb, now(), $5)
       ON CONFLICT DO NOTHING`,
      [gameId, playerId, roundIndex, JSON.stringify({ absent: true, score: 0, resultPhaseStartedAt: new Date().toISOString() }), completeToken]
    );

    if (roundIndex === guard.total_rounds - 1) {
      const sessionCompleteToken = generateVerificationToken();
      const sessionCompleteResult = await client.query(
        `INSERT INTO player_round_events (game_id, player_id, round_index, event_type, payload, occurred_at, verification_token)
         VALUES ($1, $2, $3, 'PLAYER_SESSION_COMPLETE', $4::jsonb, now(), $5)
         ON CONFLICT DO NOTHING`,
        [gameId, playerId, roundIndex, JSON.stringify({ totalRounds: guard.total_rounds }), sessionCompleteToken]
      );
      if ((sessionCompleteResult as unknown as { rowCount: number | null }).rowCount === 1) {
        await updatePlayerGlobalStats(gameId, guard.mode as "practice" | "sync" | "async", playerId, client);
      }
    }

    const base = await loadAsyncSnapshotBaseForActivePlayers(gameId, client);
    await client.query("COMMIT");
    client.release();
    clientReleased = true;
    const playerSnapshots = buildAsyncPlayerSnapshotsFromBase(gameId, base);
    const actingPlayerSnapshot = playerSnapshots[playerId];
    if (!actingPlayerSnapshot) throw new Error("Session not found");
    return { ...actingPlayerSnapshot, playerSnapshots };
  } catch (error) {
    if (!clientReleased) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

export async function finalizeAsyncSessionDeadline(
  gameId: string,
  executor: DbTransactionClient
): Promise<number> {
  const sessionResult = await executor.query<{
    mode: string;
    total_rounds: number;
    scoring_reference_year: number;
    session_deadline: Date | null;
  }>(
    `SELECT mode, total_rounds, scoring_reference_year, session_deadline
     FROM sessions
     WHERE game_id = $1
     FOR UPDATE`,
    [gameId]
  );
  const session = sessionResult.rows[0];
  if (!session || session.mode !== "async" || !session.session_deadline) {
    return 0;
  }
  if (session.session_deadline.getTime() > Date.now()) {
    return 0;
  }

  const sessionCreatedResult = await executor.query<{ eventIds: string[] }>(
    `SELECT payload->'eventIds' AS "eventIds"
     FROM round_events
     WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
     ORDER BY id ASC
     LIMIT 1`,
    [gameId]
  );
  const eventIds = sessionCreatedResult.rows[0]?.eventIds;
  if (!Array.isArray(eventIds) || eventIds.length < session.total_rounds) {
    return 0;
  }

  const activePlayersResult = await executor.query<{ player_id: string }>(
    `SELECT sp.player_id
     FROM session_players sp
     WHERE sp.game_id = $1
       AND sp.left_at IS NULL
       AND sp.kicked IS NOT TRUE
       AND NOT EXISTS (
         SELECT 1 FROM player_round_events pre
         WHERE pre.game_id = sp.game_id
           AND pre.player_id = sp.player_id
           AND pre.event_type = 'PLAYER_SESSION_COMPLETE'
       )
     ORDER BY sp.player_id ASC`,
    [gameId]
  );
  if (activePlayersResult.rows.length === 0) {
    return 0;
  }

  const referenceYear = session.scoring_reference_year;
  const sessionDeadline = session.session_deadline;
  const totalRounds = session.total_rounds;

  let finalizedCount = 0;
  const touchedRounds = new Set<number>();
  const affectedPlayers: string[] = [];

  // Ruling 2: acquire per-player locks for the entire active roster in player_id order before the sweep
  for (const row of activePlayersResult.rows) {
    await executor.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':async'))`,
      [gameId, row.player_id]
    );
  }

  for (const row of activePlayersResult.rows) {
    const playerId = row.player_id;

    const completedCheck = await executor.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM player_round_events
         WHERE game_id = $1 AND player_id = $2 AND event_type = 'PLAYER_SESSION_COMPLETE'
       ) AS exists`,
      [gameId, playerId]
    );
    if (completedCheck.rows[0]?.exists) {
      continue;
    }

    const lastCompleteResult = await executor.query<{ round_index: number | null }>(
      `SELECT MAX(round_index) AS round_index FROM player_round_events
       WHERE game_id = $1 AND player_id = $2 AND event_type = 'ROUND_COMPLETE'`,
      [gameId, playerId]
    );
    const lastCompleteRound = lastCompleteResult.rows[0]?.round_index ?? -1;

    for (let roundIndex = lastCompleteRound + 1; roundIndex < totalRounds; roundIndex++) {
      touchedRounds.add(roundIndex);

      // For rounds the player never reached, we still need a ROUND_STARTED event
      // in their per-player stream so the snapshot builder can reveal the round
      // content and mark it reached/completed. `occurred_at = session_deadline`
      // is a deliberate placeholder timestamp for this deadline-forced
      // completion; it is NOT the moment the player actually opened the round,
      // so future analytics should not treat it as a real view time.
      const startedToken = generateVerificationToken();
      await executor.query(
        `INSERT INTO player_round_events
           (game_id, player_id, round_index, event_type, payload, occurred_at, phase_ends_at, verification_token)
         VALUES ($1, $2, $3, 'ROUND_STARTED', $4::jsonb, $5, NULL, $6)
         ON CONFLICT DO NOTHING`,
        [
          gameId,
          playerId,
          roundIndex,
          JSON.stringify({ startedAt: sessionDeadline.toISOString() }),
          sessionDeadline,
          startedToken
        ]
      );

      const event = await fetchEventById(eventIds[roundIndex], executor);
      if (!event) {
        throw new Error(`Event not found for round ${roundIndex}`);
      }
      const result = evaluateRound(
        event,
        { year: null, location: null },
        roundIndex,
        false,
        0,
        0,
        referenceYear
      );

      const commitToken = generateVerificationToken();
      await executor.query(
        `INSERT INTO round_commits
           (game_id, player_id, round_index, submitted_at, year_guess, location_lat, location_lng,
            hints_used, score, absent, acc_penalty, acc_penalty_when, acc_penalty_where,
            acc_penalty_when_rate, acc_penalty_where_rate, verification_token)
         VALUES ($1, $2, $3, $4, NULL, NULL, NULL, 0, 0, TRUE, 0, 0, 0, 0, 0, $5)
         ON CONFLICT (game_id, player_id, round_index) DO NOTHING`,
        [gameId, playerId, roundIndex, sessionDeadline, commitToken]
      );

      const resultToken = generateVerificationToken();
      await executor.query(
        `INSERT INTO round_results
           (game_id, round_index, player_id, score, rank, distance_km, year_diff, location_score, time_score, verification_token)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9)
         ON CONFLICT (game_id, round_index, player_id) DO NOTHING`,
        [
          gameId,
          roundIndex,
          playerId,
          0,
          result.distanceKm,
          result.yearDiff,
          result.locationAccuracy,
          result.yearAccuracy,
          resultToken
        ]
      );

      const completeToken = generateVerificationToken();
      await executor.query(
        `INSERT INTO player_round_events
           (game_id, player_id, round_index, event_type, payload, occurred_at, verification_token)
         VALUES ($1, $2, $3, 'ROUND_COMPLETE', $4::jsonb, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          gameId,
          playerId,
          roundIndex,
          JSON.stringify({ absent: true, score: 0, resultPhaseStartedAt: sessionDeadline.toISOString() }),
          sessionDeadline,
          completeToken
        ]
      );
    }

    const sessionCompleteToken = generateVerificationToken();
    const sessionCompleteResult = await executor.query(
      `INSERT INTO player_round_events
         (game_id, player_id, round_index, event_type, payload, occurred_at, verification_token)
       VALUES ($1, $2, $3, 'PLAYER_SESSION_COMPLETE', $4::jsonb, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        gameId,
        playerId,
        totalRounds - 1,
        JSON.stringify({ totalRounds, finalizedByDeadline: true }),
        sessionDeadline,
        sessionCompleteToken
      ]
    );

    if ((sessionCompleteResult as unknown as { rowCount: number | null }).rowCount === 1) {
      affectedPlayers.push(playerId);
      finalizedCount++;
    }
  }

  // (c) finalize ranks for every touched round, taking per-round locks in round_index order
  const sortedTouchedRounds = Array.from(touchedRounds).sort((a, b) => a - b);
  for (const roundIndex of sortedTouchedRounds) {
    await tryFinalizeAsyncRound(gameId, roundIndex, executor);
  }

  // (d) update per-player global stats for each affected player
  for (const playerId of affectedPlayers) {
    await updatePlayerGlobalStats(gameId, session.mode as "practice" | "sync" | "async", playerId, executor);
  }

  return finalizedCount;
}

export async function maybeFinalizeAsyncSessionDeadline(gameId: string): Promise<number> {
  const guardResult = await dbPool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM sessions s
       WHERE s.game_id = $1
         AND s.mode = 'async'
         AND s.session_deadline IS NOT NULL
         AND s.session_deadline < now()
         AND EXISTS (
           SELECT 1
           FROM session_players sp
           WHERE sp.game_id = s.game_id
             AND sp.left_at IS NULL
             AND sp.kicked IS NOT TRUE
             AND NOT EXISTS (
               SELECT 1 FROM player_round_events pre
               WHERE pre.game_id = sp.game_id
                 AND pre.player_id = sp.player_id
                 AND pre.event_type = 'PLAYER_SESSION_COMPLETE'
             )
         )
     ) AS exists`,
    [gameId]
  );
  if (!guardResult.rows[0]?.exists) {
    return 0;
  }

  const client = await getTransactionClient();
  try {
    await client.query("BEGIN");
    const finalized = await finalizeAsyncSessionDeadline(gameId, client);
    await client.query("COMMIT");
    return finalized;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertMissingCommits(
  client: DbTransactionClient,
  gameId: string,
  roundIndex: number
): Promise<void> {
  // Load all players in this session
  const playersResult = await client.query<{ player_id: string }>(
    `SELECT player_id FROM session_players WHERE game_id = $1 AND left_at IS NULL`,
    [gameId]
  );

  // Load all players who already have a commit for this round
  const commitsResult = await client.query<{ player_id: string }>(
    `SELECT player_id FROM round_commits WHERE game_id = $1 AND round_index = $2`,
    [gameId, roundIndex]
  );

  const submitted = new Set(commitsResult.rows.map((r) => r.player_id));

  // Insert zero-score absent commit for each player who has not submitted.
  // absent=TRUE distinguishes "never submitted / absent" from "submitted a real
  // guess scoring 0" (absent=FALSE). See Compete Relax (Option B) §6 + migration
  // 20260703000000_add_absent_to_round_commits.sql.
  for (const row of playersResult.rows) {
    if (!submitted.has(row.player_id)) {
      await client.query(
        `INSERT INTO round_commits
           (game_id, player_id, round_index, submitted_at, year_guess, location_lat, location_lng, hints_used, score, absent)
         VALUES ($1, $2, $3, now(), NULL, NULL, NULL, 0, 0, TRUE)
         ON CONFLICT (game_id, player_id, round_index) DO NOTHING`,
        [gameId, row.player_id, roundIndex]
      );
    }
  }
}

export async function completeRound(input: {
  gameId: string;
  roundIndex: number;
  _executionContext: string;
}): Promise<CompeteSessionSnapshot> {
  assertValidExecutionContext(input);
  const { gameId, roundIndex } = input;

  const client = await getTransactionClient();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2::text))`,
      [gameId, roundIndex]
    );

    const commitCount = await loadRoundCommitCount(gameId, roundIndex, client);
    const roundCompleteInserted = await appendEventIfNotExists(
      client, gameId, "ROUND_COMPLETE",
      { commitCount, resultPhaseStartedAt: new Date().toISOString() },
      roundIndex
    );
    if (roundCompleteInserted) {
      await insertMissingCommits(client, gameId, roundIndex);
      await computeAndWriteRoundResults(gameId, roundIndex, client);
    }
    // If !roundCompleteInserted: submitGuess already completed this round — commit cleanly

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  let snapshot = await loadCompeteSessionSnapshot(gameId, undefined);
  if (!snapshot) {
    await new Promise(r => setTimeout(r, 300));
    snapshot = await loadCompeteSessionSnapshot(gameId, undefined);
  }
  if (!snapshot) {
    await new Promise(r => setTimeout(r, 500));
    snapshot = await loadCompeteSessionSnapshot(gameId, undefined);
  }
  if (!snapshot) throw new Error("Session not found");
  return snapshot;
}

// ═════════════════════════════════════════════════════════════════════════════
// DAILY MODE — Game-end transaction (DAILY_MODE_SPEC.md §8)
// Runs inside the caller's transaction (passed DbTransactionClient).
// All-or-nothing. Uses challengeDate from daily_attempts (fixes C1 — not now()).
// Step 4 (§9 streak): real write to player_daily_streak. Steps 4-6 scope from
// DAILY_MODE_SPEC.md §8 is intentionally reduced per CTO ruling 2026-07-30:
// player_progression_stats, player_accuracy_history, and player_era_stats are
// NOT built (single-stats-system rule; only player_daily_streak is added).
// ═════════════════════════════════════════════════════════════════════════════
async function dailyGameEndTransaction(
  client: DbTransactionClient,
  gameId: string,
  challengeDate: string
): Promise<void> {
  // Fetch round_results for this game (solo — one player)
  const roundResults = await client.query<{
    player_id: string;
    location_score: number;
    time_score: number;
  }>(
    `SELECT player_id, location_score, time_score
     FROM round_results
     WHERE game_id = $1`,
    [gameId]
  );

  if (roundResults.rows.length === 0) {
    console.error(`[dailyGameEndTransaction] No round_results for gameId=${gameId}`);
    throw new Error(`No round_results found for daily game ${gameId}`);
  }

  // Group by player_id (solo — exactly one, but follow the existing pattern)
  const playerMap = new Map<string, { total_xp: number; accuracy_sum: number; round_count: number; best_round_accuracy: number }>();
  for (const row of roundResults.rows) {
    const xp = row.location_score + row.time_score;
    const accuracy = Math.round(((row.location_score + row.time_score) / 2) * 100) / 100;
    const entry = playerMap.get(row.player_id) ?? { total_xp: 0, accuracy_sum: 0, round_count: 0, best_round_accuracy: 0 };
    entry.total_xp += xp;
    entry.accuracy_sum += accuracy;
    entry.round_count += 1;
    if (accuracy > entry.best_round_accuracy) {
      entry.best_round_accuracy = accuracy;
    }
    playerMap.set(row.player_id, entry);
  }

  for (const [playerId, data] of playerMap.entries()) {
    if (data.round_count === 0) continue;
    const avgAccuracy = data.accuracy_sum / data.round_count;
    const totalXp = Math.min(data.total_xp, 1000);

    // Step 1: leaderboard_daily INSERT (date=challengeDate) ON CONFLICT DO NOTHING
    const insertResult = await client.query(
      `INSERT INTO leaderboard_daily (date, player_id, avg_accuracy, total_xp, best_round_accuracy, completed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (date, player_id) DO NOTHING`,
      [challengeDate, playerId, avgAccuracy, totalXp, data.best_round_accuracy]
    );

    // Step 2: IF rows_inserted = 1 → leaderboard_daily_alltime UPSERT
    if (((insertResult as unknown as { rowCount: number | null }).rowCount ?? 0) === 1) {
      await client.query(
        `INSERT INTO leaderboard_daily_alltime (player_id, games_played, avg_accuracy, total_xp, updated_at)
         VALUES ($1, 1, $2, $3, now())
         ON CONFLICT (player_id) DO UPDATE SET
           avg_accuracy = (leaderboard_daily_alltime.avg_accuracy * leaderboard_daily_alltime.games_played + EXCLUDED.avg_accuracy) / (leaderboard_daily_alltime.games_played + 1),
           total_xp     = leaderboard_daily_alltime.total_xp + EXCLUDED.total_xp,
           games_played = leaderboard_daily_alltime.games_played + 1,
           updated_at   = now()`,
        [playerId, avgAccuracy, totalXp]
      );
    }

    // Step 3: player_global_stats UPSERT (existing columns only — table LOCKED)
    const existing = await client.query<{ rounds_played: number; avg_accuracy: number }>(
      `SELECT rounds_played, avg_accuracy FROM player_global_stats WHERE player_id = $1`,
      [playerId]
    );
    const existingRounds = existing.rows[0]?.rounds_played ?? 0;
    const existingAvg = existing.rows[0]?.avg_accuracy ?? 0;
    let runningAvg = existingAvg;
    let runningCount = existingRounds;
    for (let i = 0; i < data.round_count; i++) {
      const roundAcc = data.accuracy_sum / data.round_count;
      runningAvg = (runningAvg * runningCount + roundAcc) / (runningCount + 1);
      runningCount += 1;
    }
    await client.query(
      `INSERT INTO player_global_stats (player_id, rounds_played, games_played, avg_accuracy, total_xp, updated_at)
       VALUES ($1, $2, 1, $3, $4, now())
       ON CONFLICT (player_id) DO UPDATE SET
         avg_accuracy = $3,
         total_xp = player_global_stats.total_xp + $4,
         rounds_played = $2,
         games_played = player_global_stats.games_played + 1,
         updated_at = now()`,
      [playerId, runningCount, runningAvg, data.total_xp]
    );

    // Step 4 (scope reduction): per-CTO ruling 2026-07-30, steps 4-6 of
    // DAILY_MODE_SPEC.md §8 are collapsed to streak-only. player_progression_stats,
    // player_accuracy_history, and player_era_stats are intentionally not built.

    // Daily streak evaluation (§9)
    const challengeDateMidnight = new Date(challengeDate + "T00:00:00Z");
    const yesterdayDate = new Date(challengeDateMidnight);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayIso = yesterdayDate.toISOString().slice(0, 10);

    const streakRow = await client.query<{
      daily_streak_current: number;
      daily_streak_best: number;
      last_attempt_date: string | null;
    }>(
      `SELECT daily_streak_current, daily_streak_best, last_attempt_date::text
       FROM player_daily_streak
       WHERE player_id = $1`,
      [playerId]
    );

    const existingStreak = streakRow.rows[0];
    const lastAttemptDate = existingStreak?.last_attempt_date ?? null;

    if (lastAttemptDate !== challengeDate) {
      let newStreakCurrent = 1;
      if (lastAttemptDate === yesterdayIso) {
        newStreakCurrent = (existingStreak?.daily_streak_current ?? 0) + 1;
      }

      const newStreakBest = Math.max(
        existingStreak?.daily_streak_best ?? 0,
        newStreakCurrent
      );

      await client.query(
        `INSERT INTO player_daily_streak (player_id, daily_streak_current, daily_streak_best, last_attempt_date, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (player_id) DO UPDATE SET
           daily_streak_current = EXCLUDED.daily_streak_current,
           daily_streak_best = EXCLUDED.daily_streak_best,
           last_attempt_date = EXCLUDED.last_attempt_date,
           updated_at = now()`,
        [playerId, newStreakCurrent, newStreakBest, challengeDate]
      );
    }

    // Step 7: Badge aggregates — evaluated per round, aggregated here, never
    // persisted standalone. No standalone write needed (badges are derived).

    // Step 8: daily_attempts.status = 'completed', completed_at = now()
    await client.query(
      `UPDATE daily_attempts SET status = 'completed', completed_at = now()
       WHERE game_id = $1`,
      [gameId]
    );
  }
}

function buildAsyncRoundClosureCheckSql(gameIdRef: string, roundIndexRef: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM session_players sp
    WHERE sp.game_id = ${gameIdRef} AND sp.left_at IS NULL AND sp.kicked IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM round_results rrc
      WHERE rrc.game_id = ${gameIdRef} AND rrc.round_index = ${roundIndexRef} AND rrc.player_id = sp.player_id
    )
  )`;
}

async function updatePlayerGlobalStats(
  gameId: string,
  mode: "practice" | "sync" | "async",
  playerId?: string,
  executor?: DbTransactionClient
): Promise<void> {
  const savepointId = executor ? `sp_${generateVerificationToken().replace(/-/g, '_')}` : null;
  try {
    if (executor) {
      await executor.query(`SAVEPOINT ${savepointId}`);
    }

    const db = executor ?? dbPool;
    const closureSql = buildAsyncRoundClosureCheckSql('$1', 'rr.round_index');
    const playerFilter = playerId ? 'AND rr.player_id = $2' : '';
    const params = playerId ? [gameId, playerId] : [gameId];

    // Fetch round_results for this game (optionally scoped to one player)
    const roundResults = await db.query<{
      player_id: string;
      location_score: number;
      time_score: number;
      rank: number | null;
      rank_is_final: boolean;
    }>(
      `SELECT rr.player_id, rr.location_score, rr.time_score, rr.rank, (${closureSql}) AS rank_is_final
       FROM round_results rr
       WHERE rr.game_id = $1 ${playerFilter}`,
      params
    );

    // Group by player_id
    const playerMap = new Map<string, {
      rounds_in_session: number;
      session_total_xp: number;
      session_accuracy_per_round: number[];
      rounds_won_in_session: number;
    }>();

    for (const row of roundResults.rows) {
      const pId = row.player_id;
      const xp = row.location_score + row.time_score;
      const accuracy = (row.location_score + row.time_score) / 2;

      if (!playerMap.has(pId)) {
        playerMap.set(pId, {
          rounds_in_session: 0,
          session_total_xp: 0,
          session_accuracy_per_round: [],
          rounds_won_in_session: 0
        });
      }

      const data = playerMap.get(pId)!;
      data.rounds_in_session += 1;
      data.session_total_xp += xp;
      data.session_accuracy_per_round.push(accuracy);
      if (row.rank === 1 && row.rank_is_final) {
        data.rounds_won_in_session += 1;
      }
    }

    const isPractice = mode === "practice";

    // For each player, upsert player_global_stats
    for (const [statsPlayerId, data] of playerMap.entries()) {
      if (isPractice) {
        // Practice mode: only add XP, do NOT touch avg_accuracy / rounds_played / games_played
        await db.query(
          `INSERT INTO player_global_stats (player_id, rounds_played, games_played, avg_accuracy, total_xp, updated_at)
           VALUES ($1, 0, 0, 0, $2, now())
           ON CONFLICT (player_id) DO UPDATE SET
             total_xp = player_global_stats.total_xp + $2,
             updated_at = now()`,
          [statsPlayerId, data.session_total_xp]
        );
      } else {
        // Non-practice: update avg_accuracy (running average), rounds_played, games_played, rounds_won, and total_xp
        const existing = await db.query<{
          rounds_played: number;
          avg_accuracy: number;
          rounds_won: number;
        }>(
          `SELECT rounds_played, avg_accuracy, rounds_won
           FROM player_global_stats
           WHERE player_id = $1`,
          [statsPlayerId]
        );

        const existingRounds = existing.rows[0]?.rounds_played ?? 0;
        const existingAvg = existing.rows[0]?.avg_accuracy ?? 0;

        // Compute running average incrementally per round
        let runningAvg = existingAvg;
        let runningCount = existingRounds;
        for (const roundAcc of data.session_accuracy_per_round) {
          runningAvg = (runningAvg * runningCount + roundAcc) / (runningCount + 1);
          runningCount += 1;
        }

        // Upsert
        await db.query(
          `INSERT INTO player_global_stats (player_id, rounds_played, games_played, avg_accuracy, total_xp, rounds_won, updated_at)
           VALUES ($1, $2, 1, $3, $4, $5, now())
           ON CONFLICT (player_id) DO UPDATE SET
             avg_accuracy = $3,
             total_xp = player_global_stats.total_xp + $4,
             rounds_played = $2,
             games_played = player_global_stats.games_played + 1,
             rounds_won = player_global_stats.rounds_won + $5,
             updated_at = now()`,
          [statsPlayerId, runningCount, runningAvg, data.session_total_xp, data.rounds_won_in_session]
        );
      }
    }

    if (executor) {
      await executor.query(`RELEASE SAVEPOINT ${savepointId}`);
    }
  } catch (error) {
    if (executor) {
      await executor.query(`ROLLBACK TO SAVEPOINT ${savepointId}`).catch(() => {});
    }
    console.error('[updatePlayerGlobalStats]', error);
    // Do NOT throw — stats write failure must not crash the session
  }
}

async function updateLeaderboardLevelUp(gameId: string, mode: string): Promise<void> {
  // Only runs for levelup mode
  if (mode !== 'levelup') return;

  try {
    // Fetch session to get level number (stored in sessions table — check for a level or factor field)
    // The sessions table has a `factor_id` column. Level Up uses a different mechanism.
    // Fetch avg accuracy from round_results for this game, grouped by player.
    const roundResults = await dbPool.query<{
      player_id: string;
      location_score: number;
      time_score: number;
    }>(
      `SELECT player_id, location_score, time_score
       FROM round_results
       WHERE game_id = $1`,
      [gameId]
    );

    // Also fetch the session to get any level metadata
    const sessionRow = await dbPool.query<{
      year_min: number;
      year_max: number;
      mode: string;
    }>(
      `SELECT year_min, year_max, mode FROM sessions WHERE game_id = $1`,
      [gameId]
    );

    if (sessionRow.rows.length === 0) return;

    // Group by player_id
    const playerMap = new Map<string, { accuracy_sum: number; round_count: number }>();
    for (const row of roundResults.rows) {
      const accuracy = (row.location_score + row.time_score) / 2;
      const entry = playerMap.get(row.player_id) ?? { accuracy_sum: 0, round_count: 0 };
      entry.accuracy_sum += accuracy;
      entry.round_count += 1;
      playerMap.set(row.player_id, entry);
    }

    for (const [playerId, data] of playerMap.entries()) {
      if (data.round_count === 0) continue;
      const avgAccuracy = Math.round(data.accuracy_sum / data.round_count);

      // We don't have level number directly in sessions — use best_accuracy upsert only.
      // current_level defaults to 1 if not known. The Level Up feature will update this
      // properly once the Level Up mode session schema stores the level number.
      // For now: upsert with current_level = 1 only if no row exists; otherwise only
      // update best_accuracy if it improves (never overwrite a higher level).
      await dbPool.query(
        `INSERT INTO leaderboard_levelup (player_id, current_level, best_accuracy, updated_at)
         VALUES ($1, 1, $2, now())
         ON CONFLICT (player_id) DO UPDATE SET
           best_accuracy = GREATEST(leaderboard_levelup.best_accuracy, EXCLUDED.best_accuracy),
           updated_at = now()
         WHERE EXCLUDED.best_accuracy > leaderboard_levelup.best_accuracy`,
        [playerId, avgAccuracy]
      );
    }
  } catch (error) {
    console.error('[updateLeaderboardLevelUp]', error);
    // Do NOT throw — leaderboard write failure must not crash the session
  }
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

  // ═════════════════════════════════════════════════════════════════════════════
  // SESSION_COMPLETE IDEMPOTENT CHECK — Pure read path, no transaction
  // If session is already complete, return snapshot directly without any DB writes.
  // ═════════════════════════════════════════════════════════════════════════════
  const preflightSnapshot = await loadCompeteSessionSnapshot(gameId, playerId ?? undefined);
  if (!preflightSnapshot) throw new Error("Session not found");
  if (preflightSnapshot.status === "SESSION_COMPLETE") {
    return preflightSnapshot;
  }

  const client = await getTransactionClient();

  // Track events emitted by existing logic for transition-engine comparison
  const existingEvents: TransitionEvent[] = [];

  // Declare variables outside try block for fire-and-forget stats update access
  let session: SessionRow | null = null;
  let nextRoundIndex: number;
  let sessionCompletedEarly = false;

  try {
    await client.query("BEGIN");

    // ═════════════════════════════════════════════════════════════════════════════
    // LOCK-BASED PHASE VALIDATION — Load last event with FOR UPDATE to serialize
    // concurrent writes and validate phase before any DB mutation.
    // ═════════════════════════════════════════════════════════════════════════════
    const lastEvent = await loadLastEventWithLock(client, gameId);
    const currentPhase = lastEvent?.eventType ?? null;

    if (currentPhase === "SESSION_COMPLETE") {
      await client.query("ROLLBACK");
      throw new Error("SESSION_COMPLETE");
    }

    if (currentPhase !== "ROUND_COMPLETE" && currentPhase !== "READY_NEXT") {
      await client.query("ROLLBACK");
      throw new Error("INVALID_ADVANCE_SOURCE_PHASE");
    }

    session = await loadSessionRow(gameId, client);
    if (!session) throw new Error("Session not found");

    nextRoundIndex = roundIndex + 1;
    let advanceEventIds: string[] | undefined;
    let advanceStartedAt = "";
    let advancePhaseEndsAt = "";

    // Early closure: after a round resolves, if fewer than 2 players remain
    // with left_at IS NULL, the session closes early regardless of remaining
    // rounds/deadline. Mere absence (never submitted) does NOT trigger this —
    // only formal leaving (left_at set) does.
    // See Compete Relax (Option B) §6.
    const activePlayerRows = await loadSessionPlayerRows(gameId, client);
    const nonLeftCount = activePlayerRows.filter((p) => p.left_at === null).length;
    // Solo modes (practice, daily) have exactly 1 player by design — the
    // multiplayer early-closure rule (close if < 2 players remain) must NOT
    // apply to them, or solo sessions close after round 0 instead of advancing.
    const isSoloMode = session.mode === "practice" || session.mode === "daily";
    const totalEverJoined = activePlayerRows.length; // includes players who left
    const shouldCloseEarly = !isSoloMode && totalEverJoined >= 2 && nonLeftCount < 2;

    if (nextRoundIndex < session.total_rounds && !shouldCloseEarly) {
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
      advancePhaseEndsAt = session.round_timer_sec === 0
        ? ""
        : new Date(advanceNow.getTime() + session.round_timer_sec * 1000).toISOString();
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
      sessionCompletedEarly = nextRoundIndex < session.total_rounds;
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
          phaseEndsAt: advancePhaseEndsAt
        }
      }
    );
    compareTransitionEvents("advanceRound", existingEvents, transitionResult.events);

    // DAILY MODE: run game-end transaction INSIDE this transaction (§8)
    // before COMMIT. Uses challengeDate from daily_attempts (fixes C1).
    if (session.mode === "daily" && (nextRoundIndex >= session.total_rounds || sessionCompletedEarly)) {
      const dailyAttempt = await client.query<{ date: string }>(
        `SELECT date::text FROM daily_attempts WHERE game_id = $1`,
        [gameId]
      );
      if (dailyAttempt.rows.length > 0) {
        await dailyGameEndTransaction(client, gameId, dailyAttempt.rows[0].date);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Fire-and-forget: update stats and leaderboards after SESSION_COMPLETE
  // (either last round completed or early closure per §6)
  // DAILY mode: handled transactionally above — skip fire-and-forget for daily
  if (nextRoundIndex >= session!.total_rounds || sessionCompletedEarly) {
    if (session!.mode !== "daily") {
      updatePlayerGlobalStats(gameId, session!.mode as "practice" | "sync" | "async").catch((err) =>
        console.error('[advanceRound] updatePlayerGlobalStats fire-and-forget error:', err)
      );
    }
    updateLeaderboardLevelUp(gameId, session!.mode).catch((err) =>
      console.error('[advanceRound] updateLeaderboardLevelUp fire-and-forget error:', err)
    );
  }

  const snapshot = await loadCompeteSessionSnapshot(gameId, playerId ?? undefined);
  if (!snapshot) throw new Error("Session not found");

  return snapshot;
}

export async function recordReadyNext(input: {
  gameId: string;
  playerId: string;
  roundIndex: number;
  _executionContext?: string;
}): Promise<void> {
  assertValidExecutionContext(input);
  const client = await getTransactionClient();
  try {
    await client.query("BEGIN");

    // MP-BUILD-RELAX-BROADCAST-LEAK-002: in async (Relax) sessions there is no
    // shared "READY_NEXT" phase; per-player advancement is handled by the
    // /advance-player endpoint writing to player_round_events. Skip the global
    // round_events write entirely for async so it cannot throw INVALID_TRANSITION.
    const modeResult = await client.query<{ mode: string }>(
      `SELECT mode FROM sessions WHERE game_id = $1`,
      [input.gameId]
    );
    if (modeResult.rows[0]?.mode === "async") {
      await client.query("COMMIT");
      return;
    }

    await appendEvent(
      client,
      input.gameId,
      "READY_NEXT",
      { playerId: input.playerId },
      input.roundIndex
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getRoundResults(
  gameId: string,
  roundIndex: number
): Promise<Array<{ playerId: string; score: number; rank: number; accuracy: number; locationScore: number; didSubmit: boolean; guessYear: number | null; guessLat: number | null; guessLng: number | null; timeScore: number; badges: Array<{ dimension: 'year' | 'location' | 'combo'; tier: 'gold' | 'silver' | 'bronze'; accuracy: number }>; nearMisses: Array<{ dimension: 'year' | 'location' | 'combo'; accuracy: number }>; cumulativeScore: number; cumulativeAccuracy: number }>> {
  const result = await dbPool.query<{
    player_id: string;
    score: number;
    rank: number;
    location_score: number | null;
    time_score: number | null;
    year_guess: number | null;
    location_lat: number | null;
    location_lng: number | null;
  }>(
    `SELECT
      sp.player_id,
      COALESCE(rr.score, 0) AS score,
      COALESCE(rr.rank, 9999) AS rank,
      rr.location_score,
      rr.time_score,
      rc.year_guess,
      rc.location_lat,
      rc.location_lng
    FROM session_players sp
    LEFT JOIN round_results rr
      ON rr.game_id = $1
      AND rr.round_index = $2
      AND rr.player_id = sp.player_id
    LEFT JOIN round_commits rc
      ON rc.game_id = $1
      AND rc.round_index = $2
      AND rc.player_id = sp.player_id
    WHERE sp.game_id = $1 AND sp.left_at IS NULL
    ORDER BY COALESCE(rr.rank, 9999) ASC, sp.player_id ASC`,
    [gameId, roundIndex]
  );

  // Query cumulative scores + cumulative accuracy for all players up to current round.
  // Per-round accuracy = (location_score + time_score) / 2; cumulative = AVG across rounds.
  const cumulativeResult = await dbPool.query<{
    player_id: string;
    cumulative_score: number;
    cumulative_accuracy: number;
  }>(
    `SELECT
      rr.player_id,
      COALESCE(SUM(rr.score), 0) AS cumulative_score,
      COALESCE(AVG((rr.location_score + rr.time_score) / 2), 0) AS cumulative_accuracy
    FROM round_results rr
    WHERE rr.game_id = $1
      AND rr.round_index <= $2
    GROUP BY rr.player_id`,
    [gameId, roundIndex]
  );

  // Build maps of player_id -> cumulative_score / cumulative_accuracy
  const cumulativeMap = new Map<string, number>();
  const cumulativeAccuracyMap = new Map<string, number>();
  for (const row of cumulativeResult.rows) {
    cumulativeMap.set(row.player_id, row.cumulative_score);
    cumulativeAccuracyMap.set(row.player_id, Math.round(row.cumulative_accuracy));
  }

  return result.rows.map((row) => {
    const locationAccuracy = Math.round(row.location_score ?? 0);
    const yearAccuracy = Math.round(row.time_score ?? 0);
    const comboAccuracy = Math.min(locationAccuracy, yearAccuracy);
    const badges = calculateBadges({ yearAccuracy, locationAccuracy, comboAccuracy });
    const nearMisses = evaluateNearMisses(yearAccuracy, locationAccuracy, comboAccuracy, badges);
    return {
      playerId: row.player_id,
      score: row.score,
      rank: row.rank,
      accuracy: Math.round((locationAccuracy + yearAccuracy) / 2),
      locationScore: row.location_score ?? 0,
      didSubmit: row.year_guess !== null,
      guessYear: row.year_guess ?? null,
      guessLat: row.location_lat,
      guessLng: row.location_lng,
      timeScore: row.time_score ?? 0,
      badges,
      nearMisses,
      cumulativeScore: cumulativeMap.get(row.player_id) ?? 0,
      cumulativeAccuracy: cumulativeAccuracyMap.get(row.player_id) ?? 0,
    };
  });
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

/**
 * Atomic insert for ROUND_COMPLETE event with idempotency via unique partial index.
 * Returns true if the event was inserted (caller won the race), false if it already exists (caller lost).
 * Used exclusively for ROUND_COMPLETE to prevent concurrent submitGuess calls from both inserting.
 */
async function appendEventIfNotExists(
  client: DbTransactionClient,
  gameId: string,
  eventType: string,
  payload: Record<string, unknown>,
  roundIndex: number
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO round_events (game_id, round_index, event_type, payload, created_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (game_id, round_index) WHERE event_type = 'ROUND_COMPLETE' DO NOTHING
     RETURNING id`,
    [gameId, roundIndex, eventType, JSON.stringify(payload)]
  );
  return result.rows.length > 0;
}

/**
 * Atomic insert for PRESSURE_APPLIED event with idempotency via unique partial
 * index (idx_round_events_unique_pressure). Returns true if the event was
 * inserted (caller won the race), false if it already exists (caller lost).
 * Used by submitGuess to apply the first-submission timer clamp atomically
 * inside the same transaction as the first round_commit, so concurrent
 * first-submission clamp attempts resolve to exactly one PRESSURE_APPLIED row
 * per round. Single source of truth: ONE PRESSURE_APPLIED event per round.
 */
async function appendPressureAppliedIfNotExists(
  client: DbTransactionClient,
  gameId: string,
  roundIndex: number,
  payload: { newRoundEndsAt: string; clampedToSec: number }
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO round_events (game_id, round_index, event_type, payload, created_at)
     VALUES ($1, $2, 'PRESSURE_APPLIED', $3::jsonb, now())
     ON CONFLICT (game_id, round_index) WHERE event_type = 'PRESSURE_APPLIED' DO NOTHING
     RETURNING id`,
    [gameId, roundIndex, JSON.stringify(payload)]
  );
  return result.rows.length > 0;
}

async function tryFinalizeAsyncRound(
  gameId: string,
  roundIndex: number,
  executor: DbTransactionClient
): Promise<boolean> {
  await executor.query(
    `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2::text || ':async-rank'))`,
    [gameId, roundIndex]
  );

  await executor.query(
    `SELECT player_id
     FROM session_players
     WHERE game_id = $1 AND left_at IS NULL AND kicked IS NOT TRUE
     ORDER BY player_id
     FOR UPDATE`,
    [gameId]
  );

  const closureSql = buildAsyncRoundClosureCheckSql('$1', '$2');
  const closureResult = await executor.query<{ is_closed: boolean }>(
    `SELECT ${closureSql} AS is_closed`,
    [gameId, roundIndex]
  );
  const isClosed = closureResult.rows[0]?.is_closed ?? false;

  if (isClosed) {
    await executor.query(
      `UPDATE round_results rr
       SET rank = ranked.rank
       FROM (
         SELECT player_id, RANK() OVER (ORDER BY score DESC NULLS LAST) AS rank
         FROM round_results
         WHERE game_id = $1 AND round_index = $2
       ) ranked
       WHERE rr.game_id = $1 AND rr.round_index = $2 AND rr.player_id = ranked.player_id`,
      [gameId, roundIndex]
    );
  } else {
    await executor.query(
      `UPDATE round_results SET rank = NULL WHERE game_id = $1 AND round_index = $2`,
      [gameId, roundIndex]
    );
  }

  return isClosed;
}

async function computeAndWriteRoundResults(
  gameId: string,
  roundIndex: number,
  executor: DbTransactionClient
): Promise<string> {
  const commits = await executor.query<{
    player_id: string;
    score: number | null;
    year_guess: number | null;
    location_lat: number | null;
    location_lng: number | null;
    acc_penalty: number | null;
    acc_penalty_when: number | null;
    acc_penalty_where: number | null;
    acc_penalty_when_rate: number | null;
    acc_penalty_where_rate: number | null;
  }>(
    `SELECT player_id, score, year_guess, location_lat, location_lng,
            acc_penalty, acc_penalty_when, acc_penalty_where,
            acc_penalty_when_rate, acc_penalty_where_rate
     FROM round_commits
     WHERE game_id = $1 AND round_index = $2
     ORDER BY score DESC NULLS LAST`,
    [gameId, roundIndex]
  );

  // Generate a single verification token for all results in this round
  const roundResultsToken = generateVerificationToken();

  // Fetch the SESSION_CREATED event once (outside the loop to avoid N+1 query pattern)
  const sessionCreatedEvent = await executor.query<{ payload: { eventIds: string[] } }>(
    `SELECT payload FROM round_events
     WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
     ORDER BY id ASC LIMIT 1`,
    [gameId]
  );

  if (sessionCreatedEvent.rows.length === 0) return roundResultsToken;

  // Fetch scoring_reference_year (frozen at session creation) for deterministic era scaling
  const sessionMeta = await executor.query<{ scoring_reference_year: number }>(
    `SELECT scoring_reference_year FROM sessions WHERE game_id = $1`,
    [gameId]
  );
  if (!sessionMeta.rows[0]) {
    throw new Error(`[SCORING] missing scoring_reference_year for game ${gameId}`);
  }
  const referenceYear = sessionMeta.rows[0].scoring_reference_year;

  const eventIds = sessionCreatedEvent.rows[0].payload?.eventIds;
  if (!Array.isArray(eventIds) || roundIndex >= eventIds.length) return roundResultsToken;

  for (let i = 0; i < commits.rows.length; i++) {
    const row = commits.rows[i];

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
      row.acc_penalty_when_rate ?? 0,
      row.acc_penalty_where_rate ?? 0,
      referenceYear
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

  return roundResultsToken;
}
