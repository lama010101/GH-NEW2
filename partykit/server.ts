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

interface Room {
  id: string;
  env: Record<string, unknown>;
  broadcast: (msg: string | ArrayBuffer | ArrayBufferView, without?: string[]) => void;
  getConnection(id: string): Connection | undefined;
  getConnections(tag?: string): Iterable<Connection>;
}

interface Connection {
  id: string;
  send: (msg: string | ArrayBuffer | ArrayBufferView) => void;
}

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
  | { type: "KICK_PLAYER"; playerId: string; targetPlayerId: string }
  | { type: "PING" };

// Messages sent TO clients
export type ClientMessage =
  | { type: "STATE_UPDATE"; snapshot: unknown; results?: unknown[] }
  | { type: "ERROR"; message: string }
  | { type: "PLAYER_SUBMITTED"; playerId: string; playerName: string }
  | { type: "TIMER_CLAMPED"; newPhaseEndsAt: string; clampedToSec: number };



export default class GameServer {
  // Connection registry — Maps connection.id → playerId for routing.
  private connections: Map<string, string> = new Map();

  // Active-connection count per playerId. Prevents /leave calls while the
  // player still has another live WS (StrictMode remount, tab A→B, etc.).
  private playerConnectionCounts: Map<string, number> = new Map();

  // Debounced /leave timers keyed by playerId. Cancelled on reconnect.
  private leaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Grace period before marking a player as left. Must be long enough to
  // absorb React StrictMode double-mount, HMR reloads, tab refreshes, and
  // normal network blips — but short enough that real disconnects flush
  // out of the active roster within a round.
  private static readonly LEAVE_GRACE_MS = 5_000;
  private static readonly ROUND_EXPIRY_SUBMIT_GRACE_MS = 1_000;

  // Runtime state — derived, rebuildable from DB at any time.
  // This is the DO's authoritative view. DB remains canonical truth.
  // INVARIANT: if snapshotLoaded=true, snapshot is a valid RuntimeState.
  private snapshot: unknown | null = null;
  private snapshotLoaded = false;

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

  // Pending results to be broadcast with next STATE_UPDATE.
  // Set when API returns results (e.g., /guess after round complete).
  // Cleared after broadcast to avoid stale results in future updates.
  private pendingResults: unknown[] | null = null;

  // Detected base URL from first client connection's Origin header.
  // Used to derive NEXTJS_BASE_URL dynamically for production correctness.
  private detectedBaseUrl: string | null = null;

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
      if (
        isRuntimeState(this.snapshot) &&
        this.snapshot.status === "ROUND_ACTIVE" &&
        snapshot.status === "ROUND_ACTIVE" &&
        this.snapshot.currentRoundIndex === snapshot.currentRoundIndex &&
        this.snapshot.roundEndsAt &&
        snapshot.roundEndsAt &&
        new Date(this.snapshot.roundEndsAt).getTime() < new Date(snapshot.roundEndsAt).getTime()
      ) {
        console.log("[APPLY_SNAPSHOT_PRESERVED_OLD_TIMER]", {
          preserved: this.snapshot.roundEndsAt,
          rejected: snapshot.roundEndsAt,
        });
        snapshot.roundEndsAt = this.snapshot.roundEndsAt;
      }
      console.log("[PartyKit] Applying snapshot, players:", snapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
      // Reset readyForNext when transitioning from ROUND_COMPLETE to ROUND_ACTIVE (new round started)
      if (isRuntimeState(this.snapshot) &&
          this.snapshot.status === "ROUND_COMPLETE" &&
          snapshot.status === "ROUND_ACTIVE") {
        this.readyForNext.clear();
        console.log("[PartyKit] New round started, readyForNext cleared");
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

    if (!this.snapshot || !isRuntimeState(this.snapshot)) return;

    if (this.snapshot.status === "ROUND_COMPLETE" && this.snapshot.resultPhaseStartedAt) {
      const autoAdvanceMs = (this.snapshot.resultsAutoAdvanceSec ?? 10) * 1000;
      const delay = new Date(this.snapshot.resultPhaseStartedAt).getTime() + autoAdvanceMs - Date.now();
      const expectedRoundIndex = this.snapshot.currentRoundIndex;
      if (delay <= 0) {
        this.triggerResultAutoAdvance(expectedRoundIndex);
      } else {
        this.resultTimerHandle = setTimeout(() => {
          this.resultTimerHandle = null;
          this.triggerResultAutoAdvance(expectedRoundIndex);
        }, delay);
      }
      return;
    }

    // Only schedule for active rounds with a known end time
    if (this.snapshot.status !== "ROUND_ACTIVE" || !this.snapshot.roundEndsAt) return;

    const endsAt = new Date(this.snapshot.roundEndsAt).getTime();
    const now = Date.now();
    const delay = endsAt - now;
    const expectedRoundIndex = this.snapshot.currentRoundIndex;

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
   * Called when a round timer expires. First completes the round (scores + ROUND_COMPLETE),
   * waits 40 seconds for clients to display results and optionally click "Next Round",
   * then advances to next round. Uses API-returned snapshots — no re-fetch.
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
          console.error("[PartyKit] Round complete failed:", msg);
          return;
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

    this.advanceInFlight = true;
    try {
      const baseUrl = this.getNextJsBaseUrl();
      const advanceUrl = `${baseUrl}/api/compete/${encodeURIComponent(this.room.id)}/advance`;
      const advanceRes = await fetch(advanceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
        },
        body: JSON.stringify({ cause: TransitionCause.TIMEOUT, roundIndex: expectedRoundIndex })
      });
      if (!advanceRes.ok) {
        const text = await advanceRes.text();
        throw new Error(`[triggerResultAutoAdvance] advance API error ${advanceRes.status}: ${text}`);
      }
      const advanceSnapshot = await advanceRes.json();
      this.applySnapshotAndBroadcast(advanceSnapshot);
    } catch (err) {
      console.error("[PartyKit] Result auto-advance failed:", err instanceof Error ? err.message : err);
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
    let snapshotWithReadyState: unknown = this.snapshot;
    let resultPhaseEndsAt: number | undefined;
    if (isRuntimeState(this.snapshot)) {
      console.log("[PartyKit] Broadcasting to all, players:", this.snapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
      const autoAdvanceMs = (this.snapshot.resultsAutoAdvanceSec ?? 10) * 1000;
      resultPhaseEndsAt = this.snapshot.status === "ROUND_COMPLETE" && this.snapshot.resultPhaseStartedAt
        ? new Date(this.snapshot.resultPhaseStartedAt).getTime() + autoAdvanceMs
        : undefined;
      snapshotWithReadyState = {
        ...this.snapshot,
        readyForNext: [...this.readyForNext],
        resultPhaseEndsAt
      };
    }
    // Add readyForNext and resultPhaseEndsAt to snapshot before broadcasting
    // readyForNext is in-memory PartyKit state; resultPhaseEndsAt is derived from DB payload

    // Regression guard: ROUND_COMPLETE snapshots must always carry resultPhaseEndsAt.
    // If this fires, the snapshot builder did not include resultPhaseStartedAt from DB.
    if (isRuntimeState(this.snapshot) &&
        this.snapshot.status === "ROUND_COMPLETE" &&
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

    for (const connection of this.room.getConnections()) {
      const socketPlayerId = this.connections.get(connection.id);
      const perSocketSnapshot = { ...snapshotWithReadyState as Record<string, unknown>, viewerPlayerId: socketPlayerId ?? null };
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
      if (origin && (origin.includes("localhost") || origin.includes("vercel.app") || origin.includes(".partykit.dev"))) {
        this.detectedBaseUrl = origin;
        console.log(`[PartyKit] Detected base URL from origin: ${this.detectedBaseUrl}`);
      }
    }

    // Send current snapshot to the newly connected client immediately.
    // If snapshot not yet loaded, load from DB first (cold start).
    if (this.snapshotLoaded && this.snapshot) {
      const state = this.snapshot as RuntimeState;
      console.log("[PartyKit] Sending snapshot on connect, players:", state.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
      const msg = JSON.stringify({
        type: "STATE_UPDATE",
        snapshot: state,
        ...(state.roundResultsForClient ? { results: state.roundResultsForClient } : {})
      });
      connection.send(msg);
    } else {
      // Cold start — load from DB, schedule timers, send to this client
      try {
        await this.loadFromDB();
        const state = this.snapshot as RuntimeState;
        console.log("[PartyKit] Loaded snapshot from DB, players:", state.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
        const msg = JSON.stringify({
          type: "STATE_UPDATE",
          snapshot: state,
          ...(state.roundResultsForClient ? { results: state.roundResultsForClient } : {})
        });
        connection.send(msg);
      } catch (err) {
        console.error("[PartyKit] Failed to load snapshot on connect:", err instanceof Error ? err.message : err);
        this.sendError(connection, "Failed to load session state");
      }
    }
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
        }
        // Reload and broadcast updated snapshot
        const snapUrl = `${baseUrl}/api/compete/${encodeURIComponent(gameId)}`;
        const snapRes = await fetch(snapUrl, {
          headers: {
            "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
          }
        });
        if (snapRes.ok) {
          const snapshot = await snapRes.json();
          this.applySnapshotAndBroadcast(snapshot);
        }
      } catch (err) {
        console.error("[PartyKit] Failed to persist disconnect:", err instanceof Error ? err.message : err);
        this.broadcastStateUpdate();
      }
    }, GameServer.LEAVE_GRACE_MS);

    this.leaveTimers.set(playerId, timer);
  }

  async onMessage(message: string, sender: Connection): Promise<void> {
    let data: ServerMessage;
    try {
      data = JSON.parse(message) as ServerMessage;
    } catch (err) {
      this.sendError(sender, "Invalid message format");
      return;
    }

    const gameId = this.room.id;

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
          break;
        }

        case "START_GAME": {
          // Validate: only allowed in LOBBY phase
          if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "LOBBY") {
            this.sendError(sender, "START_GAME only allowed in LOBBY phase");
            break;
          }
          // Prevent double-start: reject if another start is already in flight
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
                playerId: data.playerId
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
                accPenalty: data.accPenalty ?? 0,
                xpPenalty: data.xpPenalty ?? 0
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

            // Check if this is the first submission of the round and apply timer clamp
            if (isRuntimeState(fullResponse) &&
                fullResponse.status === "ROUND_ACTIVE" &&
                fullResponse.currentRoundIndex === data.roundIndex &&
                fullResponse.roundEndsAt) {
              // Count submitted players in updated snapshot (includes current submitter)
              const submittedCount = fullResponse.players.filter(p => p.hasSubmitted && p.leftAt === null).length;

              // Fire clamp only on exactly the first submission (submittedCount === 1)
              if (submittedCount === 1) {
                const CLAMP_SEC = 30;
                const remainingMs = new Date(fullResponse.roundEndsAt).getTime() - Date.now();

                if (remainingMs > CLAMP_SEC * 1000) {
                  const newRoundEndsAt = new Date(Date.now() + CLAMP_SEC * 1000);
                  const clampTo = CLAMP_SEC;
                  console.log("[CLAMP_BEFORE]", {
                    gameId: this.room.id,
                    roundIndex: fullResponse.currentRoundIndex,
                    currentRoundEndsAt: fullResponse.roundEndsAt,
                    remainingMs,
                    clampTo,
                    now: new Date().toISOString(),
                  });
                  const pressureRes = await fetch(`${this.getNextJsBaseUrl()}/api/compete/${this.room.id}/pressure`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-partykit-secret": (this.room.env.PARTYKIT_SECRET as string) ?? ""
                    },
                    body: JSON.stringify({
                      roundIndex: data.roundIndex,
                      newRoundEndsAt: newRoundEndsAt.toISOString(),
                      clampedToSec: clampTo,
                      _executionContext: "partykit"
                    })
                  });
                  if (!pressureRes.ok) {
                    const text = await pressureRes.text();
                    console.error(`[PartyKit] PRESSURE_APPLIED persist failed ${pressureRes.status}: ${text}`);
                    // Do NOT break — fall through to applySnapshotAndBroadcast
                    // so clients still receive the updated snapshot with hasSubmitted=true
                  }
                  console.log("[CLAMP_AFTER_API]", {
                    newRoundEndsAt: newRoundEndsAt.toISOString(),
                    apiStatus: pressureRes.status,
                  });

                  // Update RuntimeState
                  if (isRuntimeState(fullResponse)) {
                    (fullResponse as RuntimeState).roundEndsAt = newRoundEndsAt.toISOString();
                  }

                  // Broadcast TIMER_CLAMPED
                  const timerClampedMsg: ClientMessage = {
                    type: "TIMER_CLAMPED",
                    newPhaseEndsAt: newRoundEndsAt.toISOString(),
                    clampedToSec: clampTo
                  };
                  for (const connection of this.room.getConnections()) {
                    connection.send(JSON.stringify(timerClampedMsg));
                  }
                  console.log(`[PartyKit] Timer clamped from ${Math.round(remainingMs / 1000)}s to ${clampTo}s`);
                }
              }
            }

            // Apply snapshot after clamp shaping so clients see hasSubmitted=true and clamped timer together
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
          // Persist READY_NEXT event to DB (fire-and-forget)
          fetch(`${this.getNextJsBaseUrl()}/api/compete/${gameId}/ready-next`, {
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
          }).catch(err => console.error("[PartyKit] READY_NEXT persist failed:", err));
          // Broadcast STATE_UPDATE with updated readyForNext array
          this.broadcastStateUpdate();
          // If all active players are ready, cancel result timer and advance
          const activePlayers = this.snapshot.players.filter(p => p.leftAt === null);
          if (this.readyForNext.size === activePlayers.length) {
            console.log("[PartyKit] All players ready, cancelling result timer and advancing");
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
                  this.sendError(sender, `Failed to advance round: ${text}`);
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
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "PING":
          // Keepalive — no response needed
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

  private sendError(connection: Connection, message: string): void {
    const errMsg: ClientMessage = { type: "ERROR", message };
    connection.send(JSON.stringify(errMsg));
  }
}
