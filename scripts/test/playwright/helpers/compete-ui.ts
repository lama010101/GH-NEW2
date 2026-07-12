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
  await page.getByTestId('round-when-btn').first().click();
  await page.waitForTimeout(500);
  const clicked = await page.evaluate((targetYear) => {
    const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const yearBtns = btns.filter((b) => /^\d{3,4}$/.test((b.textContent || '').trim()));
    if (yearBtns.length === 0) return false;
    const match = yearBtns.find((b) => (b.textContent || '').trim() === String(targetYear));
    const target = match || yearBtns[Math.floor(yearBtns.length / 2)];
    target.click();
    return true;
  }, year);
  if (!clicked) {
    throw new Error(`submitGuessViaUI: no year buttons found in WHEN sheet (target year=${year})`);
  }

  // 2. Open WHERE sheet, click map at center.
  await page.getByTestId('round-where-btn').first().click();
  const map = page.locator('.leaflet-container').first();
  await map.waitFor({ state: 'visible', timeout: 10000 });
  const box = await map.boundingBox();
  if (box) {
    await map.click({ x: box.width / 2, y: box.height / 2 });
  }
  await page.waitForTimeout(300);

  // 3. Submit.
  await page.getByTestId('round-submit-btn').first().click();
}
