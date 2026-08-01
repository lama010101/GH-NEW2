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
  getTimerClampedEvents,
  getVisibleStatus,
  updateSessionDeadline,
  finalizeSessionDeadline,
  getRoundResults,
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
    pages.map((page, i) =>
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

test.describe('Relax 6P — timers and deadlines (T01–T08)', () => {
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

  test('T01: per-round timer off by default; rounds do not auto-expire', async () => {
    test.setTimeout(180000);
    const violations: Violation[] = [];
    const gameId = await createAsyncGame(pages[0], USERS[0], { roundTimerSec: 0 });
    await navigateAllToGame(pages, gameId);
    const clients = await createObservers(gameId, violations);

    await Promise.all(clients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));
    await assertNoBannedTextAll(pages, violations);

    // Start all six players sequentially to avoid per-player start races.
    for (const client of clients) {
      await startPlayerViaWS(client);
    }
    await Promise.all(
      clients.map((c, i) =>
        c.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT).then(() =>
          console.log(`[T01] P${i + 1} ROUND_ACTIVE round=0`),
        ),
      ),
    );
    await assertNoBannedTextAll(pages, violations);

    // Wait well beyond any default timer period to prove rounds do not auto-expire.
    await pages[0].waitForTimeout(10000);

    for (let i = 0; i < clients.length; i++) {
      const s = clients[i].getLastSnapshot();
      expect(s?.status, `P${i + 1} should still be ROUND_ACTIVE`).toBe('ROUND_ACTIVE');
      expect(s?.currentRoundIndex, `P${i + 1} round should not regress`).toBe(0);
    }

    await assertNoBannedTextAll(pages, violations);
    expectNoViolations(violations, 'T01');
  });

  test('T02–T05 & T08: per-round timer expiry auto-submits only that player; no pressure clamp', async () => {
    test.setTimeout(180000);
    const violations: Violation[] = [];
    const ROUND_TIMER_SEC = 15;
    const gameId = await createAsyncGame(pages[0], USERS[0], { roundTimerSec: ROUND_TIMER_SEC });
    await navigateAllToGame(pages, gameId);
    const clients = await createObservers(gameId, violations);
    await Promise.all(clients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));

    // P1 = will expire. P2/P3 = submit early. P4/P5/P6 remain in lobby as observers.
    const [p1, p2, p3] = [clients[0], clients[1], clients[2]];

    // Start P1 first and record its per-player round end time.
    await startPlayerViaWS(p1);
    await p1.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT);
    const p1StartSnapshot = p1.getLastSnapshot();
    const p1InitialRoundEndsAt = p1StartSnapshot?.roundEndsAt;
    expect(p1InitialRoundEndsAt, 'P1 should have a round end time with timer enabled').toBeTruthy();
    console.log(`[T02] P1 ROUND_ACTIVE round=0, roundEndsAt=${p1InitialRoundEndsAt}`);

    // Start P2/P3 a few seconds later so their timers end after P1's.
    await pages[0].waitForTimeout(5000);
    await startPlayerViaWS(p2);
    await startPlayerViaWS(p3);
    await Promise.all([
      p2.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      p3.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
    ]);

    // P2 and P3 submit before P1's timer expires.
    await submitGuessViaWS(p2, 0, 1920, 10, 20);
    await submitGuessViaWS(p3, 0, 1930, 30, 40);
    await Promise.all([
      p2.waitForState((s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      p3.waitForState((s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
    ]);

    // P1 should still be active with the original round end time (no pressure clamp).
    await p1.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, 5000, true);
    const p1SnapshotAfterOthersSubmit = p1.getLastSnapshot();
    expect(p1SnapshotAfterOthersSubmit?.roundEndsAt, 'P1 round end time should not change after others submit').toBe(p1InitialRoundEndsAt);
    expect(p1SnapshotAfterOthersSubmit?.status, 'P1 should still be active after others submit').toBe('ROUND_ACTIVE');

    // No TIMER_CLAMPED events should have been received by any observer.
    await assertNoBannedTextAll(pages, violations);

    // Wait for P1's timer to hit zero and auto-submit P1 only.
    const timerText = await pages[0].locator('[class*="timerText"]').first().innerText().catch(() => '');
    console.log(`[T02] P1 timer before expiry: ${timerText}`);
    await takeScreenshot(pages[0], 'timer-before-zero-p1');

    await p1.waitForState(
      (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0,
      ROUND_TIMER_SEC * 1000 + 10000,
    );
    console.log('[T02] P1 timer expired and auto-submitted');

    const p1Me = p1.getLastSnapshot()?.players.find((p) => p.playerId === USERS[0].id);
    expect(p1Me?.hasSubmitted, 'P1 should be auto-submitted (hasSubmitted=false because absent)').toBe(false);
    expect(p2.getLastSnapshot()?.status, 'P2 should still be ROUND_COMPLETE').toBe('ROUND_COMPLETE');
    expect(p3.getLastSnapshot()?.status, 'P3 should still be ROUND_COMPLETE').toBe('ROUND_COMPLETE');

    // Verify via API that P1 did not submit, while P2/P3 did.
    const results = await getRoundResults(pages[0], gameId, 0);
    const p1Result = results.results.find((r) => r.playerId === USERS[0].id);
    const p2Result = results.results.find((r) => r.playerId === USERS[1].id);
    const p3Result = results.results.find((r) => r.playerId === USERS[2].id);
    expect(p1Result?.didSubmit).toBe(false);
    expect(p2Result?.didSubmit).toBe(true);
    expect(p3Result?.didSubmit).toBe(true);

    await takeScreenshot(pages[0], 'timer-expired-result-p1');

    // P1 can still advance to round 1 after timer expiry.
    await advanceToNextRoundViaWS(p1, 0);
    await p1.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1, STATE_TIMEOUT);

    // No pressure-clamp events anywhere.
    for (let i = 0; i < clients.length; i++) {
      const clamped = getTimerClampedEvents(clients[i]);
      expect(clamped, `P${i + 1} should not receive TIMER_CLAMPED in Relax`).toEqual([]);
    }

    await assertNoBannedTextAll(pages, violations);
    expectNoViolations(violations, 'T02–T05 & T08');
  });

  test('T06–T07: session deadline finalizes only unsubmitted players', async () => {
    test.setTimeout(240000);
    const violations: Violation[] = [];
    const gameId = await createAsyncGame(pages[0], USERS[0], { roundTimerSec: 0 });
    await navigateAllToGame(pages, gameId);
    const clients = await createObservers(gameId, violations);
    await Promise.all(clients.map((c) => c.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT)));

    // P1 completes all rounds. P2 completes round 0 and advances to round 1. P3 starts but never submits.
    // P4–P6 join the lobby but never start their own sequence.
    await startPlayerViaWS(clients[0]);
    await startPlayerViaWS(clients[1]);
    await startPlayerViaWS(clients[2]);
    await Promise.all(
      [clients[0], clients[1], clients[2]].map((c) =>
        c.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      ),
    );

    await completeAllRoundsViaWS(clients[0]);
    await submitGuessViaWS(clients[1], 0, 1950, 50, 60);
    await advanceToNextRoundViaWS(clients[1], 0);
    // P1 and P2 are now in their independent states; P3 is in ROUND_ACTIVE round=0.
    await clients[0].waitForState((s) => s.status === 'SESSION_COMPLETE', STATE_TIMEOUT);
    expect(clients[1].getLastSnapshot()?.status).toBe('ROUND_ACTIVE');
    expect(clients[1].getLastSnapshot()?.currentRoundIndex).toBe(1);
    expect(clients[2].getLastSnapshot()?.status).toBe('ROUND_ACTIVE');

    // Force the session deadline into the past and call the finalize endpoint.
    const pastDeadline = new Date(Date.now() - 60_000);
    await updateSessionDeadline(gameId, pastDeadline);
    await finalizeSessionDeadline(gameId);
    console.log('[T06] finalize-deadline called');

    // P1 must remain complete with real scores; everyone else must be finalized.
    for (let round = 0; round < 5; round++) {
      const { results } = await getRoundResults(pages[0], gameId, round);
      const p1 = results.find((r) => r.playerId === USERS[0].id);
      expect(p1?.didSubmit, `P1 round ${round} should have submitted`).toBe(true);
      expect(p1?.score, `P1 round ${round} should have a positive score`).toBeGreaterThan(0);

      for (let i = 1; i < 6; i++) {
        const r = results.find((res) => res.playerId === USERS[i].id);
        if (i === 1 && round === 0) {
          expect(r?.didSubmit, 'P2 round 0 should be a real submit').toBe(true);
          expect(r?.score, 'P2 round 0 should have a positive score').toBeGreaterThan(0);
        } else {
          expect(r?.didSubmit, `P${i + 1} round ${round} should be absent`).toBe(false);
          expect(r?.score, `P${i + 1} round ${round} should score 0`).toBe(0);
        }
      }
    }

    // Reloading affected players should show SESSION_COMPLETE (finalized).
    await pages[1].reload({ waitUntil: 'domcontentloaded' });
    await pages[2].reload({ waitUntil: 'domcontentloaded' });
    await pages[3].reload({ waitUntil: 'domcontentloaded' });

    await pages[1]
      .locator('[data-testid="session-complete-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
    await pages[2]
      .locator('[data-testid="session-complete-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
    await pages[3]
      .locator('[data-testid="session-complete-section"]')
      .first()
      .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });

    const p1Status = await getVisibleStatus(pages[0]);
    expect(p1Status).toBe('SESSION_COMPLETE');

    await takeScreenshot(pages[0], 'deadline-finalized-p1-complete');
    await takeScreenshot(pages[1], 'deadline-finalized-p2-finalized');

    await assertNoBannedTextAll(pages, violations);
    expectNoViolations(violations, 'T06–T07');
  });
});
