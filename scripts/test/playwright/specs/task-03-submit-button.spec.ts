import { test, expect } from '@playwright/test';
import { create5PlayerSession, cleanupSession } from '../fixtures/session';
import { waitForPhase, hasClass, getComputedStyle } from '../helpers/game';

test.describe('TASK 3 - Submit button animation', () => {
  let session: Awaited<ReturnType<typeof create5PlayerSession>>;

  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    session = await create5PlayerSession(browser, baseURL);
  });

  test.afterAll(async ({ baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    await cleanupSession(session.pages, session.gameId, baseURL);
  });

  test('submit button has submitBtnReady class when both marker placed and year selected', async () => {
    const hostPage = session.pages[0];

    // Wait for ROUND_ACTIVE phase
    await waitForPhase(hostPage, 'ROUND_ACTIVE', 15000);
    await hostPage.waitForTimeout(1000);

    // Find the map and click to place a marker
    const map = hostPage.locator('.leaflet-container, [class*="map"], canvas').first();
    await map.waitFor({ state: 'visible', timeout: 10000 });

    const mapBox = await map.boundingBox();
    if (mapBox) {
      await map.click({ x: mapBox.width / 2, y: mapBox.height / 2 });
    }

    await hostPage.waitForTimeout(500);

    // Select a year - find year input/slider
    const yearInput = hostPage.locator('input[type="range"], [class*="year"], [class*="Year"]').first();
    if (await yearInput.isVisible().catch(() => false)) {
      await yearInput.fill('1500');
      await hostPage.waitForTimeout(300);
    }

    // Check that submit button has submitBtnReady class
    const submitButton = hostPage.locator('button[class*="submit"], button:has-text("Submit")').first();
    const hasReadyClass = await hasClass(
      hostPage,
      '[class*="submit"]',
      'submitBtnReady'
    ).catch(() => false);

    // Also check by element text if class-based check fails
    const buttonClass = await submitButton.evaluate((el) => el.className);
    const hasClassViaText = buttonClass.includes('submitBtnReady');

    expect(hasReadyClass || hasClassViaText).toBe(true);

    // Check animation/transition property
    const transitionValue = await getComputedStyle(
      hostPage,
      '[class*="submitBtnReady"], button[class*="submit"]',
      'transition'
    );

    const hasAnimation = transitionValue && transitionValue !== 'none' && transitionValue !== 'all 0s ease 0s';
    expect(hasAnimation).toBe(true);
  });

  test('submit button does NOT have submitBtnReady when only location is placed', async () => {
    const hostPage = session.pages[0];

    // Wait for ROUND_ACTIVE phase (new round resets state)
    await waitForPhase(hostPage, 'ROUND_ACTIVE', 15000);

    // Reset by refreshing (simulates new round with clean state)
    await hostPage.reload();
    await hostPage.waitForLoadState('networkidle');
    await hostPage.waitForTimeout(1500);

    // Find the map and click to place a marker (but no year)
    const map = hostPage.locator('.leaflet-container, [class*="map"], canvas').first();
    await map.waitFor({ state: 'visible', timeout: 10000 });

    const mapBox = await map.boundingBox();
    if (mapBox) {
      await map.click({ x: mapBox.width / 2, y: mapBox.height / 2 });
    }

    await hostPage.waitForTimeout(500);

    // Check that submit button does NOT have submitBtnReady class
    const hasReadyClass = await hasClass(
      hostPage,
      'button[class*="submit"]',
      'submitBtnReady'
    ).catch(() => false);

    expect(hasReadyClass).toBe(false);
  });
});
