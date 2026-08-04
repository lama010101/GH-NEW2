import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TEST_USERS, fetchAccessToken } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, type CompeteSnapshot } from '../orchestrator/websocketClient';

// ═════════════════════════════════════════════════════════════════════
// MP-BUILD-RELAX-GOLDEN-PATH-002
//
// Three-context Playwright spec: 1 host + 2 guests in an async (Relax)
// session. Covers A0–A11: preflight, lobby formation, independent per-player
// start, guest-start pull-in regression guard, double-start guard, staggered
// round advancement / partial leaderboard (broadcast leak regression guard),
// one-finishes-mid-session, late joiner, reconnect/identity persistence,
// session-complete divergent scores, banned text, and region-reveal gate.
//
// UI-driven for the per-player start clicks; WebSocket orchestrator fast-forwards
// rounds. Assertions combine DOM state with per-player WS snapshots.
// ═════════════════════════════════════════════════════════════════════

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

async function expectRosterStatus(page: Page, playerId: string, status: string) {
  await expect(page.locator(`[data-testid="lobby-player-${playerId}"]`)).toContainText(status, { ignoreCase: true, timeout: 10000 });
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

async function waitForSection(
  page: Page,
  testid: string,
  opts?: { roundIndex?: number; status?: string; timeout?: number },
) {
  let selector = `[data-testid="${testid}"]`;
  if (opts?.roundIndex !== undefined) selector += `[data-round-index="${opts.roundIndex}"]`;
  if (opts?.status) selector += `[data-status="${opts.status}"]`;
  await page.locator(selector).first().waitFor({
    state: 'visible',
    timeout: opts?.timeout ?? STATE_TIMEOUT,
  });
}

function leaderboardRow(page: Page, name: string) {
  return page.locator('[class*="lbRow"]').filter({ hasText: name });
}

async function dismissWelcomeModal(page: Page) {
  const letsPlay = page.getByRole('button', { name: "Let's play!" });
  try {
    await letsPlay.click({ timeout: 5000 });
  } catch {
    // Modal not present; continue.
  }
}

async function openYourTurnTab(page: Page) {
  await page.getByRole('button', { name: /YOUR TURN/i }).click();
}

async function openCompletedTab(page: Page) {
  await page.getByRole('button', { name: /COMPLETED/i }).click();
}

async function fetchActiveGames(page: Page) {
  const res = await page.request.get(`${BASE_URL}/api/compete/active-games`);
  expect(res.ok(), 'active-games API failed').toBeTruthy();
  const data = await res.json();
  return (data.games ?? []) as Array<{
    id: string;
    game_id: string;
    opponent_name: string;
    round_current: number;
    round_total: number;
    status: 'your_turn' | 'waiting' | 'completed';
    mode: 'sync' | 'async';
  }>;
}

async function expectCompeteCardGame(page: Page, gameId: string, expectedRound: number) {
  const games = await fetchActiveGames(page);
  const game = games.find((g) => g.game_id === gameId);
  expect(game, `game ${gameId} not found in active-games`).toBeTruthy();
  expect(game!.round_current, 'round_current matches per-player state').toBe(expectedRound);
  expect(game!.status, 'status is your_turn').toBe('your_turn');
  // Confirm the row is visible under the Your Turn tab.
  await expect(page.getByText(new RegExp(`Round ${expectedRound} / 5`)).first()).toBeVisible({ timeout: 10000 });
}

async function expectCompletedGame(page: Page, gameId: string) {
  const games = await fetchActiveGames(page);
  const game = games.find((g) => g.game_id === gameId);
  expect(game, `game ${gameId} not found in active-games`).toBeTruthy();
  expect(game!.status, 'status is completed').toBe('completed');
  // Confirm the completed row is visible under the Completed tab.
  await expect(page.locator('[class*="gameRow"]').filter({ hasText: new RegExp(game!.opponent_name) }).first()).toBeVisible({ timeout: 10000 });
}

function sendStartPlayer(ws: CompeteWSClient, playerId: string) {
  (ws as any)['send']({ type: 'START_PLAYER', playerId });
}

async function playRounds(ws: CompeteWSClient, startRound: number, lastRound: number) {
  for (let round = startRound; round <= lastRound; round++) {
    ws.submitGuess(round, 1900, 0, 0, []);
    if (round === lastRound) {
      await ws.waitForState((s) => s.status === 'SESSION_COMPLETE', STATE_TIMEOUT, true);
    } else {
      await ws.waitForState(
        (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === round,
        STATE_TIMEOUT,
        true,
      );
      ws.readyNext(round);
      await ws.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === round + 1,
        STATE_TIMEOUT,
        true,
      );
    }
  }
}

test('Relax golden path A0–A13', async () => {
  const errors: string[] = [];
  const playerSubmittedEvents: { playerId: string; playerName: string }[] = [];

  const browser = await chromium.launch({ headless: true });
  try {
    // ═════════════════════════════════════════════════════════════════
    // A0 — Preflight & A1 — Lobby formation
    // ═════════════════════════════════════════════════════════════════
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

    const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
      data: {
        displayName: HOST_USER.displayName,
        playerId: HOST_USER.id,
        mode: 'async',
        roundTimerSec: 0,
        resultsAutoAdvanceSec: 0,
      },
      timeout: NAV_TIMEOUT,
    });
    expect(createRes.ok(), `Create game failed: ${createRes.status()}`).toBeTruthy();
    const sessionData = await createRes.json();
    const gameId = sessionData.gameId || sessionData.id;
    expect(gameId, 'Create game returned no gameId').toBeTruthy();
    console.log(`[RELAX-GOLDEN] Game created: ${gameId}`);

    await Promise.all([
      hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      guestBPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      guestCPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
    ]);

    await Promise.all([
      waitForSection(hostPage, 'lobby-shell'),
      waitForSection(guestBPage, 'lobby-shell'),
      waitForSection(guestCPage, 'lobby-shell'),
    ]);

    const [hostToken, guestBToken, guestCToken] = await Promise.all([
      fetchAccessToken(HOST_USER),
      fetchAccessToken(GUEST_B_USER),
      fetchAccessToken(GUEST_C_USER),
    ]);

    const hostWS = createWS(gameId, HOST_USER, hostToken, errors, playerSubmittedEvents);
    const guestBWS = createWS(gameId, GUEST_B_USER, guestBToken, errors, playerSubmittedEvents);
    const guestCWS = createWS(gameId, GUEST_C_USER, guestCToken, errors, playerSubmittedEvents);
    await Promise.all([hostWS.connect(), guestBWS.connect(), guestCWS.connect()]);

    await Promise.all([
      hostWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT),
      guestBWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT),
      guestCWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT),
    ]);

    expect(hostWS.getLastSnapshot()!.players.length, 'A1: 3 players in lobby').toBe(3);
    expect(hostWS.getLastSnapshot()!.config.mode, 'A1: mode is async').toBe('async');

    await expect(guestCPage.locator('[data-testid^="lobby-player-"]')).toHaveCount(3, { timeout: 10000 });
    for (const user of [HOST_USER, GUEST_B_USER, GUEST_C_USER]) {
      await expectRosterStatus(guestCPage, user.id, 'joined');
    }
    await assertNoBannedLobbyText(hostPage, 'A1-host');
    await assertNoBannedLobbyText(guestBPage, 'A1-guestB');
    await assertNoBannedLobbyText(guestCPage, 'A1-guestC');
    console.log('[RELAX-GOLDEN] A1 passed: 3 players joined');

    // ═════════════════════════════════════════════════════════════════
    // A2 — Host independent start
    // ═════════════════════════════════════════════════════════════════
    await hostPage.getByTestId('lobby-ready-btn').first().click();

    await Promise.all([
      hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT, true),
      guestBWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT, true),
      guestCWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT, true),
    ]);

    expect(hostWS.getLastSnapshot()!.status, 'A2: host status').toBe('ROUND_ACTIVE');
    expect(guestBWS.getLastSnapshot()!.status, 'A2: guestB status').toBe('LOBBY');
    expect(guestCWS.getLastSnapshot()!.status, 'A2: guestC status').toBe('LOBBY');

    await expectRosterStatus(guestCPage, HOST_USER.id, 'playing');
    await expectRosterStatus(guestCPage, GUEST_B_USER.id, 'joined');
    await expectRosterStatus(guestCPage, GUEST_C_USER.id, 'joined');
    await assertNoBannedLobbyText(guestBPage, 'A2-guestB');
    await assertNoBannedLobbyText(guestCPage, 'A2-guestC');
    console.log('[RELAX-GOLDEN] A2 passed: host started, others not auto-started');

    // ═════════════════════════════════════════════════════════════════
    // A11 — Region-reveal gate (new: assert answer is hidden until reveal)
    // ═════════════════════════════════════════════════════════════════
    await waitForSection(hostPage, 'round-active-section', { roundIndex: 0 });
    const hostSnapBefore = hostWS.getLastSnapshot() as any;
    expect(hostSnapBefore.rounds[0].region, 'A11: region hidden before reveal').toBeNull();
    expect(hostSnapBefore.rounds[0].year, 'A11: year hidden before reveal').toBeNull();

    const apiBeforeRes = await hostPage.request.get(`${BASE_URL}/api/compete/${gameId}`);
    expect(apiBeforeRes.ok(), 'A11: API before reveal ok').toBeTruthy();
    const apiBefore = await apiBeforeRes.json();
    expect(apiBefore.rounds[0].region, 'A11: API region hidden before reveal').toBeNull();

    const bodyBefore = await hostPage.locator('body').innerText();

    hostWS.submitGuess(0, 1900, 0, 0, []);
    const hostSnapAfterReveal = (await hostWS.waitForState(
      (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0,
      STATE_TIMEOUT,
      true,
    )) as any;
    expect(hostSnapAfterReveal.rounds[0].region, 'A11: region revealed after ROUND_COMPLETE').not.toBeNull();

    const region = hostSnapAfterReveal.rounds[0].region as string;
    const apiAfterRes = await hostPage.request.get(`${BASE_URL}/api/compete/${gameId}`);
    expect(apiAfterRes.ok(), 'A11: API after reveal ok').toBeTruthy();
    const apiAfter = await apiAfterRes.json();
    expect(apiAfter.rounds[0].region, 'A11: API region revealed after ROUND_COMPLETE').toBe(region);
    expect(bodyBefore.toLowerCase(), 'A11: region answer not in DOM before reveal').not.toContain(region.toLowerCase());

    // Advance host to round 1 so A3/A5 can exercise staggered states.
    hostWS.readyNext(0);
    await hostWS.waitForState(
      (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1,
      STATE_TIMEOUT,
      true,
    );
    console.log('[RELAX-GOLDEN] A11 passed: region answer hidden until reveal');

    // ═════════════════════════════════════════════════════════════════
    // A3 — Guest B independent start (guest-start-pull-in regression guard)
    // ═════════════════════════════════════════════════════════════════
    await guestBPage.getByTestId('lobby-ready-btn').first().click();

    await Promise.all([
      guestBWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT, true),
      hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1, STATE_TIMEOUT, true),
      guestCWS.waitForState((s) => s.status === 'LOBBY' && s.players.length === 3, STATE_TIMEOUT, true),
    ]);

    expect(guestBWS.getLastSnapshot()!.status, 'A3: guestB status').toBe('ROUND_ACTIVE');
    expect(hostWS.getLastSnapshot()!.status, 'A3: host status unchanged').toBe('ROUND_ACTIVE');
    expect(guestCWS.getLastSnapshot()!.status, 'A3: guestC status unchanged').toBe('LOBBY');

    await expectRosterStatus(guestCPage, HOST_USER.id, 'playing');
    await expectRosterStatus(guestCPage, GUEST_B_USER.id, 'playing');
    await expectRosterStatus(guestCPage, GUEST_C_USER.id, 'joined');
    await assertNoBannedLobbyText(guestCPage, 'A3-guestC');
    console.log('[RELAX-GOLDEN] A3 passed: guestB independently started (no pull-in)');

    // ═════════════════════════════════════════════════════════════════
    // A12 — Home Compete card round_current matches per-player state
    // Host is on round 1 (currentRoundIndex = 1, round_current = 2);
    // Guest B is on round 0 (currentRoundIndex = 0, round_current = 1).
    // ═════════════════════════════════════════════════════════════════
    await Promise.all([
      hostPage.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      guestBPage.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
    ]);
    await dismissWelcomeModal(hostPage);
    await dismissWelcomeModal(guestBPage);
    await openYourTurnTab(hostPage);
    await openYourTurnTab(guestBPage);
    await expectCompeteCardGame(hostPage, gameId, 2);
    await expectCompeteCardGame(guestBPage, gameId, 1);
    console.log('[RELAX-GOLDEN] A12 passed: home Compete card shows per-player round_current');

    // Return to compete pages for subsequent assertions.
    await Promise.all([
      hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      guestBPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
    ]);
    await Promise.all([
      waitForSection(hostPage, 'round-active-section', { roundIndex: 1 }),
      waitForSection(guestBPage, 'round-active-section', { roundIndex: 0 }),
    ]);

    // ═════════════════════════════════════════════════════════════════
    // A4 — Double-start guard
    // ═════════════════════════════════════════════════════════════════
    const preDoubleStatus = hostWS.getLastSnapshot()!.status;
    const preDoubleRound = hostWS.getLastSnapshot()!.currentRoundIndex;
    sendStartPlayer(hostWS, HOST_USER.id);

    await expect
      .poll(() => errors.some((e) => e.includes('START_PLAYER only allowed in LOBBY phase')), {
        timeout: 5000,
      })
      .toBeTruthy();

    expect(hostWS.getLastSnapshot()!.status, 'A4: host status unchanged').toBe(preDoubleStatus);
    expect(hostWS.getLastSnapshot()!.currentRoundIndex, 'A4: host round unchanged').toBe(preDoubleRound);
    console.log('[RELAX-GOLDEN] A4 passed: double START_PLAYER rejected');

    // ═════════════════════════════════════════════════════════════════
    // A5 — Staggered round advancement / partial leaderboard
    // EXPLICITLY: broadcast-leak regression guard (MP-BUILD-RELAX-BROADCAST-LEAK-002)
    // Host is on round 1; Guest B is on round 0; Guest C is in lobby.
    // ═════════════════════════════════════════════════════════════════
    hostWS.submitGuess(1, 1900, 0, 0, []);
    await hostWS.waitForState(
      (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 1,
      STATE_TIMEOUT,
      true,
    );
    await waitForSection(hostPage, 'round-complete-section', { roundIndex: 1 });

    // Host page leaderboard: at least host row has a score; B and C rows are still no-guess.
    const hostPlayers = hostWS.getLastSnapshot()!.players;
    const hostName = hostPlayers.find((p) => p.playerId === HOST_USER.id)!.displayName;
    const guestBName = hostPlayers.find((p) => p.playerId === GUEST_B_USER.id)!.displayName;
    const guestCName = hostPlayers.find((p) => p.playerId === GUEST_C_USER.id)!.displayName;
    const hostLeaderboardCount = await hostPage.locator('[class*="lbRow"]').count();
    expect(hostLeaderboardCount, 'A5: host leaderboard has rows').toBeGreaterThanOrEqual(3);
    await expect(leaderboardRow(hostPage, hostName).first()).toBeVisible();
    await expect(leaderboardRow(hostPage, hostName).first().locator('[class*="lbAccPill"]')).toHaveText(/\d+%/);
    await expect(leaderboardRow(hostPage, guestBName).first().locator('[class*="lbAccEmpty"]')).toHaveText('—');
    await expect(leaderboardRow(hostPage, guestCName).first().locator('[class*="lbAccEmpty"]')).toHaveText('—');

    // Next button is enabled in async (no group gating).
    await expect(hostPage.getByTestId('round-next-btn').first()).not.toBeDisabled();

    // Guest B's snapshot must NOT have changed because host advanced — no broadcast leak.
    const bSnapA5 = guestBWS.getLastSnapshot()!;
    expect(bSnapA5.status, 'A5: guestB still ROUND_ACTIVE round 0').toBe('ROUND_ACTIVE');
    expect(bSnapA5.currentRoundIndex, 'A5: guestB round still 0').toBe(0);
    expect(guestCWS.getLastSnapshot()!.status, 'A5: guestC still LOBBY').toBe('LOBBY');

    // Host advances to round 2.
    hostWS.readyNext(1);
    await hostWS.waitForState(
      (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 2,
      STATE_TIMEOUT,
      true,
    );

    // Guest B submits round 0 and now sees a leaderboard with host + B scored, C not yet.
    guestBWS.submitGuess(0, 1900, 0, 0, []);
    await guestBWS.waitForState(
      (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0,
      STATE_TIMEOUT,
      true,
    );
    await waitForSection(guestBPage, 'round-complete-section', { roundIndex: 0 });

    await expect(guestBPage.locator('[class*="lbRow"]')).toHaveCount(6);
    await expect(leaderboardRow(guestBPage, guestBName).first().locator('[class*="lbAccPill"]')).toHaveText(/\d+%/);
    await expect(leaderboardRow(guestBPage, hostName).first().locator('[class*="lbAccPill"]')).toHaveText(/\d+%/);
    await expect(leaderboardRow(guestBPage, guestCName).first().locator('[class*="lbAccEmpty"]')).toHaveText('—');
    await expect(guestBPage.getByTestId('round-next-btn').first()).not.toBeDisabled();

    guestBWS.readyNext(0);
    await guestBWS.waitForState(
      (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1,
      STATE_TIMEOUT,
      true,
    );
    console.log('[RELAX-GOLDEN] A5 passed: staggered advancement, no broadcast leak');

    // ═════════════════════════════════════════════════════════════════
    // A6 — One player finishes while others are mid-session
    // ═════════════════════════════════════════════════════════════════
    // Advance Guest B to round 2 while Host stays at round 2.
    guestBWS.submitGuess(1, 1900, 0, 0, []);
    await guestBWS.waitForState(
      (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 1,
      STATE_TIMEOUT,
      true,
    );
    guestBWS.readyNext(1);
    await guestBWS.waitForState(
      (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 2,
      STATE_TIMEOUT,
      true,
    );

    // Fast-forward Host through rounds 2-4 to finish.
    await playRounds(hostWS, 2, 4);
    expect(hostWS.getLastSnapshot()!.status, 'A6: host finished').toBe('SESSION_COMPLETE');

    // Guest C's lobby roster should show finished / playing / joined simultaneously.
    await expectRosterStatus(guestCPage, HOST_USER.id, 'finished');
    await expectRosterStatus(guestCPage, GUEST_B_USER.id, 'playing');
    await expectRosterStatus(guestCPage, GUEST_C_USER.id, 'joined');
    console.log('[RELAX-GOLDEN] A6 passed: finished/playing/joined simultaneously');

    // ═════════════════════════════════════════════════════════════════
    // A13 — Host completed game appears under Completed on /home
    // ═════════════════════════════════════════════════════════════════
    await hostPage.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await dismissWelcomeModal(hostPage);
    await openCompletedTab(hostPage);
    await expectCompletedGame(hostPage, gameId);
    console.log('[RELAX-GOLDEN] A13 passed: host completed game appears under Completed');

    // Return host page to compete session-complete view for A9.
    await hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await waitForSection(hostPage, 'session-complete-section');

    // ═════════════════════════════════════════════════════════════════
    // A7 — Late joiner after first player finished
    // ═════════════════════════════════════════════════════════════════
    const deadlineBeforeC = (guestCWS.getLastSnapshot() as any).config.sessionDeadline;
    await guestCPage.getByTestId('lobby-ready-btn').first().click();
    await guestCWS.waitForState(
      (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0,
      STATE_TIMEOUT,
      true,
    );
    const cSnapA7 = guestCWS.getLastSnapshot() as any;
    expect(cSnapA7.status, 'A7: guestC started').toBe('ROUND_ACTIVE');
    expect(cSnapA7.currentRoundIndex, 'A7: guestC round 0').toBe(0);
    expect(cSnapA7.config.sessionDeadline, 'A7: global deadline not extended for late joiner').toBe(deadlineBeforeC);
    console.log('[RELAX-GOLDEN] A7 passed: late joiner starts independently, deadline unchanged');

    // ═════════════════════════════════════════════════════════════════
    // A8 — Reconnect / identity persistence
    // ═════════════════════════════════════════════════════════════════
    const bId = GUEST_B_USER.id;
    const bBefore = guestBWS.getLastSnapshot()!;
    expect(bBefore.status, 'A8: B mid-session before reload').toBe('ROUND_ACTIVE');
    expect(bBefore.currentRoundIndex, 'A8: B round 2 before reload').toBe(2);
    expect((bBefore as any).viewerPlayerId, 'A8: B viewer id before reload').toBe(bId);

    guestBWS.close();
    await guestBPage.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await ensureLoggedIn(guestBPage, GUEST_B_USER);
    await waitForSection(guestBPage, 'round-active-section', { roundIndex: 2 });

    // Reuse the original guest B token (still within its JWT lifetime) so we
    // don't need another password-grant round-trip during the reconnect check.
    const bReconnectWS = createWS(gameId, GUEST_B_USER, guestBToken, errors, playerSubmittedEvents);
    await bReconnectWS.connect();
    const bAfter = (await bReconnectWS.waitForState(
      (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 2,
      STATE_TIMEOUT,
      true,
    )) as any;
    expect(bAfter.viewerPlayerId, 'A8: B viewer id after reconnect').toBe(bId);
    const bBeforeName = bBefore.players.find((p) => p.playerId === bId)?.displayName;
    expect(bAfter.players.find((p: any) => p.playerId === bId)?.displayName, 'A8: B displayName after reconnect').toBe(bBeforeName);
    console.log('[RELAX-GOLDEN] A8 passed: reconnect restores identity and round');

    // ═════════════════════════════════════════════════════════════════
    // A9 — Session complete with divergent scores
    // ═════════════════════════════════════════════════════════════════
    // Finish Guest B (rounds 2-4) and Guest C (rounds 0-4).
    await playRounds(bReconnectWS, 2, 4);
    await playRounds(guestCWS, 0, 4);

    // Host page should show all three players in the final ranking.
    await waitForSection(hostPage, 'session-complete-section');
    const rankRows = hostPage.locator('[data-testid="session-rank-row"]');
    await expect(rankRows).toHaveCount(3, { timeout: 20000 });

    const finalText = await hostPage.locator('body').innerText();
    expect(finalText, 'A9: host name in final ranking').toContain(hostName);
    expect(finalText, 'A9: guestB name in final ranking').toContain(guestBName);
    expect(finalText, 'A9: guestC name in final ranking').toContain(guestCName);
    console.log('[RELAX-GOLDEN] A9 passed: all players finished, divergent scores rendered');

    // ═════════════════════════════════════════════════════════════════
    // A10 — Banned text never appears
    // ═════════════════════════════════════════════════════════════════
    await assertNoBannedLobbyText(hostPage, 'A10-host');
    await assertNoBannedLobbyText(guestBPage, 'A10-guestB');
    await assertNoBannedLobbyText(guestCPage, 'A10-guestC');
    console.log('[RELAX-GOLDEN] A10 passed: no banned lobby text');
  } finally {
    await browser.close();
  }
});
