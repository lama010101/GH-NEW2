import { Browser, BrowserContext, Page } from '@playwright/test';
import { TestUser } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';

export type DeviceProfile = 'desktop-chrome' | 'iphone-safari';

export interface PlayerBrowser {
  user: TestUser;
  context: BrowserContext;
  page: Page;
  device: DeviceProfile;
  index: number;
}

export interface BrowserPoolOptions {
  baseURL: string;
  users: TestUser[];
  headed?: boolean;
  /** Override the default device split (3 desktop + 3 mobile). */
  deviceAssignments?: DeviceProfile[];
}

const DEFAULT_DEVICES: DeviceProfile[] = [
  'desktop-chrome',
  'desktop-chrome',
  'desktop-chrome',
  'iphone-safari',
  'iphone-safari',
  'iphone-safari',
];

const DEVICE_PRESETS: Record<DeviceProfile, {
  userAgent?: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}> = {
  'desktop-chrome': {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  'iphone-safari': {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

/**
 * Manages a pool of 6 browser contexts, each logged in as a different test
 * user with a mix of Chromium desktop and WebKit mobile profiles.
 */
export class BrowserPool {
  private players: PlayerBrowser[] = [];
  private readonly opts: BrowserPoolOptions;

  constructor(opts: BrowserPoolOptions) {
    this.opts = opts;
  }

  get baseURL(): string {
    return this.opts.baseURL;
  }

  get count(): number {
    return this.players.length;
  }

  get all(): PlayerBrowser[] {
    return this.players;
  }

  byIndex(i: number): PlayerBrowser {
    const p = this.players[i];
    if (!p) throw new Error(`No player at index ${i}`);
    return p;
  }

  byUserId(userId: string): PlayerBrowser {
    const p = this.players.find((p) => p.user.id === userId);
    if (!p) throw new Error(`No player with userId ${userId}`);
    return p;
  }

  host(): PlayerBrowser {
    return this.players[0];
  }

  /**
   * Launch all browser contexts and log in each user via the AuthModal.
   *
   * Uses the supplied `browser` (Playwright's chromium or webkit). For the
   * mixed-engine setup, the caller should pass a function that returns the
   * right browser engine per device profile.
   */
  async launch(
    getBrowser: (device: DeviceProfile) => Browser,
  ): Promise<void> {
    const assignments = this.opts.deviceAssignments ?? DEFAULT_DEVICES;
    console.log(`[BROWSER_POOL] Launching ${this.opts.users.length} browsers...`);

    for (let i = 0; i < this.opts.users.length; i++) {
      const user = this.opts.users[i];
      const device = assignments[i] ?? 'desktop-chrome';
      const preset = DEVICE_PRESETS[device];
      const browser = getBrowser(device);

      const context = await browser.newContext({
        userAgent: preset.userAgent,
        viewport: preset.viewport,
        deviceScaleFactor: preset.deviceScaleFactor,
        isMobile: preset.isMobile,
        hasTouch: preset.hasTouch,
      });

      const page = await context.newPage();

      // Navigate to the home page first to trigger any auth gate
      await page.goto(this.opts.baseURL, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);

      // Log in via the AuthModal UI
      await ensureLoggedIn(page, user);

      // Wait for identity to be ready (no auth modal visible)
      await page.waitForLoadState('networkidle').catch(() => undefined);

      this.players.push({ user, context, page, device, index: i });
      console.log(`[BROWSER_POOL] Player ${i + 1} (${user.displayName}, ${device}) ready`);
    }

    console.log(`[BROWSER_POOL] All ${this.players.length} browsers launched and authenticated`);
  }

  /**
   * Navigate a player's page to a specific game URL.
   */
  async navigateToGame(player: PlayerBrowser, gameId: string): Promise<void> {
    const url = `${this.opts.baseURL}/compete/${gameId}`;
    await player.page.goto(url, { waitUntil: 'domcontentloaded' });
    await player.page.waitForLoadState('networkidle').catch(() => undefined);
  }

  /**
   * Reload a player's page (simulates a refresh) and re-establish identity.
   */
  async refresh(player: PlayerBrowser): Promise<void> {
    await player.page.reload({ waitUntil: 'domcontentloaded' });
    await player.page.waitForLoadState('networkidle').catch(() => undefined);
    // Identity should be restored from cookies — no re-login needed
    await ensureLoggedIn(player.page, player.user);
  }

  /**
   * Navigate a player away from the game (simulates navigating away) and
   * then back to the same game.
   */
  async navigateAwayAndBack(player: PlayerBrowser, gameId: string): Promise<void> {
    await player.page.goto(this.opts.baseURL, { waitUntil: 'domcontentloaded' });
    await player.page.waitForLoadState('networkidle').catch(() => undefined);
    await player.page.waitForTimeout(500);
    await this.navigateToGame(player, gameId);
  }

  async closeAll(): Promise<void> {
    for (const p of this.players) {
      try {
        await p.context.close();
      } catch {
        // ignore
      }
    }
    this.players = [];
  }
}
