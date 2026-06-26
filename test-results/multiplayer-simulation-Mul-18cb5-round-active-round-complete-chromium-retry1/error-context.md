# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> resume-after-refresh: lobby, round-active, round-complete
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:85:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  29  |         }
  30  |         return chromiumBrowser;
  31  |       };
  32  | 
  33  |       // Initialize browser pool
  34  |       browserPool = new BrowserPool({
  35  |         baseURL: BASE_URL,
  36  |         users: TEST_USERS,
  37  |         headed: false,
  38  |       });
  39  | 
  40  |       // Launch browsers and log in
  41  |       await browserPool.launch(getBrowser);
  42  | 
  43  |       // Initialize edge-case engine
  44  |       edgeCaseEngine = new EdgeCaseEngine();
  45  | 
  46  |       // Initialize orchestrator
  47  |       orchestrator = new GameOrchestrator({
  48  |         browserPool,
  49  |         partyKitHost: PARTYKIT_HOST,
  50  |         totalRounds: 5,
  51  |         totalGames: 3,
  52  |         edgeCaseEngine,
  53  |         onStep: (step) => {
  54  |           console.log(`[SIMULATION] ${step}`);
  55  |           stepLog.push(step);
  56  |         },
  57  |         onAssertionFailure: (failures) => {
  58  |           assertionFailures.push(...failures);
  59  |         },
  60  |       });
  61  | 
  62  |       // Run the simulation
  63  |       const results = await orchestrator.run();
  64  | 
  65  |       // Report results
  66  |       console.log('[SIMULATION] Results:', results);
  67  |       console.log(`[SIMULATION] Edge cases injected: ${edgeCaseEngine.injectedCount}/${edgeCaseEngine.totalCount}`);
  68  |       console.log(`[SIMULATION] Assertion failures: ${assertionFailures.length}`);
  69  | 
  70  |       // Assertions
  71  |       expect(results.length).toBe(3);
  72  |       expect(results.every((r) => r.completed)).toBe(true);
  73  |       expect(edgeCaseEngine.injectedCount).toBeGreaterThan(0);
  74  |       expect(assertionFailures.length).toBe(0);
  75  | 
  76  |       // Cleanup
  77  |       await browserPool.closeAll();
  78  |     } finally {
  79  |       // Close isolated browser instances
  80  |       await chromiumBrowser.close();
  81  |       await webkitBrowser.close();
  82  |     }
  83  |   });
  84  | 
  85  |   test('resume-after-refresh: lobby, round-active, round-complete', async () => {
  86  |     // This test focuses specifically on the resume-after-refresh scenarios
  87  |     const stepLog: string[] = [];
  88  | 
  89  |     // Launch isolated browser instances for this test
  90  |     const chromiumBrowser = await chromium.launch();
  91  |     const webkitBrowser = await webkit.launch();
  92  | 
  93  |     try {
  94  |       const getBrowser = (device: DeviceProfile) => {
  95  |         if (device === 'iphone-safari') {
  96  |           return webkitBrowser;
  97  |         }
  98  |         return chromiumBrowser;
  99  |       };
  100 | 
  101 |       browserPool = new BrowserPool({
  102 |         baseURL: BASE_URL,
  103 |         users: TEST_USERS.slice(0, 2), // Only 2 players for this focused test
  104 |         headed: false,
  105 |       });
  106 | 
  107 |       await browserPool.launch(getBrowser);
  108 | 
  109 |       orchestrator = new GameOrchestrator({
  110 |         browserPool,
  111 |         partyKitHost: PARTYKIT_HOST,
  112 |         totalRounds: 2, // Shorter game for focused test
  113 |         totalGames: 1,
  114 |         onStep: (step) => {
  115 |           console.log(`[RESUME-TEST] ${step}`);
  116 |           stepLog.push(step);
  117 |         },
  118 |       });
  119 | 
  120 |       edgeCaseEngine = new EdgeCaseEngine();
  121 | 
  122 |       // Run a single game with refresh edge cases
  123 |       const results = await orchestrator.run();
  124 | 
  125 |       console.log('[RESUME-TEST] Results:', results);
  126 |       console.log(`[RESUME-TEST] Edge cases injected: ${edgeCaseEngine.injectedCount}`);
  127 | 
  128 |       expect(results.length).toBe(1);
> 129 |       expect(results[0].completed).toBe(true);
      |                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  130 | 
  131 |       await browserPool.closeAll();
  132 |     } finally {
  133 |       // Close isolated browser instances
  134 |       await chromiumBrowser.close();
  135 |       await webkitBrowser.close();
  136 |     }
  137 |   });
  138 | });
  139 | 
```