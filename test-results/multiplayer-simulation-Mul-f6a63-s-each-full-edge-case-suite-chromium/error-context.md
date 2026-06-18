# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> 6 players, 3 games, 5 rounds each, full edge-case suite
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:30:7

# Error details

```
"beforeAll" hook timeout of 60000ms exceeded.
```

# Test source

```ts
  1   | import { test, expect, devices } from '@playwright/test';
  2   | import { chromium, webkit } from '@playwright/test';
  3   | import { TEST_USERS } from '../fixtures/auth';
  4   | import { BrowserPool, DeviceProfile } from '../orchestrator/browserPool';
  5   | import { GameOrchestrator } from '../orchestrator/gameOrchestrator';
  6   | import { EdgeCaseEngine } from '../orchestrator/edgeCases';
  7   | 
  8   | const PARTYKIT_HOST = process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
  9   | const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  10  | 
  11  | test.describe('Multiplayer Simulation', () => {
  12  |   let browserPool: BrowserPool;
  13  |   let orchestrator: GameOrchestrator;
  14  |   let edgeCaseEngine: EdgeCaseEngine;
  15  |   let chromiumBrowser: any;
  16  |   let webkitBrowser: any;
  17  | 
> 18  |   test.beforeAll(async () => {
      |        ^ "beforeAll" hook timeout of 60000ms exceeded.
  19  |     console.log('[SIMULATION] Setting up browsers...');
  20  |     chromiumBrowser = await chromium.launch();
  21  |     webkitBrowser = await webkit.launch();
  22  |   });
  23  | 
  24  |   test.afterAll(async () => {
  25  |     console.log('[SIMULATION] Cleaning up browsers...');
  26  |     await chromiumBrowser?.close();
  27  |     await webkitBrowser?.close();
  28  |   });
  29  | 
  30  |   test('6 players, 3 games, 5 rounds each, full edge-case suite', async () => {
  31  |     const stepLog: string[] = [];
  32  |     const assertionFailures: string[] = [];
  33  | 
  34  |     // Helper to get the right browser engine for a device profile
  35  |     const getBrowser = (device: DeviceProfile) => {
  36  |       if (device === 'iphone-safari') {
  37  |         return webkitBrowser;
  38  |       }
  39  |       return chromiumBrowser;
  40  |     };
  41  | 
  42  |     // Initialize browser pool
  43  |     browserPool = new BrowserPool({
  44  |       baseURL: BASE_URL,
  45  |       users: TEST_USERS,
  46  |       headed: false,
  47  |     });
  48  | 
  49  |     // Launch browsers and log in
  50  |     await browserPool.launch(getBrowser);
  51  | 
  52  |     // Initialize edge-case engine
  53  |     edgeCaseEngine = new EdgeCaseEngine();
  54  | 
  55  |     // Initialize orchestrator
  56  |     orchestrator = new GameOrchestrator({
  57  |       browserPool,
  58  |       partyKitHost: PARTYKIT_HOST,
  59  |       totalRounds: 5,
  60  |       totalGames: 3,
  61  |       edgeCaseEngine,
  62  |       onStep: (step) => {
  63  |         console.log(`[SIMULATION] ${step}`);
  64  |         stepLog.push(step);
  65  |       },
  66  |       onAssertionFailure: (failures) => {
  67  |         assertionFailures.push(...failures);
  68  |       },
  69  |     });
  70  | 
  71  |     // Run the simulation
  72  |     const results = await orchestrator.run();
  73  | 
  74  |     // Report results
  75  |     console.log('[SIMULATION] Results:', results);
  76  |     console.log(`[SIMULATION] Edge cases injected: ${edgeCaseEngine.injectedCount}/${edgeCaseEngine.totalCount}`);
  77  |     console.log(`[SIMULATION] Assertion failures: ${assertionFailures.length}`);
  78  | 
  79  |     // Assertions
  80  |     expect(results.length).toBe(3);
  81  |     expect(results.every((r) => r.completed)).toBe(true);
  82  |     expect(edgeCaseEngine.injectedCount).toBeGreaterThan(0);
  83  |     expect(assertionFailures.length).toBe(0);
  84  | 
  85  |     // Cleanup
  86  |     await browserPool.closeAll();
  87  |   });
  88  | 
  89  |   test('resume-after-refresh: lobby, round-active, round-complete', async () => {
  90  |     // This test focuses specifically on the resume-after-refresh scenarios
  91  |     const stepLog: string[] = [];
  92  | 
  93  |     const getBrowser = (device: DeviceProfile) => {
  94  |       if (device === 'iphone-safari') {
  95  |         return webkitBrowser;
  96  |       }
  97  |       return chromiumBrowser;
  98  |     };
  99  | 
  100 |     browserPool = new BrowserPool({
  101 |       baseURL: BASE_URL,
  102 |       users: TEST_USERS.slice(0, 2), // Only 2 players for this focused test
  103 |       headed: false,
  104 |     });
  105 | 
  106 |     await browserPool.launch(getBrowser);
  107 | 
  108 |     orchestrator = new GameOrchestrator({
  109 |       browserPool,
  110 |       partyKitHost: PARTYKIT_HOST,
  111 |       totalRounds: 2, // Shorter game for focused test
  112 |       totalGames: 1,
  113 |       onStep: (step) => {
  114 |         console.log(`[RESUME-TEST] ${step}`);
  115 |         stepLog.push(step);
  116 |       },
  117 |     });
  118 | 
```