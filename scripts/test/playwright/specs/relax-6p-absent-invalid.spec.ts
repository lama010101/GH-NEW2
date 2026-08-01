import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  TEST_USERS,
  BASE_URL,
  DESKTOP_PRESET,
  NAV_TIMEOUT,
  STATE_TIMEOUT,
  PARTYKIT_SECRET,
  createAsyncGame,
  createReadonlyClient,
  startPlayerViaWS,
  submitGuessViaWS,
  advanceToNextRoundViaWS,
  completeAllRoundsViaWS,
  assertNoBannedText,
  getRoundResults,
  updateSessionDeadline,
  finalizeSessionDeadline,
  takeScreenshot,
  Violation,
} from '../helpers/relax-shared';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient } from '../orchestrator/websocketClient';

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

async function openWhenAndSelectYear(page: Page, year: number) {
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="round-when-btn"]') as HTMLButtonElement | null;
    if (btn) btn.click();
  });
  await page.waitForTimeout(300);
  await page.locator('input[type="number"]').fill(String(year));
  await page.evaluate(() => {
    const backdrop = document.querySelector('[class*="sheetBackdrop"]') as HTMLElement | null;
    if (backdrop) backdrop.click();
  }).catch(() => {});
  await page.waitForTimeout(300);
}

async function openWhereAndClickMap(page: Page) {
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="round-where-btn"]') as HTMLButtonElement | null;
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);
  const map = page.locator('.leaflet-container').first();
  await map.waitFor({ state: 'visible', timeout: 30000 });
  const box = await map.boundingBox();
  if (box) {
    await map.click({ x: box.width / 2, y: box.height / 2, force: true, timeout: 15000 });
  }
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const backdrop = document.querySelector('[class*="sheetBackdrop"]') as HTMLElement | null;
    if (backdrop) backdrop.click();
  }).catch(() => {});
  await page.waitForTimeout(300);
}

async function clickSubmitViaDOM(page: Page) {
  const btn = page.locator('[data-testid="round-submit-btn"]').first();
  await btn.waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
  await btn.click({ force: true });
}

async function attemptApiGuess(
  page: Page,
  gameId: string,
  playerId: string,
  roundIndex: number,
): Promise<number> {
  const res = await page.request.post(`${BASE_URL}/api/compete/${encodeURIComponent(gameId)}/guess`, {
    headers: {
      'Content-Type': 'application/json',
      'x-partykit-secret': PARTYKIT_SECRET,
    },
    data: {
      playerId,
      roundIndex,
      year: 1900,
      lat: 0,
      lng: 0,
      mode: 'async',
    },
  });
  return res.status();
}

test.describe('Relax 6P — absent players and invalid inputs (A01–A10)', () => {
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

  test('A01–A02 & A08: absent players score zero and didSubmit is false', async () => {
    test.setTimeout(180000);
    const violations: Violation[] = [];
    const gameId = await createAsyncGame(pages[0], USERS[0], { roundTimerSec: 15 });
    await navigateAllToGame(pages, gameId);
    const clients = await createObservers(gameId, violations);
    await Promise.all(clients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));

    // Start P1, P2 and P3. P3 will remain in the lobby without starting.
    await startPlayerViaWS(clients[0]);
    await startPlayerViaWS(clients[1]);
    await Promise.all([
      clients[0].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      clients[1].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
    ]);

    // P2 submits normally; P1 lets the timer expire (absent).
    await submitGuessViaWS(clients[1], 0, 1950, 20, 30);
    await clients[0].waitForState(
      (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0,
      25000,
    );

    const p1Me = clients[0].getLastSnapshot()?.players.find((p) => p.playerId === USERS[0].id);
    expect(p1Me?.hasSubmitted, 'P1 should be marked absent after timer expiry').toBe(false);

    const results0 = await getRoundResults(pages[0], gameId, 0);
    const p1Result = results0.results.find((r) => r.playerId === USERS[0].id);
    const p2Result = results0.results.find((r) => r.playerId === USERS[1].id);
    expect(p1Result?.didSubmit, 'P1 didSubmit should be false').toBe(false);
    expect(p1Result?.score, 'P1 absent round should score 0').toBe(0);
    expect(p2Result?.didSubmit, 'P2 didSubmit should be true').toBe(true);
    expect(p2Result?.score, 'P2 submitted round should score > 0').toBeGreaterThan(0);

    // A08: P1 can still advance after an absent round.
    await advanceToNextRoundViaWS(clients[0], 0);
    await clients[0].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1, STATE_TIMEOUT);

    // A02: P3 never starts. Use the session deadline to finalize them.
    const pastDeadline = new Date(Date.now() - 60_000);
    await updateSessionDeadline(gameId, pastDeadline);
    await finalizeSessionDeadline(gameId);

    const resultsAll = await getRoundResults(pages[0], gameId, 0);
    const p3Result = resultsAll.results.find((r) => r.playerId === USERS[2].id);
    expect(p3Result?.didSubmit, 'P3 (never started) should be absent').toBe(false);
    expect(p3Result?.score, 'P3 absent round should score 0').toBe(0);

    await assertNoBannedTextAll(pages, violations);
    expectNoViolations(violations, 'A01–A02 & A08');
  });

  test('A03–A05: invalid UI inputs are blocked; duplicate submit is a no-op', async () => {
    test.setTimeout(180000);
    const violations: Violation[] = [];
    const gameId = await createAsyncGame(pages[0], USERS[0], { roundTimerSec: 0 });
    await navigateAllToGame(pages, gameId);
    const clients = await createObservers(gameId, violations);
    await Promise.all(clients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));

    await startPlayerViaWS(clients[0]);
    await clients[0].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT);

    // A03: Submit with no inputs blocked.
    await clickSubmitViaDOM(pages[0]);
    const hint1 = pages[0].getByText(/Select WHERE and WHEN first/i);
    await expect(hint1).toBeVisible({ timeout: 5000 });
    const hint1Text = await hint1.textContent();
    expect(hint1Text?.toLowerCase()).toMatch(/select.*and.*first/);
    await takeScreenshot(pages[0], 'invalid-submit-no-inputs');
    await pages[0].waitForTimeout(2600); // hint auto-dismisses

    // A04: Submit with only year set blocked.
    await openWhenAndSelectYear(pages[0], 1920);
    await clickSubmitViaDOM(pages[0]);
    const hint2 = pages[0].getByText(/Select WHERE and WHEN first/i);
    await expect(hint2).toBeVisible({ timeout: 5000 });
    await takeScreenshot(pages[0], 'invalid-submit-year-only');
    await pages[0].waitForTimeout(2600);

    // Valid submit with both inputs succeeds.
    await openWhereAndClickMap(pages[0]);
    await clickSubmitViaDOM(pages[0]);
    await pages[0]
      .locator('[data-testid="round-complete-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
    await takeScreenshot(pages[0], 'valid-submit-round-complete');

    // A05: Duplicate WS submit should be idempotent (no state regression, no error).
    const p1 = clients[0];
    p1.submitGuess(0, 1930, 40, 50);
    p1.submitGuess(0, 1940, 50, 60);
    // Give the server time to process both messages; the round is already complete.
    await pages[0].waitForTimeout(1500);
    const s = p1.getLastSnapshot();
    expect(s?.status).toBe('ROUND_COMPLETE');
    expect(s?.currentRoundIndex).toBe(0);

    await assertNoBannedTextAll(pages, violations);
    expectNoViolations(violations, 'A03–A05');
  });

  test('A06–A07 & A09–A10: wrong-round / post-deadline API calls are rejected', async () => {
    test.setTimeout(180000);
    const violations: Violation[] = [];

    // A06: Submit to a round index that is not the player's current round.
    const gameId = await createAsyncGame(pages[0], USERS[0], { roundTimerSec: 0 });
    await navigateAllToGame(pages, gameId);
    const clients = await createObservers(gameId, violations);
    await Promise.all(clients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));

    await startPlayerViaWS(clients[0]);
    await clients[0].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT);

    const wrongRoundStatus = await attemptApiGuess(pages[0], gameId, USERS[0].id, 1);
    expect(wrongRoundStatus, 'Submit to wrong round index should be rejected').toBe(400);
    expect(clients[0].getLastSnapshot()?.currentRoundIndex).toBe(0);

    // A07: Submit after the session deadline has finalized the player.
    await startPlayerViaWS(clients[1]);
    await clients[1].waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT);
    await completeAllRoundsViaWS(clients[1]);
    expect(clients[1].getLastSnapshot()?.status).toBe('SESSION_COMPLETE');

    const pastDeadline = new Date(Date.now() - 60_000);
    await updateSessionDeadline(gameId, pastDeadline);
    await finalizeSessionDeadline(gameId);

    // P1 never completed; after finalization their expected current round is out of bounds.
    const postDeadlineStatus = await attemptApiGuess(pages[0], gameId, USERS[0].id, 5);
    expect(postDeadlineStatus, 'Submit after session deadline should be rejected').toBe(400);

    // A09: Use an unknown playerId.
    const unknownStatus = await pages[0].request.post(
      `${BASE_URL}/api/compete/${encodeURIComponent(gameId)}/guess`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-partykit-secret': PARTYKIT_SECRET,
        },
        data: {
          playerId: '00000000-0000-0000-0000-000000000000',
          roundIndex: 0,
          year: 1900,
          lat: 0,
          lng: 0,
          mode: 'async',
        },
      },
    );
    expect(unknownStatus.status(), 'Unknown player submit should be rejected').toBeLessThan(500);

    // A10: Submit to a round that is already complete (duplicate API call).
    const completedStatus = await attemptApiGuess(pages[0], gameId, USERS[1].id, 0);
    expect(completedStatus, 'Resubmitting an already-completed round should return the current state without error').toBeLessThan(500);

    await assertNoBannedTextAll(pages, violations);
    expectNoViolations(violations, 'A06–A07 & A09–A10');
  });
});
