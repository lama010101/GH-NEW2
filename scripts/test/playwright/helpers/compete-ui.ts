import { Page } from '@playwright/test';

/**
 * Drive one player's guess submission through the real browser UI.
 *
 * MP-GUARD-SYNC-REGRESSION-001 — golden-path helper.
 *
 * Flow:
 *   1. Open the WHEN sheet via `round-when-btn`, pick a year by clicking the
 *      numeric-label button (technique proven in practice-mode.spec.ts).
 *   2. Open the WHERE sheet via `round-where-btn`, click the Leaflet map at
 *      its center to set a location.
 *   3. Click `round-submit-btn` to submit the guess.
 *
 * The golden path does not assert guess *accuracy* (scoring is covered by
 * unit tests in rules.test.ts). A center-map click + any year is sufficient
 * to exercise the submit → round-complete transition.
 *
 * @param page   The player's Playwright page.
 * @param guess  The guess values. `year` is the target year button label to
 *               click (falls back to the middle year button if not found).
 *               `lat`/`lng` are accepted for API symmetry but the golden path
 *               clicks the map center — pixel derivation from lat/lng is not
 *               required for the happy-path transition assertion.
 */
export async function submitGuessViaUI(
  page: Page,
  { year, lat, lng }: { year: number; lat: number; lng: number },
): Promise<void> {
  // lat/lng accepted for API symmetry; the golden path clicks the map center.
  void lat;
  void lng;

  // 1. Open WHEN sheet, pick year via numeric-label button.
  // force: true bypasses Playwright's actionability check — the WHEN button
  // has a CSS glow animation (whenBtnGlow) that makes Playwright consider it
  // "not stable" even though it's visible and enabled. The animation does not
  // prevent clicking.
  await page.getByTestId('round-when-btn').first().click({ force: true, timeout: 15000 });
  await page.waitForTimeout(200);
  // Retry year-button click: under load, the WHEN sheet may not have rendered
  // the year buttons within 200ms. Retry up to 5 times with 300ms backoff.
  let clicked = false;
  for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
    if (attempt > 0) await page.waitForTimeout(300);
    clicked = await page.evaluate((targetYear) => {
      const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      const yearBtns = btns.filter((b) => /^\d{3,4}$/.test((b.textContent || '').trim()));
      if (yearBtns.length === 0) return false;
      const match = yearBtns.find((b) => (b.textContent || '').trim() === String(targetYear));
      const target = match || yearBtns[Math.floor(yearBtns.length / 2)];
      target.click();
      return true;
    }, year);
  }
  if (!clicked) {
    throw new Error(`submitGuessViaUI: no year buttons found in WHEN sheet after 5 attempts (target year=${year})`);
  }

  // 2. Close WHEN sheet, then open WHERE sheet via direct DOM click.
  // The WHEN sheet's backdrop intercepts Playwright clicks. Using element.click()
  // via page.evaluate fires the React onClick handler directly on the WHERE
  // button, bypassing any overlapping backdrop. This sets activePanel to 'where',
  // which switches the sheet content and renders the Leaflet map.
  // First, close the WHEN sheet by clicking its backdrop via DOM.
  await page.evaluate(() => {
    const backdrop = document.querySelector('[class*="sheetBackdrop"]') as HTMLElement;
    if (backdrop) backdrop.click();
  }).catch(() => {});
  await page.waitForTimeout(300);
  // Now click the WHERE button via DOM (bypasses backdrop interception).
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="round-where-btn"]') as HTMLButtonElement;
    if (btn) btn.click();
  });
  const map = page.locator('.leaflet-container').first();
  await map.waitFor({ state: 'visible', timeout: 30000 });
  const box = await map.boundingBox();
  if (box) {
    await map.click({ x: box.width / 2, y: box.height / 2, force: true, timeout: 15000 });
  }
  await page.waitForTimeout(100);

  // 3. Close WHERE sheet, then submit.
  // Same backdrop issue: the WHERE sheet's backdrop intercepts the submit
  // button click. Close the sheet first via DOM backdrop click.
  await page.evaluate(() => {
    const backdrop = document.querySelector('[class*="sheetBackdrop"]') as HTMLElement;
    if (backdrop) backdrop.click();
  }).catch(() => {});
  await page.waitForTimeout(300);
  // Submit via DOM click (bypasses any residual backdrop).
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="round-submit-btn"]') as HTMLButtonElement;
    if (btn) btn.click();
  });
}
