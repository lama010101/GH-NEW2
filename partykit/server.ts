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
//     DO cold start → buildSnapshotFromDB() → loadCompeteSessionSnapshot() → getGameState()
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

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function apiFetch(path: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Build snapshot from DB via REST API.
// Returns validated CompeteSessionSnapshot or throws.
async function buildSnapshotFromDB(gameId: string): Promise<unknown> {
  return apiFetch(`/api/compete/${encodeURIComponent(gameId)}`);
}

// Runtime state shape — mirrors CompeteSessionSnapshot for type safety.
type RuntimeState = {
  gameId: string;
  status: string;
  players: Array<{ playerId: string; displayName: string; ready: boolean; isHost: boolean; hasSubmitted: boolean; leftAt: string | null }>;
  currentRoundIndex: number;
  roundEndsAt: string | null;
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
  | { type: "SUBMIT_GUESS"; playerId: string; roundIndex: number; year: number | null; lat: number | null; lng: number | null; hintsUsed: number }
  | { type: "ADVANCE_ROUND"; playerId: string; roundIndex: number };

// Messages sent TO clients
export type ClientMessage =
  | { type: "STATE_UPDATE"; snapshot: unknown }
  | { type: "ERROR"; message: string };

interface Room {
  id: string;
  broadcast: (message: string) => void;
}

interface Connection {
  id: string;
  send: (message: string) => void;
}


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

  // Runtime state — derived, rebuildable from DB at any time.
  // This is the DO's authoritative view. DB remains canonical truth.
  // INVARIANT: if snapshotLoaded=true, snapshot is a valid RuntimeState.
  private snapshot: unknown | null = null;
  private snapshotLoaded = false;

  // Timer handle for round countdown (Phase 4+ — not yet active).
  // Will be used to broadcast timer ticks and auto-advance on expiry.
  private roundTimerHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Room) {}

  /**
   * Load snapshot from DB (cold start / reconnect only).
   * This is the ONLY path that reads from DB.
   * NOT called after writes — use applySnapshotAndBroadcast() instead.
   */
  private async loadFromDB(): Promise<void> {
    const gameId = this.room.id;
    this.snapshot = await buildSnapshotFromDB(gameId);
    this.snapshotLoaded = true;
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
      console.log("[PartyKit] Applying snapshot, players:", snapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
    }
    this.snapshot = snapshot;
    this.snapshotLoaded = true;
    this.scheduleRoundTimer();
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

    if (!this.snapshot || !isRuntimeState(this.snapshot)) return;

    // Only schedule for active rounds with a known end time
    if (this.snapshot.status !== "ROUND_ACTIVE" || !this.snapshot.roundEndsAt) return;

    const endsAt = new Date(this.snapshot.roundEndsAt).getTime();
    const now = Date.now();
    const delay = endsAt - now;

    if (delay <= 0) {
      // Round already expired — trigger advance immediately
      console.log("[PartyKit] Round expired, triggering advance");
      this.triggerRoundExpiry();
    } else {
      // Schedule advance for when the round expires
      console.log(`[PartyKit] Round timer scheduled: ${Math.round(delay / 1000)}s`);
      this.roundTimerHandle = setTimeout(() => {
        this.roundTimerHandle = null;
        this.triggerRoundExpiry();
      }, delay);
    }
  }

  /**
   * Called when a round timer expires. Triggers the advance API
   * with cause="timeout" — no playerId fabrication.
   * Uses API-returned snapshot — no re-fetch.
   */
  private async triggerRoundExpiry(): Promise<void> {
    if (!this.snapshot || !isRuntimeState(this.snapshot)) return;

    const gameId = this.room.id;
    const roundIndex = this.snapshot.currentRoundIndex;

    try {
      const snapshot = await apiFetch(`/api/compete/${encodeURIComponent(gameId)}/advance`, {
        method: "POST",
        body: JSON.stringify({
          cause: TransitionCause.TIMEOUT,
          roundIndex
        })
      });
      this.applySnapshotAndBroadcast(snapshot);
    } catch (err) {
      console.error("[PartyKit] Round expiry advance failed:", err instanceof Error ? err.message : err);
    }
  }

  /**
   * Broadcast full STATE_UPDATE to all connected clients.
   * This replaces STATE_INVALIDATED — clients no longer need to REST-fetch.
   */
  private broadcastStateUpdate(): void {
    if (!this.snapshot) return;
    if (isRuntimeState(this.snapshot)) {
      console.log("[PartyKit] Broadcasting to all, players:", this.snapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
    }
    const msg = JSON.stringify({ type: "STATE_UPDATE", snapshot: this.snapshot });
    this.room.broadcast(msg);
  }

  async onConnect(connection: Connection): Promise<void> {
    console.log("[PartyKit] Client connected:", connection.id);

    // Send current snapshot to the newly connected client immediately.
    // If snapshot not yet loaded, load from DB first (cold start).
    if (this.snapshotLoaded && this.snapshot) {
      const state = this.snapshot as RuntimeState;
      console.log("[PartyKit] Sending snapshot on connect, players:", state.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
      const msg = JSON.stringify({ type: "STATE_UPDATE", snapshot: this.snapshot });
      connection.send(msg);
    } else {
      // Cold start — load from DB, schedule timers, send to this client
      try {
        await this.loadFromDB();
        const state = this.snapshot as RuntimeState;
        console.log("[PartyKit] Loaded snapshot from DB, players:", state.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
        const msg = JSON.stringify({ type: "STATE_UPDATE", snapshot: this.snapshot });
        connection.send(msg);
      } catch (err) {
        console.error("[PartyKit] Failed to load snapshot on connect:", err instanceof Error ? err.message : err);
        this.sendError(connection, "Failed to load session state");
      }
    }
  }

  async onClose(connection: Connection): Promise<void> {
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
        // /leave mutates MEMBERSHIP ONLY (left_at, is_host reassignment).
        // LOCKED RULE: /leave must NEVER evolve into gameplay mutation.
        await apiFetch(`/api/compete/${encodeURIComponent(gameId)}/leave`, {
          method: "POST",
          body: JSON.stringify({ playerId })
        });
        await this.loadFromDB();
        this.broadcastStateUpdate();
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
          // /join returns the updated snapshot — use it directly
          const snapshot = await apiFetch(`/api/compete/${gameId}/join`, {
            method: "POST",
            body: JSON.stringify({
              playerId: data.playerId,
              displayName: data.displayName
            })
          });
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "TOGGLE_READY": {
          // /ready returns the updated snapshot — use it directly
          const snapshot = await apiFetch(`/api/compete/${gameId}/ready`, {
            method: "POST",
            body: JSON.stringify({
              playerId: data.playerId,
              ready: data.ready
            })
          });
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "START_GAME": {
          // /start returns the updated snapshot — use it directly
          const snapshot = await apiFetch(`/api/compete/${gameId}/start`, {
            method: "POST",
            body: JSON.stringify({ playerId: data.playerId })
          });
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "SUBMIT_GUESS": {
          // /guess returns the updated snapshot — use it directly
          const snapshot = await apiFetch(`/api/compete/${gameId}/guess`, {
            method: "POST",
            body: JSON.stringify({
              playerId: data.playerId,
              roundIndex: data.roundIndex,
              year: data.year,
              lat: data.lat,
              lng: data.lng,
              hintsUsed: data.hintsUsed
            })
          });
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "ADVANCE_ROUND": {
          // Guard: if the round was already advanced by another player,
          // skip the API call (would hit INVALID_TRANSITION: ROUND_STARTED → ROUND_STARTED)
          // and just send the current snapshot to the requester.
          if (isRuntimeState(this.snapshot) &&
              (this.snapshot.currentRoundIndex > data.roundIndex ||
               (this.snapshot.status !== "ROUND_COMPLETE" && this.snapshot.status !== "SESSION_COMPLETE"))) {
            sender.send(JSON.stringify({ type: "STATE_UPDATE", snapshot: this.snapshot }));
            break;
          }
          const snapshot = await apiFetch(`/api/compete/${gameId}/advance`, {
            method: "POST",
            body: JSON.stringify({
              cause: TransitionCause.PLAYER,
              playerId: data.playerId,
              roundIndex: data.roundIndex
            })
          });
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        default: {
          this.sendError(sender, `Unhandled message type: ${(data as { type: string }).type}`);
        }
      }
    } catch (error) {
      // DB write may have partially succeeded (e.g., post-commit verification
      // failure). Reload from DB to keep DO state consistent with committed data.
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[PartyKit] Action failed:", message);
      try {
        await this.loadFromDB();
        this.broadcastStateUpdate();
      } catch (reloadErr) {
        console.error("[PartyKit] Post-failure reload also failed:", reloadErr instanceof Error ? reloadErr.message : reloadErr);
      }
      this.sendError(sender, message);
    }
  }

  private sendError(connection: Connection, message: string): void {
    const errMsg: ClientMessage = { type: "ERROR", message };
    connection.send(JSON.stringify(errMsg));
  }
}
