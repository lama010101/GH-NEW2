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
// MP-PLAN-RELAX-GOLDEN-PATH-001 — Relax (async) Compete Golden Path
//
// Two-context Playwright spec: 2 players, full Relax (async) session,
// then PLAY_AGAIN. UI-driven with per-context read-only WS observers.
//
// Architecture:
//   - Host  = TEST_USERS[0], context[0], page[0], wsClient[0] (read-only)
//   - Guest = TEST_USERS[1], context[1], page[1], wsClient[1] (read-only)
//   - Game config: mode async, totalRounds 5, roundTimerSec 0
//
// Relax-specific behaviour exercised:
//   - Host and guest ready up once; server auto-starts.
//   - Each player submits at their own pace; the "Next" button is never
//     gated by the other player.
//   - After the host submits round 0 and is still on the result screen,
//     the guest's snapshot marks the host as submitted for that round
//     (live partial leaderboard state).
//   - After all 5 rounds both players reach SESSION_COMPLETE independently.
//   - Host PLAY_AGAIN creates a new async game and both contexts navigate
//     to a fresh lobby.
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
test.describe('Relax (async) Compete Golden Path', () => {
  test.beforeAll(async () => {
    // ── S0a: Supabase connectivity preflight ──
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!supabaseUrl) {
      throw new Error('Supabase unreachable — NEXT_PUBLIC_SUPABASE_URL not set. Check connectivity.');
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
        signal: controller.signal,
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
      });
      clearTimeout(timeout);
      if (!res.ok && res.status !== 401 && res.status !== 403) {
        throw new Error(`Supabase unreachable — auth health check returned HTTP ${res.status}. Check connectivity.`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Supabase unreachable — auth health check timed out after 5s. Check connectivity.');
      }
      throw new Error(`Supabase unreachable — ${err.message}. Check connectivity.`);
    }

    // ── S0b: Preflight KC grep guards ──
    const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

    // KC-002: broadcastStateUpdate must never use room.broadcast()
    const server = read('partykit/server.ts');
    expect(server, 'KC-002 VIOLATION: room.broadcast() found in partykit/server.ts').not.toMatch(
      /room\.broadcast\s*\(/,
    );

    // KC-007: no flowType in supabaseBrowser
    const supabaseBrowser = read('src/core/supabaseBrowser.ts');
    expect(supabaseBrowser, 'KC-007 VIOLATION: flowType re-added to src/core/supabaseBrowser.ts').not.toMatch(
      /flowType/,
    );

    // KC-001: z-index 1001 on sheetFieldWrap
    const css = read('src/components/compete/RoundActiveSection.module.css');
    expect(css, 'KC-001 VIOLATION: z-index 1001 missing on .sheetFieldWrap').toMatch(
      /\.sheetFieldWrap[\s\S]*?z-index:\s*1001/,
    );

    // KC-005: antimeridian dLng clamp in rules.ts
    const rules = read('src/core/rules.ts');
    expect(rules, 'KC-005 VIOLATION: dLng clamp missing in src/core/rules.ts').toMatch(
      /dLng[\s\S]*?Math\.(max|min)\s*\(/,
    );
  });

  // ───────────────────────────────────────────────────────────────────
  // Helper: wait until a player's DOM and read-only WS agree on status.
  // ───────────────────────────────────────────────────────────────────
  async function assertPlayerStatus(
    label: string,
    page: Page,
    client: CompeteWSClient,
    expectedStatus: SnapshotStatus,
    expectedRound: number | null = null,
  ): Promise<CompeteSnapshot> {
    const snapshot = await client.waitForState(
      (s) => s.status === expectedStatus && (expectedRound === null || s.currentRoundIndex === expectedRound),
      STATE_TIMEOUT,
      true, // skipHistory — match the current state, not a stale one
    );

    const sectionTestId =
      expectedStatus === 'LOBBY'
        ? 'lobby-shell'
        : expectedStatus === 'ROUND_ACTIVE'
          ? 'round-active-section'
          : expectedStatus === 'ROUND_COMPLETE'
            ? 'round-complete-section'
            : 'session-complete-section';

    await page.locator(`[data-testid="${sectionTestId}"]`).first().waitFor({
      state: 'visible',
      timeout: STATE_TIMEOUT,
    });

    const observed = await observeState(page, { pollTimeoutMs: 10000 });
    const failures = assertStateMatches(observed, snapshot, label);
    expect(
      failures,
      `DOM ↔ WS cross-assertion failures for ${label}:\n${failures.join('\n')}`,
    ).toEqual([]);

    return snapshot;
  }

  // ───────────────────────────────────────────────────────────────────
  // Helper: create a read-only WS observer for a game.
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
        if (snapshot.viewerPlayerId !== null && snapshot.viewerPlayerId !== user.id) {
          errors.push(
            `[WS:${user.displayName}] received snapshot for wrong viewer: ${snapshot.viewerPlayerId}`,
          );
        }
        console.log(
          `[WS:${user.displayName}] State: ${snapshot.status} round=${snapshot.currentRoundIndex} viewer=${snapshot.viewerPlayerId?.slice(0, 8) ?? 'null'}`,
        );
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
  // Helper: submit a single round through the real UI.
  // ───────────────────────────────────────────────────────────────────
  async function submitRound(
    page: Page,
    client: CompeteWSClient,
    label: string,
    roundIndex: number,
    totalRounds: number,
    year: number,
  ): Promise<CompeteSnapshot> {
    await assertPlayerStatus(label, page, client, 'ROUND_ACTIVE', roundIndex);
    await expect(page.getByTestId('round-image-container').first()).toBeVisible({ timeout: 15000 });

    await submitGuessViaUI(page, {
      year,
      lat: 40 + roundIndex,
      lng: roundIndex,
    });

    const isLast = roundIndex === totalRounds - 1;
    if (isLast) {
      return assertPlayerStatus(label, page, client, 'SESSION_COMPLETE');
    }
    return assertPlayerStatus(label, page, client, 'ROUND_COMPLETE', roundIndex);
  }

  // ───────────────────────────────────────────────────────────────────
  // Helper: click "Next" and wait for the next round to become active.
  // ───────────────────────────────────────────────────────────────────
  async function advanceToNextRound(
    page: Page,
    client: CompeteWSClient,
    label: string,
    roundIndex: number,
  ): Promise<CompeteSnapshot> {
    await page.getByTestId('round-next-btn').first().click();
    return assertPlayerStatus(label, page, client, 'ROUND_ACTIVE', roundIndex + 1);
  }

  // ───────────────────────────────────────────────────────────────────
  // Main test: S1–S9 async golden path
  // ───────────────────────────────────────────────────────────────────
  test('2 players, full 5-round async game, play-again — UI-driven with per-player WS cross-assertion', async () => {
    test.setTimeout(600000);

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

      await Promise.all([
        hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);
      await Promise.all([ensureLoggedIn(hostPage, TEST_USERS[0]), ensureLoggedIn(guestPage, TEST_USERS[1])]);

      // ── S2: Host creates an async (Relax) game ──
      const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
        data: {
          displayName: TEST_USERS[0].displayName,
          playerId: TEST_USERS[0].id,
          mode: 'async',
          totalRounds: 5,
        },
        timeout: NAV_TIMEOUT,
      });
      expect(createRes.ok(), `Create async game failed: ${createRes.status()}`).toBeTruthy();
      const sessionData = await createRes.json();
      const gameId = sessionData.gameId || sessionData.id;
      expect(gameId, 'Create game returned no gameId').toBeTruthy();
      console.log(`[RELAX-GOLDEN] Game created: ${gameId}`);

      // ── S3: Both navigate, attach read-only WS observers ──
      await Promise.all([
        hostPage.goto(`${BASE_URL}/compete/${gameId}`, {
          waitUntil: 'domcontentloaded',
          timeout: NAV_TIMEOUT,
        }),
        guestPage.goto(`${BASE_URL}/compete/${gameId}`, {
          waitUntil: 'domcontentloaded',
          timeout: NAV_TIMEOUT,
        }),
      ]);
      await Promise.all([
        hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);

      const hostWS = await createReadonlyWS(gameId, TEST_USERS[0], errors, playerSubmittedEvents);
      const guestWS = await createReadonlyWS(gameId, TEST_USERS[1], errors, playerSubmittedEvents);

      await Promise.all([
        hostWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      // ── S3: Assert LOBBY with 2 players ──
      const hostLobbySnap = await assertPlayerStatus('host', hostPage, hostWS, 'LOBBY');
      const guestLobbySnap = await assertPlayerStatus('guest', guestPage, guestWS, 'LOBBY');
      expect(hostLobbySnap.players.length, 'Lobby should have 2 players').toBe(2);
      expect(guestLobbySnap.players.length, 'Lobby should have 2 players').toBe(2);

      // ── S4: Both ready → auto-start ──
      await Promise.all([
        hostPage.getByTestId('lobby-ready-btn').first().click(),
        guestPage.getByTestId('lobby-ready-btn').first().click(),
      ]);
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      ]);

      const totalRounds = hostWS.getLastSnapshot()!.config.totalRounds;
      expect(totalRounds, 'Relax session should have 5 rounds').toBe(5);
      console.log(`[RELAX-GOLDEN] totalRounds=${totalRounds}`);

      // ── S5–S8: Full async game, one round at a time, host slightly ahead ──
      for (let round = 0; round < totalRounds; round++) {
        console.log(`[RELAX-GOLDEN] --- Round ${round} ---`);
        const hostYear = 1950 + round * 10;
        const guestYear = 1960 + round * 10;

        // Host submits and reaches the result screen independently.
        await submitRound(hostPage, hostWS, 'host', round, totalRounds, hostYear);

        // Round 0 partial-leaderboard assertion: the guest is still in ROUND_ACTIVE
        // round 0 and should see the host as already submitted for this round.
        if (round === 0) {
          const guestSnap = guestWS.getLastSnapshot();
          expect(guestSnap, 'Guest should have a snapshot after host submission').not.toBeNull();
          expect(guestSnap!.status, 'Guest should still be ROUND_ACTIVE while host is on result').toBe('ROUND_ACTIVE');
          expect(guestSnap!.currentRoundIndex, 'Guest round should still be 0').toBe(0);
          const hostAsSeenByGuest = guestSnap!.players.find((p) => p.playerId === TEST_USERS[0].id);
          expect(hostAsSeenByGuest, 'Host should appear in guest player list').toBeTruthy();
          expect(hostAsSeenByGuest!.hasSubmitted, 'Guest should see host has submitted round 0').toBe(true);
          const guestAsSeenByGuest = guestSnap!.players.find((p) => p.playerId === TEST_USERS[1].id);
          expect(guestAsSeenByGuest, 'Guest should appear in guest player list').toBeTruthy();
          expect(guestAsSeenByGuest!.hasSubmitted, 'Guest should not yet be submitted').toBe(false);
        }

        // Host can advance to the next round without waiting for the guest.
        if (round < totalRounds - 1) {
          await advanceToNextRound(hostPage, hostWS, 'host', round);
        }

        // Guest submits the same round at their own pace.
        await submitRound(guestPage, guestWS, 'guest', round, totalRounds, guestYear);

        // Guest advances independently.
        if (round < totalRounds - 1) {
          await advanceToNextRound(guestPage, guestWS, 'guest', round);
        }
      }

      // ── S8: Assert both contexts reached SESSION_COMPLETE ──
      await assertPlayerStatus('host', hostPage, hostWS, 'SESSION_COMPLETE');
      await assertPlayerStatus('guest', guestPage, guestWS, 'SESSION_COMPLETE');

      // ── S9: Play again → new lobby ──
      await hostPage.getByTestId('session-play-again-btn').first().click();

      await Promise.all([
        hostPage.waitForURL(
          (url) => {
            const m = url.pathname.match(/\/compete\/([a-f0-9-]+)/);
            return m !== null && m[1] !== gameId;
          },
          { timeout: STATE_TIMEOUT },
        ),
        guestPage.waitForURL(
          (url) => {
            const m = url.pathname.match(/\/compete\/([a-f0-9-]+)/);
            return m !== null && m[1] !== gameId;
          },
          { timeout: STATE_TIMEOUT },
        ),
      ]);

      const newGameIdMatch = hostPage.url().match(/\/compete\/([a-f0-9-]+)/);
      expect(newGameIdMatch, 'Host URL should contain new gameId').not.toBeNull();
      const newGameId = newGameIdMatch![1];
      const guestNewGameIdMatch = guestPage.url().match(/\/compete\/([a-f0-9-]+)/);
      expect(guestNewGameIdMatch, 'Guest URL should contain new gameId').not.toBeNull();
      expect(guestNewGameIdMatch![1], 'Both contexts should navigate to same new game').toBe(newGameId);
      console.log(`[RELAX-GOLDEN] Play-again new game: ${newGameId} (old: ${gameId})`);

      hostWS.close();
      guestWS.close();

      await Promise.all([
        hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);

      const newHostWS = await createReadonlyWS(newGameId, TEST_USERS[0], errors, playerSubmittedEvents);
      const newGuestWS = await createReadonlyWS(newGameId, TEST_USERS[1], errors, playerSubmittedEvents);

      await Promise.all([
        newHostWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
        newGuestWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      const newHostLobbySnap = await assertPlayerStatus('host', hostPage, newHostWS, 'LOBBY');
      const newGuestLobbySnap = await assertPlayerStatus('guest', guestPage, newGuestWS, 'LOBBY');
      expect(newHostLobbySnap.gameId, 'New lobby gameId should differ from old').not.toBe(gameId);
      expect(newHostLobbySnap.gameId, 'New lobby gameId should match URL').toBe(newGameId);
      expect(newHostLobbySnap.players.length, 'New lobby should have 2 players').toBe(2);
      expect(newGuestLobbySnap.players.length, 'New lobby should have 2 players').toBe(2);

      newHostWS.close();
      newGuestWS.close();

      // ── Global invariant: no ERROR messages on either WS observer ──
      expect(errors, `WS ERROR messages received during Relax golden path:\n${errors.join('\n')}`).toEqual([]);

      console.log('[RELAX-GOLDEN] All async scenarios S1–S9 passed.');
    } finally {
      await browser.close();
    }
  });
});
