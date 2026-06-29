# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> resume-after-refresh: lobby, round-active, round-complete
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:95:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
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
  75  |       // Assert no edge case failures (H13 fix — T3 added failuresList but
  76  |       // the spec never checked it, so edge case failures couldn't fail the test)
  77  |       const edgeFailures = edgeCaseEngine.failuresList;
  78  |       if (edgeFailures.length > 0) {
  79  |         console.error(`[SIMULATION] Edge case failures (${edgeFailures.length}):`);
  80  |         for (const f of edgeFailures) {
  81  |           console.error(`  - ${f}`);
  82  |         }
  83  |       }
  84  |       expect(edgeFailures.length).toBe(0);
  85  | 
  86  |       // Cleanup
  87  |       await browserPool.closeAll();
  88  |     } finally {
  89  |       // Close isolated browser instances
  90  |       await chromiumBrowser.close();
  91  |       await webkitBrowser.close();
  92  |     }
  93  |   });
  94  | 
  95  |   test('resume-after-refresh: lobby, round-active, round-complete', async () => {
  96  |     // This test focuses specifically on the resume-after-refresh scenarios
  97  |     const stepLog: string[] = [];
  98  | 
  99  |     // Launch isolated browser instances for this test
  100 |     const chromiumBrowser = await chromium.launch({ headless: true });
  101 |     const webkitBrowser = await webkit.launch({ headless: true });
  102 | 
  103 |     try {
  104 |       const getBrowser = (device: DeviceProfile) => {
  105 |         if (device === 'iphone-safari') {
  106 |           return webkitBrowser;
  107 |         }
  108 |         return chromiumBrowser;
  109 |       };
  110 | 
  111 |       browserPool = new BrowserPool({
  112 |         baseURL: BASE_URL,
  113 |         users: TEST_USERS.slice(0, 2), // Only 2 players for this focused test
  114 |         headed: false,
  115 |       });
  116 | 
  117 |       await browserPool.launch(getBrowser);
  118 | 
  119 |       edgeCaseEngine = new EdgeCaseEngine();
  120 | 
  121 |       orchestrator = new GameOrchestrator({
  122 |         browserPool,
  123 |         partyKitHost: PARTYKIT_HOST,
  124 |         totalRounds: 2, // Shorter game for focused test
  125 |         totalGames: 1,
  126 |         edgeCaseEngine,
  127 |         onStep: (step) => {
  128 |           console.log(`[RESUME-TEST] ${step}`);
  129 |           stepLog.push(step);
  130 |         },
  131 |       });
  132 | 
  133 |       // Run a single game with refresh edge cases
  134 |       const results = await orchestrator.run();
  135 | 
  136 |       console.log('[RESUME-TEST] Results:', results);
  137 |       console.log(`[RESUME-TEST] Edge cases injected: ${edgeCaseEngine.injectedCount}`);
  138 | 
  139 |       expect(results.length).toBe(1);
> 140 |       expect(results[0].completed).toBe(true);
      |                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  141 | 
  142 |       await browserPool.closeAll();
  143 |     } finally {
  144 |       // Close isolated browser instances
  145 |       await chromiumBrowser.close();
  146 |       await webkitBrowser.close();
  147 |     }
  148 |   });
  149 | });
  150 | 
```