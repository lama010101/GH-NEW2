# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> resume-after-refresh: lobby, round-active, round-complete
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:95:7

# Error details

```
Error: Failed to create game: {"error":"timeout exceeded when trying to connect"}
```

# Test source

```ts
  49  |   }
  50  | 
  51  |   get browserPool(): BrowserPool {
  52  |     return this.opts.browserPool;
  53  |   }
  54  | 
  55  |   get clients(): CompeteWSClient[] {
  56  |     return this.wsClients;
  57  |   }
  58  | 
  59  |   /**
  60  |    * Initialize WebSocket clients for all players.
  61  |    */
  62  |   async initClients(gameId: string): Promise<void> {
  63  |     console.log(`[ORCHESTRATOR] Initializing ${this.browserPool.count} WebSocket clients for game ${gameId}...`);
  64  |     this.wsClients = [];
  65  | 
  66  |     for (const player of this.browserPool.all) {
  67  |       // Fetch Supabase access token for PartyKit WS auth (onBeforeConnect
  68  |       // requires ?token=<access_token> — without it the server returns 401).
  69  |       let accessToken: string | undefined;
  70  |       try {
  71  |         accessToken = await fetchAccessToken(player.user);
  72  |       } catch (err) {
  73  |         console.error(`[ORCHESTRATOR] Failed to fetch access token for ${player.user.email}:`, err instanceof Error ? err.message : err);
  74  |       }
  75  |       const client = new CompeteWSClient({
  76  |         partyKitHost: this.opts.partyKitHost,
  77  |         gameId,
  78  |         user: player.user,
  79  |         displayName: player.user.displayName,
  80  |         accessToken,
  81  |         onStateUpdate: (snapshot) => {
  82  |           console.log(`[WS:${player.user.displayName}] ts=${Date.now()} State update: ${snapshot.status} round=${snapshot.currentRoundIndex}`);
  83  |         },
  84  |         onError: (msg) => {
  85  |           console.error(`[WS:${player.user.displayName}] Error: ${msg}`);
  86  |         },
  87  |         onPlayAgain: (newGameId: string) => {
  88  |           console.log(`[WS:${player.user.displayName}] PLAY_AGAIN received: newGameId=${newGameId}`);
  89  |           const resolver = this.playAgainWaiters.get(player.user.id);
  90  |           if (resolver) resolver(newGameId);
  91  |         },
  92  |       });
  93  |       this.wsClients.push(client);
  94  |     }
  95  | 
  96  |     // Connect all clients in parallel
  97  |     await Promise.all(this.wsClients.map((c) => c.connect()));
  98  |     console.log('[ORCHESTRATOR] All WebSocket clients connected');
  99  |   }
  100 | 
  101 |   /**
  102 |    * Run the full 3-game sequence.
  103 |    */
  104 |   async run(): Promise<GameResult[]> {
  105 |     console.log(`[ORCHESTRATOR] Starting ${this.opts.totalGames} games of ${this.opts.totalRounds} rounds each...`);
  106 | 
  107 |     for (let gameIndex = 0; gameIndex < this.opts.totalGames; gameIndex++) {
  108 |       this.opts.onStep?.(`Game ${gameIndex + 1}/${this.opts.totalGames}`);
  109 |       const result = await this.runGame(gameIndex);
  110 |       this.results.push(result);
  111 | 
  112 |       if (gameIndex < this.opts.totalGames - 1) {
  113 |         // Play again
  114 |         this.opts.onStep?.('Starting next game via PLAY_AGAIN...');
  115 |         await this.playAgain();
  116 |       }
  117 |     }
  118 | 
  119 |     console.log('[ORCHESTRATOR] All games completed');
  120 |     return this.results;
  121 |   }
  122 | 
  123 |   /**
  124 |    * Run a single game from creation to session complete.
  125 |    */
  126 |   private async runGame(gameIndex: number): Promise<GameResult> {
  127 |     const errors: string[] = [];
  128 |     const host = this.browserPool.host();
  129 | 
  130 |     // Reset edge case engine for each new game so edge cases run across
  131 |     // all 3 games, not just game 1. (H15 fix)
  132 |     this.opts.edgeCaseEngine?.resetForNewGame();
  133 | 
  134 |     // Create game via API (host)
  135 |     this.opts.onStep?.('Creating game via API...');
  136 |     const baseURL = this.browserPool['baseURL'] as string;
  137 |     const createResponse = await host.page.request.post(`${baseURL}/api/compete/create`, {
  138 |       data: {
  139 |         displayName: host.user.displayName,
  140 |         playerId: host.user.id,
  141 |         mode: 'compete',
  142 |         totalRounds: this.opts.totalRounds,
  143 |         roundTimerSec: 60,
  144 |       },
  145 |     });
  146 | 
  147 |     if (!createResponse.ok()) {
  148 |       const text = await createResponse.text();
> 149 |       throw new Error(`Failed to create game: ${text}`);
      |             ^ Error: Failed to create game: {"error":"timeout exceeded when trying to connect"}
  150 |     }
  151 | 
  152 |     const sessionData = await createResponse.json();
  153 |     const gameId = sessionData.gameId || sessionData.id;
  154 |     console.log(`[ORCHESTRATOR] Game ${gameIndex + 1} created: ${gameId}`);
  155 | 
  156 |     // Navigate all browsers to the game
  157 |     this.opts.onStep?.('Navigating all browsers to game...');
  158 |     await Promise.all(this.browserPool.all.map((p) => this.browserPool.navigateToGame(p, gameId)));
  159 | 
  160 |     // Initialize WebSocket clients for this game
  161 |     await this.initClients(gameId);
  162 |     const hostClient = this.wsClients[0];
  163 | 
  164 |     // Wait for LOBBY state on all clients
  165 |     this.opts.onStep?.('Waiting for LOBBY state...');
  166 |     await Promise.all(
  167 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'LOBBY', 60000)),
  168 |     );
  169 | 
  170 |     // Set a short results auto-advance (10s) so the only-one-next edge case
  171 |     // (where only 1 of 6 players sends READY_NEXT) doesn't wait the default
  172 |     // 90 seconds for the result timer. This keeps the test within the 30min
  173 |     // timeout while still exercising the result-timer auto-advance path.
  174 |     hostClient.setResultsTimer(10);
  175 | 
  176 |     // Assert all browsers see LOBBY
  177 |     await this.assertAllBrowsersSeeStatus('LOBBY', errors);
  178 | 
  179 |     // Inject lobby edge cases
  180 |     if (this.opts.edgeCaseEngine) {
  181 |       await this.opts.edgeCaseEngine.injectForPhase('lobby', this.browserPool, this.wsClients, gameId, 0, this);
  182 |     }
  183 | 
  184 |     // All players ready
  185 |     this.opts.onStep?.('All players marking ready...');
  186 |     for (const client of this.wsClients) {
  187 |       client.toggleReady(true);
  188 |     }
  189 | 
  190 |     // Wait for allPlayersReady (extended timeout: edge cases may trigger WS reconnects)
  191 |     this.opts.onStep?.('Waiting for all players ready...');
  192 |     await hostClient.waitForState((s) => s.allPlayersReady && s.players.length === this.wsClients.length, 60000);
  193 | 
  194 |     // Host starts game (or auto-start)
  195 |     this.opts.onStep?.('Starting game...');
  196 |     hostClient.startGame();
  197 | 
  198 |     // Wait for ROUND_ACTIVE
  199 |     this.opts.onStep?.('Waiting for ROUND_ACTIVE...');
  200 |     await Promise.all(
  201 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'ROUND_ACTIVE', 60000)),
  202 |     );
  203 | 
  204 |     // Play all rounds
  205 |     for (let roundIndex = 0; roundIndex < this.opts.totalRounds; roundIndex++) {
  206 |       this.opts.onStep?.(`Round ${roundIndex + 1}/${this.opts.totalRounds}`);
  207 |       await this.runRound(gameId, roundIndex, errors);
  208 |     }
  209 | 
  210 |     // Wait for SESSION_COMPLETE
  211 |     this.opts.onStep?.('Waiting for SESSION_COMPLETE...');
  212 |     await Promise.all(
  213 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'SESSION_COMPLETE', 120000)),
  214 |     );
  215 | 
  216 |     // Assert all browsers see SESSION_COMPLETE
  217 |     await this.assertAllBrowsersSeeStatus('SESSION_COMPLETE', errors);
  218 | 
  219 |     // Close WebSocket clients
  220 |     this.opts.onStep?.('Closing WebSocket clients...');
  221 |     for (const client of this.wsClients) {
  222 |       client.close();
  223 |     }
  224 |     this.wsClients = [];
  225 | 
  226 |     return {
  227 |       gameId,
  228 |       players: this.browserPool.all.map((p) => p.user.id),
  229 |       rounds: this.opts.totalRounds,
  230 |       completed: errors.length === 0,
  231 |       errors,
  232 |     };
  233 |   }
  234 | 
  235 |   /**
  236 |    * Run a single round from ROUND_ACTIVE to ROUND_COMPLETE.
  237 |    */
  238 |   private async runRound(gameId: string, roundIndex: number, errors: string[]): Promise<void> {
  239 |     const hostClient = this.wsClients[0];
  240 | 
  241 |     // Clear any skip-submission flags from prior rounds
  242 |     this.skipSubmissionPlayerIds.clear();
  243 |     // Clear any skip-ready-next flags from prior rounds
  244 |     this.skipReadyNextPlayerIds.clear();
  245 | 
  246 |     // Assert all browsers see ROUND_ACTIVE
  247 |     await this.assertAllBrowsersSeeStatus('ROUND_ACTIVE', errors);
  248 | 
  249 |     // Inject round-active edge cases
```