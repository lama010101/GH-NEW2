// ============================================================================
// CompeteWebSocket — DO-Authoritative Client Transport
// TASK: MP-DO-AUTHORITATIVE-001
//
// PartyKit is the DO-authoritative executor. This client:
//   - Sends action signals (join/ready/start/guess/advance)
//   - Receives STATE_UPDATE (full snapshot from DO) and ERROR
//   - WS is the ONLY state source — no REST fallback
// ============================================================================

export type WebSocketMessage =
  | { type: "STATE_UPDATE"; snapshot: unknown; results?: unknown[] }
  | { type: "ERROR"; message: string; code?: string }
  | { type: "KICKED"; gameId: string }
  | { type: "PLAYER_SUBMITTED"; playerId: string; playerName: string }
  | { type: "TIMER_CLAMPED"; newPhaseEndsAt: string; clampedToSec: number }
  | { type: "PLAY_AGAIN"; newGameId: string }
  | { type: "PONG" };

export type ConnectionState = "CONNECTING" | "OPEN" | "RECONNECTING" | "FAILED";

export type CompeteWebSocketCallbacks = {
  onStateUpdate?: (snapshot: unknown) => void;
  onError?: (message: string, code?: string) => void;
  onKicked?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onPlayerSubmitted?: (playerId: string, playerName: string) => void;
  onTimerClamped?: (newPhaseEndsAt: string, clampedToSec: number) => void;
  onPlayAgain?: (newGameId: string) => void;
};

export class CompeteWebSocket {
  private ws: WebSocket | null = null;
  private gameId: string;
  private playerId: string;
  private callbacks: CompeteWebSocketCallbacks;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectDelay = 1000;
  private manuallyDisconnected = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastAppliedSnapshotVersion = -1;
  private pendingVersionReset = false;
  private lastPongReceived = 0;
  private connectionState: ConnectionState = "CONNECTING";
  private sendQueue: Array<{ id: number; message: unknown; expiresAt: number; onFailure?: () => void }> = [];
  private queueTimer: ReturnType<typeof setInterval> | null = null;
  private nextQueueId = 0;
  private readonly messageTtlMs = 5000;
  private static activeSockets = new Map<string, CompeteWebSocket>();

  constructor(
    gameId: string,
    playerId: string,
    callbacks: CompeteWebSocketCallbacks,
    private partyKitHost: string = process.env.NEXT_PUBLIC_PARTY_KIT_HOST || "localhost:1999",
    private accessToken: string | null = null,
    private tokenProvider?: () => Promise<string | null>
  ) {
    this.gameId = gameId;
    this.playerId = playerId;
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.ws) {
      const state = this.ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        return;
      }
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionState("CONNECTING");
    const isLocalhost =
      this.partyKitHost.includes("localhost") || this.partyKitHost.includes("127.0.0.1");
    const protocol = isLocalhost ? "ws" : "wss";
    const tokenParam = this.accessToken ? `?token=${encodeURIComponent(this.accessToken)}` : "";
    const url = `${protocol}://${this.partyKitHost}/parties/lobby/${this.gameId}${tokenParam}`;
    console.log("[WS_CONNECT_URL]", { url });
    console.log("[CompeteWebSocket] Connecting to:", url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("[CompeteWebSocket] Connected");
      CompeteWebSocket.activeSockets.set(this.gameId, this);
      this.reconnectAttempts = 0;
      this.manuallyDisconnected = false;
      this.lastPongReceived = Date.now();
      this.pendingVersionReset = true;
      this.setConnectionState("OPEN");
      this.callbacks.onConnect?.();
      this.flushSendQueue();
      this.heartbeatInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Force reconnect if no PONG received within 45s (missed 2+ heartbeats).
          // This detects half-open TCP connections where onclose never fires.
          if (Date.now() - this.lastPongReceived > 45000) {
            console.warn("[CompeteWebSocket] Heartbeat timeout — no PONG in 45s, force reconnecting");
            this.ws.close();
            this.ws = null;
            this.attemptReconnect();
            return;
          }
          this.ws.send(JSON.stringify({ type: "PING" }));
        }
      }, 20000);
    };

    this.ws.onmessage = (event) => {
      if (event.target !== this.ws) {
        console.warn("[CompeteWebSocket] Ignoring message from inactive socket");
        return;
      }
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        this.handleMessage(data);
      } catch (error) {
        console.error("[CompeteWebSocket] Failed to parse message:", error);
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.clearHeartbeat();
      this.stopQueueTimer();
      console.log("[CompeteWebSocket] Disconnected — code:", event.code, "reason:", event.reason || "(none)");
      if (this.manuallyDisconnected) {
        return;
      }
      this.setConnectionState("RECONNECTING");
      this.callbacks.onDisconnect?.();
      this.attemptReconnect();
    };

    this.ws.onerror = () => {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.callbacks.onError?.("WebSocket error");
      }
    };
  }

  disconnect(): void {
    this.clearHeartbeat();
    this.stopQueueTimer();
    this.manuallyDisconnected = true;
    const dropped = this.sendQueue.splice(0);
    dropped.forEach((item) => item.onFailure?.());
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (CompeteWebSocket.activeSockets.get(this.gameId) === this) {
      CompeteWebSocket.activeSockets.delete(this.gameId);
    }
  }

  private handleMessage(data: WebSocketMessage): void {
    switch (data.type) {
      case "STATE_UPDATE": {
        if (this.pendingVersionReset) {
          const snapshotConfig = ((data.snapshot as Record<string, unknown>)?.config) as Record<string, unknown> | undefined;
          if (snapshotConfig?.mode === "async") {
            this.lastAppliedSnapshotVersion = -1;
          }
          this.pendingVersionReset = false;
        }
        // Monotonic version guard: reject stale out-of-order broadcasts.
        // Only active when snapshotVersion is present on the incoming snapshot.
        const incomingVersion = (data.snapshot as Record<string, unknown>)?.snapshotVersion;
        if (typeof incomingVersion === "number") {
          if (incomingVersion <= this.lastAppliedSnapshotVersion) {
            console.warn("[CompeteWebSocket] Stale STATE_UPDATE rejected — incoming version:", incomingVersion, "last applied:", this.lastAppliedSnapshotVersion);
            break;
          }
          this.lastAppliedSnapshotVersion = incomingVersion;
        }
        // Merge results into snapshot before passing to callback
        const snapshotWithResults = data.results
          ? { ...(data.snapshot as Record<string, unknown>), results: data.results }
          : data.snapshot;
        this.callbacks.onStateUpdate?.(snapshotWithResults);
        break;
      }
      case "PLAYER_SUBMITTED":
        this.callbacks.onPlayerSubmitted?.(data.playerId, data.playerName);
        break;
      case "TIMER_CLAMPED":
        this.callbacks.onTimerClamped?.(data.newPhaseEndsAt, data.clampedToSec);
        break;
      case "PLAY_AGAIN":
        this.callbacks.onPlayAgain?.(data.newGameId);
        break;
      case "PONG":
        this.lastPongReceived = Date.now();
        break;
      case "KICKED":
        // Host kicked this player — prevent reconnect and notify UI.
        this.manuallyDisconnected = true;
        this.callbacks.onKicked?.();
        break;
      case "ERROR": {
        const msg = data.message ?? "";
        // Explicit non-recoverable: kick rejection must never trigger reconnect.
        if (data.code === "PLAYER_KICKED") {
          this.manuallyDisconnected = true;
          this.callbacks.onError?.(msg, data.code);
          return;
        }
        const isRecoverable =
          msg.toLowerCase().includes("session") ||
          msg.toLowerCase().includes("failed to load") ||
          msg.toLowerCase().includes("snapshot");
        if (isRecoverable) {
          console.warn("[CompeteWebSocket] Recoverable server error, retrying:", msg);
          setTimeout(() => {
            if (this.ws) {
              this.ws.close();
              this.ws = null;
            }
            this.attemptReconnect();
          }, 2000);
        } else {
          this.callbacks.onError?.(msg);
        }
        break;
      }
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.manuallyDisconnected) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[CompeteWebSocket] Max reconnect attempts reached");
      this.setConnectionState("FAILED");
      this.callbacks.onError?.("Failed to reconnect after multiple attempts");
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.setConnectionState("RECONNECTING");
    setTimeout(() => this.connectWithFreshToken(), delay);
  }

  /**
   * Fetches a fresh access token via tokenProvider (if available) before
   * reconnecting. This prevents permanent disconnection when the original
   * token has expired (Supabase access tokens default to 1-hour TTL).
   * Falls back to connect() with the existing token if no provider is set.
   */
  private async connectWithFreshToken(): Promise<void> {
    if (this.manuallyDisconnected) return;
    this.setConnectionState("CONNECTING");
    if (this.tokenProvider) {
      try {
        const freshToken = await this.tokenProvider();
        if (freshToken) {
          this.accessToken = freshToken;
        } else {
          console.warn("[CompeteWebSocket] Token provider returned null — reconnecting with existing token");
        }
      } catch (err) {
        console.warn("[CompeteWebSocket] Token provider failed — reconnecting with existing token:", err);
      }
    }
    this.connect();
  }

  private send(message: unknown, onFailure?: () => void): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        console.error("[CompeteWebSocket] Send failed while OPEN:", err);
        onFailure?.();
      }
      return;
    }
    if (this.manuallyDisconnected || this.connectionState === "FAILED") {
      onFailure?.();
      return;
    }
    const id = ++this.nextQueueId;
    this.sendQueue.push({ id, message, expiresAt: Date.now() + this.messageTtlMs, onFailure });
    this.startQueueTimer();
    console.warn(
      "[CompeteWebSocket] Queued message (socket not open):",
      (message as Record<string, unknown>).type,
      "queue length:",
      this.sendQueue.length
    );
  }

  private sendAction(message: unknown): void {
    this.send(message, () => {
      this.callbacks.onError?.("Connection lost — action failed. Please retry.");
    });
  }

  private startQueueTimer(): void {
    if (this.queueTimer) return;
    this.queueTimer = setInterval(() => this.processQueue(), 250);
  }

  private stopQueueTimer(): void {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }
  }

  private processQueue(): void {
    const now = Date.now();
    if (this.ws?.readyState === WebSocket.OPEN) {
      while (this.sendQueue.length > 0) {
        const item = this.sendQueue[0];
        if (item.expiresAt <= now) {
          item.onFailure?.();
          this.sendQueue.shift();
          continue;
        }
        try {
          this.ws.send(JSON.stringify(item.message));
          this.sendQueue.shift();
        } catch (err) {
          console.error("[CompeteWebSocket] Failed to flush queued message:", err);
          item.onFailure?.();
          this.sendQueue.shift();
        }
      }
    } else {
      for (let i = this.sendQueue.length - 1; i >= 0; i--) {
        const item = this.sendQueue[i];
        if (item.expiresAt <= now) {
          item.onFailure?.();
          this.sendQueue.splice(i, 1);
        }
      }
    }
    if (this.sendQueue.length === 0) {
      this.stopQueueTimer();
    }
  }

  private flushSendQueue(): void {
    this.processQueue();
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    console.log("[CompeteWebSocket] Connection state:", state);
    this.callbacks.onConnectionStateChange?.(state);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Action signals. PartyKit will translate these into API calls.
  // Each triggers a DB write + STATE_INVALIDATED broadcast on success.
  // ─────────────────────────────────────────────────────────────────────

  joinRoom(displayName: string): void {
    this.send({ type: "JOIN_ROOM", playerId: this.playerId, displayName });
  }

  toggleReady(ready: boolean): void {
    this.sendAction({ type: "TOGGLE_READY", playerId: this.playerId, ready });
  }

  startGame(): void {
    this.sendAction({ type: "START_GAME", playerId: this.playerId });
  }

  setTimer(roundTimerSec: number): void {
    this.sendAction({ type: "SET_TIMER", playerId: this.playerId, roundTimerSec });
  }

  setYearRange(yearMin: number, yearMax: number): void {
    this.sendAction({ type: "SET_YEAR_RANGE", playerId: this.playerId, yearMin, yearMax });
  }

  setEraSelection(selectedEras: string[], yearMin: number, yearMax: number): void {
    this.sendAction({ type: "SET_ERA_SELECTION", playerId: this.playerId, selectedEras, yearMin, yearMax });
  }

  setRegionSelection(selectedRegions: string[]): void {
    this.sendAction({ type: "SET_REGION_SELECTION", playerId: this.playerId, selectedRegions });
  }

  setResultsTimer(resultsAutoAdvanceSec: number): void {
    this.sendAction({ type: "SET_RESULTS_TIMER", playerId: this.playerId, resultsAutoAdvanceSec });
  }

  setSubMode(mode: "sync" | "async", sessionDeadlineDays: number): void {
    this.sendAction({ type: "SET_SUB_MODE", playerId: this.playerId, mode, sessionDeadlineDays });
  }

  kickPlayer(targetPlayerId: string): void {
    this.sendAction({ type: "KICK_PLAYER", playerId: this.playerId, targetPlayerId });
  }

  cancelInvite(inviteeId: string): void {
    this.sendAction({ type: "CANCEL_INVITE", playerId: this.playerId, inviteeId });
  }

  syncInvites(): void {
    this.send({ type: "SYNC_INVITES", playerId: this.playerId });
  }

  static syncInvites(gameId: string): void {
    const socket = CompeteWebSocket.activeSockets.get(gameId);
    if (socket) {
      socket.syncInvites();
    } else {
      console.warn("[CompeteWebSocket] No active socket for game, cannot sync invites:", gameId);
    }
  }

  submitGuess(
    roundIndex: number,
    year: number | null,
    lat: number | null,
    lng: number | null,
    hintsUsed: string[] = []
  ): void {
    this.sendAction({
      type: "SUBMIT_GUESS",
      playerId: this.playerId,
      roundIndex,
      year,
      lat,
      lng,
      hintsUsed
    });
  }

  advanceRound(roundIndex: number): void {
    this.sendAction({ type: "ADVANCE_ROUND", playerId: this.playerId, roundIndex });
  }

  readyNext(roundIndex: number): void {
    this.sendAction({ type: "READY_NEXT", playerId: this.playerId, roundIndex });
  }

  playAgain(newGameId: string): void {
    this.sendAction({ type: "PLAY_AGAIN", playerId: this.playerId, newGameId });
  }

  reconnect(): void {
    this.manuallyDisconnected = false;
    this.reconnectAttempts = 0;
    this.setConnectionState("CONNECTING");
    this.connectWithFreshToken();
  }
}
