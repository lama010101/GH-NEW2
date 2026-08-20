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
    get(key: string): Promise<unknown>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
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

const StartPlayerSchema = z.object({
  type: z.literal("START_PLAYER"),
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

const CancelInviteSchema = z.object({
  type: z.literal("CANCEL_INVITE"),
  playerId: z.string().uuid(),
  inviteeId: z.string().uuid()
});

const SyncInvitesSchema = z.object({
  type: z.literal("SYNC_INVITES"),
  playerId: z.string().uuid()
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
  StartPlayerSchema,
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
  CancelInviteSchema,
  SyncInvitesSchema,
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
  pendingInvitees?: Array<{ playerId: string; displayName: string; avatarUrl: string | null; invitedAt: string }>;
};

type DbVersion = {
  roundEventVersion: number;
  playerEventVersions: Record<string, number>;
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
  | { type: "START_PLAYER"; playerId: string }
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
  | { type: "CANCEL_INVITE"; playerId: string; inviteeId: string }
  | { type: "SYNC_INVITES"; playerId: string }
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
  // Cached room id — needed because PartyKit dev forbids accessing room.id inside
  // the onAlarm handler, but constructor runs with room.id available.
  private gameId = "";

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

  // Last accepted DB version vector per player. Used to reject stale snapshots.
  private lastDbVersionByPlayer = new Map<string, DbVersion>();

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
    const serviceKey = lobby.env.SUPABASE_SECRET_KEY_PROD as string | undefined;
    if (!supabaseUrl || !serviceKey) {
      console.error("[PartyKit] onBeforeConnect: SUPABASE_URL or SUPABASE_SECRET_KEY_PROD not configured");
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
    this.gameId = room.id;
    console.log("[DO_INSTANCE]", {
      room: this.gameId,
      location: "constructor"
    });
  }

  private getNextJsBaseUrl(): string {
    if (this.detectedBaseUrl) return this.detectedBaseUrl;
    return (this.room.env.NEXTJS_BASE_URL as string | undefined) ?? "http://localhost:3000";
  }

  // A per-player snapshot is ACCEPTED for playerId if the incoming vector
  // is at least as fresh as `last` for that specific player's own event
  // stream AND for the global roundEventVersion. Equal values are accepted
  // (e.g. a re-broadcast where nothing changed for this player). A snapshot
  // is REJECTED for playerId if roundEventVersion regressed OR if
  // playerEventVersions[playerId] is strictly less than the last accepted
  // value for that same player. Other players' values are intentionally NOT
  // compared because each per-player snapshot may carry a transaction-local
  // view of the other players' state.
  private isAtLeastAsNewForPlayer(playerId: string, incoming: DbVersion, last?: DbVersion): boolean {
    if (!last) return true;
    if (incoming.roundEventVersion < last.roundEventVersion) return false;
    const incomingVersion = incoming.playerEventVersions[playerId] ?? 0;
    const lastVersion = last.playerEventVersions[playerId] ?? 0;
    return incomingVersion >= lastVersion;
  }

  /**
   * Load snapshot from DB (cold start / reconnect only).
   * This is the ONLY path that reads from DB.
   * NOT called after writes — use applySnapshotAndBroadcast() instead.
   */
  private async loadFromDB(): Promise<void> {
    // In the onAlarm handler PartyKit (dev) forbids accessing room.id. The gameId
    // is persisted to room.storage whenever the async alarm is scheduled, and on
    // first connect it falls back to room.id and caches itself.
    let gameId: string | undefined;
    const storedGameId = await this.room.storage.get("gameId");
    if (typeof storedGameId === "string") {
      gameId = storedGameId;
    } else {
      gameId = this.room.id;
      await this.room.storage.put("gameId", gameId).catch(() => {});
    }
    this.gameId = gameId;
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

    // Seed per-player dbVersion map from cold-loaded snapshot if it carries one.
    const loadedSnapshot = this.snapshot as Record<string, unknown> | null;
    if (loadedSnapshot && loadedSnapshot["dbVersion"]) {
      const loadedDbVersion = loadedSnapshot["dbVersion"] as DbVersion;
      const loadedViewer = loadedSnapshot["viewerPlayerId"] as string | undefined;
      if (loadedViewer) {
        this.lastDbVersionByPlayer.set(loadedViewer, loadedDbVersion);
      }
      const loadedPlayerSnapshots = loadedSnapshot["playerSnapshots"] as Record<string, Record<string, unknown>> | undefined;
      if (loadedPlayerSnapshots) {
        for (const [pid, ps] of Object.entries(loadedPlayerSnapshots)) {
          const psDbVersion = ps["dbVersion"] as DbVersion | undefined;
          if (psDbVersion) {
            this.lastDbVersionByPlayer.set(pid, psDbVersion);
          }
        }
      }
    }

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

    await this.scheduleRoundTimer().catch((err) =>
      console.error("[PartyKit] scheduleRoundTimer (loadFromDB) failed:", err instanceof Error ? err.message : err)
    );
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
          snapshot.status === "ROUND_ACTIVE" &&
          snapshot.currentRoundIndex === this.snapshot.currentRoundIndex + 1) {
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

    // DB freshness gate: reject stale per-player snapshots that arrive out of order.
    if (snapshot && typeof snapshot === "object") {
      const snapshotRecord = snapshot as Record<string, unknown>;
      const dbVersion = snapshotRecord["dbVersion"] as DbVersion | undefined;
      if (dbVersion) {
        const playerSnapshots = snapshotRecord["playerSnapshots"] as Record<string, Record<string, unknown>> | undefined;
        const viewerPlayerId = snapshotRecord["viewerPlayerId"] as string | undefined;

        const candidates: Record<string, Record<string, unknown>> = {};
        if (playerSnapshots) {
          for (const [pid, ps] of Object.entries(playerSnapshots)) {
            candidates[pid] = ps;
          }
        }
        if (viewerPlayerId) {
          candidates[viewerPlayerId] = snapshotRecord;
        }

        let anyAccepted = false;
        const accepted: Record<string, Record<string, unknown>> = {};
        for (const [pid, ps] of Object.entries(candidates)) {
          const psDbVersion = ps["dbVersion"] as DbVersion | undefined;
          if (!psDbVersion) continue;
          const last = this.lastDbVersionByPlayer.get(pid);
          if (!this.isAtLeastAsNewForPlayer(pid, psDbVersion, last)) {
            console.log(`[STALE_SNAPSHOT_REJECTED] playerId=${pid.slice(0, 8)}`);
            continue;
          }
          this.lastDbVersionByPlayer.set(pid, psDbVersion);
          accepted[pid] = ps;
          anyAccepted = true;
        }

        if (!anyAccepted) {
          console.log("[APPLY_SNAPSHOT_REJECTED] all per-player snapshots stale");
          return;
        }

        const current = this.snapshot as Record<string, unknown> | null;
        const mergedPlayerSnapshots = {
          ...((current?.["playerSnapshots"] as Record<string, Record<string, unknown>> | undefined) ?? {}),
          ...accepted,
        };

        let finalSnapshot: Record<string, unknown>;
        if (viewerPlayerId && accepted[viewerPlayerId]) {
          finalSnapshot = { ...snapshotRecord, playerSnapshots: mergedPlayerSnapshots };
        } else if (current) {
          finalSnapshot = { ...current, playerSnapshots: mergedPlayerSnapshots };
        } else {
          finalSnapshot = { ...snapshotRecord, playerSnapshots: mergedPlayerSnapshots };
        }
        snapshot = finalSnapshot;
      }
    }

    this.snapshot = snapshot;
    this.snapshotLoaded = true;
    void this.scheduleRoundTimer();
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
    if (!isRuntimeState(this.snapshot)) return;
    if (this.snapshot.config?.mode === "async") return;
    if (this.snapshot.status !== "LOBBY") return;
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
  private async scheduleRoundTimer(): Promise<void> {
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
    await this.room.storage.deleteAlarm().catch(() => {});

    if (!this.snapshot || !isRuntimeState(this.snapshot)) return;

    // Determine sub-mode from snapshot config (async = Relax, sync = Rush)
    const snapshotConfig = (this.snapshot as Record<string, unknown>)?.config as Record<string, unknown> | undefined;
    const mode = (snapshotConfig?.["mode"] as string) ?? "sync";
    const isAsync = mode === "async";

    if (isAsync) {
      await this.scheduleAsyncRoundTimer();
      return;
    }

    if (this.snapshot.status === "ROUND_COMPLETE" && this.snapshot.resultPhaseStartedAt) {
      const autoAdvanceSec = this.snapshot.resultsAutoAdvanceSec ?? 90;
      if (autoAdvanceSec > 0) {
        const autoAdvanceMs = autoAdvanceSec * 1000;
        const resultPhaseEndsAt = new Date(this.snapshot.resultPhaseStartedAt).getTime() + autoAdvanceMs;
        const delay = resultPhaseEndsAt - Date.now();
        const expectedRoundIndex = this.snapshot.currentRoundIndex;
        if (delay <= 0) {
          this.triggerResultAutoAdvance(expectedRoundIndex);
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

    const now = Date.now();
    const expectedRoundIndex = this.snapshot.currentRoundIndex;
    const roundEndsAtMs = this.snapshot.roundEndsAt ? new Date(this.snapshot.roundEndsAt).getTime() : null;

    if (roundEndsAtMs === null) return; // no expiry mechanism available (sync with no timer)

    const delay = roundEndsAtMs - now;

    if (delay <= 0) {
      // Round already expired — trigger advance immediately
      console.log("[PartyKit] Round expired, triggering advance");
      this.triggerRoundExpiry(expectedRoundIndex);
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
   * Async (Relax) per-player round timer scheduling.
   * Fetches the single earliest expiring active player from the DB and sets one
   * DO alarm. Does nothing when no active player has a per-round timer set.
   */
  private async scheduleAsyncRoundTimer(): Promise<void> {
    // room.id is not accessible inside the onAlarm handler, so the gameId is
    // read from storage (written by loadFromDB / previous schedule calls).
    const storedGameId = await this.room.storage.get("gameId");
    let gameId: string;
    if (typeof storedGameId === "string") {
      gameId = storedGameId;
    } else {
      gameId = this.room.id;
      await this.room.storage.put("gameId", gameId).catch(() => {});
    }
    const baseUrl = this.getNextJsBaseUrl();
    const nextExpiryUrl = `${baseUrl}/api/compete/${encodeURIComponent(gameId)}/next-expiry`;
    const secret = (this.room.env.PARTYKIT_SECRET as string) ?? "";

    try {
      const res = await fetch(nextExpiryUrl, {
        headers: { "x-partykit-secret": secret }
      });
      if (!res.ok) {
        console.error("[PartyKit] next-expiry fetch failed:", res.status);
        return;
      }
      const next = await res.json() as { playerId?: string; roundIndex?: number; phaseEndsAt?: string | null; isSessionDeadline?: boolean } | null;
      if (!next || !next.phaseEndsAt) {
        console.log("[PartyKit] Async: no timer to schedule");
        return;
      }
      const phaseEndsAtMs = new Date(next.phaseEndsAt).getTime();
      const alarmTime = Math.max(phaseEndsAtMs, Date.now() + 1);
      await this.room.storage.setAlarm(alarmTime).catch((err) =>
        console.error("[PartyKit] setAlarm (async round) failed:", err)
      );
      console.log(`[PartyKit] Async: per-player alarm scheduled for ${Math.round((alarmTime - Date.now()) / 1000)}s`);
    } catch (err) {
      console.error("[PartyKit] scheduleAsyncRoundTimer error:", err instanceof Error ? err.message : err);
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
    // PartyKit dev forbids accessing room.id inside the onAlarm handler, so the
    // gameId is read from the storage entry written when the alarm was scheduled.
    const storedGameId = await this.room.storage.get("gameId");
    const gameId = typeof storedGameId === "string" ? storedGameId : "";
    if (gameId.length === 0) {
      console.error("[PartyKit] onAlarm: missing gameId in storage");
      return;
    }

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

    if (this.snapshot.config?.mode === "async") {
      await this.handleAsyncExpiryAlarm(gameId);
      return;
    }

    if (this.snapshot.status === "ROUND_ACTIVE") {
      await this.triggerRoundExpiry(this.snapshot.currentRoundIndex);
    } else if (this.snapshot.status === "ROUND_COMPLETE") {
      await this.triggerResultAutoAdvance(this.snapshot.currentRoundIndex);
    }
  }

  /**
   * Async (Relax) per-player expiry alarm handler.
   * Repeatedly fetches the earliest expiring active player and marks them absent
   * until no expired player remains, then applies the final snapshot+bundle and
   * reschedules the next alarm. Bounded to avoid an infinite loop if expiry rows
   * fail to clear.
   */
  private async handleAsyncExpiryAlarm(gameId: string): Promise<void> {
    const baseUrl = this.getNextJsBaseUrl();
    const secret = (this.room.env.PARTYKIT_SECRET as string) ?? "";

    const activePlayerCount = isRuntimeState(this.snapshot)
      ? this.snapshot.players.filter(p => p.leftAt === null).length
      : 0;
    const maxIterations = Math.max(1, Math.min(activePlayerCount, 20));

    let lastSnapshot: unknown = null;
    let processed = 0;

    for (let i = 0; i < maxIterations; i++) {
      const nextExpiryUrl = `${baseUrl}/api/compete/${encodeURIComponent(gameId)}/next-expiry`;
      let next: { playerId?: string; roundIndex?: number; phaseEndsAt?: string | null; isSessionDeadline?: boolean } | null = null;
      try {
        const nextRes = await fetch(nextExpiryUrl, {
          headers: { "x-partykit-secret": secret }
        });
        if (!nextRes.ok) {
          console.error("[PartyKit] next-expiry fetch failed:", nextRes.status);
          break;
        }
        next = await nextRes.json() as { playerId?: string; roundIndex?: number; phaseEndsAt?: string | null; isSessionDeadline?: boolean } | null;
      } catch (err) {
        console.error("[PartyKit] next-expiry fetch error:", err instanceof Error ? err.message : err);
        break;
      }

      if (!next || !next.phaseEndsAt || (typeof next.playerId !== "string" && !next.isSessionDeadline) || (typeof next.roundIndex !== "number" && !next.isSessionDeadline)) {
        break;
      }

      const phaseEndsAtMs = new Date(next.phaseEndsAt).getTime();
      if (phaseEndsAtMs > Date.now() + 1) {
        // Earliest expiry is still in the future; reschedule and stop.
        await this.room.storage.setAlarm(phaseEndsAtMs).catch((err) =>
          console.error("[PartyKit] setAlarm (async future expiry) failed:", err)
        );
        break;
      }

      if (next.isSessionDeadline) {
        const finalizeRes = await fetch(
          `${baseUrl}/api/compete/${encodeURIComponent(gameId)}/finalize-deadline`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": secret,
            },
            body: JSON.stringify({}),
          }
        );
        if (!finalizeRes.ok) {
          console.error(`[PartyKit] finalize-deadline failed:`, finalizeRes.status);
          break;
        }
        lastSnapshot = await finalizeRes.json();
        processed += 1;
        break;
      }

      const absentRes = await fetch(
        `${baseUrl}/api/compete/${encodeURIComponent(gameId)}/player-absent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-partykit-secret": secret,
          },
          body: JSON.stringify({ playerId: next.playerId, roundIndex: next.roundIndex }),
        }
      );
      if (!absentRes.ok) {
        console.error(`[PartyKit] player-absent failed for ${next.playerId}:`, absentRes.status);
        break;
      }

      lastSnapshot = await absentRes.json();
      processed += 1;
    }

    if (processed === maxIterations && maxIterations >= 20) {
      console.error("[PartyKit] handleAsyncExpiryAlarm: hit iteration safety bound, stopping loop");
    }

    if (lastSnapshot) {
      this.applySnapshotAndBroadcast(lastSnapshot);
    } else {
      await this.scheduleRoundTimer().catch((err) =>
        console.error("[PartyKit] scheduleRoundTimer (async expiry fallback) failed:", err)
      );
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
    if (isRuntimeState(this.snapshot) && this.snapshot.config?.mode === "async") {
      console.log("[PartyKit] triggerRoundExpiry: async no-op");
      return;
    }

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
    if (isRuntimeState(this.snapshot) && this.snapshot.config?.mode === "async") {
      console.log("[PartyKit] triggerResultAutoAdvance: async no-op");
      return;
    }
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
      room: this.gameId,
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
      room: this.gameId,
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
      referenceYear: (configRecord?.["referenceYear"] as number) ?? (snapshotRecord["referenceYear"] as number) ?? 2025,
    };

    const isAsync = config.mode === "async";
    const playerSnapshots = isAsync
      ? (snapshotRecord["playerSnapshots"] as Record<string, Record<string, unknown>> | undefined)
      : undefined;

    // Observability: dump dbVersion for every outgoing per-player snapshot.
    if (isAsync && playerSnapshots) {
      const dbVersionDump: Record<string, unknown> = {};
      for (const [pid, ps] of Object.entries(playerSnapshots)) {
        const psDbVersion = ps["dbVersion"] as DbVersion | undefined;
        dbVersionDump[pid.slice(0, 8)] = psDbVersion ?? null;
      }
      console.log("[BROADCAST_DBVERSION_DUMP]", dbVersionDump);
    }

    // MP-BUILD-RELAX-BROADCAST-LEAK-002: If an async snapshot reaches broadcast
    // without a playerSnapshots routing map, do NOT fall through to the sync branch
    // and blast a single player's view to every socket. Per-socket fetch each player's
    // own snapshot instead.
    if (isAsync && !playerSnapshots) {
      const socketCount = [...this.room.getConnections()].length;
      console.error(`[ASYNC_BROADCAST_LEAK_REROUTE] async snapshot missing playerSnapshots; per-player fetching for ${socketCount} sockets`);
      for (const connection of this.room.getConnections()) {
        const socketPlayerId = this.connections.get(connection.id);
        if (!socketPlayerId) continue;
        void this.sendPerPlayerSnapshot(
          connection,
          socketPlayerId,
          snapshotRecord["snapshotVersion"] as number,
          (snapshotRecord["readyForNext"] as string[] | undefined) ?? [],
          snapshotRecord["resultPhaseEndsAt"] as number | undefined,
          snapshotRecord["allPlayersReady"] as boolean | undefined
        );
      }
      this.pendingResults = null; // clear after broadcast attempt
      return;
    }

    for (const connection of this.room.getConnections()) {
      const socketPlayerId = this.connections.get(connection.id);

      let perSocketSnapshot: Record<string, unknown>;
      let results: unknown = undefined;
      if (isAsync && playerSnapshots && socketPlayerId && playerSnapshots[socketPlayerId]) {
        perSocketSnapshot = {
          ...playerSnapshots[socketPlayerId],
          viewerPlayerId: socketPlayerId,
          config,
          readyForNext: (snapshotRecord["readyForNext"] as string[] | undefined) ?? [],
          resultPhaseEndsAt: snapshotRecord["resultPhaseEndsAt"] as number | undefined,
          allPlayersReady: snapshotRecord["allPlayersReady"] as boolean | undefined,
          snapshotVersion: snapshotRecord["snapshotVersion"] as number | undefined
        };
        results = playerSnapshots[socketPlayerId]["results"] ?? undefined;
      } else if (isAsync && playerSnapshots) {
        continue;
      } else {
        perSocketSnapshot = {
          ...snapshotRecord,
          viewerPlayerId: socketPlayerId ?? null,
          config
        };
        delete perSocketSnapshot["playerSnapshots"];
        results = this.pendingResults ?? (this.snapshot as RuntimeState)?.roundResultsForClient ?? undefined;
      }

      // Ensure the message carries exactly one results field (top-level), not a
      // duplicate inside the snapshot object. CompeteWebSocket merges this
      // top-level value into snapshot.results on the client.
      delete perSocketSnapshot["results"];

      connection.send(JSON.stringify({
        type: "STATE_UPDATE",
        snapshot: perSocketSnapshot,
        results
      }));
    }
    this.pendingResults = null; // clear after broadcast
  }

  /**
   * Fetch and send a per-player snapshot to a single connection.
   * Shared by the async cold-start path and the per-socket broadcast reroute.
   * Includes one retry on transient fetch failure.
   */
  private async sendPerPlayerSnapshot(
    connection: Connection,
    playerId: string,
    snapshotVersion: number,
    readyForNext?: string[],
    resultPhaseEndsAt?: number,
    allPlayersReady?: boolean
  ): Promise<void> {
    const baseUrl = this.getNextJsBaseUrl();
    const secret = (this.room.env.PARTYKIT_SECRET as string) ?? "";
    const maxAttempts = 2;
    const retryDelayMs = 300;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
      try {
        const response = await fetch(`${baseUrl}/api/compete/${encodeURIComponent(this.room.id)}`, {
          headers: {
            "x-partykit-secret": secret,
            "x-viewer-player-id": playerId,
          },
        });
        if (!response.ok) {
          console.error(`[PartyKit] per-player snapshot fetch failed: status=${response.status} playerId=${playerId.slice(0, 8)} attempt=${attempt}`);
          continue;
        }
        const snapshot = await response.json() as Record<string, unknown>;

        const dbVersion = snapshot["dbVersion"] as DbVersion | undefined;
        if (dbVersion) {
          const last = this.lastDbVersionByPlayer.get(playerId);
          if (!this.isAtLeastAsNewForPlayer(playerId, dbVersion, last)) {
            console.log(`[STALE_SNAPSHOT_REJECTED] playerId=${playerId.slice(0, 8)} (sendPerPlayerSnapshot)`);
            continue;
          }
          this.lastDbVersionByPlayer.set(playerId, dbVersion);
        }

        const results = snapshot["results"];
        const snapshotToSend: Record<string, unknown> = {
          ...snapshot,
          viewerPlayerId: playerId,
          snapshotVersion,
        };
        delete snapshotToSend["results"];
        if (readyForNext !== undefined) snapshotToSend["readyForNext"] = readyForNext;
        if (resultPhaseEndsAt !== undefined) snapshotToSend["resultPhaseEndsAt"] = resultPhaseEndsAt;
        if (allPlayersReady !== undefined) snapshotToSend["allPlayersReady"] = allPlayersReady;
        connection.send(JSON.stringify({
          type: "STATE_UPDATE",
          snapshot: snapshotToSend,
          results,
        }));
        return;
      } catch (err) {
        console.error(`[PartyKit] per-player snapshot fetch error: ${err instanceof Error ? err.message : String(err)} playerId=${playerId.slice(0, 8)} attempt=${attempt}`);
      }
    }
    console.error(`[PER_PLAYER_FETCH_FAILED] playerId=${playerId.slice(0, 8)} socketId=${connection.id} attempt=2`);
  }

  /**
   * Fetch a per-player cold-start snapshot for a newly connected async socket.
   * This is the only allowed loadCompeteSessionSnapshot call for an async
   * socket before any write on that connection, mirroring the DO cold-start
   * pattern documented in MP-DO-AUTHORITATIVE-006.
   */
  private async sendPlayerSnapshot(connection: Connection, playerId: string): Promise<void> {
    this.broadcastVersionCounter += 1;
    await this.sendPerPlayerSnapshot(connection, playerId, this.broadcastVersionCounter);
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
      const isAsync = isRuntimeState(this.snapshot) && this.snapshot.config?.mode === "async";
      if (isAsync && verifiedUid) {
        // Only send a per-player cold-start snapshot to active members. Unjoined
        // viewers connecting to a started async game must not see a ROUND_ACTIVE
        // state and must not have player_round_events created for them.
        const activePlayer = isRuntimeState(this.snapshot) &&
          this.snapshot.players.find(p => p.playerId === verifiedUid && p.leftAt === null);
        if (activePlayer) {
          await this.sendPlayerSnapshot(connection, verifiedUid);
        } else if (isRuntimeState(this.snapshot) && this.snapshot.status !== "LOBBY") {
          console.log("[PartyKit] Rejecting unjoined viewer for started async session:", verifiedUid);
          this.sendError(connection, "Game already in progress");
        } else {
          connection.send(JSON.stringify({
            type: "STATE_UPDATE",
            snapshot: { ...this.snapshot as Record<string, unknown>, viewerPlayerId: null },
            results: (this.snapshot as RuntimeState)?.roundResultsForClient ?? undefined
          }));
        }
      } else {
        connection.send(JSON.stringify({
          type: "STATE_UPDATE",
          snapshot: { ...this.snapshot as Record<string, unknown>, viewerPlayerId: null },
          results: (this.snapshot as RuntimeState)?.roundResultsForClient ?? undefined
        }));
      }
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
          // attemptAutoStart is kept unconditional because it no-ops for async
          // (Relax has no all-ready auto-start trigger; per-player start is handled
          // by startRelaxPlayer). Removing this call would break that guard.
          await this.attemptAutoStart(gameId);
          break;
        }

        case "START_GAME": {
          if (!isRuntimeState(this.snapshot)) {
            this.sendError(sender, "START_GAME only allowed in LOBBY phase");
            break;
          }

          const senderPlayerId = this.connections.get(sender.id);

          // For async (Relax) the DO snapshot is the last-acting player's view;
          // validate start against the sending player's own per-player snapshot.
          const isAsync = this.snapshot.config?.mode === "async";
          let senderStatus = this.snapshot.status;
          if (isAsync && senderPlayerId) {
            const playerSnapshots = (this.snapshot as { playerSnapshots?: Record<string, { status?: string }> }).playerSnapshots;
            senderStatus = playerSnapshots?.[senderPlayerId]?.status ?? this.snapshot.status;
          }
          if (senderStatus !== "LOBBY") {
            this.sendError(sender, "START_GAME only allowed in LOBBY phase");
            break;
          }

          // For async (Relax), every player starts their own round sequence
          // independently. Use the per-player start endpoint and skip the host
          // and all-ready checks that apply to sync/practice/daily.
          if (isAsync) {
            if (this.startInFlight) {
              console.log("[PartyKit] START_GAME ignored — start already in flight");
              break;
            }
            this.startInFlight = true;
            try {
              const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/start-player`;
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
                console.error(`[START_GAME] start-player API error ${response.status}: ${text}`);
                break;
              }
              const snapshot = await response.json();
              this.applySnapshotAndBroadcast(snapshot);
            } finally {
              this.startInFlight = false;
            }
            break;
          }

          // Validate: only the host can manually force-start (sync/practice/daily)
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

        case "START_PLAYER": {
          if (!isRuntimeState(this.snapshot)) {
            this.sendError(sender, "START_PLAYER only allowed in LOBBY phase");
            break;
          }

          const senderPlayerId = this.connections.get(sender.id);

          const isAsync = this.snapshot.config?.mode === "async";
          let senderStatus = this.snapshot.status;
          if (isAsync && senderPlayerId) {
            const playerSnapshots = (this.snapshot as { playerSnapshots?: Record<string, { status?: string }> }).playerSnapshots;
            senderStatus = playerSnapshots?.[senderPlayerId]?.status ?? this.snapshot.status;
          }
          if (senderStatus !== "LOBBY") {
            this.sendError(sender, "START_PLAYER only allowed in LOBBY phase");
            break;
          }

          if (senderPlayerId !== data.playerId) {
            this.sendError(sender, "Player ID mismatch");
            break;
          }

          if (this.startInFlight) {
            console.log("[PartyKit] START_PLAYER ignored — start already in flight");
            break;
          }
          this.startInFlight = true;
          try {
            const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/start-player`;
            const response = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
              },
              body: JSON.stringify({ playerId: data.playerId })
            });
            if (response.ok) {
              const snapshot = await response.json();
              this.applySnapshotAndBroadcast(snapshot);
            } else {
              const text = await response.text();
              this.sendError(sender, `Start failed: ${text}`);
            }
          } catch (err) {
            this.sendError(sender, "Start request failed");
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
            const snapshotMode = isRuntimeState(this.snapshot)
              ? (this.snapshot as RuntimeState).config?.mode
              : undefined;
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
                mode: snapshotMode ?? "sync",
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
          const runtimeSnapshot = isRuntimeState(this.snapshot) ? this.snapshot : null;
          if (!runtimeSnapshot) {
            this.sendError(sender, "Game state not loaded");
            break;
          }
          const readyNextConfig = runtimeSnapshot.config;
          const readyNextMode = (readyNextConfig?.mode as string) ?? "sync";
          const isAsyncReadyNext = readyNextMode === "async";

          // For async (Relax) sessions the DO's this.snapshot may be the last
          // acting player's per-player view. Validate the READY_NEXT request
          // against the requesting player's own per-player snapshot from the
          // playerSnapshots map when available, not the actor's view.
          let validationSnapshot: unknown = this.snapshot;
          if (isAsyncReadyNext) {
            const playerSnapshots = (this.snapshot as Record<string, unknown> | null)?.["playerSnapshots"] as
              Record<string, Record<string, unknown>> | undefined;
            const requesterSnapshot = playerSnapshots?.[data.playerId];
            if (requesterSnapshot) validationSnapshot = requesterSnapshot;
          }

          const validationRuntime = isRuntimeState(validationSnapshot) ? validationSnapshot : null;
          // Validate: current status must be ROUND_COMPLETE (result phase active)
          console.log(`[READY_NEXT] snapshot status=${validationRuntime?.status ?? "NOT_RUNTIME_STATE"} isRuntimeState=${validationRuntime !== null} mode=${readyNextMode}`);
          if (!validationRuntime || validationRuntime.status !== "ROUND_COMPLETE") {
            this.sendError(sender, "READY_NEXT only allowed during ROUND_COMPLETE phase");
            break;
          }
          // Validate: roundIndex matches current round
          if (validationRuntime.currentRoundIndex !== data.roundIndex) {
            this.sendError(sender, "READY_NEXT roundIndex does not match current round");
            break;
          }
          // Validate: playerId is in active players list (left_at is null)
          const player = validationRuntime.players.find(p => p.playerId === data.playerId);
          if (!player || player.leftAt !== null) {
            this.sendError(sender, "Player not found or has left the session");
            break;
          }
          // Add playerId to readyForNext set
          this.readyForNext.add(data.playerId);
          console.log(`[PartyKit] READY_NEXT: player ${data.playerId.slice(0, 8)} ready for next round, total ready: ${this.readyForNext.size}/${runtimeSnapshot.players.filter(p => p.leftAt === null).length}`);
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
                roundIndex: runtimeSnapshot.currentRoundIndex,
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
          // Advance condition:
          // - async (Relax): ANY single player tapping "Next" advances the round
          //   immediately (spec §5.8: "Player taps Next Round immediately — does
          //   not wait for others"). Players who haven't submitted get absent rows
          //   via insertMissingCommits when the round completes.
          // - sync (Rush): ALL active players must tap "Next" (existing behavior).
          const activePlayers = runtimeSnapshot.players.filter(p => p.leftAt === null);
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
                const apiUrl = isAsyncReadyNext
                  ? `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/advance-player`
                  : `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/advance`;
                const response = await fetch(apiUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
                  },
                  body: JSON.stringify(isAsyncReadyNext
                    ? { playerId: data.playerId }
                    : {
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

        case "CANCEL_INVITE": {
          // Validate: only allowed in LOBBY phase
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "CANCEL_INVITE only allowed in LOBBY phase");
            break;
          }
          const apiUrl = `${this.getNextJsBaseUrl()}/api/compete/${encodeURIComponent(gameId)}/cancel-invite`;
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
            },
            body: JSON.stringify({
              playerId: data.playerId,
              inviteeId: data.inviteeId
            })
          });
          if (!response.ok) {
            const text = await response.text();
            console.error(`[CANCEL_INVITE] API error ${response.status}: ${text}`);
            break;
          }
          const snapshot = await response.json();
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "SYNC_INVITES": {
          // Only the host should trigger a roster refresh. If the sender cannot be
          // identified or the snapshot is not loaded yet, allow the cold-start load
          // to proceed — the client only sends this after a successful invite POST.
          const senderPlayerId = this.connections.get(sender.id);
          if (isRuntimeState(this.snapshot) && senderPlayerId) {
            const senderPlayer = this.snapshot.players.find(p => p.playerId === senderPlayerId);
            if (senderPlayer && !senderPlayer.isHost) {
              this.sendError(sender, "Only the host can sync invites");
              break;
            }
          }
          console.log("[PartyKit] SYNC_INVITES: reloading snapshot to refresh pending invitees");
          try {
            await this.loadFromDB();
            this.broadcastStateUpdate();
          } catch (err) {
            console.error("[PartyKit] SYNC_INVITES loadFromDB failed:", err instanceof Error ? err.message : err);
            this.sendError(sender, "Failed to sync invites");
          }
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
