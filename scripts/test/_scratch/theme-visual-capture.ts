import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local and expand any unexpanded variable references before the
// test fixtures try to read them.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const EXPANSIONS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'SUPABASE_URL',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'SUPABASE_PUBLISHABLE_KEY',
};

for (const [key, sourceKey] of Object.entries(EXPANSIONS)) {
  const val = process.env[key];
  if (val && val.includes('${')) {
    const source = process.env[sourceKey];
    if (source) process.env[key] = source;
  }
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const PARTY_HOST = process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'scripts/test/_scratch/theme-screenshots');

const VIEWPORT = { width: 1280, height: 800 };

type TestUser = {
  id: string;
  email: string;
  password: string;
  displayName: string;
};

async function main() {
  const { chromium } = await import('@playwright/test');
  const authModule: any = await import('../playwright/fixtures/auth');
  const { TEST_USERS, fetchAccessToken, globalSetup, globalTeardown } = authModule;
  const { ensureLoggedIn } = await import('../playwright/helpers/auth-ui');
  const { submitGuessViaUI } = await import('../playwright/helpers/compete-ui');
  const { CompeteWSClient }: any = await import('../playwright/orchestrator/websocketClient');

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Ensure test users exist and have ids before trying to log in.
  await globalSetup();

  for (const theme of ['light', 'dark'] as const) {
    console.log(`[THEME] ======== ${theme.toUpperCase()} theme capture ========`);
    const browser = await chromium.launch({ headless: true });

    try {
      const hostUser: TestUser = TEST_USERS[0];
      const guestUser: TestUser = TEST_USERS[1];

      async function preparePlayer(user: TestUser, label: string) {
        const context = await browser.newContext({
          viewport: VIEWPORT,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
        });

        // Deterministic theme force: cookie for SSR + localStorage for the
        // client anti-FOUC script. Both keys are "gh_theme" per src/lib/theme.ts.
        await context.addCookies([
          {
            name: 'gh_theme',
            value: theme,
            domain: 'localhost',
            path: '/',
            sameSite: 'Lax',
          },
        ]);
        await context.addInitScript((t: string) => {
          try {
            localStorage.setItem('gh_theme', t);
          } catch {}
        }, theme);

        const page = await context.newPage();
        await page.goto(`${BASE_URL}/login`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        });
        await ensureLoggedIn(page, user);
        return { context, page };
      }

      const { page: hostPage, context: hostContext } = await preparePlayer(hostUser, 'host');
      const { page: guestPage, context: guestContext } = await preparePlayer(guestUser, 'guest');

      // Create the sync compete room as host.
      const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
        data: {
          displayName: hostUser.displayName,
          playerId: hostUser.id,
          mode: 'sync',
          totalRounds: 1,
          roundTimerSec: 120,
          yearMin: 1500,
          yearMax: 2024,
          resultsAutoAdvanceSec: 60,
          selectedRegions: [],
        },
      });
      if (!createRes.ok()) {
        throw new Error(`Create game failed: ${createRes.status()} ${await createRes.text()}`);
      }
      const sessionData = await createRes.json();
      const gameId = sessionData.gameId || sessionData.id;
      console.log(`[THEME:${theme}] Created game ${gameId}`);

      // Helper to build a read-only WS observer for a player.
      async function createWS(user: TestUser) {
        const accessToken = await fetchAccessToken(user);
        return new CompeteWSClient({
          partyKitHost: PARTY_HOST,
          gameId,
          user,
          displayName: user.displayName,
          accessToken,
          onStateUpdate: (s: any) => {
            console.log(`[WS:${user.displayName}] state=${s.status} round=${s.currentRoundIndex}`);
          },
          onError: (msg: string) => {
            console.error(`[WS:${user.displayName}] ERROR ${msg}`);
          },
        });
      }

      // Navigate both players to the room.
      await Promise.all([
        hostPage.goto(`${BASE_URL}/compete/${gameId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        }),
        guestPage.goto(`${BASE_URL}/compete/${gameId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        }),
      ]);

      const hostWS = await createWS(hostUser);
      const guestWS = await createWS(guestUser);
      await Promise.all([hostWS.connect(), guestWS.connect()]);

      // LOBBY
      await Promise.all([
        hostWS.waitForState((s: any) => s.status === 'LOBBY', 60000),
        guestWS.waitForState((s: any) => s.status === 'LOBBY', 60000),
      ]);
      await hostPage.waitForTimeout(800);
      const lobbyPath = path.join(SCREENSHOT_DIR, `${theme}-lobby.png`);
      await hostPage.screenshot({ path: lobbyPath, fullPage: true });
      console.log(`[THEME:${theme}] Screenshot: ${lobbyPath}`);

      // Both ready -> auto-start
      hostWS.toggleReady(true);
      guestWS.toggleReady(true);
      await hostWS.waitForState((s: any) => s.allPlayersReady && s.players.length === 2, 60000);
      hostWS.startGame();

      await Promise.all([
        hostWS.waitForState((s: any) => s.status === 'ROUND_ACTIVE', 60000),
        guestWS.waitForState((s: any) => s.status === 'ROUND_ACTIVE', 60000),
      ]);
      await hostPage.getByTestId('round-image-container').first().waitFor({
        state: 'visible',
        timeout: 30000,
      });
      await hostPage.waitForTimeout(800);
      const activePath = path.join(SCREENSHOT_DIR, `${theme}-round-active.png`);
      await hostPage.screenshot({ path: activePath, fullPage: true });
      console.log(`[THEME:${theme}] Screenshot: ${activePath}`);

      // Submit guesses via UI on both browsers.
      await Promise.all([
        submitGuessViaUI(hostPage, { year: 1950, lat: 0, lng: 0 }),
        submitGuessViaUI(guestPage, { year: 1960, lat: 0, lng: 0 }),
      ]);
      await Promise.all([hostWS.waitForSubmissionAck(60000), guestWS.waitForSubmissionAck(60000)]);

      await Promise.all([
        hostWS.waitForState((s: any) => s.status === 'ROUND_COMPLETE', 60000),
        guestWS.waitForState((s: any) => s.status === 'ROUND_COMPLETE', 60000),
      ]);
      await hostPage.waitForTimeout(800);
      const completePath = path.join(SCREENSHOT_DIR, `${theme}-round-complete.png`);
      await hostPage.screenshot({ path: completePath, fullPage: true });
      console.log(`[THEME:${theme}] Screenshot: ${completePath}`);

      hostWS.close();
      guestWS.close();
      await hostContext.close();
      await guestContext.close();
    } finally {
      await browser.close();
    }
  }

  console.log('[THEME] All captures complete');

  // Clean up test users created by globalSetup.
  await globalTeardown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
