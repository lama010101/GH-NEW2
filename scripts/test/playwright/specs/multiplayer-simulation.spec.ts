import { test, expect, devices } from '@playwright/test';
import { chromium, webkit } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';
import { BrowserPool, DeviceProfile } from '../orchestrator/browserPool';
import { GameOrchestrator } from '../orchestrator/gameOrchestrator';
import { EdgeCaseEngine } from '../orchestrator/edgeCases';

const PARTYKIT_HOST = process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

test.describe('Multiplayer Simulation', () => {
  let browserPool: BrowserPool;
  let orchestrator: GameOrchestrator;
  let edgeCaseEngine: EdgeCaseEngine;

  test('6 players, 3 games, 5 rounds each, full edge-case suite', async () => {
    const stepLog: string[] = [];
    const assertionFailures: string[] = [];

    // Launch isolated browser instances for this test
    const chromiumBrowser = await chromium.launch({ headless: true });
    const webkitBrowser = await webkit.launch({ headless: true });

    try {
      // Helper to get the right browser engine for a device profile
      const getBrowser = (device: DeviceProfile) => {
        if (device === 'iphone-safari') {
          return webkitBrowser;
        }
        return chromiumBrowser;
      };

      // Initialize browser pool — slice to 6 to match the test title
      // ("6 players") and stay under the game's 8-player max.
      browserPool = new BrowserPool({
        baseURL: BASE_URL,
        users: TEST_USERS.slice(0, 6),
        headed: false,
      });

      // Launch browsers and log in
      await browserPool.launch(getBrowser);

      // Initialize edge-case engine
      edgeCaseEngine = new EdgeCaseEngine();

      // Initialize orchestrator
      orchestrator = new GameOrchestrator({
        browserPool,
        partyKitHost: PARTYKIT_HOST,
        totalRounds: 5,
        totalGames: 3,
        edgeCaseEngine,
        onStep: (step) => {
          console.log(`[SIMULATION] ${step}`);
          stepLog.push(step);
        },
        onAssertionFailure: (failures) => {
          assertionFailures.push(...failures);
        },
      });

      // Run the simulation
      const results = await orchestrator.run();

      // Report results
      console.log('[SIMULATION] Results:', results);
      console.log(`[SIMULATION] Edge cases injected: ${edgeCaseEngine.injectedCount}/${edgeCaseEngine.totalCount}`);
      console.log(`[SIMULATION] Assertion failures: ${assertionFailures.length}`);

      // Assertions
      expect(results.length).toBe(3);
      expect(results.every((r) => r.completed)).toBe(true);
      expect(edgeCaseEngine.injectedCount).toBeGreaterThan(0);
      expect(assertionFailures.length).toBe(0);
      // Assert no edge case failures (H13 fix — T3 added failuresList but
      // the spec never checked it, so edge case failures couldn't fail the test)
      const edgeFailures = edgeCaseEngine.failuresList;
      if (edgeFailures.length > 0) {
        console.error(`[SIMULATION] Edge case failures (${edgeFailures.length}):`);
        for (const f of edgeFailures) {
          console.error(`  - ${f}`);
        }
      }
      expect(edgeFailures.length).toBe(0);

      // Cleanup
      await browserPool.closeAll();
    } finally {
      // Close isolated browser instances
      await chromiumBrowser.close();
      await webkitBrowser.close();
    }
  });

  test('resume-after-refresh: lobby, round-active, round-complete', async () => {
    // This test focuses specifically on the resume-after-refresh scenarios
    const stepLog: string[] = [];

    // Launch isolated browser instances for this test
    const chromiumBrowser = await chromium.launch({ headless: true });
    const webkitBrowser = await webkit.launch({ headless: true });

    try {
      const getBrowser = (device: DeviceProfile) => {
        if (device === 'iphone-safari') {
          return webkitBrowser;
        }
        return chromiumBrowser;
      };

      browserPool = new BrowserPool({
        baseURL: BASE_URL,
        users: TEST_USERS.slice(0, 2), // Only 2 players for this focused test
        headed: false,
      });

      await browserPool.launch(getBrowser);

      edgeCaseEngine = new EdgeCaseEngine();

      orchestrator = new GameOrchestrator({
        browserPool,
        partyKitHost: PARTYKIT_HOST,
        totalRounds: 2, // Shorter game for focused test
        totalGames: 1,
        edgeCaseEngine,
        onStep: (step) => {
          console.log(`[RESUME-TEST] ${step}`);
          stepLog.push(step);
        },
      });

      // Run a single game with refresh edge cases
      const results = await orchestrator.run();

      console.log('[RESUME-TEST] Results:', results);
      console.log(`[RESUME-TEST] Edge cases injected: ${edgeCaseEngine.injectedCount}`);

      expect(results.length).toBe(1);
      expect(results[0].completed).toBe(true);

      await browserPool.closeAll();
    } finally {
      // Close isolated browser instances
      await chromiumBrowser.close();
      await webkitBrowser.close();
    }
  });
});
