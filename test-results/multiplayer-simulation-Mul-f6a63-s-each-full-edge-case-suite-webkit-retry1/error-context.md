# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> 6 players, 3 games, 5 rounds each, full edge-case suite
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:16:7

# Error details

```
Error: Failed to create game: {"error":"timeout exceeded when trying to connect"}
```

# Test source

```ts
  50  |   }
  51  | 
  52  |   get browserPool(): BrowserPool {
  53  |     return this.opts.browserPool;
  54  |   }
  55  | 
  56  |   get clients(): CompeteWSClient[] {
  57  |     return this.wsClients;
  58  |   }
  59  | 
  60  |   /**
  61  |    * Initialize WebSocket clients for all players.
  62  |    */
  63  |   async initClients(gameId: string): Promise<void> {
  64  |     console.log(`[ORCHESTRATOR] Initializing ${this.browserPool.count} WebSocket clients for game ${gameId}...`);
  65  |     this.wsClients = [];
  66  | 
  67  |     for (const player of this.browserPool.all) {
  68  |       // Fetch Supabase access token for PartyKit WS auth (onBeforeConnect
  69  |       // requires ?token=<access_token> — without it the server returns 401).
  70  |       let accessToken: string | undefined;
  71  |       try {
  72  |         accessToken = await fetchAccessToken(player.user);
  73  |       } catch (err) {
  74  |         console.error(`[ORCHESTRATOR] Failed to fetch access token for ${player.user.email}:`, err instanceof Error ? err.message : err);
  75  |       }
  76  |       const client = new CompeteWSClient({
  77  |         partyKitHost: this.opts.partyKitHost,
  78  |         gameId,
  79  |         user: player.user,
  80  |         displayName: player.user.displayName,
  81  |         accessToken,
  82  |         onStateUpdate: (snapshot) => {
  83  |           console.log(`[WS:${player.user.displayName}] ts=${Date.now()} State update: ${snapshot.status} round=${snapshot.currentRoundIndex}`);
  84  |         },
  85  |         onError: (msg) => {
  86  |           console.error(`[WS:${player.user.displayName}] Error: ${msg}`);
  87  |         },
  88  |         onPlayAgain: (newGameId: string) => {
  89  |           console.log(`[WS:${player.user.displayName}] PLAY_AGAIN received: newGameId=${newGameId}`);
  90  |           const resolver = this.playAgainWaiters.get(player.user.id);
  91  |           if (resolver) resolver(newGameId);
  92  |         },
  93  |       });
  94  |       this.wsClients.push(client);
  95  |     }
  96  | 
  97  |     // Connect all clients in parallel
  98  |     await Promise.all(this.wsClients.map((c) => c.connect()));
  99  |     console.log('[ORCHESTRATOR] All WebSocket clients connected');
  100 |   }
  101 | 
  102 |   /**
  103 |    * Run the full 3-game sequence.
  104 |    */
  105 |   async run(): Promise<GameResult[]> {
  106 |     console.log(`[ORCHESTRATOR] Starting ${this.opts.totalGames} games of ${this.opts.totalRounds} rounds each...`);
  107 | 
  108 |     for (let gameIndex = 0; gameIndex < this.opts.totalGames; gameIndex++) {
  109 |       this.opts.onStep?.(`Game ${gameIndex + 1}/${this.opts.totalGames}`);
  110 |       const result = await this.runGame(gameIndex);
  111 |       this.results.push(result);
  112 | 
  113 |       if (gameIndex < this.opts.totalGames - 1) {
  114 |         // Play again
  115 |         this.opts.onStep?.('Starting next game via PLAY_AGAIN...');
  116 |         await this.playAgain();
  117 |       }
  118 |     }
  119 | 
  120 |     console.log('[ORCHESTRATOR] All games completed');
  121 |     return this.results;
  122 |   }
  123 | 
  124 |   /**
  125 |    * Run a single game from creation to session complete.
  126 |    */
  127 |   private async runGame(gameIndex: number): Promise<GameResult> {
  128 |     const errors: string[] = [];
  129 |     const host = this.browserPool.host();
  130 | 
  131 |     // Reset edge case engine for each new game so edge cases run across
  132 |     // all 3 games, not just game 1. (H15 fix)
  133 |     this.opts.edgeCaseEngine?.resetForNewGame();
  134 | 
  135 |     // Create game via API (host)
  136 |     this.opts.onStep?.('Creating game via API...');
  137 |     const baseURL = this.browserPool['baseURL'] as string;
  138 |     const createResponse = await host.page.request.post(`${baseURL}/api/compete/create`, {
  139 |       data: {
  140 |         displayName: host.user.displayName,
  141 |         playerId: host.user.id,
  142 |         mode: 'compete',
  143 |         totalRounds: this.opts.totalRounds,
  144 |         roundTimerSec: 120,
  145 |       },
  146 |     });
  147 | 
  148 |     if (!createResponse.ok()) {
  149 |       const text = await createResponse.text();
> 150 |       throw new Error(`Failed to create game: ${text}`);
      |             ^ Error: Failed to create game: {"error":"timeout exceeded when trying to connect"}
  151 |     }
  152 | 
  153 |     const sessionData = await createResponse.json();
  154 |     const gameId = sessionData.gameId || sessionData.id;
  155 |     console.log(`[ORCHESTRATOR] Game ${gameIndex + 1} created: ${gameId}`);
  156 | 
  157 |     // Navigate all browsers to the game
  158 |     this.opts.onStep?.('Navigating all browsers to game...');
  159 |     await Promise.all(this.browserPool.all.map((p) => this.browserPool.navigateToGame(p, gameId)));
  160 | 
  161 |     // Initialize WebSocket clients for this game
  162 |     await this.initClients(gameId);
  163 |     const hostClient = this.wsClients[0];
  164 | 
  165 |     // Wait for LOBBY state on all clients
  166 |     this.opts.onStep?.('Waiting for LOBBY state...');
  167 |     await Promise.all(
  168 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'LOBBY', 60000)),
  169 |     );
  170 | 
  171 |     // Set a short results auto-advance (10s) so the only-one-next edge case
  172 |     // (where only 1 of 6 players sends READY_NEXT) doesn't wait the default
  173 |     // 90 seconds for the result timer. This keeps the test within the 30min
  174 |     // timeout while still exercising the result-timer auto-advance path.
  175 |     hostClient.setResultsTimer(30);
  176 | 
  177 |     // Assert all browsers see LOBBY
  178 |     await this.assertAllBrowsersSeeStatus('LOBBY', errors);
  179 | 
  180 |     // Inject lobby edge cases
  181 |     if (this.opts.edgeCaseEngine) {
  182 |       await this.opts.edgeCaseEngine.injectForPhase('lobby', this.browserPool, this.wsClients, gameId, 0, this);
  183 |     }
  184 | 
  185 |     // All players ready
  186 |     this.opts.onStep?.('All players marking ready...');
  187 |     for (const client of this.wsClients) {
  188 |       client.toggleReady(true);
  189 |     }
  190 | 
  191 |     // Wait for allPlayersReady (extended timeout: edge cases may trigger WS reconnects)
  192 |     this.opts.onStep?.('Waiting for all players ready...');
  193 |     await hostClient.waitForState((s) => s.allPlayersReady && s.players.length === this.wsClients.length, 60000);
  194 | 
  195 |     // Host starts game (or auto-start)
  196 |     this.opts.onStep?.('Starting game...');
  197 |     hostClient.startGame();
  198 | 
  199 |     // Wait for ROUND_ACTIVE
  200 |     this.opts.onStep?.('Waiting for ROUND_ACTIVE...');
  201 |     await Promise.all(
  202 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'ROUND_ACTIVE', 60000)),
  203 |     );
  204 | 
  205 |     // Play all rounds
  206 |     for (let roundIndex = 0; roundIndex < this.opts.totalRounds; roundIndex++) {
  207 |       this.opts.onStep?.(`Round ${roundIndex + 1}/${this.opts.totalRounds}`);
  208 |       await this.runRound(gameId, roundIndex, errors);
  209 |     }
  210 | 
  211 |     // Wait for SESSION_COMPLETE
  212 |     this.opts.onStep?.('Waiting for SESSION_COMPLETE...');
  213 |     await Promise.all(
  214 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'SESSION_COMPLETE', 120000)),
  215 |     );
  216 | 
  217 |     // Assert all browsers see SESSION_COMPLETE
  218 |     await this.assertAllBrowsersSeeStatus('SESSION_COMPLETE', errors);
  219 | 
  220 |     // Close WebSocket clients
  221 |     this.opts.onStep?.('Closing WebSocket clients...');
  222 |     for (const client of this.wsClients) {
  223 |       client.close();
  224 |     }
  225 |     this.wsClients = [];
  226 | 
  227 |     return {
  228 |       gameId,
  229 |       players: this.browserPool.all.map((p) => p.user.id),
  230 |       rounds: this.opts.totalRounds,
  231 |       completed: errors.length === 0,
  232 |       errors,
  233 |     };
  234 |   }
  235 | 
  236 |   /**
  237 |    * Run a single round from ROUND_ACTIVE to ROUND_COMPLETE.
  238 |    */
  239 |   private async runRound(gameId: string, roundIndex: number, errors: string[]): Promise<void> {
  240 |     const hostClient = this.wsClients[0];
  241 | 
  242 |     // Clear any skip-submission flags from prior rounds
  243 |     this.skipSubmissionPlayerIds.clear();
  244 |     // Clear any skip-ready-next flags from prior rounds
  245 |     this.skipReadyNextPlayerIds.clear();
  246 | 
  247 |     // Assert all browsers see ROUND_ACTIVE
  248 |     await this.assertAllBrowsersSeeStatus('ROUND_ACTIVE', errors);
  249 | 
  250 |     // Inject round-active edge cases
```