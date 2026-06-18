# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> resume-after-refresh: lobby, round-active, round-complete
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:89:7

# Error details

```
TypeError: Cannot read properties of undefined (reading 'request')
```

# Test source

```ts
  6   | export interface GameOrchestratorOptions {
  7   |   browserPool: BrowserPool;
  8   |   partyKitHost: string;
  9   |   totalRounds: number;
  10  |   totalGames: number;
  11  |   edgeCaseEngine?: EdgeCaseEngine;
  12  |   onStep?: (step: string) => void;
  13  |   onAssertionFailure?: (failures: string[]) => void;
  14  | }
  15  | 
  16  | export interface GameResult {
  17  |   gameId: string;
  18  |   players: string[];
  19  |   rounds: number;
  20  |   completed: boolean;
  21  |   errors: string[];
  22  | }
  23  | 
  24  | /**
  25  |  * Drives the full 3-game lifecycle using WebSocket clients while browsers
  26  |  * observe and assert state.
  27  |  */
  28  | export class GameOrchestrator {
  29  |   private wsClients: CompeteWSClient[] = [];
  30  |   private results: GameResult[] = [];
  31  |   private readonly opts: GameOrchestratorOptions;
  32  | 
  33  |   constructor(opts: GameOrchestratorOptions) {
  34  |     this.opts = opts;
  35  |   }
  36  | 
  37  |   get browserPool(): BrowserPool {
  38  |     return this.opts.browserPool;
  39  |   }
  40  | 
  41  |   get clients(): CompeteWSClient[] {
  42  |     return this.wsClients;
  43  |   }
  44  | 
  45  |   /**
  46  |    * Initialize WebSocket clients for all players.
  47  |    */
  48  |   async initClients(gameId: string): Promise<void> {
  49  |     console.log(`[ORCHESTRATOR] Initializing ${this.browserPool.count} WebSocket clients for game ${gameId}...`);
  50  |     this.wsClients = [];
  51  | 
  52  |     for (const player of this.browserPool.all) {
  53  |       const client = new CompeteWSClient({
  54  |         partyKitHost: this.opts.partyKitHost,
  55  |         gameId,
  56  |         user: player.user,
  57  |         displayName: player.user.displayName,
  58  |         onStateUpdate: (snapshot) => {
  59  |           console.log(`[WS:${player.user.displayName}] State update: ${snapshot.status} round=${snapshot.currentRoundIndex}`);
  60  |         },
  61  |         onError: (msg) => {
  62  |           console.error(`[WS:${player.user.displayName}] Error: ${msg}`);
  63  |         },
  64  |       });
  65  |       this.wsClients.push(client);
  66  |     }
  67  | 
  68  |     // Connect all clients in parallel
  69  |     await Promise.all(this.wsClients.map((c) => c.connect()));
  70  |     console.log('[ORCHESTRATOR] All WebSocket clients connected');
  71  |   }
  72  | 
  73  |   /**
  74  |    * Run the full 3-game sequence.
  75  |    */
  76  |   async run(): Promise<GameResult[]> {
  77  |     console.log(`[ORCHESTRATOR] Starting ${this.opts.totalGames} games of ${this.opts.totalRounds} rounds each...`);
  78  | 
  79  |     for (let gameIndex = 0; gameIndex < this.opts.totalGames; gameIndex++) {
  80  |       this.opts.onStep?.(`Game ${gameIndex + 1}/${this.opts.totalGames}`);
  81  |       const result = await this.runGame(gameIndex);
  82  |       this.results.push(result);
  83  | 
  84  |       if (gameIndex < this.opts.totalGames - 1) {
  85  |         // Play again
  86  |         this.opts.onStep?.('Starting next game via PLAY_AGAIN...');
  87  |         await this.playAgain();
  88  |       }
  89  |     }
  90  | 
  91  |     console.log('[ORCHESTRATOR] All games completed');
  92  |     return this.results;
  93  |   }
  94  | 
  95  |   /**
  96  |    * Run a single game from creation to session complete.
  97  |    */
  98  |   private async runGame(gameIndex: number): Promise<GameResult> {
  99  |     const errors: string[] = [];
  100 |     const host = this.browserPool.host;
  101 |     const hostClient = this.wsClients[0];
  102 | 
  103 |     // Create game via API (host)
  104 |     this.opts.onStep?.('Creating game via API...');
  105 |     const baseURL = this.browserPool['baseURL'] as string;
> 106 |     const createResponse = await host.page.request.post(`${baseURL}/api/compete/create`, {
      |                                            ^ TypeError: Cannot read properties of undefined (reading 'request')
  107 |       data: {
  108 |         displayName: host.user.displayName,
  109 |         playerId: host.user.id,
  110 |         mode: 'compete',
  111 |         totalRounds: this.opts.totalRounds,
  112 |       },
  113 |     });
  114 | 
  115 |     if (!createResponse.ok()) {
  116 |       const text = await createResponse.text();
  117 |       throw new Error(`Failed to create game: ${text}`);
  118 |     }
  119 | 
  120 |     const sessionData = await createResponse.json();
  121 |     const gameId = sessionData.gameId || sessionData.id;
  122 |     console.log(`[ORCHESTRATOR] Game ${gameIndex + 1} created: ${gameId}`);
  123 | 
  124 |     // Navigate all browsers to the game
  125 |     this.opts.onStep?.('Navigating all browsers to game...');
  126 |     await Promise.all(this.browserPool.all.map((p) => this.browserPool.navigateToGame(p, gameId)));
  127 | 
  128 |     // Initialize WebSocket clients for this game
  129 |     await this.initClients(gameId);
  130 | 
  131 |     // Wait for LOBBY state on all clients
  132 |     this.opts.onStep?.('Waiting for LOBBY state...');
  133 |     await Promise.all(
  134 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'LOBBY', 15000)),
  135 |     );
  136 | 
  137 |     // Assert all browsers see LOBBY
  138 |     await this.assertAllBrowsersSeeStatus('LOBBY', errors);
  139 | 
  140 |     // Inject lobby edge cases
  141 |     if (this.opts.edgeCaseEngine) {
  142 |       await this.opts.edgeCaseEngine.injectForPhase('lobby', this.browserPool, this.wsClients, gameId, 0);
  143 |     }
  144 | 
  145 |     // All players ready
  146 |     this.opts.onStep?.('All players marking ready...');
  147 |     for (const client of this.wsClients) {
  148 |       client.toggleReady(true);
  149 |     }
  150 | 
  151 |     // Wait for allPlayersReady
  152 |     this.opts.onStep?.('Waiting for all players ready...');
  153 |     await hostClient.waitForState((s) => s.allPlayersReady && s.players.length === 6, 15000);
  154 | 
  155 |     // Host starts game (or auto-start)
  156 |     this.opts.onStep?.('Starting game...');
  157 |     hostClient.startGame();
  158 | 
  159 |     // Wait for ROUND_ACTIVE
  160 |     this.opts.onStep?.('Waiting for ROUND_ACTIVE...');
  161 |     await Promise.all(
  162 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'ROUND_ACTIVE', 20000)),
  163 |     );
  164 | 
  165 |     // Play all rounds
  166 |     for (let roundIndex = 0; roundIndex < this.opts.totalRounds; roundIndex++) {
  167 |       this.opts.onStep?.(`Round ${roundIndex + 1}/${this.opts.totalRounds}`);
  168 |       await this.runRound(roundIndex, errors);
  169 |     }
  170 | 
  171 |     // Wait for SESSION_COMPLETE
  172 |     this.opts.onStep?.('Waiting for SESSION_COMPLETE...');
  173 |     await Promise.all(
  174 |       this.wsClients.map((c) => c.waitForState((s) => s.status === 'SESSION_COMPLETE', 30000)),
  175 |     );
  176 | 
  177 |     // Assert all browsers see SESSION_COMPLETE
  178 |     await this.assertAllBrowsersSeeStatus('SESSION_COMPLETE', errors);
  179 | 
  180 |     // Close WebSocket clients
  181 |     this.opts.onStep?.('Closing WebSocket clients...');
  182 |     for (const client of this.wsClients) {
  183 |       client.close();
  184 |     }
  185 |     this.wsClients = [];
  186 | 
  187 |     return {
  188 |       gameId,
  189 |       players: this.browserPool.all.map((p) => p.user.id),
  190 |       rounds: this.opts.totalRounds,
  191 |       completed: errors.length === 0,
  192 |       errors,
  193 |     };
  194 |   }
  195 | 
  196 |   /**
  197 |    * Run a single round from ROUND_ACTIVE to ROUND_COMPLETE.
  198 |    */
  199 |   private async runRound(roundIndex: number, errors: string[]): Promise<void> {
  200 |     const hostClient = this.wsClients[0];
  201 | 
  202 |     // Assert all browsers see ROUND_ACTIVE
  203 |     await this.assertAllBrowsersSeeStatus('ROUND_ACTIVE', errors);
  204 | 
  205 |     // Inject round-active edge cases
  206 |     if (this.opts.edgeCaseEngine) {
```