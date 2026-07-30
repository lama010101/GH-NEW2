import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TEST_USERS, fetchAccessToken } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, CompeteSnapshot } from '../orchestrator/websocketClient';

// ─────────────────────────────────────────────────────────────────────
// MP-BUILD-RELAX-STARTROSTER-GOLDENPATH-005 — Relax Start + Roster
//
// Three-context Playwright spec: 1 host + 2 guests in an async (Relax)
// session. UI-driven for the per-player start clicks; WebSocket orchestrator
// fast-forwards the host through all 5 rounds. Asserts per-viewer state and
// the roster pills rendered from server-provided `roundStatus`.
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

const HOST_USER = TEST_USERS[0];
const GUEST_B_USER = TEST_USERS[1];
const GUEST_C_USER = TEST_USERS[2];

const BANNED_LOBBY_TEXT = ['waiting for others', 'starting soon', 'players ready'];

async function assertNoBannedLobbyText(page: Page, label: string) {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const lower = text.toLowerCase();
  for (const banned of BANNED_LOBBY_TEXT) {
    expect(lower, `[${label}] Banned lobby text found: "${banned}"`).not.toContain(banned);
  }
}

async function getRosterRowText(page: Page, playerId: string): Promise<string> {
  const row = page.locator(`[data-testid="lobby-player-${playerId}"]`).first();
  const text = await row.textContent({ timeout: 10000 }).catch(() => '');
  return text || '';
}

function createWS(
  gameId: string,
  user: typeof TEST_USERS[0],
  accessToken: string,
  errors: string[],
  playerSubmittedEvents: { playerId: string; playerName: string }[],
): CompeteWSClient {
  return new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST,
    gameId,
    user,
    displayName: user.displayName,
    accessToken,
    onStateUpdate: (snapshot: CompeteSnapshot) => {
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
}

test('Relax per-player start + roster states — S1 through S7', async () => {
  const errors: string[] = [];
  const playerSubmittedEvents: { playerId: string; playerName: string }[] = [];

  const browser = await chromium.launch({ headless: true });
  try {
    // ── S0: Setup — three separate contexts/pages ──
    const [hostCtx, guestBCtx, guestCCtx] = await Promise.all([
      browser.newContext(DESKTOP_PRESET),
      browser.newContext(DESKTOP_PRESET),
      browser.newContext(DESKTOP_PRESET),
    ]);
    const [hostPage, guestBPage, guestCPage] = await Promise.all([
      hostCtx.newPage(),
      guestBCtx.newPage(),
      guestCCtx.newPage(),
    ]);

    await Promise.all([
      hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      guestBPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      guestCPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
    ]);

    await Promise.all([
      ensureLoggedIn(hostPage, HOST_USER),
      ensureLoggedIn(guestBPage, GUEST_B_USER),
      ensureLoggedIn(guestCPage, GUEST_C_USER),
    ]);

    // ── S1: Host creates async session ──
    const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
      data: {
        displayName: HOST_USER.displayName,
        playerId: HOST_USER.id,
        mode: 'async',
        totalRounds: 5,
        roundTimerSec: 0,
      },
      timeout: NAV_TIMEOUT,
    });
    expect(createRes.ok(), `Create game failed: ${createRes.status()}`).toBeTruthy();
    const sessionData = await createRes.json();
    const gameId = sessionData.gameId || sessionData.id;
    expect(gameId, 'Create game returned no gameId').toBeTruthy();
    console.log(`[RELAX-GOLDEN] Game created: ${gameId}`);

    // ── S1: All three players navigate to the game ──
    await Promise.all([
      hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      guestBPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      guestCPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
    ]);

    await Promise.all([
      hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      guestBPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      guestCPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
    ]);

    // Attach per-player WS orchestrators (separate from the browser sockets)
    const hostToken = await fetchAccessToken(HOST_USER);
    const guestBToken = await fetchAccessToken(GUEST_B_USER);
    const guestCToken = await fetchAccessToken(GUEST_C_USER);

    const hostWS = createWS(gameId, HOST_USER, hostToken, errors, playerSubmittedEvents);
    const guestBWS = createWS(gameId, GUEST_B_USER, guestBToken, errors, playerSubmittedEvents);
    const guestCWS = createWS(gameId, GUEST_C_USER, guestCToken, errors, playerSubmittedEvents);
    await Promise.all([hostWS.connect(), guestBWS.connect(), guestCWS.connect()]);

    // Wait for all three to reach LOBBY
    await Promise.all([
      hostWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT),
      guestBWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT),
      guestCWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT),
    ]);

    // S1 assertions: roster shows 3 joined players
    const joinedSnapshot = hostWS.getLastSnapshot()!;
    expect(joinedSnapshot.players.length, 'S1: 3 players in lobby').toBe(3);
    expect(joinedSnapshot.config.mode, 'S1: mode is async').toBe('async');

    await expect(guestCPage.locator('[data-testid^="lobby-player-"]')).toHaveCount(3, { timeout: 10000 });
    for (const user of [HOST_USER, GUEST_B_USER, GUEST_C_USER]) {
      const rowText = await getRosterRowText(guestCPage, user.id);
      expect(rowText.toLowerCase(), `S1: ${user.displayName} should show Joined`).toContain('joined');
    }
    await assertNoBannedLobbyText(hostPage, 'S1-host');
    await assertNoBannedLobbyText(guestBPage, 'S1-guestB');
    await assertNoBannedLobbyText(guestCPage, 'S1-guestC');
    console.log('[RELAX-GOLDEN] S1 passed: 3 players joined');

    // ── S2: Host clicks Start/Ready; only host starts ──
    await hostPage.getByTestId('lobby-ready-btn').first().click();

    await Promise.all([
      hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      guestBWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT),
      guestCWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT),
    ]);

    // S2 assertions: host is playing; B and C are still joined
    expect(hostWS.getLastSnapshot()!.status, 'S2: host status').toBe('ROUND_ACTIVE');
    expect(guestBWS.getLastSnapshot()!.status, 'S2: guestB status').toBe('LOBBY');
    expect(guestCWS.getLastSnapshot()!.status, 'S2: guestC status').toBe('LOBBY');

    const hostRowS2 = await getRosterRowText(guestCPage, HOST_USER.id);
    expect(hostRowS2.toLowerCase(), 'S2: host roster pill').toContain('playing');
    const bRowS2 = await getRosterRowText(guestCPage, GUEST_B_USER.id);
    expect(bRowS2.toLowerCase(), 'S2: guestB roster pill').toContain('joined');
    const cRowS2 = await getRosterRowText(guestCPage, GUEST_C_USER.id);
    expect(cRowS2.toLowerCase(), 'S2: guestC roster pill').toContain('joined');

    await assertNoBannedLobbyText(guestBPage, 'S2-guestB');
    await assertNoBannedLobbyText(guestCPage, 'S2-guestC');
    console.log('[RELAX-GOLDEN] S2 passed: host started, others not auto-started');

    // ── S3: Guest B independently starts ──
    await guestBPage.getByTestId('lobby-ready-btn').first().click();

    await Promise.all([
      guestBWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      // Host and C remain unaffected
      hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT, true),
      guestCWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT, true),
    ]);

    expect(guestBWS.getLastSnapshot()!.status, 'S3: guestB status').toBe('ROUND_ACTIVE');
    expect(hostWS.getLastSnapshot()!.status, 'S3: host status unchanged').toBe('ROUND_ACTIVE');
    expect(guestCWS.getLastSnapshot()!.status, 'S3: guestC status unchanged').toBe('LOBBY');

    const hostRowS3 = await getRosterRowText(guestCPage, HOST_USER.id);
    expect(hostRowS3.toLowerCase(), 'S3: host roster pill').toContain('playing');
    const bRowS3 = await getRosterRowText(guestCPage, GUEST_B_USER.id);
    expect(bRowS3.toLowerCase(), 'S3: guestB roster pill').toContain('playing');
    const cRowS3 = await getRosterRowText(guestCPage, GUEST_C_USER.id);
    expect(cRowS3.toLowerCase(), 'S3: guestC roster pill').toContain('joined');

    await assertNoBannedLobbyText(guestCPage, 'S3-guestC');
    console.log('[RELAX-GOLDEN] S3 passed: guestB independently started');

    // ── S4: No banned waiting/starting-soon/players-ready text ──
    // Already asserted after each of S1-S3; re-check for all lobby views.
    await assertNoBannedLobbyText(hostPage, 'S4-host');
    await assertNoBannedLobbyText(guestBPage, 'S4-guestB');
    await assertNoBannedLobbyText(guestCPage, 'S4-guestC');
    console.log('[RELAX-GOLDEN] S4 passed: no banned lobby text');

    // ── S7: Re-send START_GAME for host (already active) — must reject/no-op ──
    const preDoubleStartStatus = hostWS.getLastSnapshot()!.status;
    const preDoubleStartRound = hostWS.getLastSnapshot()!.currentRoundIndex;
    hostWS.startGame();
    await hostPage.waitForTimeout(1000);
    expect(hostWS.getLastSnapshot()!.status, 'S7: host status unchanged after double START_GAME').toBe(preDoubleStartStatus);
    expect(hostWS.getLastSnapshot()!.currentRoundIndex, 'S7: host round unchanged after double START_GAME').toBe(preDoubleStartRound);
    expect(errors, 'S7: server rejected duplicate START_GAME').toContain(`[${HOST_USER.displayName}] START_GAME only allowed in LOBBY phase`);
    console.log('[RELAX-GOLDEN] S7 passed: duplicate START_GAME rejected');

    // ── S5: Fast-forward host through all 5 rounds ──
    for (let round = 0; round < 5; round++) {
      hostWS.submitGuess(round, 1900, 0, 0, []);
      await hostWS.waitForState((s) => {
        if (round === 4) return s.status === 'SESSION_COMPLETE';
        return s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === round;
      }, STATE_TIMEOUT, true);

      if (round < 4) {
        hostWS.readyNext(round);
        await hostWS.waitForState(
          (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === round + 1,
          STATE_TIMEOUT,
          true,
        );
      }
    }

    expect(hostWS.getLastSnapshot()!.status, 'S5: host finished').toBe('SESSION_COMPLETE');
    console.log('[RELAX-GOLDEN] S5 passed: host finished all 5 rounds');

    // ── S6: Roster shows finished (host), playing (B), joined (C) simultaneously ──
    await guestCWS.waitForState(
      (s) => s.players.find((p) => p.playerId === HOST_USER.id)?.roundStatus === 'finished',
      STATE_TIMEOUT,
    );

    const hostRowS6 = await getRosterRowText(guestCPage, HOST_USER.id);
    expect(hostRowS6.toLowerCase(), 'S6: host roster pill finished').toContain('finished');
    const bRowS6 = await getRosterRowText(guestCPage, GUEST_B_USER.id);
    expect(bRowS6.toLowerCase(), 'S6: guestB roster pill playing').toContain('playing');
    const cRowS6 = await getRosterRowText(guestCPage, GUEST_C_USER.id);
    expect(cRowS6.toLowerCase(), 'S6: guestC roster pill joined').toContain('joined');

    console.log('[RELAX-GOLDEN] S6 passed: finished/playing/joined simultaneously');
  } finally {
    await browser.close();
  }
});
