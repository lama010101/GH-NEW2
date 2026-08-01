import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  TEST_USERS,
  BASE_URL,
  DESKTOP_PRESET,
  NAV_TIMEOUT,
  STATE_TIMEOUT,
  createAsyncGame,
  createReadonlyClient,
  startPlayerViaWS,
  completeAllRoundsViaWS,
  submitGuessViaWS,
  advanceToNextRoundViaWS,
  assertNoBannedText,
  getVisibleStatus,
  updateSessionDeadline,
  finalizeSessionDeadline,
  takeScreenshot,
  Violation,
} from '../helpers/relax-shared';
import { captureResumeToken, diffResumeTokens } from '../orchestrator/observer';
import { ensureLoggedIn, loginViaAuthModal } from '../helpers/auth-ui';
import { CompeteWSClient } from '../orchestrator/websocketClient';
import type { TestUser } from '../fixtures/auth';

const USERS = TEST_USERS.slice(0, 6);

async function setupSixPlayers(): Promise<{
  browser: any;
  contexts: any[];
  pages: Page[];
}> {
  const browser = await chromium.launch({ headless: true });
  const contexts = await Promise.all(USERS.map(() => browser.newContext(DESKTOP_PRESET)));
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  await Promise.all(
    pages.map((page) =>
      page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
    ),
  );
  await Promise.all(pages.map((page, i) => ensureLoggedIn(page, USERS[i])));
  return { browser, contexts, pages };
}

async function navigateAllToGame(pages: Page[], gameId: string) {
  await Promise.all(
    pages.map((page) =>
      page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
    ),
  );
}

async function reconnectToGame(
  browser: any,
  gameId: string,
  user: TestUser,
): Promise<Page> {
  // Open a fresh browser context and log in to avoid Playwright cookie/localStorage
  // flakiness when reconnecting after a tab close.
  const ctx = await browser.newContext(DESKTOP_PRESET);
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await loginViaAuthModal(page, user);
  await page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  return page;
}

async function createObservers(gameId: string, violations: Violation[]): Promise<CompeteWSClient[]> {
  return Promise.all(
    USERS.map((user, i) => createReadonlyClient(gameId, user, user.id, `P${i + 1}`, violations)),
  );
}

async function assertNoBannedTextAll(pages: Page[], violations: Violation[]) {
  for (let i = 0; i < pages.length; i++) {
    await assertNoBannedText(pages[i], `P${i + 1}`, violations);
  }
}

function expectNoViolations(violations: Violation[], label: string) {
  expect(violations, `${label} invariant violations:${violations.map((v) => `\n  - ${v}`).join('')}`).toEqual([]);
}

test.describe('Relax 6P — disconnect, reconnect and refresh (DR01–DR10)', () => {
  let browser: any;
  let contexts: any[];
  let pages: Page[];

  test.beforeAll(async () => {
    const setup = await setupSixPlayers();
    browser = setup.browser;
    contexts = setup.contexts;
    pages = setup.pages;
  });

  test.afterAll(async () => {
    if (browser) await browser.close();
  });

  test('DR01–DR08: tab close/reopen and refresh do not pause or regress other players', async () => {
    test.setTimeout(240000);
    const violations: Violation[] = [];
    const gameId = await createAsyncGame(pages[0], USERS[0], { roundTimerSec: 0 });
    await navigateAllToGame(pages, gameId);
    const clients = await createObservers(gameId, violations);
    await Promise.all(clients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));

    // Start P1–P3 sequentially to avoid per-player start races.
    for (const client of [clients[0], clients[1], clients[2]]) {
      await startPlayerViaWS(client);
    }
    await Promise.all(
      [clients[0], clients[1], clients[2]].map((c) =>
        c.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      ),
    );

    // DR03: Refreshing/reconnecting a player in the lobby keeps them in the lobby.
    const p4Before = await captureResumeToken(pages[3]);
    await pages[3].reload({ waitUntil: 'domcontentloaded' });
    const p4New = await reconnectToGame(browser, gameId, USERS[3]);
    pages[3] = p4New;
    const p4After = await captureResumeToken(p4New);
    const p4Diffs = diffResumeTokens(p4Before, p4After, 'P4-lobby-refresh');
    expect(p4Diffs, `P4 lobby refresh diffs: ${p4Diffs.join(', ')}`).toEqual([]);
    expect(p4After.status).toBe('lobby-shell');

    // DR01/DR02: P2 closes tab mid-round, waits, then reconnects.
    const p2Before = await captureResumeToken(pages[1]);
    await pages[1].close();
    await pages[0].waitForTimeout(3000);

    // Meanwhile P1 submits and P3 submits + advances to round 1.
    await submitGuessViaWS(clients[0], 0, 1920, 10, 20);
    await submitGuessViaWS(clients[2], 0, 1930, 30, 40);
    await advanceToNextRoundViaWS(clients[2], 0);
    expect(clients[2].getLastSnapshot()?.status).toBe('ROUND_ACTIVE');
    expect(clients[2].getLastSnapshot()?.currentRoundIndex).toBe(1);

    // P2 reconnects. In Relax, P3's actions must not change P2's state.
    const p2New = await reconnectToGame(browser, gameId, USERS[1]);
    pages[1] = p2New;
    const p2ReconnectedStatus = await getVisibleStatus(p2New);
    expect(p2ReconnectedStatus, 'P2 should resume in ROUND_ACTIVE round 0').toBe('ROUND_ACTIVE');
    const p2After = await captureResumeToken(p2New);
    expect(p2After.testid).toBe('round-active-section');
    expect(p2After.status).toBe('ROUND_ACTIVE');
    expect(p2After.roundIndex).toBe('0');
    await takeScreenshot(p2New, 'dr02-p2-reconnect-round0');

    // P2 continues independently and reaches round 1.
    await submitGuessViaWS(clients[1], 0, 1940, 40, 50);
    await advanceToNextRoundViaWS(clients[1], 0);
    expect(clients[1].getLastSnapshot()?.status).toBe('ROUND_ACTIVE');
    expect(clients[1].getLastSnapshot()?.currentRoundIndex).toBe(1);

    // DR05: Host (P1) closes tab. P2 should still be able to continue.
    const p1Before = await captureResumeToken(pages[0]);
    await pages[0].close();
    await new Promise((r) => setTimeout(r, 3000));

    // P2 submits round 1 while host is offline.
    await submitGuessViaWS(clients[1], 1, 1950, 50, 60);
    expect(clients[1].getLastSnapshot()?.status).toBe('ROUND_COMPLETE');
    expect(clients[1].getLastSnapshot()?.currentRoundIndex).toBe(1);

    // Host reconnects and should still be at round 0 result (not forced ahead).
    const p1New = await reconnectToGame(browser, gameId, USERS[0]);
    pages[0] = p1New;
    await p1New
      .locator('[data-testid="round-complete-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
    const p1After = await captureResumeToken(p1New);
    expect(p1After.testid).toBe('round-complete-section');
    expect(p1After.status).toBe('ROUND_COMPLETE');
    expect(p1After.roundIndex).toBe('0');

    // DR04: Refresh during result phase should keep the "Next" button enabled.
    const nextBtn = p1New.locator('[data-testid="round-next-btn"]').first();
    await expect(nextBtn).toBeEnabled({ timeout: 10000 });
    const beforeRefresh = await captureResumeToken(p1New);
    await p1New.reload({ waitUntil: 'domcontentloaded' });
    await p1New
      .locator('[data-testid="round-complete-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
    const afterRefresh = await captureResumeToken(p1New);
    expect(diffResumeTokens(beforeRefresh, afterRefresh, 'P1-result-refresh')).toEqual([]);
    await expect(p1New.locator('[data-testid="round-next-btn"]').first()).toBeEnabled({ timeout: 10000 });

    await assertNoBannedTextAll(pages, violations);
    expectNoViolations(violations, 'DR01–DR08');
  });

  test('DR09–DR10: reconnect after timer expiry and session deadline', async () => {
    test.setTimeout(240000);
    const violations: Violation[] = [];

    // DR09: timer expiry while disconnected.
    const timerGameId = await createAsyncGame(pages[0], USERS[0], { roundTimerSec: 15 });
    await navigateAllToGame(pages, timerGameId);
    const timerClients = await createObservers(timerGameId, violations);
    await Promise.all(timerClients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));

    await startPlayerViaWS(timerClients[0]);
    await timerClients[0].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT);
    await startPlayerViaWS(timerClients[1]);
    await timerClients[1].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT);

    // P1 closes tab before timer expires.
    await pages[0].close();
    await pages[1].waitForTimeout(3000);

    // P1's timer expires while offline.
    await timerClients[0].waitForState((s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0, 25000);
    const p1Me = timerClients[0].getLastSnapshot()?.players.find((p) => p.playerId === USERS[0].id);
    expect(p1Me?.hasSubmitted).toBe(false);

    // P2 continues and can advance independently.
    await submitGuessViaWS(timerClients[1], 0, 1960, 60, 70);
    await advanceToNextRoundViaWS(timerClients[1], 0);
    expect(timerClients[1].getLastSnapshot()?.status).toBe('ROUND_ACTIVE');
    expect(timerClients[1].getLastSnapshot()?.currentRoundIndex).toBe(1);

    // P1 reconnects and should see the timer-expired result, then advance.
    const p1New = await reconnectToGame(browser, timerGameId, USERS[0]);
    pages[0] = p1New;
    await p1New
      .locator('[data-testid="round-complete-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
    await takeScreenshot(p1New, 'dr09-reconnect-after-timer-expiry');

    await p1New.locator('[data-testid="round-next-btn"]').first().click();
    await p1New
      .locator('[data-testid="round-active-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
    expect(await getVisibleStatus(p1New)).toBe('ROUND_ACTIVE');

    // DR10: session deadline while disconnected.
    const deadlineGameId = await createAsyncGame(pages[0] || contexts[0].newPage(), USERS[0], { roundTimerSec: 0 });
    const deadlinePage = pages[0];
    await deadlinePage.goto(`${BASE_URL}/compete/${deadlineGameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    const deadlineClients = await createObservers(deadlineGameId, violations);
    await Promise.all(deadlineClients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));

    await startPlayerViaWS(deadlineClients[0]);
    await deadlineClients[0].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT);

    // P1 closes tab, then the session deadline passes.
    await deadlinePage.close();
    await pages[1].waitForTimeout(1000);
    const pastDeadline = new Date(Date.now() - 60_000);
    await updateSessionDeadline(deadlineGameId, pastDeadline);
    await finalizeSessionDeadline(deadlineGameId);

    // P1 reconnects; should be finalized and session complete.
    const p1DeadlineNew = await reconnectToGame(browser, deadlineGameId, USERS[0]);
    pages[0] = p1DeadlineNew;
    await p1DeadlineNew
      .locator('[data-testid="session-complete-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
    await takeScreenshot(p1DeadlineNew, 'dr10-reconnect-after-deadline');
    expect(await getVisibleStatus(p1DeadlineNew)).toBe('SESSION_COMPLETE');

    await assertNoBannedTextAll(pages, violations);
    expectNoViolations(violations, 'DR09–DR10');
  });
});
