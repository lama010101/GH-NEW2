# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> 6 players, 3 games, 5 rounds each, full edge-case suite
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:16:7

# Error details

```
Error: page.goto: Navigation to "http://localhost:3000/compete/858cc0ec-24d2-4a3c-97ae-875a32b03947" is interrupted by another navigation to "http://localhost:3000/"
Call log:
  - navigating to "http://localhost:3000/compete/858cc0ec-24d2-4a3c-97ae-875a32b03947", waiting until "domcontentloaded"

```

# Test source

```ts
  46  |     userAgent:
  47  |       'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  48  |     viewport: { width: 390, height: 844 },
  49  |     deviceScaleFactor: 3,
  50  |     isMobile: true,
  51  |     hasTouch: true,
  52  |   },
  53  | };
  54  | 
  55  | /**
  56  |  * Manages a pool of 6 browser contexts, each logged in as a different test
  57  |  * user with a mix of Chromium desktop and WebKit mobile profiles.
  58  |  */
  59  | export class BrowserPool {
  60  |   private players: PlayerBrowser[] = [];
  61  |   private readonly opts: BrowserPoolOptions;
  62  | 
  63  |   constructor(opts: BrowserPoolOptions) {
  64  |     this.opts = opts;
  65  |   }
  66  | 
  67  |   get baseURL(): string {
  68  |     return this.opts.baseURL;
  69  |   }
  70  | 
  71  |   get count(): number {
  72  |     return this.players.length;
  73  |   }
  74  | 
  75  |   get all(): PlayerBrowser[] {
  76  |     return this.players;
  77  |   }
  78  | 
  79  |   byIndex(i: number): PlayerBrowser {
  80  |     const p = this.players[i];
  81  |     if (!p) throw new Error(`No player at index ${i}`);
  82  |     return p;
  83  |   }
  84  | 
  85  |   byUserId(userId: string): PlayerBrowser {
  86  |     const p = this.players.find((p) => p.user.id === userId);
  87  |     if (!p) throw new Error(`No player with userId ${userId}`);
  88  |     return p;
  89  |   }
  90  | 
  91  |   host(): PlayerBrowser {
  92  |     return this.players[0];
  93  |   }
  94  | 
  95  |   /**
  96  |    * Launch all browser contexts and log in each user via the AuthModal.
  97  |    *
  98  |    * Uses the supplied `browser` (Playwright's chromium or webkit). For the
  99  |    * mixed-engine setup, the caller should pass a function that returns the
  100 |    * right browser engine per device profile.
  101 |    */
  102 |   async launch(
  103 |     getBrowser: (device: DeviceProfile) => Browser,
  104 |   ): Promise<void> {
  105 |     const assignments = this.opts.deviceAssignments ?? DEFAULT_DEVICES;
  106 |     console.log(`[BROWSER_POOL] Launching ${this.opts.users.length} browsers...`);
  107 | 
  108 |     for (let i = 0; i < this.opts.users.length; i++) {
  109 |       const user = this.opts.users[i];
  110 |       const device = assignments[i] ?? 'desktop-chrome';
  111 |       const preset = DEVICE_PRESETS[device];
  112 |       const browser = getBrowser(device);
  113 | 
  114 |       const context = await browser.newContext({
  115 |         userAgent: preset.userAgent,
  116 |         viewport: preset.viewport,
  117 |         deviceScaleFactor: preset.deviceScaleFactor,
  118 |         isMobile: preset.isMobile,
  119 |         hasTouch: preset.hasTouch,
  120 |       });
  121 | 
  122 |       const page = await context.newPage();
  123 | 
  124 |       // Navigate to the home page first to trigger any auth gate
  125 |       await page.goto(this.opts.baseURL, { waitUntil: 'domcontentloaded' });
  126 |       await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  127 | 
  128 |       // Log in via the AuthModal UI
  129 |       await ensureLoggedIn(page, user);
  130 | 
  131 |       // Wait for identity to be ready (no auth modal visible)
  132 |       await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  133 | 
  134 |       this.players.push({ user, context, page, device, index: i });
  135 |       console.log(`[BROWSER_POOL] Player ${i + 1} (${user.displayName}, ${device}) ready`);
  136 |     }
  137 | 
  138 |     console.log(`[BROWSER_POOL] All ${this.players.length} browsers launched and authenticated`);
  139 |   }
  140 | 
  141 |   /**
  142 |    * Navigate a player's page to a specific game URL.
  143 |    */
  144 |   async navigateToGame(player: PlayerBrowser, gameId: string): Promise<void> {
  145 |     const url = `${this.opts.baseURL}/compete/${gameId}`;
> 146 |     await player.page.goto(url, { waitUntil: 'domcontentloaded' });
      |                       ^ Error: page.goto: Navigation to "http://localhost:3000/compete/858cc0ec-24d2-4a3c-97ae-875a32b03947" is interrupted by another navigation to "http://localhost:3000/"
  147 |     await player.page.waitForLoadState('domcontentloaded').catch(() => undefined);
  148 |   }
  149 | 
  150 |   /**
  151 |    * Reload a player's page (simulates a refresh) and re-establish identity.
  152 |    */
  153 |   async refresh(player: PlayerBrowser): Promise<void> {
  154 |     await player.page.reload({ waitUntil: 'domcontentloaded' });
  155 |     await player.page.waitForLoadState('domcontentloaded').catch((err) => {
  156 |       // If page is closed, surface the error immediately
  157 |       if (player.page.isClosed() || (err instanceof Error && err.message.includes('closed'))) {
  158 |         throw new Error(`refresh() failed: page closed during reload for player ${player.user.email}`);
  159 |       }
  160 |       // Otherwise, it's a benign networkidle timeout — proceed anyway
  161 |     });
  162 |     // Identity should be restored from cookies — no re-login needed
  163 |     await ensureLoggedIn(player.page, player.user);
  164 | 
  165 |     // Explicit liveness check before returning
  166 |     if (player.page.isClosed()) {
  167 |       throw new Error(`refresh() failed: page closed after ensureLoggedIn for player ${player.user.email}`);
  168 |     }
  169 |   }
  170 | 
  171 |   /**
  172 |    * Navigate a player away from the game (simulates navigating away) and
  173 |    * then back to the same game.
  174 |    */
  175 |   async navigateAwayAndBack(player: PlayerBrowser, gameId: string): Promise<void> {
  176 |     await player.page.goto(this.opts.baseURL, { waitUntil: 'domcontentloaded' });
  177 |     await player.page.waitForLoadState('networkidle').catch(() => undefined);
  178 |     await player.page.waitForTimeout(500);
  179 |     await this.navigateToGame(player, gameId);
  180 |   }
  181 | 
  182 |   async closeAll(): Promise<void> {
  183 |     for (const p of this.players) {
  184 |       try {
  185 |         await p.context.close();
  186 |       } catch {
  187 |         // ignore
  188 |       }
  189 |     }
  190 |     this.players = [];
  191 |   }
  192 | }
  193 | 
```