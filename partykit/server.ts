// ============================================================================
// PartyKit Server — DO-Authoritative Real-Time System
// TASK: MP-DO-AUTHORITATIVE-006
//
// ARCHITECTURE (strict):
//   DB = canonical truth (persistence, replay)
//   DO = executor (validates, writes DB, broadcasts state)
//   Client = renderer (displays state, sends action signals)
//
// DO holds RUNTIME STATE (derived, rebuildable from DB at any time):
//   - players, ready flags, phase, current round, timers
//   - Loaded from DB on first connection (cold start)
//   - Updated deterministically from API write results (no re-fetch)
//
// Action flow: Client → DO → API → DB → snapshot returned → broadcast
// NO re-fetch after write. API returns snapshot from same write transaction.
//
// INVARIANTS:
//   - DO state is ALWAYS rebuildable from DB (no orphan state)
//   - Only DO writes to DB for gameplay actions (no dual writes)
//   - Client never calls refreshSnapshot() — WS is the only state source
//   - NO DB read after write — API-returned snapshot is the write result
//   - Same event → same state transition (deterministic)
//
// LOCKED RULES (MP-DO-AUTHORITATIVE-006 — CTO enforcement):
//
//   [SNAPSHOT-UNIQUE] ONE snapshot builder in the entire system:
//     API endpoints → loadCompeteSessionSnapshot() → getGameState()
//     DO cold start → GET /api/compete/:gameId → loadCompeteSessionSnapshot() → getGameState()
//     NO other snapshot construction allowed. No parallel logic.
//
//   [TIMER-DETERMINISM] phaseEndsAt = phaseStartAt + duration
//     Computed at write time, stored in round_events.payload
//     Read back from DB on reconstruction. No independent computation.
//
//   [LEAVE-MEMBERSHIP-ONLY] /leave mutates membership only (left_at, is_host).
//     NEVER gameplay state. Read-after-write acceptable for membership.
//     Must NEVER evolve into gameplay mutation.
//
//   [BANNED-PATTERNS] These are permanently banned:
//     ❌ write → DB → re-fetch → broadcast  (race condition)
//     ❌ multiple snapshot builders          (silent divergence)
//     ❌ API-only computed state              (not derivable from DB)
//     ❌ DO-only computed authoritative values (not in DB)
// ============================================================================

import { TransitionCause } from "../src/core/transitionCause";
import { z } from "zod";

interface Room {
  id: string;
  env: Record<string, unknown>;
  storage: {
    setAlarm(scheduledTime: number | Date): Promise<void>;
    deleteAlarm(): Promise<void>;
    getAlarm(): Promise<number | null>;
  };
  broadcast: (msg: string | ArrayBuffer | ArrayBufferView, without?: string[]) => void;
  getConnection(id: string): Connection | undefined;
  getConnections(tag?: string): Iterable<Connection>;
}

interface Connection {
  id: string;
  send: (msg: string | ArrayBuffer | ArrayBufferView) => void;
}

const JoinRoomSchema = z.object({
  type: z.literal("JOIN_ROOM"),
  playerId: z.string().uuid(),
  displayName: z.string().min(1).max(32)
});

const ToggleReadySchema = z.object({
  type: z.literal("TOGGLE_READY"),
  playerId: z.string().uuid(),
  ready: z.boolean()
});

const StartGameSchema = z.object({
  type: z.literal("START_GAME"),
  playerId: z.string().uuid()
});

const SubmitGuessSchema = z.object({
  type: z.literal("SUBMIT_GUESS"),
  playerId: z.string().uuid(),
  roundIndex: z.number().int().min(0),
  year: z.number().int().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  hintsUsed: z.array(z.string())
});

const AdvanceRoundSchema = z.object({
  type: z.literal("ADVANCE_ROUND"),
  playerId: z.string().uuid(),
  roundIndex: z.number().int().min(0),
  cause: z.string().optional()
});

const ReadyNextSchema = z.object({
  type: z.literal("READY_NEXT"),
  playerId: z.string().uuid(),
  roundIndex: z.number().int().min(0)
});

const SetTimerSchema = z.object({
  type: z.literal("SET_TIMER"),
  playerId: z.string().uuid(),
  roundTimerSec: z.number().int().min(0).max(300)
});

const SetYearRangeSchema = z.object({
  type: z.literal("SET_YEAR_RANGE"),
  playerId: z.string().uuid(),
  yearMin: z.number().int(),
  yearMax: z.number().int()
});

const SetEraSelectionSchema = z.object({
  type: z.literal("SET_ERA_SELECTION"),
  playerId: z.string().uuid(),
  selectedEras: z.array(z.string()),
  yearMin: z.number().int(),
  yearMax: z.number().int()
});

const SetRegionSelectionSchema = z.object({
  type: z.literal("SET_REGION_SELECTION"),
  playerId: z.string().uuid(),
  selectedRegions: z.array(z.string())
});

const SetResultsTimerSchema = z.object({
  type: z.literal("SET_RESULTS_TIMER"),
  playerId: z.string().uuid(),
  resultsAutoAdvanceSec: z.number().int().min(0).max(300)
});

const SetSubModeSchema = z.object({
  type: z.literal("SET_SUB_MODE"),
  playerId: z.string().uuid(),
  mode: z.enum(["sync", "async"]),
  sessionDeadlineDays: z.number().int().min(0).max(14)
});

const KickPlayerSchema = z.object({
  type: z.literal("KICK_PLAYER"),
  playerId: z.string().uuid(),
  targetPlayerId: z.string().uuid()
});

const PlayAgainSchema = z.object({
  type: z.literal("PLAY_AGAIN"),
  playerId: z.string().uuid(),
  newGameId: z.string().uuid()
});

const PingSchema = z.object({
  type: z.literal("PING")
});

const ServerMessageSchema = z.discriminatedUnion("type", [
  JoinRoomSchema,
  ToggleReadySchema,
  StartGameSchema,
  SubmitGuessSchema,
  AdvanceRoundSchema,
  ReadyNextSchema,
  SetTimerSchema,
  SetYearRangeSchema,
  SetEraSelectionSchema,
  SetRegionSelectionSchema,
  SetResultsTimerSchema,
  SetSubModeSchema,
  KickPlayerSchema,
  PlayAgainSchema,
  PingSchema
]);

// Runtime state shape — mirrors CompeteSessionSnapshot for type safety.
type RuntimeState = {
  gameId: string;
  status: string;
  players: Array<{ playerId: string; displayName: string; ready: boolean; isHost: boolean; hasSubmitted: boolean; leftAt: string | null }>;
  currentRoundIndex: number;
  roundEndsAt: string | null;
  roundTimerSec: number;
  resultsAutoAdvanceSec: number;
  roundResultsForClient?: unknown[];
  events?: Array<{ id: number; roundIndex: number | null; eventType: string; payload?: Record<string, unknown>; createdAt?: string }>;
  readyForNext?: string[];
  resultPhaseEndsAt?: number;
  resultPhaseStartedAt?: string | null;
  config?: { mode?: string };
};

function isRuntimeState(value: unknown): value is RuntimeState {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.gameId === "string" && typeof obj.status === "string" && Array.isArray(obj.players);
}

// Messages accepted FROM clients (action signals only — PartyKit never trusts payload fields except to forward to API)
export type ServerMessage =
  | { type: "JOIN_ROOM"; playerId: string; displayName: string }
  | { type: "TOGGLE_READY"; playerId: string; ready: boolean }
  | { type: "START_GAME"; playerId: string }
  | { type: "SUBMIT_GUESS"; playerId: string; roundIndex: number; year: number | null; lat: number | null; lng: number | null; hintsUsed: string[]; accPenalty?: number; xpPenalty?: number }
  | { type: "ADVANCE_ROUND"; playerId: string; roundIndex: number; cause?: string }
  | { type: "READY_NEXT"; playerId: string; roundIndex: number }
  | { type: "SET_TIMER"; playerId: string; roundTimerSec: number }
  | { type: "SET_YEAR_RANGE"; playerId: string; yearMin: number; yearMax: number }
  | { type: "SET_RESULTS_TIMER"; playerId: string; resultsAutoAdvanceSec: number }
  | { type: "SET_SUB_MODE"; playerId: string; mode: "sync" | "async"; sessionDeadlineDays: number }
  | { type: "SET_ERA_SELECTION"; playerId: string; selectedEras: string[]; yearMin: number; yearMax: number }
  | { type: "SET_REGION_SELECTION"; playerId: string; selectedRegions: string[] }
  | { type: "KICK_PLAYER"; playerId: string; targetPlayerId: string }
  | { type: "PLAY_AGAIN"; playerId: string; newGameId: string }
  | { type: "PING" };

// Messages sent TO clients
export type ClientMessage =
  | { type: "STATE_UPDATE"; snapshot: unknown; results?: unknown[] }
  | { type: "ERROR"; message: string; code?: string }
  | { type: "KICKED"; gameId: string }
  | { type: "PLAYER_SUBMITTED"; playerId: string; playerName: string }
  | { type: "TIMER_CLAMPED"; newPhaseEndsAt: string; clampedToSec: number }
  | { type: "PONG" };



export default class GameServer {
  // Connection registry — Maps connection.id → playerId for routing.
  private connections: Map<string, string> = new Map();

  // Active-connection count per playerId. Prevents /leave calls while the
  // player still has another live WS (StrictMode remount, tab A→B, etc.).
  private playerConnectionCounts: Map<string, number> = new Map();

  // Debounced /leave timers keyed by playerId. Cancelled on reconnect.
  private leaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Verified auth uids keyed by connection.id. Set in onConnect from the
  // x-verified-uid header stamped by static onBeforeConnect. Used in onMessage
  // to override client-supplied playerId with the verified Supabase auth uid.
  private verifiedUids: Map<string, string> = new Map();

  // Grace period before marking a player as left. Must be long enough to
  // absorb React StrictMode double-mount, HMR reloads, tab refreshes, and
  // normal network blips — but short enough that real disconnects flush
  // out of the active roster within a round.
  private static readonly LEAVE_GRACE_MS = 15_000;
  private static readonly ROUND_EXPIRY_SUBMIT_GRACE_MS = 1_000;

  // Mode-aware minimum players to start: sync requires 2, all other modes
  // (async, practice, daily) require 1. Reverts the temporary solo-start
  // override (MP-FIX-COMPETE-SOLO-START-TEMP-001) for sync specifically.
  private minPlayersToStart(mode: string): number {
    return mode === "sync" ? 2 : 1;
  }

  // Runtime state — derived, rebuildable from DB at any time.
  // This is the DO's authoritative view. DB remains canonical truth.
  // INVARIANT: if snapshotLoaded=true, snapshot is a valid RuntimeState.
  private snapshot: unknown | null = null;
  private snapshotLoaded = false;

  // Monotonic counter for snapshot broadcasts — increments on every snapshot update.
  // Used as snapshotVersion to guarantee strictly increasing versions regardless of
  // which DB table changed (round_events, session_players, etc.).
  private broadcastVersionCounter = 0;

  // Timer handle for round countdown (Phase 4+ — not yet active).
  // Will be used to broadcast timer ticks and auto-advance on expiry.
  private roundTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private resultTimerHandle: ReturnType<typeof setTimeout> | null = null;

  // In-flight lock for ADVANCE_ROUND to prevent race condition when
  // multiple players click "Next Round" simultaneously.
  private advanceInFlight = false;

  // In-flight counter for SUBMIT_GUESS to prevent race with triggerRoundExpiry.
  // When triggerRoundExpiry fires, we wait for all in-flight submissions to complete
  // before calling /complete to ensure real commits are written before insertMissingCommits.
  private submitInFlight = 0;

  // Per-player in-flight submission tracking to deduplicate concurrent SUBMIT_GUESS
  // messages for the same player+round before the first API call returns.
  private submitInFlightPlayers = new Set<string>();

  // In-flight lock for triggerRoundExpiry to prevent concurrent expiry handling.
  // Prevents duplicate ROUND_STARTED → ROUND_STARTED transitions when scheduleRoundTimer
  // fires while expiry is already in progress or when a new round's timer is already expired.
  private completeInFlight = false;

  // In-flight lock for START_GAME to prevent double-start when host double-clicks.
  private startInFlight = false;

  // Per-player ready state for RESULT phase (separate from lobby ready state).
  // Tracks which players have clicked "Next Round" during ROUND_COMPLETE phase.
  private readyForNext: Set<string> = new Set();

  // Tracks whether we've already attempted the bounded full-flow retry for result auto-advance.
  // Prevents unlimited rescheduling. Reset per-round when expectedRoundIndex changes.
  private resultAdvanceRetryAttempted = false;
  private lastResultAdvanceRoundIndex: number | null = null;

  // Pending results to be broadcast with next STATE_UPDATE.
  // Set when API returns results (e.g., /guess after round complete).
  // Cleared after broadcast to avoid stale results in future updates.
  private pendingResults: unknown[] | null = null;

  // Detected base URL from first client connection's Origin header.
  // Used to derive NEXTJS_BASE_URL dynamically for production correctness.
  private detectedBaseUrl: string | null = null;

  // Loading lock to prevent concurrent loadFromDB calls on cold start.
  private snapshotLoading = false;

  // ─────────────────────────────────────────────────────────────────────
  // WS AUTH GATE (MP-FIX-COMPETE-LIFECYCLE-BATCH-001 M1)
  // Verifies the Supabase access token from the WS URL ?token= query param
  // before the connection is established. Stamps x-verified-uid header on
  // the forwarded request so onConnect can bind connection.id → auth uid.
  // Returns 401 Response to reject unauthorized connection attempts.
  // ─────────────────────────────────────────────────────────────────────
  static async onBeforeConnect(
    req: Request,
    lobby: { env: Record<string, unknown> }
  ): Promise<Request | Response> {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Unauthorized: no token", { status: 401 });
    }

    const supabaseUrl = lobby.env.SUPABASE_URL as string | undefined;
    const serviceKey = lobby.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
    if (!supabaseUrl || !serviceKey) {
      console.error("[PartyKit] onBeforeConnect: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
      return new Response("Server auth configuration error", { status: 500 });
    }

    try {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: serviceKey,
        },
      });
      if (!userRes.ok) {
        return new Response("Unauthorized: invalid token", { status: 401 });
      }
      const user = await userRes.json() as { id?: string };
      if (!user?.id) {
        return new Response("Unauthorized: no user identity", { status: 401 });
      }
      const headers = new Headers(req.headers);
      headers.set("x-verified-uid", user.id);
      return new Request(req, { headers });
    } catch (err) {
      console.error("[PartyKit] onBeforeConnect: token verification failed:", err);
      return new Response("Unauthorized: token verification failed", { status: 401 });
    }
  }

  constructor(readonly room: Room) {
    console.log("[DO_INSTANCE]", {
      room: this.room.id,
      location: "constructor"
    });
  }

  private getNextJsBaseUrl(): string {
    if (this.detectedBaseUrl) return this.detectedBaseUrl;
    return (this.room.env.NEXTJS_BASE_URL as string | undefined) ?? "http://localhost:3000";
  }

  /**
   * Load snapshot from DB (cold start / reconnect only).
   * This is the ONLY path that reads from DB.
   * NOT called after writes — use applySnapshotAndBroadcast() instead.
   */
  private async loadFromDB(): Promise<void> {
    const gameId = this.room.id;
    console.time("[PERF] loadFromDB:apiFetch");
    const baseUrl = this.getNextJsBaseUrl();
    const snapUrl = `${baseUrl}/api/compete/${encodeURIComponent(gameId)}`;
    const snapRes = await fetch(snapUrl, {
      headers: {
        "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
      }
    });
    if (!snapRes.ok) {
      const text = await snapRes.text();
      throw new Error(`[loadFromDB] snapshot API error ${snapRes.status}: ${text}`);
    }
    const snapshot = await snapRes.json();
    // Extract config fields to populate RuntimeState
    if (snapshot && typeof snapshot === "object" && snapshot.config) {
      if (typeof snapshot.config.roundTimerSec === "number") {
        (snapshot as RuntimeState).roundTimerSec = snapshot.config.roundTimerSec;
      }
      if (typeof snapshot.config.resultsAutoAdvanceSec === "number") {
        (snapshot as RuntimeState).resultsAutoAdvanceSec = snapshot.config.resultsAutoAdvanceSec;
      }
    }
    this.snapshot = snapshot;
    console.timeEnd("[PERF] loadFromDB:apiFetch");
    this.snapshotLoaded = true;
    // Rebuild readyForNext from READY_NEXT events for the current round only
    if (isRuntimeState(this.snapshot) && this.snapshot.status === "ROUND_COMPLETE") {
      const currentRound = this.snapshot.currentRoundIndex;
      const readyNextEvents = this.snapshot.events
        ?.filter((e: { eventType: string; roundIndex?: number | null }) =>
          e.eventType === "READY_NEXT" && e.roundIndex === currentRound
        );
      this.readyForNext = new Set(
        (readyNextEvents ?? [])
          .map((e: { payload?: Record<string, unknown> }) => e.payload?.playerId as string)
          .filter(Boolean)
      );
      console.log("[PartyKit] Cold load: restored readyForNext from DB events for ROUND_COMPLETE session");
    }

    // If a PRESSURE_APPLIED event exists for the current round,
    // use its newRoundEndsAt instead of the original ROUND_STARTED value
    if (isRuntimeState(this.snapshot) &&
        this.snapshot.status === "ROUND_ACTIVE" &&
        this.snapshot.events) {
      const currentRound = this.snapshot.currentRoundIndex;
      const pressureEvent = this.snapshot.events
        .slice()
        .reverse()
        .find((e) =>
          e.eventType === "PRESSURE_APPLIED" &&
          e.roundIndex === currentRound
        );
      if (pressureEvent?.payload?.newRoundEndsAt) {
        (this.snapshot as RuntimeState).roundEndsAt =
          pressureEvent.payload.newRoundEndsAt as string;
        console.log("[PartyKit] Cold load: restored clamped roundEndsAt from PRESSURE_APPLIED event");
      }
    }

    this.scheduleRoundTimer();
  }

  /**
   * Apply API-returned snapshot to runtime state and broadcast.
   * This is the ONLY way state is updated after a write action.
   *
   * CRITICAL: The snapshot comes from the same API call that wrote to DB.
   * No separate DB read occurs. This eliminates the race condition where
   * a re-fetch could see stale or interleaved data.
   *
   * If DB write fails, this method is NEVER called (exception propagates).
   * → NO state mutation on failure. NO broadcast on failure.
   */
  private applySnapshotAndBroadcast(snapshot: unknown): void {
    if (isRuntimeState(snapshot)) {
      console.log("[APPLY_SNAPSHOT_INCOMING]", {
        previousRoundEndsAt: (isRuntimeState(this.snapshot) ? this.snapshot.roundEndsAt : null) ?? null,
        incomingRoundEndsAt: snapshot.roundEndsAt ?? null,
        status: snapshot.status,
        roundIndex: snapshot.currentRoundIndex,
      });
      console.log("[PartyKit] Applying snapshot, players:", snapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
      // Reset readyForNext when transitioning from ROUND_COMPLETE to ROUND_ACTIVE (new round started)
      if (isRuntimeState(this.snapshot) &&
          this.snapshot.status === "ROUND_COMPLETE" &&
          snapshot.status === "ROUND_ACTIVE") {
        this.readyForNext.clear();
        // MP-FIX-SYNC-DESYNC-001: Reset completeInFlight (set true by SUBMIT_GUESS
        // early-completion path) and ensure roundTimerHandle is cleared so the new
        // round's timer scheduling is not blocked by stale state from the prior round.
        this.completeInFlight = false;
        this.roundTimerHandle = null;
        console.log("[PartyKit] New round started, readyForNext cleared, completeInFlight reset");
      }
      console.log("[PARTYKIT_APPLY_PLAYERS]", {
        totalPlayers: snapshot.players.length,
        players: snapshot.players.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
          leftAt: p.leftAt,
        })),
      });
    }
    if (snapshot && typeof snapshot === "object") {
      const s = snapshot as Record<string, unknown>;
      const configRecord = s["config"] as Record<string, unknown> | undefined;
      if (configRecord && typeof configRecord["resultsAutoAdvanceSec"] === "number") {
        s["resultsAutoAdvanceSec"] = configRecord["resultsAutoAdvanceSec"];
      }
      if (configRecord && typeof configRecord["roundTimerSec"] === "number") {
        s["roundTimerSec"] = configRecord["roundTimerSec"];
      }
      if (configRecord && typeof configRecord["yearMin"] === "number") {
        s["yearMin"] = configRecord["yearMin"];
      }
      if (configRecord && typeof configRecord["yearMax"] === "number") {
        s["yearMax"] = configRecord["yearMax"];
      }
      if (configRecord && Array.isArray(configRecord["selectedEras"])) {
        s["selectedEras"] = configRecord["selectedEras"];
      }
    }
    this.snapshot = snapshot;
    this.snapshotLoaded = true;
    this.scheduleRoundTimer();
    console.log("[STATE_UPDATE_OUTBOUND]", {
      roundEndsAt: (isRuntimeState(this.snapshot) ? this.snapshot.roundEndsAt : null) ?? null,
      status: (isRuntimeState(this.snapshot) ? this.snapshot.status : null) ?? null,
    });
    this.broadcastStateUpdate();
  }

  /**
   * Server-authoritative auto-start: called after every TOGGLE_READY write.
   * Re-derives the start condition from DO's own state — not from counting
   * client messages. Shared by the TOGGLE_READY post-check and the
   * explicit START_GAME handler. Guarded by startInFlight mutex.
   */
  private async attemptAutoStart(gameId: string): Promise<void> {
    if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") return;
    const activePlayers = this.snapshot.players.filter(p => p.leftAt === null);
    const allReady = activePlayers.length >= this.minPlayersToStart(this.snapshot.config?.mode ?? "sync") &&
      activePlayers.every(p => p.ready === true);
    if (!allReady) return;
    if (this.startInFlight) {
      console.log("[PartyKit] attemptAutoStart skipped — start already in flight");
      return;
    }
    this.startInFlight = true;
    const hostPlayer = activePlayers.find(p => p.isHost);
    const hostPlayerId = hostPlayer?.playerId;
    if (!hostPlayerId) {
      console.error("[PartyKit] attemptAutoStart: no host found in active players");
      this.startInFlight = false;
      return;
    }
    console.log("[PartyKit] All players ready — server-initiating auto-start");
    try {
      const baseUrl = this.getNextJsBaseUrl();
      const apiUrl = `${baseUrl}/api/compete/${encodeURIComponent(gameId)}/start`;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
        },
        body: JSON.stringify({ playerId: hostPlayerId })
      });
      if (!response.ok) {
        const text = await response.text();
        console.error(`[attemptAutoStart] start API error ${response.status}: ${text}`);
        return;
      }
      const snapshot = await response.json();
      this.applySnapshotAndBroadcast(snapshot);
    } finally {
      this.startInFlight = false;
    }
  }

  /**
   * Schedule round timer based on current snapshot state.
   * If ROUND_ACTIVE with roundEndsAt in the future, set a timer to
   * auto-advance when time expires. Clear timer on any other phase.
   *
   * NOTE: The actual timeout/advance logic is handled by the /advance
   * API route which checks for expired rounds. The DO just triggers it.
   */
  private scheduleRoundTimer(): void {
    // Clear any existing timer
    if (this.roundTimerHandle !== null) {
      clearTimeout(this.roundTimerHandle);
      this.roundTimerHandle = null;
    }
    if (this.resultTimerHandle !== null) {
      clearTimeout(this.resultTimerHandle);
      this.resultTimerHandle = null;
    }
    // Clear any existing DO alarm (async mode uses alarms instead of setTimeout
    // so timers fire even with zero connected clients — Compete Relax Option B §10.1)
    this.room.storage.deleteAlarm().catch(() => {});

    if (!this.snapshot || !isRuntimeState(this.snapshot)) return;

    // Determine sub-mode from snapshot config (async = Relax, sync = Rush)
    const snapshotConfig = (this.snapshot as Record<string, unknown>)?.config as Record<string, unknown> | undefined;
    const mode = (snapshotConfig?.["mode"] as string) ?? "sync";
    const isAsync = mode === "async";
    // Session deadline (async only, computed at START_GAME as startedAt + days)
    const sessionDeadline = (snapshotConfig?.["sessionDeadline"] as string | null) ?? null;

    if (this.snapshot.status === "ROUND_COMPLETE" && this.snapshot.resultPhaseStartedAt) {
      const autoAdvanceSec = this.snapshot.resultsAutoAdvanceSec ?? 90;
      if (autoAdvanceSec > 0) {
        const autoAdvanceMs = autoAdvanceSec * 1000;
        const resultPhaseEndsAt = new Date(this.snapshot.resultPhaseStartedAt).getTime() + autoAdvanceMs;
        const delay = resultPhaseEndsAt - Date.now();
        const expectedRoundIndex = this.snapshot.currentRoundIndex;
        if (delay <= 0) {
          this.triggerResultAutoAdvance(expectedRoundIndex);
        } else if (isAsync) {
          // Async: use DO alarm (persists through DO eviction / zero clients)
          this.room.storage.setAlarm(resultPhaseEndsAt).catch((err) =>
            console.error("[PartyKit] setAlarm (result phase) failed:", err)
          );
        } else {
          this.resultTimerHandle = setTimeout(() => {
            this.resultTimerHandle = null;
            this.triggerResultAutoAdvance(expectedRoundIndex);
          }, delay);
        }
      }
      return;
    }

    // Only schedule for active rounds
    if (this.snapshot.status !== "ROUND_ACTIVE") return;

    // Compute effective expiry: earliest of roundEndsAt and sessionDeadline (async only).
    // In async mode with no round timer (roundTimerSec=0, the default), roundEndsAt is
    // null — but the session deadline still applies and must trigger round completion.
    // See Compete Relax (Option B) §5.1(c) / §6.
    const now = Date.now();
    const expectedRoundIndex = this.snapshot.currentRoundIndex;
    const roundEndsAtMs = this.snapshot.roundEndsAt ? new Date(this.snapshot.roundEndsAt).getTime() : null;
    const sessionDeadlineMs = isAsync && sessionDeadline ? new Date(sessionDeadline).getTime() : null;

    let endsAt: number | null = roundEndsAtMs;
    if (sessionDeadlineMs !== null) {
      endsAt = endsAt !== null ? Math.min(endsAt, sessionDeadlineMs) : sessionDeadlineMs;
    }
    if (endsAt === null) return; // no expiry mechanism available (sync with no timer)

    const delay = endsAt - now;

    if (delay <= 0) {
      // Round already expired — trigger advance immediately
      console.log("[PartyKit] Round expired, triggering advance");
      this.triggerRoundExpiry(expectedRoundIndex);
    } else if (isAsync) {
      // Async: use DO alarm (persists through DO eviction / zero clients)
      console.log(`[PartyKit] Round alarm scheduled (async): ${Math.round(delay / 1000)}s`);
      this.room.storage.setAlarm(endsAt).catch((err) =>
        console.error("[PartyKit] setAlarm (round active) failed:", err)
      );
    } else {
      // Schedule advance for when the round expires
      console.log(`[PartyKit] Round timer scheduled: ${Math.round(delay / 1000)}s`);
      this.roundTimerHandle = setTimeout(() => {
        this.roundTimerHandle = null;
        this.triggerRoundExpiry(expectedRoundIndex);
      }, delay);
    }
  }

  /**
   * Called when a DO storage alarm fires. This is the async (Relax) timer
   * mechanism — alarms persist through DO eviction (zero connected clients),
   * unlike setTimeout which dies when the DO is evicted.
   * If the DO was evicted, reload from DB first (loadFromDB → scheduleRoundTimer
   * handles expired rounds immediately). If the DO was alive, trigger the
   * appropriate expiry/advance directly.
   * See Compete Relax (Option B) §10.1 — PartyKit DO alarms.
   */
  async onAlarm(): Promise<void> {
    if (!this.snapshotLoaded) {
      try {
        this.snapshotLoading = true;
        await this.loadFromDB();
      } catch (err) {
        console.error("[PartyKit] onAlarm loadFromDB failed:", err instanceof Error ? err.message : err);
      } finally {
        this.snapshotLoading = false;
      }
      // loadFromDB → scheduleRoundTimer already handled the state transition.
      return;
    }

    if (!isRuntimeState(this.snapshot)) return;

    if (this.snapshot.status === "ROUND_ACTIVE") {
      await this.triggerRoundExpiry(this.snapshot.currentRoundIndex);
    } else if (this.snapshot.status === "ROUND_COMPLETE") {
      await this.triggerResultAutoAdvance(this.snapshot.currentRoundIndex);
    }
  }

  /**
   * Called when a round timer expires. First completes the round (scores + ROUND_COMPLETE),
   * waits ROUND_EXPIRY_SUBMIT_GRACE_MS (1s) for in-flight submissions to settle,
   * then broadcasts the ROUND_COMPLETE snapshot. Result-phase auto-advance is handled
   * separately by triggerResultAutoAdvance using resultsAutoAdvanceSec. Uses API-returned
   * snapshots — no re-fetch.
   */
  private async triggerRoundExpiry(expectedRoundIndex: number): Promise<void> {
    const currentRoundIndex = isRuntimeState(this.snapshot) ? this.snapshot.currentRoundIndex : null;
    if (currentRoundIndex !== expectedRoundIndex) {
      console.log(`[PartyKit] Stale round timer ignored: expected round ${expectedRoundIndex}, current round ${currentRoundIndex}`);
      return;
    }

    if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "ROUND_ACTIVE") {
      return;
    }

    if (this.completeInFlight) {
      return;
    }
    this.completeInFlight = true;

    const gameId = this.room.id;
    const roundIndex = this.snapshot.currentRoundIndex;

    await new Promise<void>((resolve) => setTimeout(resolve, GameServer.ROUND_EXPIRY_SUBMIT_GRACE_MS));
    if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "ROUND_ACTIVE" || this.snapshot.currentRoundIndex !== expectedRoundIndex) {
      this.completeInFlight = false;
      return;
    }

    // Wait for any in-flight submissions to complete before closing the round
    if (this.submitInFlight > 0) {
      const waited = await new Promise<boolean>((resolve) => {
        const start = Date.now();
        const check = () => {
          if (this.submitInFlight === 0) return resolve(true);
          if (Date.now() - start > 15000) return resolve(false);
          setTimeout(check, 50);
        };
        check();
      });
      if (!waited) {
        console.warn("[PartyKit] Timed out waiting for in-flight submissions — proceeding with round expiry");
      }
    }

    try {
      // Step 1: Complete the round (score + ROUND_COMPLETE event)
      try {
        const baseUrl = this.getNextJsBaseUrl();
        const completeUrl = `${baseUrl}/api/compete/${encodeURIComponent(gameId)}/complete`;
        const completeRes = await fetch(completeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
          },
          body: JSON.stringify({ roundIndex })
        });
        if (!completeRes.ok) {
          const text = await completeRes.text();
          throw new Error(`[triggerRoundExpiry] complete API error ${completeRes.status}: ${text}`);
        }
        const completeSnapshot = await completeRes.json();
        this.applySnapshotAndBroadcast(completeSnapshot);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("409") && !msg.includes("ALREADY_COMPLETE")) {
          console.error("[PartyKit] Round complete failed, attempting snapshot recovery:", msg);
        }
        // Fallback: regardless of error type, sync DO state from DB.
        // This handles the case where /complete failed but submitGuess already
        // wrote ROUND_COMPLETE — the DO must broadcast the current DB state.
        try {
          const baseUrl = this.getNextJsBaseUrl();
          const stateUrl = `${baseUrl}/api/compete/${encodeURIComponent(gameId)}`;
          const stateRes = await fetch(stateUrl, {
            headers: { "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? "" }
          });
          if (stateRes.ok) {
            const fallbackSnapshot = await stateRes.json();
            this.applySnapshotAndBroadcast(fallbackSnapshot);
          } else {
            console.error("[PartyKit] Fallback snapshot fetch also failed:", stateRes.status);
          }
        } catch (fallbackErr) {
          console.error("[PartyKit] Fallback snapshot fetch threw:", fallbackErr);
        }
      }

    } finally {
      this.completeInFlight = false;
    }
  }

  private async triggerResultAutoAdvance(expectedRoundIndex: number): Promise<void> {
    if (!isRuntimeState(this.snapshot)) return;
    if (this.snapshot.status !== "ROUND_COMPLETE") return;
    if (this.snapshot.currentRoundIndex !== expectedRoundIndex) return;
    if (this.advanceInFlight) return;

    // Reset retry tracking per-round when expectedRoundIndex changes
    if (this.lastResultAdvanceRoundIndex !== expectedRoundIndex) {
      this.resultAdvanceRetryAttempted = false;
      this.lastResultAdvanceRoundIndex = expectedRoundIndex;
    }

    this.advanceInFlight = true;
    try {
      const baseUrl = this.getNextJsBaseUrl();
      const advanceUrl = `${baseUrl}/api/compete/${encodeURIComponent(this.room.id)}/advance`;
      
      // Primary fetch with 10-second timeout
      const advanceController = new AbortController();
      const advanceTimeout = setTimeout(() => advanceController.abort(), 10000);
      try {
        const advanceRes = await fetch(advanceUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
          },
          body: JSON.stringify({ cause: TransitionCause.TIMEOUT, roundIndex: expectedRoundIndex }),
          signal: advanceController.signal
        });
        clearTimeout(advanceTimeout);
        if (!advanceRes.ok) {
          const text = await advanceRes.text();
          throw new Error(`[triggerResultAutoAdvance] advance API error ${advanceRes.status}: ${text}`);
        }
        const advanceSnapshot = await advanceRes.json();
        this.applySnapshotAndBroadcast(advanceSnapshot);
      } catch (err) {
        clearTimeout(advanceTimeout);
        console.error("[PartyKit] Result auto-advance failed, attempting snapshot recovery:", err instanceof Error ? err.message : err);
        
        // Fallback fetch with 10-second timeout and one bounded retry
        let fallbackSuccess = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) {
            // Wait 2 seconds before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          try {
            const fallbackController = new AbortController();
            const fallbackTimeout = setTimeout(() => fallbackController.abort(), 10000);
            try {
              const stateRes = await fetch(`${baseUrl}/api/compete/${encodeURIComponent(this.room.id)}`, {
                headers: { "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? "" },
                signal: fallbackController.signal
              });
              clearTimeout(fallbackTimeout);
              if (stateRes.ok) {
                const fallbackSnapshot = await stateRes.json();
                this.applySnapshotAndBroadcast(fallbackSnapshot);
                fallbackSuccess = true;
                break;
              }
            } catch (fallbackErr) {
              clearTimeout(fallbackTimeout);
              if (attempt === 1) {
                console.error("[PartyKit] triggerResultAutoAdvance: all recovery attempts exhausted, round_index=" + expectedRoundIndex);
              }
            }
          } catch (fallbackErr) {
            if (attempt === 1) {
              console.error("[PartyKit] triggerResultAutoAdvance: all recovery attempts exhausted, round_index=" + expectedRoundIndex);
            }
          }
        }
        
        // If all recovery attempts failed and we haven't retried the full flow yet, reschedule once
        if (!fallbackSuccess && !this.resultAdvanceRetryAttempted) {
          this.resultAdvanceRetryAttempted = true;
          setTimeout(() => {
            this.triggerResultAutoAdvance(expectedRoundIndex);
          }, 5000);
        }
      }
    } finally {
      this.advanceInFlight = false;
    }
  }

  /**
   * Broadcast full STATE_UPDATE to all connected clients.
   * This replaces STATE_INVALIDATED — clients no longer need to REST-fetch.
   */
  private broadcastStateUpdate(): void {
    console.log("[DO_INSTANCE]", {
      room: this.room.id,
      location: "broadcastStateUpdate"
    });
    if (!this.snapshot) return;
    this.broadcastVersionCounter += 1;
    let snapshotWithReadyState: unknown = this.snapshot;
    let resultPhaseEndsAt: number | undefined;
    if (isRuntimeState(this.snapshot)) {
      console.log("[PartyKit] Broadcasting to all, players:", this.snapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
      console.log("[AUTOADVANCE_DIAG]", "status=" + this.snapshot.status, "resultPhaseStartedAt=" + this.snapshot.resultPhaseStartedAt, "resultsAutoAdvanceSec=" + this.snapshot.resultsAutoAdvanceSec);
      console.log("[AUTOADVANCE_DIAG]", "resultPhaseEndsAt will be=" + (this.snapshot.status === "ROUND_COMPLETE" && this.snapshot.resultPhaseStartedAt ? new Date(this.snapshot.resultPhaseStartedAt).getTime() + (this.snapshot.resultsAutoAdvanceSec ?? 90) * 1000 : "UNDEFINED"));
      const autoAdvanceSec = this.snapshot.resultsAutoAdvanceSec ?? 90;
      const autoAdvanceMs = autoAdvanceSec * 1000;
      resultPhaseEndsAt = this.snapshot.status === "ROUND_COMPLETE" &&
        this.snapshot.resultPhaseStartedAt &&
        autoAdvanceSec > 0
          ? new Date(this.snapshot.resultPhaseStartedAt).getTime() + autoAdvanceMs
          : undefined;
      const activePlayers = this.snapshot.players.filter(p => p.leftAt === null);
      const allPlayersReady =
        activePlayers.length >= this.minPlayersToStart(this.snapshot.config?.mode ?? "sync") &&
        activePlayers.every(p => p.ready === true);

      const snapshotVersion = this.broadcastVersionCounter;
      snapshotWithReadyState = {
        ...this.snapshot,
        readyForNext: [...this.readyForNext],
        resultPhaseEndsAt,
        allPlayersReady,
        snapshotVersion
      };
    }
    // Add readyForNext and resultPhaseEndsAt to snapshot before broadcasting
    // readyForNext is in-memory PartyKit state; resultPhaseEndsAt is derived from DB payload

    // Regression guard: ROUND_COMPLETE snapshots must always carry resultPhaseEndsAt.
    // If this fires, the snapshot builder did not include resultPhaseStartedAt from DB.
    if (isRuntimeState(this.snapshot) &&
        this.snapshot.status === "ROUND_COMPLETE" &&
        (this.snapshot.resultsAutoAdvanceSec ?? 90) > 0 &&
        typeof resultPhaseEndsAt !== "number") {
      console.error(
        "[PartyKit] INVARIANT VIOLATION: broadcasting ROUND_COMPLETE without resultPhaseEndsAt. " +
        "resultPhaseStartedAt=" + this.snapshot.resultPhaseStartedAt + " This is a bug — timer and Next button will not work."
      );
    }

    console.log("[PARTYKIT_BROADCAST_PLAYERS]", {
      totalPlayers: (this.snapshot as any).players?.length ?? null,
      players: (this.snapshot as any).players?.map((p: any) => ({
        playerId: p.playerId,
        displayName: p.displayName,
      })),
    });

    console.log("[DO_BROADCAST_ROOM]", {
      room: this.room.id,
      socketCount: this.connections.size,
    });

    // MP-FIX-SYNC-DESYNC-002: Hoist config construction outside the per-connection loop.
    // All config fields depend only on session-level snapshotWithReadyState, not on
    // per-connection socketPlayerId. Computing once avoids N rebuilds for N connections.
    const snapshotRecord = snapshotWithReadyState as Record<string, unknown>;

    // Build config object from config data to satisfy SessionConfig type
    const configRecord = snapshotRecord["config"] as Record<string, unknown> | undefined;
    const players = snapshotRecord["players"] as Array<{ playerId: string; isHost: boolean }> | undefined;
    const hostPlayer = players?.find(p => p.isHost);

    const config = {
      mode: (configRecord?.["mode"] as "practice" | "sync" | "async") ?? "sync",
      roundTimerSec: (configRecord?.["roundTimerSec"] as number) ?? (snapshotRecord["roundTimerSec"] as number) ?? 60,
      totalRounds: (configRecord?.["totalRounds"] as number) ?? 5,
      yearMin: (configRecord?.["yearMin"] as number) ?? (snapshotRecord["yearMin"] as number) ?? -400,
      yearMax: (configRecord?.["yearMax"] as number) ?? (snapshotRecord["yearMax"] as number) ?? new Date().getFullYear(),
      selectedEras: (configRecord?.["selectedEras"] as string[] | undefined) ?? (snapshotRecord["selectedEras"] as string[] | undefined) ?? null,
      selectedRegions: (configRecord?.["selectedRegions"] as string[] | undefined) ?? (snapshotRecord["selectedRegions"] as string[] | undefined) ?? null,
      resultsAutoAdvanceSec: (configRecord?.["resultsAutoAdvanceSec"] as number) ?? (snapshotRecord["resultsAutoAdvanceSec"] as number) ?? 90,
      hostPlayerId: hostPlayer?.playerId ?? null,
      sessionDeadline: (configRecord?.["sessionDeadline"] as string | null) ?? null,
      startedAt: (configRecord?.["startedAt"] as string | null) ?? null,
      completedAt: (configRecord?.["completedAt"] as string | null) ?? null,
    };

    for (const connection of this.room.getConnections()) {
      const socketPlayerId = this.connections.get(connection.id);

      const perSocketSnapshot = {
        ...snapshotRecord,
        viewerPlayerId: socketPlayerId ?? null,
        config
      };

      connection.send(JSON.stringify({
        type: "STATE_UPDATE",
        snapshot: perSocketSnapshot,
        results: this.pendingResults ?? (this.snapshot as RuntimeState)?.roundResultsForClient ?? undefined
      }));
    }
    this.pendingResults = null; // clear after broadcast
  }

  async onConnect(connection: Connection, ctx: { request: { headers: { get: (name: string) => string | null } } }): Promise<void> {
    console.log("[DO_INSTANCE]", {
      room: this.room.id,
      location: "onConnect"
    });
    console.log("[DO_SOCKET_CONNECTED]", {
      room: this.room.id,
      connectionId: connection.id,
      socketCount: this.connections.size,
    });
    console.log("[PartyKit] Client connected:", connection.id);

    // Detect base URL from Origin header for production correctness
    if (!this.detectedBaseUrl && ctx.request) {
      const origin = ctx.request.headers.get("origin");
      if (origin && (origin.includes("localhost") || origin.includes("vercel.app") || origin.includes(".partykit.dev") || origin.includes("guess-history.com"))) {
        this.detectedBaseUrl = origin;
        console.log(`[PartyKit] Detected base URL from origin: ${this.detectedBaseUrl}`);
      }
    }

    // Store verified auth uid for this connection (stamped by onBeforeConnect).
    // Used in onMessage to override client-supplied playerId with verified uid.
    const verifiedUid = ctx.request.headers.get("x-verified-uid");
    if (verifiedUid) {
      this.verifiedUids.set(connection.id, verifiedUid);
    }

    // Cold start: if DO just woke up and has no snapshot, load from DB.
    // Uses a lock to prevent concurrent loads if multiple clients connect simultaneously.
    if (!this.snapshotLoaded && !this.snapshotLoading) {
      this.snapshotLoading = true;
      try {
        await this.loadFromDB();
      } catch (err) {
        console.error("[PartyKit] Cold start loadFromDB failed:", err instanceof Error ? err.message : err);
      } finally {
        this.snapshotLoading = false;
      }
    }

    // Send loading-state snapshot to connecting socket only as unblock.
    // This prevents client from hanging if JOIN_ROOM fails or is slow.
    // viewerPlayerId is null here because socket is not yet registered.
    // Correct viewerPlayerId arrives with JOIN_ROOM broadcast moments later.
    if (this.snapshotLoaded && this.snapshot) {
      connection.send(JSON.stringify({
        type: "STATE_UPDATE",
        snapshot: { ...this.snapshot as Record<string, unknown>, viewerPlayerId: null },
        results: (this.snapshot as RuntimeState)?.roundResultsForClient ?? undefined
      }));
    }

    // Do NOT broadcast snapshot here to all sockets. The client sends JOIN_ROOM
    // immediately after connecting, which triggers a DB write and a fresh
    // broadcastStateUpdate to all sockets with correct viewerPlayerId per socket.
  }

  async onClose(connection: Connection): Promise<void> {
    console.log("[DO_SOCKET_DISCONNECTED]", {
      room: this.room.id,
      connectionId: connection.id,
      socketCount: this.connections.size,
    });
    console.log("[PartyKit] Client disconnected:", connection.id);

    const playerId = this.connections.get(connection.id);
    this.connections.delete(connection.id);
    this.verifiedUids.delete(connection.id);

    if (!playerId) return;

    // Decrement active-connection count for this player.
    const prev = this.playerConnectionCounts.get(playerId) ?? 0;
    const next = Math.max(0, prev - 1);
    if (next === 0) {
      this.playerConnectionCounts.delete(playerId);
    } else {
      this.playerConnectionCounts.set(playerId, next);
    }

    // If the player still has at least one live WS (StrictMode remount,
    // multi-tab, rapid reconnect), do NOT mark them as left — they are
    // still present. This eliminates the race where /leave fires for an
    // old socket after /join has already re-activated the player.
    if (next > 0) {
      console.log(`[PartyKit] onClose ignored — ${next} live connections remain for player ${playerId.slice(0, 8)}`);
      return;
    }

    // No live connections — schedule /leave after a grace period. A brief
    // disconnect (network blip, reload) will cancel this timer when the
    // player's new connection registers via JOIN_ROOM.
    const gameId = this.room.id;
    const existing = this.leaveTimers.get(playerId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.leaveTimers.delete(playerId);
      // Final check: if the player reconnected during the grace period,
      // skip /leave entirely.
      if ((this.playerConnectionCounts.get(playerId) ?? 0) > 0) {
        console.log(`[PartyKit] Leave cancelled — player ${playerId.slice(0, 8)} reconnected during grace`);
        return;
      }
      // Async (Relax) mode: closing the app/tab is a normal state, not a leave.
      // Only explicit Leave sets left_at. Disconnect never triggers absence —
      // only round/session expiry does. See Compete Relax (Option B) §9.
      if (isRuntimeState(this.snapshot)) {
        const config = (this.snapshot as Record<string, unknown>)?.config as Record<string, unknown> | undefined;
        const mode = (config?.["mode"] as string) ?? "sync";
        if (mode === "async") {
          console.log(`[PartyKit] Leave skipped — async mode, player ${playerId.slice(0, 8)} offline (not left)`);
          return;
        }
      }
      try {
        // /leave mutates MEMBERSHIP ONLY (left_at).
        // LOCKED RULE: /leave must NEVER evolve into gameplay mutation.
        const baseUrl = this.getNextJsBaseUrl();
        const leaveUrl = `${baseUrl}/api/compete/${encodeURIComponent(gameId)}/leave`;
        const leaveRes = await fetch(leaveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
          },
          body: JSON.stringify({ playerId })
        });
        if (!leaveRes.ok) {
          const text = await leaveRes.text();
          console.error(`[onClose] leave API error ${leaveRes.status}: ${text}`);
          this.broadcastStateUpdate();
          return;
        }
        const snapshot = await leaveRes.json();
        this.applySnapshotAndBroadcast(snapshot);
      } catch (err) {
        console.error("[PartyKit] Failed to persist disconnect:", err instanceof Error ? err.message : err);
        this.broadcastStateUpdate();
      }
      // Add up to 5s jitter to stagger concurrent leave calls (e.g. when
      // multiple players disconnect simultaneously during ws-drop-reconnect
      // edge case). This prevents all leave API calls from hitting the DB
      // pool at the same instant, causing pool exhaustion.
    }, GameServer.LEAVE_GRACE_MS + Math.floor(Math.random() * 5000));

    this.leaveTimers.set(playerId, timer);
  }

  async onMessage(message: string, sender: Connection): Promise<void> {
    let data: ServerMessage;
    try {
      const raw = JSON.parse(message) as unknown;
      const result = ServerMessageSchema.safeParse(raw);
      if (!result.success) {
        const firstError = result.error.issues[0];
        const errorMsg = firstError
          ? `Invalid message: ${firstError.path.join(".")} — ${firstError.message}` 
          : "Invalid message format";
        console.warn("[PartyKit] Message validation failed:", result.error.issues);
        this.sendError(sender, errorMsg);
        return;
      }
      data = result.data;
    } catch (err) {
      this.sendError(sender, "Invalid message format");
      return;
    }

    const gameId = this.room.id;

    // AUTH GATE (M1): Override client-supplied playerId with the verified
    // Supabase auth uid for this connection. onBeforeConnect verified the
    // token and onConnect stored the uid. If no verified uid exists, reject.
    const verifiedUid = this.verifiedUids.get(sender.id);
    if (!verifiedUid) {
      this.sendError(sender, "Unauthorized: no verified identity for this connection");
      return;
    }
    if ("playerId" in data && typeof data.playerId === "string") {
      (data as Record<string, unknown>).playerId = verifiedUid;
    }

    // Register connection → playerId mapping for routing purposes only.
    // First time we see this connection, bump the player's live-connection
    // count and cancel any pending debounced /leave — the player is back.
    if ("playerId" in data && typeof data.playerId === "string") {
      const playerId = data.playerId;
      const alreadyMapped = this.connections.get(sender.id) === playerId;
      if (!alreadyMapped) {
        this.connections.set(sender.id, playerId);
        const prev = this.playerConnectionCounts.get(playerId) ?? 0;
        this.playerConnectionCounts.set(playerId, prev + 1);
        const pendingLeave = this.leaveTimers.get(playerId);
        if (pendingLeave) {
          clearTimeout(pendingLeave);
          this.leaveTimers.delete(playerId);
          console.log(`[PartyKit] Cancelled pending /leave for player ${playerId.slice(0, 8)} (reconnected)`);
        }
      }
    }

    try {
      switch (data.type) {
        case "JOIN_ROOM": {
          this.connections.set(sender.id, data.playerId);
          console.log("[DO_INSTANCE]", {
            room: this.room.id,
            location: "JOIN_ROOM"
          });
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/join`;
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              displayName: data.displayName
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[JOIN_ROOM] API error ${response.status}: ${text}`);
            let errorMsg = "Unable to rejoin game";
            let errorCode: string | undefined;
            try {
              const parsed = JSON.parse(text) as { error?: string; code?: string };
              if (parsed.error) errorMsg = parsed.error.replace(/session/gi, "game");
              errorCode = parsed.code;
            } catch {}
            this.sendError(sender, errorMsg, errorCode);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "TOGGLE_READY": {
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/ready`;
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              ready: data.ready
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[TOGGLE_READY] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          // Server-authoritative auto-start: re-derive condition from DO state.
          // No client message required — server checks on every ready-state change.
          await this.attemptAutoStart(gameId);
          break;
        }

        case "START_GAME": {
          // Validate: only allowed in LOBBY phase
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "START_GAME only allowed in LOBBY phase");
            break;
          }

          // Validate: only the host can manually force-start
          const senderPlayerId = this.connections.get(sender.id);
          const senderPlayer = this.snapshot.players.find(p => p.playerId === senderPlayerId);
          if (!senderPlayer || !senderPlayer.isHost) {
            console.log(`[PartyKit] START_GAME ignored — sender ${senderPlayerId?.slice(0, 8)} is not the host`);
            break;
          }

          // Directly call the /start API (same endpoint as attemptAutoStart).
          // The /start API (startCompeteSession) enforces allPlayersReady and
          // host check — there is no bypass. The only difference from
          // attemptAutoStart is that this is triggered by the host's explicit
          // START_GAME message rather than automatically on all-ready.
          if (this.startInFlight) {
            console.log("[PartyKit] START_GAME ignored — start already in flight");
            break;
          }
          this.startInFlight = true;
          try {
            const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/start`;
            const response = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
              },
              body: JSON.stringify({
                playerId: senderPlayerId
              })
            });
            if (!response.ok) {
              const text = await response.text();
              console.error(`[START_GAME] API error ${response.status}: ${text}`);
              break;
            }
            const snapshot = await response.json();
            this.applySnapshotAndBroadcast(snapshot);
          } finally {
            this.startInFlight = false;
          }
          break;
        }

        case "SUBMIT_GUESS": {
          const submitKey = `${data.playerId}:${data.roundIndex}`;
          if (this.submitInFlightPlayers.has(submitKey)) {
            break; // Duplicate in-flight submission — discard silently
          }
          this.submitInFlightPlayers.add(submitKey);
          this.submitInFlight++;
          try {
            const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/guess`;
            const response = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
              },
              body: JSON.stringify({
                playerId: data.playerId,
                roundIndex: data.roundIndex,
                year: data.year ?? null,
                lat: data.lat ?? null,
                lng: data.lng ?? null,
                hintsUsed: Array.isArray(data.hintsUsed) ? data.hintsUsed : [],
              })
            });
            if (!response.ok) {
              const body = await response.text();
              console.error(`[SUBMIT_GUESS] API error ${response.status}: ${body}`);
              break;
            }
            const fullResponse = await response.json();
            const results = Array.isArray(fullResponse.results) ? fullResponse.results : null;
            this.pendingResults = results;

            // MP-FIX-SYNC-DESYNC-001: If /guess completed the round early (all players
            // submitted before timer expiry), cancel the pending roundTimerHandle so
            // triggerRoundExpiry cannot fire a second /complete call for the same round.
            // Also set completeInFlight to block triggerRoundExpiry's re-entry guard.
            // Populate roundResultsForClient on the snapshot so the broadcastStateUpdate
            // fallback (this.pendingResults ?? roundResultsForClient) yields results even
            // if a racy second broadcast occurs after pendingResults is cleared.
            if (isRuntimeState(fullResponse) && fullResponse.status === "ROUND_COMPLETE") {
              if (this.roundTimerHandle !== null) {
                clearTimeout(this.roundTimerHandle);
                this.roundTimerHandle = null;
              }
              this.completeInFlight = true;
              if (results !== null) {
                fullResponse.roundResultsForClient = results;
              }
            }

            // Clamp is now applied atomically inside submitGuess (sessionCore.ts)
            // and persisted as a PRESSURE_APPLIED event in the same transaction as
            // the first round_commit. The /guess response snapshot already carries
            // the clamped roundEndsAt (derived from PRESSURE_APPLIED.payload.
            // newRoundEndsAt by loadCompeteSessionSnapshot). No separate clamp
            // write, no in-memory mutation — DB is the single source of truth.
            //
            // Detect the clamp from the DB-authoritative snapshot to fire the
            // TIMER_CLAMPED UX flash (visual only; correctness is already in the
            // broadcast snapshot).
            if (isRuntimeState(fullResponse) &&
                fullResponse.status === "ROUND_ACTIVE" &&
                fullResponse.currentRoundIndex === data.roundIndex &&
                Array.isArray(fullResponse.events) &&
                fullResponse.events.some(e =>
                  e.eventType === "PRESSURE_APPLIED" &&
                  e.roundIndex === data.roundIndex)) {
              const timerClampedMsg: ClientMessage = {
                type: "TIMER_CLAMPED",
                newPhaseEndsAt: fullResponse.roundEndsAt as string,
                clampedToSec: 30
              };
              for (const connection of this.room.getConnections()) {
                connection.send(JSON.stringify(timerClampedMsg));
              }
              console.log(`[PartyKit] TIMER_CLAMPED UX flash fired from DB-authoritative PRESSURE_APPLIED event`);
            }

            // Apply snapshot (roundEndsAt already clamped in the snapshot from DB)
            console.log(`[SUBMIT_GUESS] response status=${(fullResponse as {status?: string}).status} isRuntimeState=${isRuntimeState(fullResponse)}`);
            this.applySnapshotAndBroadcast(fullResponse);

            // Broadcast PLAYER_SUBMITTED to all clients
            if (isRuntimeState(this.snapshot)) {
              const submittingPlayer = this.snapshot.players.find(p => p.playerId === data.playerId);
              if (submittingPlayer) {
                const playerSubmittedMsg: ClientMessage = {
                  type: "PLAYER_SUBMITTED",
                  playerId: data.playerId,
                  playerName: submittingPlayer.displayName
                };
                for (const connection of this.room.getConnections()) {
                  connection.send(JSON.stringify(playerSubmittedMsg));
                }
              }
            }
          } finally {
            this.submitInFlightPlayers.delete(submitKey);
            this.submitInFlight--;
          }
          break;
        }

        case "ADVANCE_ROUND": {
          // In-flight lock: if an advance is already in progress,
          // drop this request and send current snapshot to requester.
          if (this.advanceInFlight) {
            sender.send(JSON.stringify({ type: "STATE_UPDATE", snapshot: this.snapshot }));
            break;
          }
          // Guard: if the round was already advanced by another player,
          // skip the write (would hit INVALID_TRANSITION: ROUND_STARTED → ROUND_STARTED)
          // and just send the current snapshot to the requester.
          if (isRuntimeState(this.snapshot) &&
              (this.snapshot.currentRoundIndex > data.roundIndex ||
               this.snapshot.status !== "ROUND_COMPLETE")) {
            sender.send(JSON.stringify({ type: "STATE_UPDATE", snapshot: this.snapshot }));
            break;
          }
          this.advanceInFlight = true;
          try {
            const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/advance`;
            const response = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
              },
              body: JSON.stringify({
                cause: data.cause ?? TransitionCause.PLAYER,
                playerId: data.playerId,
                roundIndex: data.roundIndex
              })
            });
            if (!response.ok) {
              const text = await response.text();
              console.error(`[ADVANCE_ROUND] API error ${response.status}: ${text}`);
              try {
                const baseUrl = this.getNextJsBaseUrl();
                const stateRes = await fetch(`${baseUrl}/api/compete/${encodeURIComponent(gameId)}`, {
                  headers: { "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? "" }
                });
                if (stateRes.ok) {
                  const fallbackSnapshot = await stateRes.json();
                  this.applySnapshotAndBroadcast(fallbackSnapshot);
                }
              } catch (fallbackErr) {
                console.error("[PartyKit] ADVANCE_ROUND fallback fetch threw:", fallbackErr);
              }
              break;
            }
            const snapshot = await response.json();
            this.applySnapshotAndBroadcast(snapshot);
          } finally {
            this.advanceInFlight = false;
          }
          break;
        }

        case "READY_NEXT": {
          // Validate: current status must be ROUND_COMPLETE (result phase active)
          console.log(`[READY_NEXT] snapshot status=${isRuntimeState(this.snapshot) ? this.snapshot.status : "NOT_RUNTIME_STATE"} isRuntimeState=${isRuntimeState(this.snapshot)}`);
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "ROUND_COMPLETE") {
            this.sendError(sender, "READY_NEXT only allowed during ROUND_COMPLETE phase");
            break;
          }
          // Validate: roundIndex matches current round
          if (this.snapshot.currentRoundIndex !== data.roundIndex) {
            this.sendError(sender, "READY_NEXT roundIndex does not match current round");
            break;
          }
          // Validate: playerId is in active players list (left_at is null)
          const player = this.snapshot.players.find(p => p.playerId === data.playerId);
          if (!player || player.leftAt !== null) {
            this.sendError(sender, "Player not found or has left the session");
            break;
          }
          // Add playerId to readyForNext set
          this.readyForNext.add(data.playerId);
          console.log(`[PartyKit] READY_NEXT: player ${data.playerId.slice(0, 8)} ready for next round, total ready: ${this.readyForNext.size}/${this.snapshot.players.filter(p => p.leftAt === null).length}`);
          // Persist READY_NEXT event to DB
          try {
            const readyNextRes = await fetch(`${this.getNextJsBaseUrl()}/api/compete/${gameId}/ready-next`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
              },
              body: JSON.stringify({
                playerId: data.playerId,
                roundIndex: this.snapshot.currentRoundIndex,
                _executionContext: "partykit"
              })
            });
            if (!readyNextRes.ok) {
              const text = await readyNextRes.text();
              console.error("[PartyKit] READY_NEXT persist failed:", readyNextRes.status, text);
            }
          } catch (err) {
            console.error("[PartyKit] READY_NEXT persist threw:", err instanceof Error ? err.message : err);
          }
          // Broadcast STATE_UPDATE with updated readyForNext array
          this.broadcastStateUpdate();
          // Determine sub-mode from snapshot config (async = Relax, sync = Rush)
          const readyNextConfig = (this.snapshot as Record<string, unknown>)?.config as Record<string, unknown> | undefined;
          const readyNextMode = (readyNextConfig?.["mode"] as string) ?? "sync";
          const isAsyncReadyNext = readyNextMode === "async";
          // Advance condition:
          // - async (Relax): ANY single player tapping "Next" advances the round
          //   immediately (spec §5.8: "Player taps Next Round immediately — does
          //   not wait for others"). Players who haven't submitted get absent rows
          //   via insertMissingCommits when the round completes.
          // - sync (Rush): ALL active players must tap "Next" (existing behavior).
          const activePlayers = this.snapshot.players.filter(p => p.leftAt === null);
          const shouldAdvance = isAsyncReadyNext
            ? this.readyForNext.size >= 1
            : this.readyForNext.size === activePlayers.length;
          if (shouldAdvance) {
            console.log(`[PartyKit] ${isAsyncReadyNext ? "Async" : "Sync"} advance triggered — ready: ${this.readyForNext.size}/${activePlayers.length}`);
            // Clear any existing result timer
            if (this.roundTimerHandle !== null) {
              clearTimeout(this.roundTimerHandle);
              this.roundTimerHandle = null;
            }
            // Call /advance with cause: "player" if not already in flight
            if (!this.advanceInFlight) {
              this.advanceInFlight = true;
              try {
                if (this.resultTimerHandle !== null) {
                  clearTimeout(this.resultTimerHandle);
                  this.resultTimerHandle = null;
                }
                const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/advance`;
                const response = await fetch(apiUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
                  },
                  body: JSON.stringify({
                    cause: TransitionCause.PLAYER,
                    playerId: data.playerId,
                    roundIndex: data.roundIndex
                  })
                });
                if (!response.ok) {
                  const text = await response.text();
                  console.error(`[READY_NEXT] advance API error ${response.status}: ${text}`);
                  try {
                    const baseUrl = this.getNextJsBaseUrl();
                    const stateRes = await fetch(`${baseUrl}/api/compete/${encodeURIComponent(gameId)}`, {
                      headers: { "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? "" }
                    });
                    if (stateRes.ok) {
                      const fallbackSnapshot = await stateRes.json();
                      this.applySnapshotAndBroadcast(fallbackSnapshot);
                    }
                  } catch (fallbackErr) {
                    console.error("[PartyKit] READY_NEXT fallback fetch threw:", fallbackErr);
                  }
                } else {
                  const snapshot = await response.json();
                  this.applySnapshotAndBroadcast(snapshot);
                }
              } finally {
                this.advanceInFlight = false;
              }
            }
          }
          break;
        }

        case "SET_TIMER": {
          // Validate: only allowed in LOBBY phase (before game starts)
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "SET_TIMER only allowed in LOBBY phase");
            break;
          }
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/timer`;
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              roundTimerSec: data.roundTimerSec
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[SET_TIMER] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "SET_YEAR_RANGE": {
          // Validate: only allowed in LOBBY phase (before game starts)
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "SET_YEAR_RANGE only allowed in LOBBY phase");
            break;
          }
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/year-range`;
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              yearMin: data.yearMin,
              yearMax: data.yearMax
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[SET_YEAR_RANGE] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "SET_RESULTS_TIMER": {
          console.log("[SET_RESULTS_TIMER] Received message", JSON.stringify(data));
          // Validate: only allowed in LOBBY phase (before game starts)
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "SET_RESULTS_TIMER only allowed in LOBBY phase");
            break;
          }
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/results-timer`;

          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              resultsAutoAdvanceSec: data.resultsAutoAdvanceSec
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[SET_RESULTS_TIMER] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "SET_SUB_MODE": {
          // Validate: only allowed in LOBBY phase (before game starts)
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "SET_SUB_MODE only allowed in LOBBY phase");
            break;
          }
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/sub-mode`;

          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              mode: data.mode,
              sessionDeadlineDays: data.sessionDeadlineDays
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[SET_SUB_MODE] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "SET_ERA_SELECTION": {
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "SET_ERA_SELECTION only allowed in LOBBY phase");
            break;
          }
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/era-selection`;
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              selectedEras: data.selectedEras,
              yearMin: data.yearMin,
              yearMax: data.yearMax,
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[SET_ERA_SELECTION] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "SET_REGION_SELECTION": {
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "SET_REGION_SELECTION only allowed in LOBBY phase");
            break;
          }
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/region-selection`;
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              selectedRegions: data.selectedRegions,
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[SET_REGION_SELECTION] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "KICK_PLAYER": {
          // Validate: only allowed in LOBBY phase
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "KICK_PLAYER only allowed in LOBBY phase");
            break;
          }
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/kick`;
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              targetPlayerId: data.targetPlayerId
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[KICK_PLAYER] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          console.log(`[KICK_PLAYER] API success, snapshot players: ${snapshot.players?.length}`);

          // Notify the kicked player in real time: send a dedicated KICKED
          // message to their live connection(s) via a per-socket loop.
          // The client sets manuallyDisconnected=true on receipt, preventing
          // reconnect-loop. Must target only the kicked player (per-socket
          // send, never broadcast to the whole room).
          for (const connection of this.room.getConnections()) {
            const connPlayerId = this.connections.get(connection.id);
            if (connPlayerId === data.targetPlayerId) {
              connection.send(JSON.stringify({ type: "KICKED", gameId: this.room.id }));
            }
          }

          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "PLAY_AGAIN": {
          const parseResult = PlayAgainSchema.safeParse(data);
          if (!parseResult.success) {
            return;
          }
          const message = parseResult.data;
          // Verify sender is host
          if (!isRuntimeState(this.snapshot)) {
            return;
          }
          const player = this.snapshot.players.find(p => p.playerId === message.playerId);
          if (!player || !player.isHost) {
            return;
          }
          // Broadcast to all connections
          for (const connection of this.room.getConnections()) {
            connection.send(JSON.stringify({
              type: "PLAY_AGAIN",
              newGameId: message.newGameId
            }));
          }
          break;
        }

        case "PING":
          // Keepalive — respond with PONG so client can detect dead connections
          sender.send(JSON.stringify({ type: "PONG" }));
          break;

        default: {
          this.sendError(sender, `Unhandled message type: ${(data as { type: string }).type}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[PartyKit] Action failed:", message);
      this.broadcastStateUpdate();
      this.sendError(sender, message);
    }
  }

  private sendError(connection: Connection, message: string, code?: string): void {
    const errMsg: ClientMessage = { type: "ERROR", message, code };
    connection.send(JSON.stringify(errMsg));
  }
}
