import { test, expect } from '@playwright/test';
import { create5PlayerSession, cleanupSession } from '../fixtures/session';
import { waitForPhase } from '../helpers/game';

test.describe('TASK 4 - Year picker snap', () => {
  let session: Awaited<ReturnType<typeof create5PlayerSession>>;

  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    session = await create5PlayerSession(browser, baseURL);
  });

  test.afterAll(async ({ baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    await cleanupSession(session.pages, session.gameId, baseURL);
  });

  test('year slider container has scroll-snap-type none or absent', async () => {
    const hostPage = session.pages[0];

    // Wait for ROUND_ACTIVE phase
    await waitForPhase(hostPage, 'ROUND_ACTIVE', 15000);

    // Find year slider container
    const yearSlider = hostPage.locator('
      [class*="yearSlider"],
      [class*="year-slider"],
      [class*="YearSlider"],
      [class*="slider"],
      [class*="Slider"]
    ').first();

    // Check scroll-snap-type property
    const scrollSnapType = await yearSlider.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.scrollSnapType;
    }).catch(() => 'not-found');

    // Should be 'none' or empty/absent
    expect(scrollSnapType === 'none' || scrollSnapType === '' || scrollSnapType === 'not-found').toBe(true);
  });

  test('no snap-related CSS properties on year slider track', async () => {
    const hostPage = session.pages[0];

    // Wait for ROUND_ACTIVE phase
    await waitForPhase(hostPage, 'ROUND_ACTIVE', 15000);

    // Find slider track elements
    const sliderElements = hostPage.locator('
      [class*="slider"] *,
      [class*="Slider"] *,
      [class*="year"] *,
      input[type="range"]
    ');

    const count = await sliderElements.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const element = sliderElements.nth(i);

      const snapProperties = await element.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          scrollSnapAlign: style.scrollSnapAlign,
          scrollSnapStop: style.scrollSnapStop,
          scrollSnapType: style.scrollSnapType,
        };
      });

      // None of these should be active (non-none values)
      const hasActiveSnap =
        (snapProperties.scrollSnapAlign && snapProperties.scrollSnapAlign !== 'none') ||
        (snapProperties.scrollSnapStop && snapProperties.scrollSnapStop !== 'normal') ||
        (snapProperties.scrollSnapType && snapProperties.scrollSnapType !== 'none');

      expect(hasActiveSnap).toBe(false);
    }
  });
});
