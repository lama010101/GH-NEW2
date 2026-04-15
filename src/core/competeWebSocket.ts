import type { CompeteSessionSnapshot } from "./types";

export type WebSocketMessage =
  | { type: "PLAYER_SUBMITTED"; playerId: string; round: number }
  | { type: "ROUND_COMPLETE"; round: number; results: Array<{ playerId: string; score: number; accuracy: number; hints: number }> }
  | { type: "ADVANCE_ROUND"; nextRound: number | null }
  | { type: "PRESSURE_APPLIED"; remainingSec: number }
  | { type: "TIMER_TICK"; timeRemaining: number | null }
  | { type: "STATE_SNAPSHOT"; session: unknown; players: unknown[]; currentRound: number; timerLeft: number | null }
  | { type: "ERROR"; message: string };

export type CompeteWebSocketCallbacks = {
  onPlayerSubmitted?: (playerId: string, round: number) => void;
  onRoundComplete?: (round: number, results: Array<{ playerId: string; score: number; accuracy: number; hints: number }>) => void;
  onAdvanceRound?: (nextRound: number | null) => void;
  onPressureApplied?: (remainingSec: number) => void;
  onTimerTick?: (timeRemaining: number | null) => void;
  onStateSnapshot?: (snapshot: CompeteSessionSnapshot) => void;
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const url = `wss://${this.partyKitHost}/party/${this.gameId}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("[CompeteWebSocket] Connected");
      this.reconnectAttempts = 0;
      this.callbacks.onConnect?.();
      this.requestSnapshot();
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

    this.ws.onerror = (error) => {
      console.error("[CompeteWebSocket] Error:", error);
      this.callbacks.onError?.("WebSocket error");
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(data: WebSocketMessage): void {
    switch (data.type) {
      case "PLAYER_SUBMITTED":
        this.callbacks.onPlayerSubmitted?.(data.playerId, data.round);
        break;
      case "ROUND_COMPLETE":
        this.callbacks.onRoundComplete?.(data.round, data.results);
        break;
      case "ADVANCE_ROUND":
        this.callbacks.onAdvanceRound?.(data.nextRound);
        break;
      case "PRESSURE_APPLIED":
        this.callbacks.onPressureApplied?.(data.remainingSec);
        break;
      case "TIMER_TICK":
        this.callbacks.onTimerTick?.(data.timeRemaining);
        break;
      case "STATE_SNAPSHOT":
        if (this.isValidSnapshot(data)) {
          this.callbacks.onStateSnapshot?.(data as unknown as CompeteSessionSnapshot);
        }
        break;
      case "ERROR":
        this.callbacks.onError?.(data.message);
        break;
    }
  }

  private isValidSnapshot(data: unknown): data is Record<string, unknown> {
    return (
      typeof data === "object" &&
      data !== null &&
      "session" in data &&
      "players" in data &&
      "currentRound" in data
    );
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[CompeteWebSocket] Max reconnect attempts reached");
      this.callbacks.onError?.("Failed to reconnect after multiple attempts");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[CompeteWebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("[CompeteWebSocket] Cannot send, websocket not open");
    }
  }

  requestSnapshot(): void {
    this.send({
      type: "REQUEST_SNAPSHOT",
      playerId: this.playerId
    });
  }

  submitGuess(roundIndex: number, year: number | null, lat: number | null, lng: number | null): void {
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
    this.send({
      type: "ADVANCE_ROUND",
      playerId: this.playerId,
      roundIndex
    });
  }
}
