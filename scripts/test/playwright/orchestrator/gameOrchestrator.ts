import { BrowserPool, PlayerBrowser } from './browserPool';
import { CompeteWSClient, CompeteSnapshot, SnapshotStatus } from './websocketClient';
import { observeState, assertStateMatches, captureResumeToken, diffResumeTokens } from './observer';
import { EdgeCaseEngine } from './edgeCases';

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
      const client = new CompeteWSClient({
        partyKitHost: this.opts.partyKitHost,
        gameId,
        user: player.user,
        displayName: player.user.displayName,
        onStateUpdate: (snapshot) => {
          console.log(`[WS:${player.user.displayName}] State update: ${snapshot.status} round=${snapshot.currentRoundIndex}`);
        },
        onError: (msg) => {
          console.error(`[WS:${player.user.displayName}] Error: ${msg}`);
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
    const host = this.browserPool.host;
    const hostClient = this.wsClients[0];

    // Create game via API (host)
    this.opts.onStep?.('Creating game via API...');
    const baseURL = this.browserPool['baseURL'] as string;
    const createResponse = await host.page.request.post(`${baseURL}/api/compete/create`, {
      data: {
        displayName: host.user.displayName,
        playerId: host.user.id,
        mode: 'compete',
        totalRounds: this.opts.totalRounds,
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

    // Wait for LOBBY state on all clients
    this.opts.onStep?.('Waiting for LOBBY state...');
    await Promise.all(
      this.wsClients.map((c) => c.waitForState((s) => s.status === 'LOBBY', 15000)),
    );

    // Assert all browsers see LOBBY
    await this.assertAllBrowsersSeeStatus('LOBBY', errors);

    // Inject lobby edge cases
    if (this.opts.edgeCaseEngine) {
      await this.opts.edgeCaseEngine.injectForPhase('lobby', this.browserPool, this.wsClients, gameId, 0);
    }

    // All players ready
    this.opts.onStep?.('All players marking ready...');
    for (const client of this.wsClients) {
      client.toggleReady(true);
    }

    // Wait for allPlayersReady
    this.opts.onStep?.('Waiting for all players ready...');
    await hostClient.waitForState((s) => s.allPlayersReady && s.players.length === 6, 15000);

    // Host starts game (or auto-start)
    this.opts.onStep?.('Starting game...');
    hostClient.startGame();

    // Wait for ROUND_ACTIVE
    this.opts.onStep?.('Waiting for ROUND_ACTIVE...');
    await Promise.all(
      this.wsClients.map((c) => c.waitForState((s) => s.status === 'ROUND_ACTIVE', 20000)),
    );

    // Play all rounds
    for (let roundIndex = 0; roundIndex < this.opts.totalRounds; roundIndex++) {
      this.opts.onStep?.(`Round ${roundIndex + 1}/${this.opts.totalRounds}`);
      await this.runRound(roundIndex, errors);
    }

    // Wait for SESSION_COMPLETE
    this.opts.onStep?.('Waiting for SESSION_COMPLETE...');
    await Promise.all(
      this.wsClients.map((c) => c.waitForState((s) => s.status === 'SESSION_COMPLETE', 30000)),
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
  private async runRound(roundIndex: number, errors: string[]): Promise<void> {
    const hostClient = this.wsClients[0];

    // Assert all browsers see ROUND_ACTIVE
    await this.assertAllBrowsersSeeStatus('ROUND_ACTIVE', errors);

    // Inject round-active edge cases
    if (this.opts.edgeCaseEngine) {
      await this.opts.edgeCaseEngine.injectForPhase('round-active', this.browserPool, this.wsClients, gameId, roundIndex);
    }

    // All players submit a guess (with some randomness to simulate real play)
    this.opts.onStep?.('All players submitting guesses...');
    for (let i = 0; i < this.wsClients.length; i++) {
      const client = this.wsClients[i];
      const year = 1900 + Math.floor(Math.random() * 100);
      const lat = -90 + Math.random() * 180;
      const lng = -180 + Math.random() * 360;
      client.submitGuess(roundIndex, year, lat, lng, []);
      // Small delay between submissions
      await new Promise((r) => setTimeout(r, 200));
    }

    // Wait for ROUND_COMPLETE
    this.opts.onStep?.('Waiting for ROUND_COMPLETE...');
    await Promise.all(
      this.wsClients.map((c) => c.waitForState((s) => s.status === 'ROUND_COMPLETE', 30000)),
    );

    // Assert all browsers see ROUND_COMPLETE
    await this.assertAllBrowsersSeeStatus('ROUND_COMPLETE', errors);

    // Inject round-complete edge cases
    if (this.opts.edgeCaseEngine) {
      await this.opts.edgeCaseEngine.injectForPhase('round-complete', this.browserPool, this.wsClients, gameId, roundIndex);
    }

    // All players ready for next round
    this.opts.onStep?.('All players ready for next round...');
    for (const client of this.wsClients) {
      client.readyNext(roundIndex);
    }

    // Wait for a moment before advancing
    await new Promise((r) => setTimeout(r, 1000));

    // Host advances round
    this.opts.onStep?.('Advancing to next round...');
    hostClient.advanceRound(roundIndex, 'PLAYER');
  }

  /**
   * Trigger PLAY_AGAIN: host creates a new game and broadcasts the new gameId.
   */
  private async playAgain(): Promise<void> {
    const host = this.browserPool.host;
    const hostClient = this.wsClients[0];

    // Host creates new game via API
    const baseURL = this.browserPool['baseURL'] as string;
    const createResponse = await host.page.request.post(`${baseURL}/api/compete/create`, {
      data: {
        displayName: host.user.displayName,
        playerId: host.user.id,
        mode: 'compete',
        totalRounds: this.opts.totalRounds,
      },
    });

    if (!createResponse.ok()) {
      throw new Error(`Failed to create new game for play again: ${await createResponse.text()}`);
    }

    const sessionData = await createResponse.json();
    const newGameId = sessionData.gameId || sessionData.id;

    // Host broadcasts PLAY_AGAIN
    hostClient.playAgain(newGameId);

    // Wait for PLAY_AGAIN message on all clients
    await Promise.all(
      this.wsClients.map((c) =>
        new Promise<void>((resolve) => {
          const handler = (msg: any) => {
            if (msg.type === 'PLAY_AGAIN' && msg.newGameId === newGameId) {
              resolve();
            }
          };
          // Attach a temporary handler
          // (In a real implementation, we'd add a onPlayAgain callback to the client)
          // For now, just wait a fixed time
          setTimeout(resolve, 2000);
        }),
      ),
    );

    // Navigate all browsers to the new game
    await Promise.all(this.browserPool.all.map((p) => this.browserPool.navigateToGame(p, newGameId)));
  }

  /**
   * Assert that all browsers see a specific status.
   */
  private async assertAllBrowsersSeeStatus(expected: SnapshotStatus, errors: string[]): Promise<void> {
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
