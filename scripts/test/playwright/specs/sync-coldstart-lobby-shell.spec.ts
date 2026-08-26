import { test, expect, chromium } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';
import { authenticatePage, getSession } from '../helpers/auth-cookie';
import { CompeteWSClient, type CompeteSnapshot } from '../orchestrator/websocketClient';

// ─────────────────────────────────────────────────────────────────────
// MP-FIX-COLDSTART-ALLPLAYERSREADY-MISSING-001
// Regression test: cold-start STATE_UPDATE must include allPlayersReady
//
// Root cause: partykit/server.ts onConnect cold-start send spread this.snapshot
// directly without enriching allPlayersReady. The client validator
// (isCompeteSessionSnapshot) hard-rejects any STATE_UPDATE missing the field,
// so the cold-start snapshot was silently discarded and the client hung on
// "Loading game…" until a later JOIN_ROOM broadcast arrived.
//
// This spec creates a fresh sync game, navigates the host to it, and asserts:
//   1. [data-testid="lobby-shell"] renders within 15s (not 60s+)
//   2. The FIRST STATE_UPDATE received by a WS observer includes
//      allPlayersReady as a boolean (deterministic — fails pre-fix, passes
//      post-fix regardless of machine speed)
// ─────────────────────────────────────────────────────────────────────

const PARTYKIT_HOST =
  process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

const DESKTOP_PRESET = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

const NAV_TIMEOUT = 30000;
const LOBBY_SHELL_TIMEOUT = 15000;

test.describe('Sync Cold-Start Lobby Shell Regression', () => {
  test('cold-start STATE_UPDATE includes allPlayersReady — lobby-shell renders within 15s', async () => {
    const errors: string[] = [];
    let firstSnapshot: CompeteSnapshot | null = null;

    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext(DESKTOP_PRESET);
      const page = await ctx.newPage();

      await authenticatePage(page, TEST_USERS[0]);

      // Create a fresh sync game via API
      const createRes = await page.request.post(`${BASE_URL}/api/compete/create`, {
        data: {
          displayName: TEST_USERS[0].displayName,
          playerId: TEST_USERS[0].id,
          mode: 'sync',
          roundTimerSec: 120,
        },
        timeout: NAV_TIMEOUT,
      });
      expect(createRes.ok(), `Create game failed: ${createRes.status()}`).toBeTruthy();
      const sessionData = await createRes.json();
      const gameId = sessionData.gameId || sessionData.id;
      expect(gameId, 'Create game returned no gameId').toBeTruthy();
      console.log(`[COLDSTART-REGRESSION] Game created: ${gameId}`);

      // Attach a WS observer that captures the FIRST STATE_UPDATE.
      // The first STATE_UPDATE is the cold-start snapshot sent by onConnect
      // BEFORE JOIN_ROOM is processed. Pre-fix, this snapshot lacks
      // allPlayersReady; post-fix, it includes it.
      const { accessToken } = await getSession(TEST_USERS[0]);
      const wsClient = new CompeteWSClient({
        partyKitHost: PARTYKIT_HOST,
        gameId,
        user: TEST_USERS[0],
        displayName: TEST_USERS[0].displayName,
        accessToken,
        onStateUpdate: (snapshot) => {
          if (!firstSnapshot) {
            firstSnapshot = snapshot;
            console.log(`[COLDSTART-REGRESSION] First STATE_UPDATE captured: allPlayersReady=${(snapshot as Record<string, unknown>).allPlayersReady}`);
          }
        },
        onError: (msg) => {
          console.error(`[COLDSTART-REGRESSION] WS ERROR: ${msg}`);
          errors.push(msg);
        },
      });
      await wsClient.connect();

      // Navigate host to the game page — triggers cold-start DO load + STATE_UPDATE
      await page.goto(`${BASE_URL}/compete/${gameId}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT,
      });

      // Assert lobby-shell renders within 15s.
      // Pre-fix: cold-start STATE_UPDATE rejected → lobby-shell waits for
      // JOIN_ROOM broadcast → may exceed 15s under load.
      // Post-fix: cold-start STATE_UPDATE accepted → lobby-shell renders
      // immediately on WS connect.
      await expect(
        page.locator('[data-testid="lobby-shell"]').first(),
      ).toBeVisible({ timeout: LOBBY_SHELL_TIMEOUT });

      console.log('[COLDSTART-REGRESSION] lobby-shell visible within 15s');

      // Deterministic assertion: the FIRST STATE_UPDATE must include
      // allPlayersReady as a boolean. This is the direct proof of the fix.
      expect(firstSnapshot, 'No STATE_UPDATE received by WS observer').not.toBeNull();
      expect(
        typeof (firstSnapshot as Record<string, unknown>).allPlayersReady,
        'Cold-start STATE_UPDATE missing allPlayersReady — client validator would reject it',
      ).toBe('boolean');

      console.log('[COLDSTART-REGRESSION] allPlayersReady present on cold-start snapshot');

      // No WS errors
      expect(errors, `WS errors: ${errors.join(', ')}`).toEqual([]);

      wsClient.close();
    } finally {
      await browser.close();
    }
  });
});
