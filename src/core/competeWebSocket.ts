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
  | { type: "STATE_UPDATE"; snapshot: unknown }
  | { type: "ERROR"; message: string };

export type CompeteWebSocketCallbacks = {
  onStateUpdate?: (snapshot: unknown) => void;
  onError?: (message: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export class CompeteWebSocket {
  private ws: WebSocket | null = null;
  private gameId: string;
  private playerId: string;
  private callbacks: CompeteWebSocketCallbacks;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(
    gameId: string,
    playerId: string,
    callbacks: CompeteWebSocketCallbacks,
    private partyKitHost: string = process.env.NEXT_PUBLIC_PARTY_KIT_HOST || "localhost:1999"
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

    const isLocalhost =
      this.partyKitHost.includes("localhost") || this.partyKitHost.includes("127.0.0.1");
    const protocol = isLocalhost ? "ws" : "wss";
    const url = `${protocol}://${this.partyKitHost}/parties/lobby/${this.gameId}`;
    console.log("[CompeteWebSocket] Connecting to:", url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("[CompeteWebSocket] Connected");
      this.reconnectAttempts = 0;
      this.callbacks.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        this.handleMessage(data);
      } catch (error) {
        console.error("[CompeteWebSocket] Failed to parse message:", error);
      }
    };

    this.ws.onclose = () => {
      console.log("[CompeteWebSocket] Disconnected");
      this.callbacks.onDisconnect?.();
      this.attemptReconnect();
    };

    this.ws.onerror = () => {
      this.callbacks.onError?.("WebSocket error");
    };
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent auto-reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(data: WebSocketMessage): void {
    switch (data.type) {
      case "STATE_UPDATE":
        this.callbacks.onStateUpdate?.(data.snapshot);
        break;
      case "ERROR":
        this.callbacks.onError?.(data.message);
        break;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[CompeteWebSocket] Max reconnect attempts reached");
      this.callbacks.onError?.("Failed to reconnect after multiple attempts");
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => this.connect(), delay);
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("[CompeteWebSocket] Cannot send, websocket not open");
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Action signals. PartyKit will translate these into API calls.
  // Each triggers a DB write + STATE_INVALIDATED broadcast on success.
  // ─────────────────────────────────────────────────────────────────────

  joinRoom(displayName: string): void {
    this.send({ type: "JOIN_ROOM", playerId: this.playerId, displayName });
  }

  toggleReady(ready: boolean): void {
    this.send({ type: "TOGGLE_READY", playerId: this.playerId, ready });
  }

  startGame(): void {
    this.send({ type: "START_GAME", playerId: this.playerId });
  }

  submitGuess(
    roundIndex: number,
    year: number | null,
    lat: number | null,
    lng: number | null
  ): void {
    this.send({
      type: "SUBMIT_GUESS",
      playerId: this.playerId,
      roundIndex,
      year,
      lat,
      lng,
      hintsUsed: 0
    });
  }

  advanceRound(roundIndex: number): void {
    this.send({ type: "ADVANCE_ROUND", playerId: this.playerId, roundIndex });
  }
}
