import { BrowserPool, PlayerBrowser } from './browserPool';
import { CompeteWSClient, CompeteSnapshot, SnapshotStatus } from './websocketClient';
import { observeState, assertStateMatches, captureResumeToken, diffResumeTokens } from './observer';
import { EdgeCaseEngine } from './edgeCases';
import { fetchAccessToken } from '../fixtures/auth';

export interface GameOrchestratorOptions {
  browserPool: BrowserPool;
  partyKitHost: string;
  totalRounds: number;
  totalGames: number;
  edgeCaseEngine?: EdgeCaseEngine;
  onStep?: (step: string) => void;
  onAssertionFailure?: (failures: string[]) => void;
}

export interface GameResult {
  gameId: string;
  players: string[];
  rounds: number;
  completed: boolean;
  errors: string[];
}

/**
 * Drives the full 3-game lifecycle using WebSocket clients while browsers
 * observe and assert state.
 */
export class GameOrchestrator {
  private wsClients: CompeteWSClient[] = [];
  private results: GameResult[] = [];
  private readonly opts: GameOrchestratorOptions;
  // Per-client PLAY_AGAIN receipt resolvers, keyed by user.id.
  // Set in playAgain(), resolved by onPlayAgain callbacks wired in initClients().
  private playAgainWaiters: Map<string, (newGameId: string) => void> = new Map();

  // Player IDs that should be skipped during guess submission in runRound.
  // Populated by the 'timeout' edge case to simulate a player not submitting.
  // Cleared at the start of each round. (H7 fix)
  skipSubmissionPlayerIds: Set<string> = new Set();

  // Player IDs that should be skipped during readyNext in runRound.
  // Populated by the 'only-one-next' edge case to simulate only one player
  // clicking next round. Cleared at the start of each round. (H9 fix)
  skipReadyNextPlayerIds: Set<string> = new Set();

  constructor(opts: GameOrchestratorOptions) {
    this.opts = opts;
  }

  get browserPool(): BrowserPool {
    return this.opts.browserPool;
  }

  get clients(): CompeteWSClient[] {
    return this.wsClients;
  }

  /**
   * Initialize WebSocket clients for all players.
   */
  async initClients(gameId: string): Promise<void> {
    console.log(`[ORCHESTRATOR] Initializing ${this.browserPool.count} WebSocket clients for game ${gameId}...`);
    this.wsClients = [];

    for (const player of this.browserPool.all) {
      // Fetch Supabase access token for PartyKit WS auth (onBeforeConnect
      // requires ?token=<access_token> — without it the server returns 401).
      let accessToken: string | undefined;
      try {
        accessToken = await fetchAccessToken(player.user);
      } catch (err) {
        console.error(`[ORCHESTRATOR] Failed to fetch access token for ${player.user.email}:`, err instanceof Error ? err.message : err);
      }
      const client = new CompeteWSClient({
        partyKitHost: this.opts.partyKitHost,
        gameId,
        user: player.user,
        displayName: player.user.displayName,
        accessToken,
        onStateUpdate: (snapshot) => {
          console.log(`[WS:${player.user.displayName}] ts=${Date.now()} State update: ${snapshot.status} round=${snapshot.currentRoundIndex}`);
        },
        onError: (msg) => {
          console.error(`[WS:${player.user.displayName}] Error: ${msg}`);
        },
        onPlayAgain: (newGameId: string) => {
          console.log(`[WS:${player.user.displayName}] PLAY_AGAIN received: newGameId=${newGameId}`);
          const resolver = this.playAgainWaiters.get(player.user.id);
          if (resolver) resolver(newGameId);
        },
      });
      this.wsClients.push(client);
    }

    // Connect all clients in parallel
    await Promise.all(this.wsClients.map((c) => c.connect()));
    console.log('[ORCHESTRATOR] All WebSocket clients connected');
  }

  /**
   * Run the full 3-game sequence.
   */
  async run(): Promise<GameResult[]> {
    console.log(`[ORCHESTRATOR] Starting ${this.opts.totalGames} games of ${this.opts.totalRounds} rounds each...`);

    for (let gameIndex = 0; gameIndex < this.opts.totalGames; gameIndex++) {
      this.opts.onStep?.(`Game ${gameIndex + 1}/${this.opts.totalGames}`);
      const result = await this.runGame(gameIndex);
      this.results.push(result);

      if (gameIndex < this.opts.totalGames - 1) {
        // Play again
        this.opts.onStep?.('Starting next game via PLAY_AGAIN...');
        await this.playAgain();
      }
    }

    console.log('[ORCHESTRATOR] All games completed');
    return this.results;
  }

  /**
   * Run a single game from creation to session complete.
   */
  private async runGame(gameIndex: number): Promise<GameResult> {
    const errors: string[] = [];
    const host = this.browserPool.host();

    // Reset edge case engine for each new game so edge cases run across
    // all 3 games, not just game 1. (H15 fix)
    this.opts.edgeCaseEngine?.resetForNewGame();

    // Create game via API (host)
    this.opts.onStep?.('Creating game via API...');
    const baseURL = this.browserPool['baseURL'] as string;
    const createResponse = await host.page.request.post(`${baseURL}/api/compete/create`, {
      data: {
        displayName: host.user.displayName,
        playerId: host.user.id,
        mode: 'compete',
        totalRounds: this.opts.totalRounds,
        roundTimerSec: 30,
      },
    });

    if (!createResponse.ok()) {
      const text = await createResponse.text();
      throw new Error(`Failed to create game: ${text}`);
    }

    const sessionData = await createResponse.json();
    const gameId = sessionData.gameId || sessionData.id;
    console.log(`[ORCHESTRATOR] Game ${gameIndex + 1} created: ${gameId}`);

    // Navigate all browsers to the game
    this.opts.onStep?.('Navigating all browsers to game...');
    await Promise.all(this.browserPool.all.map((p) => this.browserPool.navigateToGame(p, gameId)));

    // Initialize WebSocket clients for this game
    await this.initClients(gameId);
    const hostClient = this.wsClients[0];

    // Wait for LOBBY state on all clients
    this.opts.onStep?.('Waiting for LOBBY state...');
    await Promise.all(
      this.wsClients.map((c) => c.waitForState((s) => s.status === 'LOBBY', 60000)),
    );

    // Assert all browsers see LOBBY
    await this.assertAllBrowsersSeeStatus('LOBBY', errors);

    // Inject lobby edge cases
    if (this.opts.edgeCaseEngine) {
      await this.opts.edgeCaseEngine.injectForPhase('lobby', this.browserPool, this.wsClients, gameId, 0, this);
    }

    // All players ready
    this.opts.onStep?.('All players marking ready...');
    for (const client of this.wsClients) {
      client.toggleReady(true);
    }

    // Wait for allPlayersReady (extended timeout: edge cases may trigger WS reconnects)
    this.opts.onStep?.('Waiting for all players ready...');
    await hostClient.waitForState((s) => s.allPlayersReady && s.players.length === this.wsClients.length, 60000);

    // Host starts game (or auto-start)
    this.opts.onStep?.('Starting game...');
    hostClient.startGame();

    // Wait for ROUND_ACTIVE
    this.opts.onStep?.('Waiting for ROUND_ACTIVE...');
    await Promise.all(
      this.wsClients.map((c) => c.waitForState((s) => s.status === 'ROUND_ACTIVE', 60000)),
    );

    // Play all rounds
    for (let roundIndex = 0; roundIndex < this.opts.totalRounds; roundIndex++) {
      this.opts.onStep?.(`Round ${roundIndex + 1}/${this.opts.totalRounds}`);
      await this.runRound(gameId, roundIndex, errors);
    }

    // Wait for SESSION_COMPLETE
    this.opts.onStep?.('Waiting for SESSION_COMPLETE...');
    await Promise.all(
      this.wsClients.map((c) => c.waitForState((s) => s.status === 'SESSION_COMPLETE', 120000)),
    );

    // Assert all browsers see SESSION_COMPLETE
    await this.assertAllBrowsersSeeStatus('SESSION_COMPLETE', errors);

    // Close WebSocket clients
    this.opts.onStep?.('Closing WebSocket clients...');
    for (const client of this.wsClients) {
      client.close();
    }
    this.wsClients = [];

    return {
      gameId,
      players: this.browserPool.all.map((p) => p.user.id),
      rounds: this.opts.totalRounds,
      completed: errors.length === 0,
      errors,
    };
  }

  /**
   * Run a single round from ROUND_ACTIVE to ROUND_COMPLETE.
   */
  private async runRound(gameId: string, roundIndex: number, errors: string[]): Promise<void> {
    const hostClient = this.wsClients[0];

    // Clear any skip-submission flags from prior rounds
    this.skipSubmissionPlayerIds.clear();
    // Clear any skip-ready-next flags from prior rounds
    this.skipReadyNextPlayerIds.clear();

    // Assert all browsers see ROUND_ACTIVE
    await this.assertAllBrowsersSeeStatus('ROUND_ACTIVE', errors);

    // Inject round-active edge cases
    if (this.opts.edgeCaseEngine) {
      await this.opts.edgeCaseEngine.injectForPhase('round-active', this.browserPool, this.wsClients, gameId, roundIndex, this);
    }

    // All players submit a guess (with some randomness to simulate real play)
    this.opts.onStep?.('All players submitting guesses...');
    for (let i = 0; i < this.wsClients.length; i++) {
      const client = this.wsClients[i];
      if (this.skipSubmissionPlayerIds.has(client.user.id)) {
        console.log(`[ORCHESTRATOR] Skipping submission for ${client.user.displayName} (timeout edge case)`);
        continue;
      }
      const year = 1900 + Math.floor(Math.random() * 100);
      const lat = -90 + Math.random() * 180;
      const lng = -180 + Math.random() * 360;
      client.submitGuess(roundIndex, year, lat, lng, []);
      // Wait for submission ack — detects rejected guesses instead of
      // fire-and-forget. (H17 fix — part 2)
      try {
        await client.waitForSubmissionAck(10000);
        console.log(`[SUBMIT-ACK] player=${client.user.displayName} round=${roundIndex} confirmed`);
      } catch (ackErr) {
        const ackMsg = ackErr instanceof Error ? ackErr.message : String(ackErr);
        const msg = `[${client.user.displayName}] Submit ack failed round ${roundIndex}: ${ackMsg}`;
        errors.push(msg);
        this.opts.onAssertionFailure?.([msg]);
        console.error(`[SUBMIT-ACK] player=${client.user.displayName} round=${roundIndex} TIMEOUT: ${ackMsg}`);
      }
      // Small delay between submissions
      await new Promise((r) => setTimeout(r, 200));
    }

    // Wait for ROUND_COMPLETE
    this.opts.onStep?.('Waiting for ROUND_COMPLETE...');
    await Promise.all(
      this.wsClients.map((c) => c.waitForState((s) => s.status === 'ROUND_COMPLETE', 60000)),
    );

    // Assert all browsers see ROUND_COMPLETE
    await this.assertAllBrowsersSeeStatus('ROUND_COMPLETE', errors);

    // Inject round-complete edge cases
    if (this.opts.edgeCaseEngine) {
      await this.opts.edgeCaseEngine.injectForPhase('round-complete', this.browserPool, this.wsClients, gameId, roundIndex, this);
    }

    // All players ready for next round
    this.opts.onStep?.('All players ready for next round...');
    for (const client of this.wsClients) {
      if (this.skipReadyNextPlayerIds.has(client.user.id)) {
        console.log(`[ORCHESTRATOR] Skipping readyNext for ${client.user.displayName} (only-one-next edge case)`);
        continue;
      }
      client.readyNext(roundIndex);
    }

    // Skip advancing on the last round — server auto-transitions to SESSION_COMPLETE
    if (roundIndex < this.opts.totalRounds - 1) {
      // Wait for a moment before advancing
      await new Promise((r) => setTimeout(r, 1000));

      // Host advances round
      this.opts.onStep?.('Advancing to next round...');
      hostClient.advanceRound(roundIndex, 'PLAYER');
    }
  }

  /**
   * Trigger PLAY_AGAIN: host creates a new game and broadcasts the new gameId.
   */
  private async playAgain(): Promise<void> {
    const host = this.browserPool.host();

    // Host creates new game via API
    const baseURL = this.browserPool['baseURL'] as string;
    const createResponse = await host.page.request.post(`${baseURL}/api/compete/create`, {
      data: {
        displayName: host.user.displayName,
        playerId: host.user.id,
        mode: 'compete',
        totalRounds: this.opts.totalRounds,
        roundTimerSec: 30,
      },
    });

    if (!createResponse.ok()) {
      throw new Error(`Failed to create new game for play again: ${await createResponse.text()}`);
    }

    const sessionData = await createResponse.json();
    const newGameId = sessionData.gameId || sessionData.id;

    // Initialize WebSocket clients for the new game
    await this.initClients(newGameId);
    const hostClient = this.wsClients[0];

    // Host broadcasts PLAY_AGAIN
    hostClient.playAgain(newGameId);

    // Wait for PLAY_AGAIN receipt on all clients with real verification.
    // Each client's onPlayAgain callback (wired in initClients) resolves its
    // entry in playAgainWaiters. Rejects on timeout if any client doesn't
    // receive the message. (H1 fix — replaces the former no-op blind-sleep wait)
    const PLAY_AGAIN_TIMEOUT = 10000;
    this.playAgainWaiters.clear();
    await Promise.all(
      this.wsClients.map((c) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.playAgainWaiters.delete(c.user.id);
            reject(new Error(`[PLAY_AGAIN] Timeout (${PLAY_AGAIN_TIMEOUT}ms) waiting for receipt on ${c.user.displayName}`));
          }, PLAY_AGAIN_TIMEOUT);
          this.playAgainWaiters.set(c.user.id, (receivedGameId: string) => {
            if (receivedGameId === newGameId) {
              clearTimeout(timer);
              this.playAgainWaiters.delete(c.user.id);
              resolve();
            }
          });
        }),
      ),
    );
    console.log('[ORCHESTRATOR] All clients received PLAY_AGAIN');

    // Navigate all browsers to the new game
    await Promise.all(this.browserPool.all.map((p) => this.browserPool.navigateToGame(p, newGameId)));
  }

  /**
   * Assert that all browsers see a specific status.
   */
  private async assertAllBrowsersSeeStatus(expected: SnapshotStatus, errors: string[]): Promise<void> {
    console.log(`[ASSERT-STATUS] ts=${Date.now()} expected=${expected}`);
    const observedStates = await Promise.all(
      this.browserPool.all.map((p) => observeState(p.page)),
    );

    for (let i = 0; i < observedStates.length; i++) {
      const observed = observedStates[i];
      const player = this.browserPool.all[i];
      if (observed.status !== expected) {
        const msg = `[${player.user.displayName}] Expected status ${expected}, got ${observed.status}`;
        errors.push(msg);
        this.opts.onAssertionFailure?.([msg]);
      }
    }
  }

  /**
   * Close all WebSocket clients and clean up.
   */
  async cleanup(): Promise<void> {
    for (const client of this.wsClients) {
      client.close();
    }
    this.wsClients = [];
  }
}
