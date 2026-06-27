import * as WebSocket from 'ws';
import { TestUser } from '../fixtures/auth';

/**
 * Server-bound message types (matches partykit/server.ts ServerMessage union).
 */
export type ServerMessage =
  | { type: 'JOIN_ROOM'; playerId: string; displayName: string }
  | { type: 'TOGGLE_READY'; playerId: string; ready: boolean }
  | { type: 'START_GAME'; playerId: string }
  | { type: 'SUBMIT_GUESS'; playerId: string; roundIndex: number; year: number | null; lat: number | null; lng: number | null; hintsUsed: string[] }
  | { type: 'ADVANCE_ROUND'; playerId: string; roundIndex: number; cause?: string }
  | { type: 'READY_NEXT'; playerId: string; roundIndex: number }
  | { type: 'SET_TIMER'; playerId: string; roundTimerSec: number }
  | { type: 'SET_YEAR_RANGE'; playerId: string; yearMin: number; yearMax: number }
  | { type: 'SET_RESULTS_TIMER'; playerId: string; resultsAutoAdvanceSec: number }
  | { type: 'KICK_PLAYER'; playerId: string; targetPlayerId: string }
  | { type: 'PLAY_AGAIN'; playerId: string; newGameId: string }
  | { type: 'PING' };

/**
 * Client-bound message types (matches partykit/server.ts ClientMessage union).
 */
export type ClientMessage =
  | { type: 'STATE_UPDATE'; snapshot: any; results?: unknown[] }
  | { type: 'ERROR'; message: string }
  | { type: 'PLAYER_SUBMITTED'; playerId: string; playerName: string }
  | { type: 'TIMER_CLAMPED'; newPhaseEndsAt: string; clampedToSec: number }
  | { type: 'PLAY_AGAIN'; newGameId: string };

export type SnapshotStatus = 'LOBBY' | 'ROUND_ACTIVE' | 'ROUND_COMPLETE' | 'SESSION_COMPLETE';

export interface CompeteSnapshot {
  gameId: string;
  status: SnapshotStatus;
  config: {
    mode: string;
    roundTimerSec: number;
    totalRounds: number;
    yearMin: number;
    yearMax: number;
    resultsAutoAdvanceSec: number;
    selectedEras: string[];
    hostPlayerId: string | null;
  };
  players: Array<{
    playerId: string;
    displayName: string;
    ready: boolean;
    isHost: boolean;
    hasSubmitted: boolean;
    leftAt: string | null;
    avatarUrl: string | null;
  }>;
  currentRoundIndex: number;
  allPlayersReady: boolean;
  roundStartsAt: string | null;
  roundEndsAt: string | null;
  viewerPlayerId: string | null;
  rounds: Array<{
    eventId: string;
    title: string;
    year: number;
    latitude: number;
    longitude: number;
    locationName: string | null;
    imageUrl: string | null;
    description: string | null;
    hints: unknown[];
  }>;
  readyForNext: string[];
  resultPhaseEndsAt?: number;
  roomCode: string;
  results?: unknown[];
}

export interface CompeteWSClientOptions {
  partyKitHost: string;
  gameId: string;
  user: TestUser;
  displayName?: string;
  onStateUpdate?: (snapshot: CompeteSnapshot) => void;
  onError?: (message: string) => void;
  onPlayerSubmitted?: (playerId: string, playerName: string) => void;
  onTimerClamped?: (newPhaseEndsAt: string, clampedToSec: number) => void;
  onPlayAgain?: (newGameId: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  heartbeatMs?: number;
}

/**
 * A Playwright-side WebSocket client that speaks the PartyKit protocol.
 *
 * This is used by the orchestrator to drive game actions programmatically
 * while the real browsers act as observers.
 */
export class CompeteWSClient {
  private ws: WebSocket.WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private manuallyClosed = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelayMs = 1000;
  private connectPromise: Promise<void> | null = null;

  constructor(private opts: CompeteWSClientOptions) {}

  get gameId(): string {
    return this.opts.gameId;
  }

  get user(): TestUser {
    return this.opts.user;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to the PartyKit room and send JOIN_ROOM.
   * Resolves once the first STATE_UPDATE is received.
   */
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.manuallyClosed = false;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const host = this.opts.partyKitHost;
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
      const protocol = isLocal ? 'ws' : 'wss';
      const url = `${protocol}://${host}/parties/lobby/${this.opts.gameId}`;
      console.log(`[WS:${this.opts.user.displayName}] Connecting to ${url}`);

      const ws = new WebSocket.WebSocket(url);
      this.ws = ws;

      let firstStateResolved = false;
      const resolveOnce = () => {
        if (!firstStateResolved) {
          firstStateResolved = true;
          resolve();
        }
      };

      ws.on('open', () => {
        console.log(`[WS:${this.opts.user.displayName}] Connected`);
        this.reconnectAttempts = 0;
        this.opts.onConnect?.();
        // Send JOIN_ROOM
        this.send({
          type: 'JOIN_ROOM',
          playerId: this.opts.user.id,
          displayName: this.opts.displayName ?? this.opts.user.displayName,
        });
        // Start heartbeat
        const hb = this.opts.heartbeatMs ?? 20000;
        this.heartbeat = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, hb);
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString()) as ClientMessage;
          this.handleMessage(msg, resolveOnce);
        } catch (err) {
          console.error(`[WS:${this.opts.user.displayName}] Failed to parse message:`, err);
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.clearHeartbeat();
        console.log(`[WS:${this.opts.user.displayName}] Closed code=${code} reason=${reason.toString()}`);
        this.opts.onDisconnect?.();
        if (!this.manuallyClosed) {
          this.attemptReconnect().catch((err) => {
            if (!firstStateResolved) {
              firstStateResolved = true;
              reject(err);
            }
          });
        }
      });

      ws.on('error', (err: Error) => {
        console.error(`[WS:${this.opts.user.displayName}] Error:`, err.message);
        if (!firstStateResolved) {
          firstStateResolved = true;
          reject(err);
        }
      });
    });
    return this.connectPromise;
  }

  private attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return Promise.reject(new Error(`Max reconnect attempts reached for ${this.opts.user.displayName}`));
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelayMs * this.reconnectAttempts;
    console.log(`[WS:${this.opts.user.displayName}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    return new Promise((resolve) => setTimeout(resolve, delay)).then(() => {
      this.connectPromise = null;
      return this.connect();
    });
  }

  private handleMessage(msg: ClientMessage, resolveOnce: () => void): void {
    switch (msg.type) {
      case 'STATE_UPDATE':
        this.opts.onStateUpdate?.(msg.snapshot as CompeteSnapshot);
        resolveOnce();
        break;
      case 'ERROR':
        console.warn(`[WS:${this.opts.user.displayName}] ERROR: ${msg.message}`);
        this.opts.onError?.(msg.message);
        break;
      case 'PLAYER_SUBMITTED':
        this.opts.onPlayerSubmitted?.(msg.playerId, msg.playerName);
        break;
      case 'TIMER_CLAMPED':
        this.opts.onTimerClamped?.(msg.newPhaseEndsAt, msg.clampedToSec);
        break;
      case 'PLAY_AGAIN':
        this.opts.onPlayAgain?.(msg.newGameId);
        break;
    }
  }

  private send(msg: ServerMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WS:${this.opts.user.displayName}] Cannot send — socket not open`);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  /** Wait for the next STATE_UPDATE matching a predicate. */
  waitForState(predicate: (s: CompeteSnapshot) => boolean, timeoutMs = 30000): Promise<CompeteSnapshot> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.opts.onStateUpdate = originalHandler;
        reject(new Error(`Timeout waiting for state match (${timeoutMs}ms)`));
      }, timeoutMs);

      const originalHandler = this.opts.onStateUpdate;
      this.opts.onStateUpdate = (snapshot: CompeteSnapshot) => {
        originalHandler?.(snapshot);
        if (predicate(snapshot)) {
          clearTimeout(timer);
          this.opts.onStateUpdate = originalHandler;
          resolve(snapshot);
        }
      };
    });
  }

  /**
   * Wait for a STATE_UPDATE confirming this player's guess was acknowledged
   * (hasSubmitted === true). Used by the orchestrator to detect rejected
   * guesses instead of fire-and-forget. (H17 fix — part 1)
   */
  waitForSubmissionAck(timeoutMs = 10000): Promise<CompeteSnapshot> {
    return this.waitForState(
      (s) => {
        const me = s.players.find((p) => p.playerId === this.opts.user.id);
        return me?.hasSubmitted === true;
      },
      timeoutMs,
    );
  }

  // ── Action helpers ──────────────────────────────────────────────────────
  toggleReady(ready = true): void {
    this.send({ type: 'TOGGLE_READY', playerId: this.opts.user.id, ready });
  }

  startGame(): void {
    this.send({ type: 'START_GAME', playerId: this.opts.user.id });
  }

  submitGuess(roundIndex: number, year: number | null, lat: number | null, lng: number | null, hintsUsed: string[] = []): void {
    this.send({ type: 'SUBMIT_GUESS', playerId: this.opts.user.id, roundIndex, year, lat, lng, hintsUsed });
  }

  readyNext(roundIndex: number): void {
    this.send({ type: 'READY_NEXT', playerId: this.opts.user.id, roundIndex });
  }

  advanceRound(roundIndex: number, cause = 'PLAYER'): void {
    this.send({ type: 'ADVANCE_ROUND', playerId: this.opts.user.id, roundIndex, cause });
  }

  setTimer(roundTimerSec: number): void {
    this.send({ type: 'SET_TIMER', playerId: this.opts.user.id, roundTimerSec });
  }

  setYearRange(yearMin: number, yearMax: number): void {
    this.send({ type: 'SET_YEAR_RANGE', playerId: this.opts.user.id, yearMin, yearMax });
  }

  kickPlayer(targetPlayerId: string): void {
    this.send({ type: 'KICK_PLAYER', playerId: this.opts.user.id, targetPlayerId });
  }

  playAgain(newGameId: string): void {
    this.send({ type: 'PLAY_AGAIN', playerId: this.opts.user.id, newGameId });
  }

  /** Forcefully close the WebSocket (e.g. to simulate a network drop). */
  close(): void {
    this.manuallyClosed = true;
    this.clearHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectPromise = null;
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
