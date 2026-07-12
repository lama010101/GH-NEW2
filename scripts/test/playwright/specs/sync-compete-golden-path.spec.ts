import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_USERS, fetchAccessToken } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, CompeteSnapshot, SnapshotStatus } from '../orchestrator/websocketClient';
import { observeState, assertStateMatches } from '../orchestrator/observer';
import { submitGuessViaUI } from '../helpers/compete-ui';

// ─────────────────────────────────────────────────────────────────────
// MP-GUARD-SYNC-REGRESSION-001 — Sync Compete Golden-Path Regression Guard
//
// Two-context Playwright spec: 2 players, 2 rounds, PLAY_AGAIN.
// UI-driven (real button clicks) with per-context read-only WS observers
// for DOM ↔ snapshot cross-assertion at every phase transition.
//
// Architecture:
//   - Host  = TEST_USERS[0], context[0], page[0], wsClient[0] (read-only)
//   - Guest = TEST_USERS[1], context[1], page[1], wsClient[1] (read-only)
//   - Game config: mode sync, totalRounds 2, roundTimerSec 120
//
// The WS clients are READ-ONLY: connect + getLastSnapshot + waitForState.
// Zero mutating calls (no toggleReady, submitGuess, readyNext, playAgain)
// from the WS clients. All actions are driven through the real browser UI.
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
const STATE_TIMEOUT = 60000;

// ─────────────────────────────────────────────────────────────────────
// S0: Preflight KC grep guards — fail fast before launching browsers.
// ─────────────────────────────────────────────────────────────────────
test.describe('Sync Compete Golden Path', () => {
  test.beforeAll(async () => {
    const read = (p: string) =>
      fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

    // KC-002: broadcastStateUpdate must never use room.broadcast()
    const server = read('partykit/server.ts');
    expect(
      server,
      'KC-002 VIOLATION: room.broadcast() found in partykit/server.ts',
    ).not.toMatch(/room\.broadcast\s*\(/);

    // KC-007: no flowType in supabaseBrowser
    const supabaseBrowser = read('src/core/supabaseBrowser.ts');
    expect(
      supabaseBrowser,
      'KC-007 VIOLATION: flowType re-added to src/core/supabaseBrowser.ts',
    ).not.toMatch(/flowType/);

    // KC-001: z-index 1001 on sheetFieldWrap
    const css = read('src/components/compete/RoundActiveSection.module.css');
    expect(
      css,
      'KC-001 VIOLATION: z-index 1001 missing on .sheetFieldWrap in RoundActiveSection.module.css',
    ).toMatch(/\.sheetFieldWrap[\s\S]*?z-index:\s*1001/);

    // KC-005: antimeridian dLng clamp in rules.ts
    const rules = read('src/core/rules.ts');
    expect(
      rules,
      'KC-005 VIOLATION: dLng clamp missing in src/core/rules.ts',
    ).toMatch(/dLng[\s\S]*?Math\.(max|min)\s*\(/);
  });

  // ───────────────────────────────────────────────────────────────────
  // Helper: assert both contexts see the same status, and DOM ↔ WS match.
  // ───────────────────────────────────────────────────────────────────
  async function assertBothSeeStatus(
    status: SnapshotStatus,
    hostPage: Page,
    guestPage: Page,
    hostWS: CompeteWSClient,
    guestWS: CompeteWSClient,
  ): Promise<void> {
    // 30s poll — under heavy dev-server load the page's useCompeteSocket hook
    // can take >15s to receive its first STATE_UPDATE and render the game shell.
    const [hostObs, guestObs] = await Promise.all([
      observeState(hostPage, { pollTimeoutMs: 30000 }),
      observeState(guestPage, { pollTimeoutMs: 30000 }),
    ]);

    // Both DOMs agree
    expect(hostObs.status, 'Host DOM status mismatch').toBe(status);
    expect(guestObs.status, 'Guest DOM status mismatch').toBe(status);

    // Both WS snapshots agree
    const hostSnap = hostWS.getLastSnapshot();
    const guestSnap = guestWS.getLastSnapshot();
    expect(hostSnap, 'Host WS: no snapshot received').not.toBeNull();
    expect(guestSnap, 'Guest WS: no snapshot received').not.toBeNull();
    expect(hostSnap!.status, 'Host WS status mismatch').toBe(status);
    expect(guestSnap!.status, 'Guest WS status mismatch').toBe(status);

    // Cross-assert DOM ↔ WS
    const failures = [
      ...assertStateMatches(hostObs, hostSnap!, 'host'),
      ...assertStateMatches(guestObs, guestSnap!, 'guest'),
    ];
    expect(failures, `DOM ↔ WS cross-assertion failures:\n${failures.join('\n')}`).toEqual([]);
  }

  // ───────────────────────────────────────────────────────────────────
  // Helper: create a read-only WS client for a game.
  // ───────────────────────────────────────────────────────────────────
  async function createReadonlyWS(
    gameId: string,
    user: typeof TEST_USERS[0],
    errors: string[],
    playerSubmittedEvents: { playerId: string; playerName: string }[],
  ): Promise<CompeteWSClient> {
    const accessToken = await fetchAccessToken(user);
    const client = new CompeteWSClient({
      partyKitHost: PARTYKIT_HOST,
      gameId,
      user,
      displayName: user.displayName,
      accessToken,
      onStateUpdate: (snapshot) => {
        console.log(`[WS:${user.displayName}] State: ${snapshot.status} round=${snapshot.currentRoundIndex}`);
      },
      onError: (msg) => {
        console.error(`[WS:${user.displayName}] ERROR: ${msg}`);
        errors.push(`[${user.displayName}] ${msg}`);
      },
      onPlayerSubmitted: (playerId, playerName) => {
        console.log(`[WS:${user.displayName}] PLAYER_SUBMITTED: ${playerName}`);
        playerSubmittedEvents.push({ playerId, playerName });
      },
    });
    await client.connect();
    return client;
  }

  // ───────────────────────────────────────────────────────────────────
  // Main test: S1–S9 golden path
  // ───────────────────────────────────────────────────────────────────
  test('2 players, 2 rounds, play-again — UI-driven with WS cross-assertion', async () => {
    const errors: string[] = [];
    const playerSubmittedEvents: { playerId: string; playerName: string }[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
      // ── S1: Setup — login both contexts ──
      const [hostCtx, guestCtx] = await Promise.all([
        browser.newContext(DESKTOP_PRESET),
        browser.newContext(DESKTOP_PRESET),
      ]);
      const [hostPage, guestPage] = await Promise.all([
        hostCtx.newPage(),
        guestCtx.newPage(),
      ]);

      // Navigate to /login directly (triggers AuthModal without /home cold-compile)
      await Promise.all([
        hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);

      // Login both in parallel (saves ~20s vs sequential)
      await Promise.all([
        ensureLoggedIn(hostPage, TEST_USERS[0]),
        ensureLoggedIn(guestPage, TEST_USERS[1]),
      ]);

      // Wait for identity bootstrap after login
      await Promise.all([
        hostPage.waitForLoadState('domcontentloaded').catch(() => undefined),
        guestPage.waitForLoadState('domcontentloaded').catch(() => undefined),
      ]);

      // ── S2: Host creates game via API ──
      const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
        data: {
          displayName: TEST_USERS[0].displayName,
          playerId: TEST_USERS[0].id,
          mode: 'sync',
          totalRounds: 2,
          roundTimerSec: 120,
        },
        timeout: NAV_TIMEOUT,
      });
      expect(createRes.ok(), `Create game failed: ${createRes.status()}`).toBeTruthy();
      const sessionData = await createRes.json();
      const gameId = sessionData.gameId || sessionData.id;
      expect(gameId, 'Create game returned no gameId').toBeTruthy();
      console.log(`[GOLDEN] Game created: ${gameId}`);

      // ── S2/S3: Both navigate to the game, attach read-only WS observers ──
      await Promise.all([
        hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);

      // Wait for the game shell to render on both pages before asserting.
      // Under load, the page's useCompeteSocket hook can take >15s to receive
      // its first STATE_UPDATE. Waiting for lobby-shell ensures the DOM is
      // ready before observeState is called.
      await Promise.all([
        hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);

      const hostWS = await createReadonlyWS(gameId, TEST_USERS[0], errors, playerSubmittedEvents);
      const guestWS = await createReadonlyWS(gameId, TEST_USERS[1], errors, playerSubmittedEvents);

      // Wait for LOBBY on both WS clients
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      // ── S3: Assert LOBBY with 2 players ──
      await assertBothSeeStatus('LOBBY', hostPage, guestPage, hostWS, guestWS);
      const lobbySnap = hostWS.getLastSnapshot()!;
      expect(lobbySnap.players.length, 'Lobby should have 2 players').toBe(2);
      expect(lobbySnap.allPlayersReady, 'Lobby: should not be all-ready yet').toBe(false);

      // Both DOMs show 2 players in roster
      const hostRosterCount = await hostPage.locator('[data-testid^="lobby-player-"]').count();
      const guestRosterCount = await guestPage.locator('[data-testid^="lobby-player-"]').count();
      expect(hostRosterCount, 'Host roster should show 2 players').toBe(2);
      expect(guestRosterCount, 'Guest roster should show 2 players').toBe(2);

      // ── S4: Both ready → auto-start ──
      await Promise.all([
        hostPage.getByTestId('lobby-ready-btn').first().click(),
        guestPage.getByTestId('lobby-ready-btn').first().click(),
      ]);

      // Wait for allPlayersReady on WS
      await hostWS.waitForState(
        (s) => s.allPlayersReady && s.players.length === 2,
        STATE_TIMEOUT,
      );

      // Wait for ROUND_ACTIVE (auto-start fires when all ready)
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE_TIMEOUT),
      ]);

      // ── S4: Assert ROUND_ACTIVE round 0 ──
      await assertBothSeeStatus('ROUND_ACTIVE', hostPage, guestPage, hostWS, guestWS);
      const round0Snap = hostWS.getLastSnapshot()!;
      expect(round0Snap.currentRoundIndex, 'Round 0: currentRoundIndex should be 0').toBe(0);
      // Assert map image is visible (round-active section rendered)
      await expect(hostPage.getByTestId('round-image-container').first()).toBeVisible({ timeout: 10000 });
      await expect(guestPage.getByTestId('round-image-container').first()).toBeVisible({ timeout: 10000 });

      // ── S5: Round 0 — both submit via UI (parallelized for speed) ──
      const playerSubmittedBefore = playerSubmittedEvents.length;
      await Promise.all([
        submitGuessViaUI(hostPage, { year: 1950, lat: 40, lng: 0 }),
        submitGuessViaUI(guestPage, { year: 1960, lat: 41, lng: 1 }),
      ]);

      // Wait for both submissions to be acknowledged (parallel)
      await Promise.all([
        hostWS.waitForState(
          (s) => s.players.find((p) => p.playerId === TEST_USERS[0].id)?.hasSubmitted === true,
          STATE_TIMEOUT,
          true, // skipHistory — must match current state, not stale
        ),
        guestWS.waitForState(
          (s) => s.players.find((p) => p.playerId === TEST_USERS[1].id)?.hasSubmitted === true,
          STATE_TIMEOUT,
          true,
        ),
      ]);

      // S5 assertion: PLAYER_SUBMITTED received via WS (DOM toast is async-only + no testid).
      // DOM gap: the playerSubmittedToast has no data-testid and only renders in async mode.
      // Future testid task should add data-testid="player-submitted-toast" to the toast div
      // at src/app/compete/[gameId]/page.tsx line 650 for DOM-level assertion.
      // Wait for BOTH players' submission events (they may arrive in any order).
      await expect
        .poll(
          async () =>
            playerSubmittedEvents
              .slice(playerSubmittedBefore)
              .filter((e) => e.playerId === TEST_USERS[0].id).length,
          { timeout: STATE_TIMEOUT },
        )
        .toBeGreaterThanOrEqual(1);
      await expect
        .poll(
          async () =>
            playerSubmittedEvents
              .slice(playerSubmittedBefore)
              .filter((e) => e.playerId === TEST_USERS[1].id).length,
          { timeout: STATE_TIMEOUT },
        )
        .toBeGreaterThanOrEqual(1);
      // At least one PLAYER_SUBMITTED event should reference the host
      const hostSubmitted = playerSubmittedEvents
        .slice(playerSubmittedBefore)
        .some((e) => e.playerId === TEST_USERS[0].id);
      expect(hostSubmitted, 'PLAYER_SUBMITTED should include host playerId').toBe(true);

      // Wait for ROUND_COMPLETE (both submitted → round completes early, timer cancelled)
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'ROUND_COMPLETE', STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'ROUND_COMPLETE', STATE_TIMEOUT),
      ]);

      // ── S5: Assert ROUND_COMPLETE round 0 ──
      await assertBothSeeStatus('ROUND_COMPLETE', hostPage, guestPage, hostWS, guestWS);
      const complete0Snap = hostWS.getLastSnapshot()!;
      expect(complete0Snap.currentRoundIndex, 'Round 0 complete: currentRoundIndex should be 0').toBe(0);

      // ── S6: Round 0 — both ready-next via UI ──
      await Promise.all([
        hostPage.getByTestId('round-next-btn').first().click(),
        guestPage.getByTestId('round-next-btn').first().click(),
      ]);

      // Wait for ROUND_ACTIVE round 1 (sync: both must ready-next → advance)
      await Promise.all([
        hostWS.waitForState(
          (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1,
          STATE_TIMEOUT,
        ),
        guestWS.waitForState(
          (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1,
          STATE_TIMEOUT,
        ),
      ]);

      // ── S6: Assert ROUND_ACTIVE round 1 ──
      await assertBothSeeStatus('ROUND_ACTIVE', hostPage, guestPage, hostWS, guestWS);
      const round1Snap = hostWS.getLastSnapshot()!;
      expect(round1Snap.currentRoundIndex, 'Round 1: currentRoundIndex should be 1').toBe(1);
      // Wait for round-active section to be fully rendered before submitting
      await expect(hostPage.getByTestId('round-image-container').first()).toBeVisible({ timeout: 15000 });
      await expect(guestPage.getByTestId('round-image-container').first()).toBeVisible({ timeout: 15000 });

      // ── S7: Round 1 — both submit via UI (parallelized) ──
      await Promise.all([
        submitGuessViaUI(hostPage, { year: 1970, lat: 42, lng: 2 }),
        submitGuessViaUI(guestPage, { year: 1980, lat: 43, lng: 3 }),
      ]);
      await Promise.all([
        hostWS.waitForState(
          (s) => s.players.find((p) => p.playerId === TEST_USERS[0].id)?.hasSubmitted === true,
          STATE_TIMEOUT,
          true,
        ),
        guestWS.waitForState(
          (s) => s.players.find((p) => p.playerId === TEST_USERS[1].id)?.hasSubmitted === true,
          STATE_TIMEOUT,
          true,
        ),
      ]);

      // Wait for ROUND_COMPLETE round 1
      await Promise.all([
        hostWS.waitForState(
          (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 1,
          STATE_TIMEOUT,
        ),
        guestWS.waitForState(
          (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 1,
          STATE_TIMEOUT,
        ),
      ]);

      // ── S7: Assert ROUND_COMPLETE round 1 ──
      await assertBothSeeStatus('ROUND_COMPLETE', hostPage, guestPage, hostWS, guestWS);

      // ── S8: Round 1 — both ready-next (final) → SESSION_COMPLETE ──
      await Promise.all([
        hostPage.getByTestId('round-next-btn').first().click(),
        guestPage.getByTestId('round-next-btn').first().click(),
      ]);

      // Wait for SESSION_COMPLETE (last round → session ends)
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'SESSION_COMPLETE', STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'SESSION_COMPLETE', STATE_TIMEOUT),
      ]);

      // ── S8: Assert SESSION_COMPLETE ──
      await assertBothSeeStatus('SESSION_COMPLETE', hostPage, guestPage, hostWS, guestWS);
      // Play-again button visible
      await expect(hostPage.getByTestId('session-play-again-btn').first()).toBeVisible({
        timeout: 10000,
      });

      // ── S9: Play again → new lobby ──
      // Host clicks play-again (creates new game via API + sends PLAY_AGAIN via WS)
      await hostPage.getByTestId('session-play-again-btn').first().click();

      // Wait for both browsers to navigate to new game URL
      // The host's handlePlayAgain creates a new game and navigates.
      // The guest receives PLAY_AGAIN broadcast and navigates.
      // Use a function predicate that excludes the old game ID — a plain regex
      // would match the current URL and resolve immediately.
      await Promise.all([
        hostPage.waitForURL((url) => {
          const m = url.pathname.match(/\/compete\/([a-f0-9-]+)/);
          return m !== null && m[1] !== gameId;
        }, { timeout: STATE_TIMEOUT }),
        guestPage.waitForURL((url) => {
          const m = url.pathname.match(/\/compete\/([a-f0-9-]+)/);
          return m !== null && m[1] !== gameId;
        }, { timeout: STATE_TIMEOUT }),
      ]);

      // Extract new gameId from URL
      const hostUrl = hostPage.url();
      const guestUrl = guestPage.url();
      const newGameIdMatch = hostUrl.match(/\/compete\/([a-f0-9-]+)/);
      expect(newGameIdMatch, 'Host URL should contain new gameId').not.toBeNull();
      const newGameId = newGameIdMatch![1];
      console.log(`[GOLDEN] Play-again new game: ${newGameId} (old: ${gameId})`);

      // S9 assertion: newGameId !== oldGameId
      expect(newGameId, 'PLAY_AGAIN should create a different gameId').not.toBe(gameId);

      // S9 assertion: both URLs point to the same new game
      const guestNewGameIdMatch = guestUrl.match(/\/compete\/([a-f0-9-]+)/);
      expect(guestNewGameIdMatch, 'Guest URL should contain new gameId').not.toBeNull();
      expect(guestNewGameIdMatch![1], 'Both contexts should navigate to same new game').toBe(
        newGameId,
      );

      // Close old WS clients and create new ones for the new game
      hostWS.close();
      guestWS.close();

      // Wait for the new game's lobby shell to render before asserting.
      await Promise.all([
        hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);

      const newHostWS = await createReadonlyWS(newGameId, TEST_USERS[0], errors, playerSubmittedEvents);
      const newGuestWS = await createReadonlyWS(newGameId, TEST_USERS[1], errors, playerSubmittedEvents);

      // Wait for LOBBY on both new WS clients
      await Promise.all([
        newHostWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
        newGuestWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      // ── S9: Assert new LOBBY with different gameId, 2 players, both ready=false ──
      await assertBothSeeStatus('LOBBY', hostPage, guestPage, newHostWS, newGuestWS);
      const newLobbySnap = newHostWS.getLastSnapshot()!;
      expect(newLobbySnap.gameId, 'New lobby gameId should differ from old').not.toBe(gameId);
      expect(newLobbySnap.gameId, 'New lobby gameId should match URL').toBe(newGameId);
      expect(newLobbySnap.players.length, 'New lobby should have 2 players').toBe(2);
      expect(
        newLobbySnap.players.every((p) => !p.ready),
        'New lobby: both players should be not-ready',
      ).toBe(true);

      // Both DOMs show 2 players in new roster
      const newHostRosterCount = await hostPage.locator('[data-testid^="lobby-player-"]').count();
      const newGuestRosterCount = await guestPage.locator('[data-testid^="lobby-player-"]').count();
      expect(newHostRosterCount, 'New lobby host roster should show 2 players').toBe(2);
      expect(newGuestRosterCount, 'New lobby guest roster should show 2 players').toBe(2);

      // Cleanup WS clients
      newHostWS.close();
      newGuestWS.close();

      // ── Global invariant: no ERROR messages on either WS client ──
      expect(
        errors,
        `WS ERROR messages received during golden path:\n${errors.join('\n')}`,
      ).toEqual([]);

      console.log('[GOLDEN] All scenarios S1–S9 passed.');
    } finally {
      await browser.close();
    }
  });
});
