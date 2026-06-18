# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> 6 players, 3 games, 5 rounds each, full edge-case suite
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:30:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: browser.newContext: Target page, context or browser has been closed
```

# Test source

```ts
  14  | 
  15  | export interface BrowserPoolOptions {
  16  |   baseURL: string;
  17  |   users: TestUser[];
  18  |   headed?: boolean;
  19  |   /** Override the default device split (3 desktop + 3 mobile). */
  20  |   deviceAssignments?: DeviceProfile[];
  21  | }
  22  | 
  23  | const DEFAULT_DEVICES: DeviceProfile[] = [
  24  |   'desktop-chrome',
  25  |   'desktop-chrome',
  26  |   'desktop-chrome',
  27  |   'iphone-safari',
  28  |   'iphone-safari',
  29  |   'iphone-safari',
  30  | ];
  31  | 
  32  | const DEVICE_PRESETS: Record<DeviceProfile, {
  33  |   userAgent?: string;
  34  |   viewport: { width: number; height: number };
  35  |   deviceScaleFactor: number;
  36  |   isMobile: boolean;
  37  |   hasTouch: boolean;
  38  | }> = {
  39  |   'desktop-chrome': {
  40  |     viewport: { width: 1280, height: 800 },
  41  |     deviceScaleFactor: 1,
  42  |     isMobile: false,
  43  |     hasTouch: false,
  44  |   },
  45  |   'iphone-safari': {
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
> 114 |       const context = await browser.newContext({
      |                       ^ Error: browser.newContext: Target page, context or browser has been closed
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
  126 |       await page.waitForLoadState('networkidle').catch(() => undefined);
  127 | 
  128 |       // Log in via the AuthModal UI
  129 |       await ensureLoggedIn(page, user);
  130 | 
  131 |       // Wait for identity to be ready (no auth modal visible)
  132 |       await page.waitForLoadState('networkidle').catch(() => undefined);
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
  146 |     await player.page.goto(url, { waitUntil: 'domcontentloaded' });
  147 |     await player.page.waitForLoadState('networkidle').catch(() => undefined);
  148 |   }
  149 | 
  150 |   /**
  151 |    * Reload a player's page (simulates a refresh) and re-establish identity.
  152 |    */
  153 |   async refresh(player: PlayerBrowser): Promise<void> {
  154 |     await player.page.reload({ waitUntil: 'domcontentloaded' });
  155 |     await player.page.waitForLoadState('networkidle').catch(() => undefined);
  156 |     // Identity should be restored from cookies — no re-login needed
  157 |     await ensureLoggedIn(player.page, player.user);
  158 |   }
  159 | 
  160 |   /**
  161 |    * Navigate a player away from the game (simulates navigating away) and
  162 |    * then back to the same game.
  163 |    */
  164 |   async navigateAwayAndBack(player: PlayerBrowser, gameId: string): Promise<void> {
  165 |     await player.page.goto(this.opts.baseURL, { waitUntil: 'domcontentloaded' });
  166 |     await player.page.waitForLoadState('networkidle').catch(() => undefined);
  167 |     await player.page.waitForTimeout(500);
  168 |     await this.navigateToGame(player, gameId);
  169 |   }
  170 | 
  171 |   async closeAll(): Promise<void> {
  172 |     for (const p of this.players) {
  173 |       try {
  174 |         await p.context.close();
  175 |       } catch {
  176 |         // ignore
  177 |       }
  178 |     }
  179 |     this.players = [];
  180 |   }
  181 | }
  182 | 
```