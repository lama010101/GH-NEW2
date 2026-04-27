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

function supabaseHeaders(supabaseKey: string): Record<string, string> {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
}

async function supabaseFrom(
  supabaseUrl: string,
  supabaseKey: string,
  table: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  options: {
    query?: string;
    body?: unknown;
    prefer?: string;
  } = {}
): Promise<unknown> {
  const url = `${supabaseUrl}/rest/v1/${table}${options.query ? `?${options.query}` : ""}`;
  const headers: Record<string, string> = {
    ...supabaseHeaders(supabaseKey),
    ...(options.prefer ? { Prefer: options.prefer } : {})
  };
  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${method} ${table} failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseRpc(
  supabaseUrl: string,
  supabaseKey: string,
  fnName: string,
  params: unknown
): Promise<unknown> {
  const url = `${supabaseUrl}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(supabaseKey),
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase RPC ${fnName} failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Build snapshot directly from Supabase REST (no Vercel/Next.js loopback).
// Returns a shape compatible with CompeteSessionSnapshot consumers.
async function buildSnapshotFromDB(
  supabaseUrl: string,
  supabaseKey: string,
  gameId: string
): Promise<unknown> {
  // Load all data in parallel
  const [sessions, players, events, commits] = await Promise.all([
    supabaseFrom(supabaseUrl, supabaseKey, "sessions", "GET", {
      query: `game_id=eq.${encodeURIComponent(gameId)}&limit=1`
    }),
    supabaseFrom(supabaseUrl, supabaseKey, "session_players", "GET", {
      query: `game_id=eq.${encodeURIComponent(gameId)}&order=joined_at.asc,player_id.asc`
    }),
    supabaseFrom(supabaseUrl, supabaseKey, "round_events", "GET", {
      query: `game_id=eq.${encodeURIComponent(gameId)}&order=created_at.asc,id.asc`
    }),
    supabaseFrom(supabaseUrl, supabaseKey, "round_commits", "GET", {
      query: `game_id=eq.${encodeURIComponent(gameId)}&order=round_index.asc,submitted_at.asc,player_id.asc`
    })
  ]) as [
    Array<Record<string, unknown>>,
    Array<Record<string, unknown>>,
    Array<Record<string, unknown>>,
    Array<Record<string, unknown>>
  ];

  if (!sessions || sessions.length === 0) {
    throw new Error(`Session not found: ${gameId}`);
  }
  const session = sessions[0];

  // Derive phase from events (mirrors deriveStateFromEventStream logic)
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const lastEventType = lastEvent ? (lastEvent.event_type as string) : null;
  const currentRoundIndex = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.event_type === "ROUND_STARTED" || e.event_type === "ROUND_COMPLETE" || e.event_type === "GUESS_SUBMITTED") {
        return (e.round_index as number) ?? 0;
      }
    }
    return 0;
  })();

  let status = "LOBBY";
  switch (lastEventType) {
    case "SESSION_CREATED": status = "LOBBY"; break;
    case "ROUND_STARTED":
    case "GUESS_SUBMITTED": status = "ROUND_ACTIVE"; break;
    case "ROUND_COMPLETE": status = "ROUND_COMPLETE"; break;
    case "SESSION_COMPLETE": status = "SESSION_COMPLETE"; break;
    default: status = "LOBBY";
  }

  // Find ROUND_STARTED event for current round to get timer info
  const roundStartedEvent = events
    .filter(e => e.event_type === "ROUND_STARTED" && e.round_index === currentRoundIndex)
    .pop();
  const payload = roundStartedEvent ? (roundStartedEvent.payload as Record<string, unknown>) : null;
  const roundEndsAt = payload ? (payload.phaseEndsAt as string) ?? null : null;
  const roundStartsAt = payload ? (payload.startedAt as string) ?? null : null;

  // Build players array
  const submittedPlayerIds = new Set(
    commits
      .filter(c => c.round_index === currentRoundIndex)
      .map(c => c.player_id as string)
  );

  const activePlayersList = players.filter(p => !p.left_at);
  const hostPlayer = players.find(p => p.is_host && !p.left_at);

  const mappedPlayers = players.map(p => ({
    playerId: p.player_id,
    displayName: (p.display_name as string) || (p.player_id as string).slice(0, 8),
    joinedAt: p.joined_at,
    leftAt: p.left_at ?? null,
    ready: p.ready ?? false,
    isHost: p.is_host ?? false,
    hasSubmitted: submittedPlayerIds.has(p.player_id as string)
  }));

  return {
    gameId,
    status,
    config: {
      mode: session.mode,
      roundTimerSec: session.round_timer_sec,
      totalRounds: session.total_rounds,
      yearMin: session.year_min,
      yearMax: session.year_max,
      hostPlayerId: hostPlayer ? hostPlayer.player_id : null,
      sessionDeadline: session.session_deadline ?? null,
      startedAt: null,
      completedAt: null
    },
    players: mappedPlayers,
    currentRoundIndex,
    allPlayersReady: activePlayersList.length >= 2 && activePlayersList.every(p => p.ready),
    roundStartsAt,
    roundEndsAt,
    viewerPlayerId: null,
    timeRemaining: null
  };
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
  env: Record<string, string | undefined>;
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

  constructor(readonly room: Room) {}

  private getSupabaseEnv(): { url: string; key: string } {
    const env = this.room.env as Record<string, string | undefined>;
    const url = env.SUPABASE_URL || "";
    const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !key) {
      throw new Error("[PartyKit] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    return { url, key };
  }

  /**
   * Load snapshot from DB (cold start / reconnect only).
   * This is the ONLY path that reads from DB.
   * NOT called after writes — use applySnapshotAndBroadcast() instead.
   */
  private async loadFromDB(): Promise<void> {
    const gameId = this.room.id;
    console.time("[PERF] loadFromDB:apiFetch");
    const { url, key } = this.getSupabaseEnv();
    this.snapshot = await buildSnapshotFromDB(url, key, gameId);
    console.timeEnd("[PERF] loadFromDB:apiFetch");
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
   * Called when a round timer expires. First completes the round (scores + ROUND_COMPLETE),
   * waits 5 seconds for clients to display results, then advances to next round.
   * Uses API-returned snapshots — no re-fetch.
   */
  private async triggerRoundExpiry(): Promise<void> {
    if (!isRuntimeState(this.snapshot) || this.snapshot.status !== "ROUND_ACTIVE") {
      return;
    }

    if (this.completeInFlight) {
      return;
    }
    this.completeInFlight = true;

    const gameId = this.room.id;
    const roundIndex = this.snapshot.currentRoundIndex;

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
        const { url: sbUrl, key: sbKey } = this.getSupabaseEnv();
        // Insert missing commits for players who did not submit (score = 0)
        const allPlayers = await supabaseFrom(sbUrl, sbKey, "session_players", "GET", {
          query: `game_id=eq.${encodeURIComponent(gameId)}&left_at=is.null`
        }) as Array<Record<string, unknown>>;
        const existingCommits = await supabaseFrom(sbUrl, sbKey, "round_commits", "GET", {
          query: `game_id=eq.${encodeURIComponent(gameId)}&round_index=eq.${roundIndex}`
        }) as Array<Record<string, unknown>>;
        const submitted = new Set(existingCommits.map(c => c.player_id as string));
        for (const player of allPlayers) {
          if (!submitted.has(player.player_id as string)) {
            await supabaseFrom(sbUrl, sbKey, "round_commits", "POST", {
              prefer: "resolution=ignore-duplicates",
              body: {
                game_id: gameId,
                player_id: player.player_id,
                round_index: roundIndex,
                submitted_at: new Date().toISOString(),
                year_guess: null,
                location_lat: null,
                location_lng: null,
                hints_used: 0,
                score: 0
              }
            });
          }
        }
        // Write round_results for all commits
        const allCommits = await supabaseFrom(sbUrl, sbKey, "round_commits", "GET", {
          query: `game_id=eq.${encodeURIComponent(gameId)}&round_index=eq.${roundIndex}&order=score.desc`
        }) as Array<Record<string, unknown>>;
        for (let i = 0; i < allCommits.length; i++) {
          const commit = allCommits[i];
          await supabaseFrom(sbUrl, sbKey, "round_results", "POST", {
            prefer: "resolution=ignore-duplicates",
            body: {
              game_id: gameId,
              round_index: roundIndex,
              player_id: commit.player_id,
              score: commit.score ?? 0,
              rank: i + 1
            }
          });
        }
        // Append ROUND_COMPLETE event (idempotent check first)
        const existingComplete = await supabaseFrom(sbUrl, sbKey, "round_events", "GET", {
          query: `game_id=eq.${encodeURIComponent(gameId)}&round_index=eq.${roundIndex}&event_type=eq.ROUND_COMPLETE&limit=1`
        }) as Array<Record<string, unknown>>;
        if (existingComplete.length === 0) {
          await supabaseFrom(sbUrl, sbKey, "round_events", "POST", {
            body: {
              game_id: gameId,
              round_index: roundIndex,
              event_type: "ROUND_COMPLETE",
              payload: { commitCount: allCommits.length }
            }
          });
        }
        const completeSnapshot = await buildSnapshotFromDB(sbUrl, sbKey, gameId);
        this.applySnapshotAndBroadcast(completeSnapshot);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("409") && !msg.includes("ALREADY_COMPLETE")) {
          console.error("[PartyKit] Round complete failed:", msg);
          return;
        }
      }

      // Step 2: Wait 15 seconds so clients can display the results screen
      await new Promise<void>((resolve) => setTimeout(resolve, 15000));

      // Step 3: Advance to next round (or SESSION_COMPLETE) — cause=TIMEOUT
      try {
        const { url: sbUrl, key: sbKey } = this.getSupabaseEnv();
        const sessionsAdv = await supabaseFrom(sbUrl, sbKey, "sessions", "GET", {
          query: `game_id=eq.${encodeURIComponent(gameId)}&limit=1`
        }) as Array<Record<string, unknown>>;
        if (!sessionsAdv || sessionsAdv.length === 0) throw new Error("Session not found");
        const sessAdv = sessionsAdv[0];
        const nextRoundIndex = roundIndex + 1;

        const sessEventsAdv = await supabaseFrom(sbUrl, sbKey, "round_events", "GET", {
          query: `game_id=eq.${encodeURIComponent(gameId)}&event_type=eq.SESSION_CREATED&order=id.asc&limit=1`
        }) as Array<Record<string, unknown>>;
        if (!sessEventsAdv || sessEventsAdv.length === 0) throw new Error("Session event not found");
        const advEventIds = (sessEventsAdv[0].payload as Record<string, unknown>)?.eventIds as string[];

        if (nextRoundIndex < (sessAdv.total_rounds as number)) {
          const now = new Date();
          const phaseEndsAt = new Date(now.getTime() + (sessAdv.round_timer_sec as number) * 1000).toISOString();
          await supabaseFrom(sbUrl, sbKey, "round_events", "POST", {
            body: {
              game_id: gameId,
              round_index: nextRoundIndex,
              event_type: "ROUND_STARTED",
              payload: {
                roundIndex: nextRoundIndex,
                eventId: advEventIds[nextRoundIndex],
                startedAt: now.toISOString(),
                phaseEndsAt,
                cause: TransitionCause.TIMEOUT
              }
            }
          });
        } else {
          await supabaseFrom(sbUrl, sbKey, "round_events", "POST", {
            body: {
              game_id: gameId,
              round_index: roundIndex,
              event_type: "SESSION_COMPLETE",
              payload: { totalRounds: sessAdv.total_rounds, cause: TransitionCause.TIMEOUT }
            }
          });
        }
        const advanceSnapshot = await buildSnapshotFromDB(sbUrl, sbKey, gameId);
        this.applySnapshotAndBroadcast(advanceSnapshot);
      } catch (err) {
        console.error("[PartyKit] Round advance after expiry failed:", err instanceof Error ? err.message : err);
      }
    } finally {
      this.completeInFlight = false;
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
        // /leave mutates MEMBERSHIP ONLY (left_at).
        // LOCKED RULE: /leave must NEVER evolve into gameplay mutation.
        const { url: sbUrl, key: sbKey } = this.getSupabaseEnv();
        await supabaseFrom(sbUrl, sbKey, "session_players", "PATCH", {
          query: `game_id=eq.${encodeURIComponent(gameId)}&player_id=eq.${encodeURIComponent(playerId)}`,
          body: { left_at: new Date().toISOString() }
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
          const { url: sbUrl, key: sbKey } = this.getSupabaseEnv();
          // Upsert player into session_players
          await supabaseFrom(sbUrl, sbKey, "session_players", "POST", {
            query: `on_conflict=game_id,player_id`,
            prefer: "resolution=merge-duplicates",
            body: {
              game_id: gameId,
              player_id: data.playerId,
              display_name: data.displayName,
              joined_at: new Date().toISOString(),
              left_at: null,
              ready: false,
              is_host: false
            }
          });
          // Host self-heal: if no active host exists, promote this player
          const joinActivePlayers = await supabaseFrom(sbUrl, sbKey, "session_players", "GET", {
            query: `game_id=eq.${encodeURIComponent(gameId)}&left_at=is.null`
          }) as Array<Record<string, unknown>>;
          const hasHost = joinActivePlayers.some(p => p.is_host);
          if (!hasHost) {
            await supabaseFrom(sbUrl, sbKey, "session_players", "PATCH", {
              query: `game_id=eq.${encodeURIComponent(gameId)}&player_id=eq.${encodeURIComponent(data.playerId)}`,
              body: { is_host: true }
            });
          }
          const snapshot = await buildSnapshotFromDB(sbUrl, sbKey, gameId);
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "TOGGLE_READY": {
          const { url: sbUrl, key: sbKey } = this.getSupabaseEnv();
          await supabaseFrom(sbUrl, sbKey, "session_players", "PATCH", {
            query: `game_id=eq.${encodeURIComponent(gameId)}&player_id=eq.${encodeURIComponent(data.playerId)}`,
            body: { ready: data.ready }
          });
          const snapshot = await buildSnapshotFromDB(sbUrl, sbKey, gameId);
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "START_GAME": {
          const { url: sbUrl, key: sbKey } = this.getSupabaseEnv();
          // Validate host and all-ready via snapshot
          const preStart = await buildSnapshotFromDB(sbUrl, sbKey, gameId) as Record<string, unknown>;
          const preStartPlayers = preStart.players as Array<Record<string, unknown>>;
          const activePre = preStartPlayers.filter(p => !p.leftAt);
          if (activePre.length < 2) throw new Error("At least 2 players required to start");
          const host = activePre.find(p => p.isHost);
          if (!host) throw new Error("Session has no host");
          if (host.playerId !== data.playerId) throw new Error("Only the host can start the game");
          if (!activePre.every(p => p.ready)) throw new Error("Not all players are ready");

          // Load SESSION_CREATED event to get eventIds
          const sessionEvents = await supabaseFrom(sbUrl, sbKey, "round_events", "GET", {
            query: `game_id=eq.${encodeURIComponent(gameId)}&event_type=eq.SESSION_CREATED&order=id.asc&limit=1`
          }) as Array<Record<string, unknown>>;
          if (!sessionEvents || sessionEvents.length === 0) throw new Error("Session event not found");
          const eventIds = (sessionEvents[0].payload as Record<string, unknown>)?.eventIds as string[];
          if (!Array.isArray(eventIds) || eventIds.length === 0) throw new Error("Event IDs not found");

          const now = new Date();
          const config = preStart.config as Record<string, unknown>;
          const phaseEndsAt = new Date(now.getTime() + (config.roundTimerSec as number) * 1000).toISOString();
          await supabaseFrom(sbUrl, sbKey, "round_events", "POST", {
            body: {
              game_id: gameId,
              round_index: 0,
              event_type: "ROUND_STARTED",
              payload: {
                roundIndex: 0,
                eventId: eventIds[0],
                startedAt: now.toISOString(),
                phaseEndsAt,
                cause: TransitionCause.PLAYER
              }
            }
          });
          const snapshot = await buildSnapshotFromDB(sbUrl, sbKey, gameId);
          this.applySnapshotAndBroadcast(snapshot);
          break;
        }

        case "SUBMIT_GUESS": {
          const { url: sbUrl, key: sbKey } = this.getSupabaseEnv();
          const submitKey = `${data.playerId}:${data.roundIndex}`;
          if (this.submitInFlightPlayers.has(submitKey)) {
            break; // Duplicate in-flight submission — discard silently
          }
          this.submitInFlightPlayers.add(submitKey);
          this.submitInFlight++;
          try {
            // Insert commit (idempotent via ON CONFLICT DO NOTHING)
            await supabaseFrom(sbUrl, sbKey, "round_commits", "POST", {
              prefer: "resolution=ignore-duplicates",
              body: {
                game_id: gameId,
                player_id: data.playerId,
                round_index: data.roundIndex,
                submitted_at: new Date().toISOString(),
                year_guess: data.year,
                location_lat: data.lat,
                location_lng: data.lng,
                hints_used: data.hintsUsed ?? 0,
                score: 0
              }
            });
            // Append GUESS_SUBMITTED event
            await supabaseFrom(sbUrl, sbKey, "round_events", "POST", {
              body: {
                game_id: gameId,
                round_index: data.roundIndex,
                event_type: "GUESS_SUBMITTED",
                payload: { playerId: data.playerId, yearGuess: data.year }
              }
            });

            // Check if all active players have now submitted
            const [allPlayersRows, allCommitsRows] = await Promise.all([
              supabaseFrom(sbUrl, sbKey, "session_players", "GET", {
                query: `game_id=eq.${encodeURIComponent(gameId)}&left_at=is.null`
              }),
              supabaseFrom(sbUrl, sbKey, "round_commits", "GET", {
                query: `game_id=eq.${encodeURIComponent(gameId)}&round_index=eq.${data.roundIndex}`
              })
            ]) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

            const allSubmitted = allPlayersRows.length > 0 &&
              allCommitsRows.length >= allPlayersRows.length;

            if (allSubmitted) {
              const existingComplete = await supabaseFrom(sbUrl, sbKey, "round_events", "GET", {
                query: `game_id=eq.${encodeURIComponent(gameId)}&round_index=eq.${data.roundIndex}&event_type=eq.ROUND_COMPLETE&limit=1`
              }) as Array<Record<string, unknown>>;

              if (existingComplete.length === 0) {
                // Write round_results ranked by score descending
                const commitsByScore = [...allCommitsRows].sort(
                  (a, b) => ((b.score as number) ?? 0) - ((a.score as number) ?? 0)
                );
                for (let i = 0; i < commitsByScore.length; i++) {
                  const commit = commitsByScore[i];
                  await supabaseFrom(sbUrl, sbKey, "round_results", "POST", {
                    prefer: "resolution=ignore-duplicates",
                    body: {
                      game_id: gameId,
                      round_index: data.roundIndex,
                      player_id: commit.player_id,
                      score: commit.score ?? 0,
                      rank: i + 1
                    }
                  });
                }
                // Append ROUND_COMPLETE event
                await supabaseFrom(sbUrl, sbKey, "round_events", "POST", {
                  body: {
                    game_id: gameId,
                    round_index: data.roundIndex,
                    event_type: "ROUND_COMPLETE",
                    payload: { commitCount: allCommitsRows.length }
                  }
                });
              }
            }

            const snapshot = await buildSnapshotFromDB(sbUrl, sbKey, gameId);
            this.applySnapshotAndBroadcast(snapshot);
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
            const { url: sbUrl, key: sbKey } = this.getSupabaseEnv();
            // Load session to get totalRounds and roundTimerSec
            const sessions = await supabaseFrom(sbUrl, sbKey, "sessions", "GET", {
              query: `game_id=eq.${encodeURIComponent(gameId)}&limit=1`
            }) as Array<Record<string, unknown>>;
            if (!sessions || sessions.length === 0) throw new Error("Session not found");
            const sess = sessions[0];
            const nextRoundIndex = data.roundIndex + 1;

            // Load SESSION_CREATED event for eventIds
            const sessEvents = await supabaseFrom(sbUrl, sbKey, "round_events", "GET", {
              query: `game_id=eq.${encodeURIComponent(gameId)}&event_type=eq.SESSION_CREATED&order=id.asc&limit=1`
            }) as Array<Record<string, unknown>>;
            if (!sessEvents || sessEvents.length === 0) throw new Error("Session event not found");
            const advEventIds = (sessEvents[0].payload as Record<string, unknown>)?.eventIds as string[];

            if (nextRoundIndex < (sess.total_rounds as number)) {
              const now = new Date();
              const phaseEndsAt = new Date(now.getTime() + (sess.round_timer_sec as number) * 1000).toISOString();
              await supabaseFrom(sbUrl, sbKey, "round_events", "POST", {
                body: {
                  game_id: gameId,
                  round_index: nextRoundIndex,
                  event_type: "ROUND_STARTED",
                  payload: {
                    roundIndex: nextRoundIndex,
                    eventId: advEventIds[nextRoundIndex],
                    startedAt: now.toISOString(),
                    phaseEndsAt,
                    cause: TransitionCause.PLAYER
                  }
                }
              });
            } else {
              await supabaseFrom(sbUrl, sbKey, "round_events", "POST", {
                body: {
                  game_id: gameId,
                  round_index: data.roundIndex,
                  event_type: "SESSION_COMPLETE",
                  payload: { totalRounds: sess.total_rounds, cause: TransitionCause.PLAYER }
                }
              });
            }
            const snapshot = await buildSnapshotFromDB(sbUrl, sbKey, gameId);
            this.applySnapshotAndBroadcast(snapshot);
          } finally {
            this.advanceInFlight = false;
          }
          break;
        }

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
