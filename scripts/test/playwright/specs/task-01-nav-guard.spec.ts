import { test, expect } from '@playwright/test';
import { create5PlayerSession, cleanupSession } from '../fixtures/session';
import { waitForPhase } from '../helpers/game';

test.describe('TASK 1 - Navigation guard', () => {
  let session: Awaited<ReturnType<typeof create5PlayerSession>>;

  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    session = await create5PlayerSession(browser, baseURL);
  });

  test.afterAll(async ({ baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    await cleanupSession(session.pages, session.gameId, baseURL);
  });

  test('onbeforeunload is registered during ROUND_ACTIVE', async () => {
    const hostPage = session.pages[0];

    // Wait for ROUND_ACTIVE phase
    await waitForPhase(hostPage, 'ROUND_ACTIVE', 15000);

    // Check that window.onbeforeunload is registered
    const hasOnBeforeUnload = await hostPage.evaluate(() => {
      return typeof window.onbeforeunload === 'function';
    });

    expect(hasOnBeforeUnload).toBe(true);
  });

  test('browser back does not navigate away from game during active round', async () => {
    const hostPage = session.pages[0];

    // Wait for ROUND_ACTIVE phase
    await waitForPhase(hostPage, 'ROUND_ACTIVE', 15000);

    // Get current URL
    const originalUrl = hostPage.url();

    // Try to go back using history
    await hostPage.evaluate(() => {
      history.go(-1);
    });

    // Wait a moment for any navigation
    await hostPage.waitForTimeout(1000);

    // Check that we're still on the game page
    const currentUrl = hostPage.url();
    const stillOnGamePage = currentUrl.includes('/compete/') || currentUrl === originalUrl;

    expect(stillOnGamePage).toBe(true);

    // Alternatively, check for beforeunload dialog handling
    const dialogHandled = await hostPage.evaluate(() => {
      // Try to trigger beforeunload
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      // If onbeforeunload returns a string, it means the dialog would show
      const result = window.onbeforeunload?.(event);
      return result !== undefined && result !== null;
    });

    expect(dialogHandled).toBe(true);
  });
});
