import { test, expect, Page } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';

/**
 * Practice mode — full flow + UI + edge cases.
 *
 * Flow under test:
 *   /home  → open PracticeSettingsModal → configure → Start
 *   → /practice (auto-creates session) → /practice/[gameId]
 *   → LOBBY (auto-start) → ROUND_ACTIVE × 5 rounds → SESSION_COMPLETE
 *   → Play Again → new /practice/[gameId]
 *
 * Edge cases:
 *   - Submit button disabled hint when year/location missing
 *   - Direct navigation to /practice (no settings) still works
 *   - Unauthenticated access to /api/practice/create → 401
 *   - Invalid gameId → /practice/<bogus> renders loading/error (no crash)
 *   - Era selection: cannot deselect last era
 *   - Round timer toggle ON/OFF in settings modal
 *   - practice_settings persisted to localStorage
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const LONG_TIMEOUT = 120_000;

/** Wait for a data-testid element to be visible. */
async function waitForTestId(page: Page, testId: string, timeout = LONG_TIMEOUT) {
  const loc = page.getByTestId(testId).first();
  await loc.waitFor({ state: 'visible', timeout });
  return loc;
}

/**
 * Open the WHEN sheet and pick a year by clicking a year-rail button.
 * The YearPicker renders 3 rails (century / decade / year). Year buttons
 * have a plain numeric label (e.g. "1995"), unlike century ("20th c.") and
 * decade ("1990s") labels. We click the currently-active year button, or
 * the middle year button, via DOM evaluation — robust against scroll/snap.
 */
async function setYearViaWhenSheet(page: Page) {
  await page.getByTestId('round-when-btn').first().click();
  // Wait for the WHEN sheet to render the picker.
  await page.waitForTimeout(500);

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const yearBtns = buttons.filter((b) => /^\d{3,4}$/.test((b.textContent || '').trim()));
    if (yearBtns.length === 0) return false;
    // Prefer the active (selected) year button — it has a non-transparent inline background.
    const active = yearBtns.find((b) => {
      const bg = b.style.background;
      return bg && bg !== 'transparent' && bg !== 'none';
    });
    const target = active || yearBtns[Math.floor(yearBtns.length / 2)];
    target.click();
    return true;
  });
  expect(clicked).toBeTruthy();

  await page.waitForTimeout(300);
  // Close the sheet via its close button (aria-label "Close").
  const closeBtn = page.getByRole('button', { name: 'Close' }).first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  } else {
    // Fallback: click the sheet backdrop.
    await page.locator('[class*="sheetBackdrop"]').first().click().catch(() => undefined);
  }
  await page.waitForTimeout(200);
}

/** Open the WHERE sheet, click the map to set a location, confirm. */
async function setLocationViaWhereSheet(page: Page) {
  await page.getByTestId('round-where-btn').first().click();
  const map = page.locator('.leaflet-container').last();
  await map.waitFor({ state: 'visible', timeout: LONG_TIMEOUT });
  const box = await map.boundingBox();
  if (box) {
    await map.click({ x: box.width / 2, y: box.height / 2 });
  }
  await page.waitForTimeout(600);
  // Confirm location button (i18n: "Confirm Location")
  const confirm = page.getByRole('button', { name: 'Confirm Location' }).first();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  }
  await page.waitForTimeout(200);
}

/** Advance to the next round (or session complete). */
async function advanceRound(page: Page) {
  const next = page.getByTestId('round-next-btn').first();
  await next.waitFor({ state: 'visible', timeout: LONG_TIMEOUT });
  await next.click();
}

/**
 * The home PracticePanel "Start Practice" button (opens the settings modal).
 * Distinct from the modal's own start button which shares the same label.
 */
function panelStartButton(page: Page) {
  return page.locator('button[class*="PracticePanel_startButton"]').first();
}

/**
 * The PracticeSettingsModal "Start Practice" button (begins the game).
 * Scoped to the dialog so it never resolves to the panel button behind the
 * modal backdrop (which would be click-intercepted).
 */
function modalStartButton(page: Page) {
  return page.getByRole('dialog').getByRole('button', { name: 'Start Practice' });
}

test.describe('Practice mode — full flow & edge cases', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the protected /home route. If unauthenticated, the app
    // redirects to /login which renders the AuthModal; ensureLoggedIn fills
    // it and waits for the auth cookie, after which the app returns to /home.
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await ensureLoggedIn(page, TEST_USERS[0]);
  });

  test('full 5-round game flow via home → settings → play → session complete → play again', async ({ page }) => {
    test.setTimeout(900_000);

    // 1. Home page should be visible
    await page.waitForURL(/\/home/, { timeout: LONG_TIMEOUT });
    await expect(panelStartButton(page)).toBeVisible({ timeout: LONG_TIMEOUT });

    // 2. Open Practice settings modal from home
    await panelStartButton(page).click();
    await expect(page.getByRole('heading', { name: 'Game Settings' }).first()).toBeVisible({ timeout: LONG_TIMEOUT });

    // 3. Verify default state: timer OFF, all eras selected
    await expect(page.getByText('OFF').first()).toBeVisible();
    for (const era of ['Ancient', 'Medieval', 'Early Modern', 'Modern', 'Contemporary']) {
      const eraBtn = page.locator('button[data-era]').filter({ hasText: era }).first();
      await expect(eraBtn).toBeVisible();
      await expect(eraBtn).toHaveAttribute('aria-pressed', 'true');
    }

    // 4. Start practice with defaults
    await modalStartButton(page).click();

    // 5. Should redirect to /practice/<gameId>
    await page.waitForURL(/\/practice\/[a-zA-Z0-9-]+/, { timeout: LONG_TIMEOUT });

    // 6. Auto-start: LOBBY → ROUND_ACTIVE
    await waitForTestId(page, 'round-active-section', LONG_TIMEOUT);
    const activeSection = page.getByTestId('round-active-section').first();
    await expect(activeSection).toHaveAttribute('data-status', 'ROUND_ACTIVE');

    // 7. Play all 5 rounds
    const totalRounds = 5;
    for (let round = 0; round < totalRounds; round++) {
      const section = page.getByTestId('round-active-section').first();
      await expect(section).toHaveAttribute('data-round-index', String(round), { timeout: LONG_TIMEOUT });

      // Edge case: submit with nothing set → should NOT transition, shows hint
      await page.getByTestId('round-submit-btn').first().click();
      await expect(page.getByText(/Select.*WHERE.*WHEN|Select.*first/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(section).toHaveAttribute('data-status', 'ROUND_ACTIVE');

      // Set year + location, then submit
      await setYearViaWhenSheet(page);
      await setLocationViaWhereSheet(page);

      await page.getByTestId('round-submit-btn').first().click();
      await waitForTestId(page, 'round-complete-section', LONG_TIMEOUT);
      const completeSection = page.getByTestId('round-complete-section').first();
      await expect(completeSection).toHaveAttribute('data-status', 'ROUND_COMPLETE');
      await expect(completeSection).toHaveAttribute('data-round-index', String(round));

      if (round < totalRounds - 1) {
        await advanceRound(page);
        await waitForTestId(page, 'round-active-section', LONG_TIMEOUT);
      }
    }

    // 8. After last round advance → SESSION_COMPLETE
    await advanceRound(page);
    await waitForTestId(page, 'session-complete-section', LONG_TIMEOUT);
    const sessionComplete = page.getByTestId('session-complete-section').first();
    await expect(sessionComplete).toHaveAttribute('data-status', 'SESSION_COMPLETE');

    // 9. Play Again → new game
    const playAgain = page.getByTestId('session-play-again-btn').first();
    await expect(playAgain).toBeVisible({ timeout: LONG_TIMEOUT });
    const urlBefore = page.url();
    await playAgain.click();
    // Wait for navigation to a *different* /practice/<gameId> URL. Playwright
    // may pass either a URL object or a string to the predicate, so normalize.
    await page.waitForURL(
      (url) => {
        const s = typeof url === 'string' ? url : (url as URL).toString();
        return /\/practice\/[a-zA-Z0-9-]+/.test(s) && s !== urlBefore;
      },
      { timeout: LONG_TIMEOUT },
    );
    await waitForTestId(page, 'round-active-section', LONG_TIMEOUT);
  });

  test('settings modal: timer toggle ON/OFF and era narrowing (cannot deselect last era)', async ({ page }) => {
    test.setTimeout(300_000);
    await page.waitForURL(/\/home/, { timeout: LONG_TIMEOUT });
    await panelStartButton(page).click();
    await expect(page.getByRole('heading', { name: 'Game Settings' }).first()).toBeVisible({ timeout: LONG_TIMEOUT });

    // Toggle timer ON → slider visible
    const timerToggle = page.locator('button[class*="lobbyToggleBtn"]').first();
    await timerToggle.click();
    await expect(page.locator('input[type="range"]').first()).toBeVisible();
    // Toggle back OFF
    await timerToggle.click();
    await expect(page.getByText('OFF').first()).toBeVisible();

    // "Deselect all" leaves a single era (Ancient) selected.
    const selectAllBtn = page.getByRole('button', { name: /Select all|Deselect all/ }).first();
    if ((await selectAllBtn.textContent()) === 'Deselect all') {
      await selectAllBtn.click();
    }
    const ancientBtn = page.locator('button[data-era="ancient"]').first();
    await expect(ancientBtn).toHaveAttribute('aria-pressed', 'true');
    // Cannot deselect the last remaining era (toggleEra guards size===1).
    await ancientBtn.click();
    await expect(ancientBtn).toHaveAttribute('aria-pressed', 'true');

    // Start with single era → app navigates to /practice (the /practice page
    // then auto-creates the session; that redirect is covered by the
    // dedicated direct-navigation test, so we only assert we leave /home).
    await modalStartButton(page).click();
    await page.waitForURL(/\/practice/, { timeout: LONG_TIMEOUT });
  });

  test('direct navigation to /practice creates a session without settings modal', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(`${BASE}/practice`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/practice\/[a-zA-Z0-9-]+/, { timeout: LONG_TIMEOUT });
    await waitForTestId(page, 'round-active-section', LONG_TIMEOUT);
  });

  test('unauthenticated API call to /api/practice/create is blocked (redirected to login)', async ({ browser }) => {
    // The route handler itself returns 401, but the auth middleware intercepts
    // unauthenticated requests first and redirects to /login (307). Either way
    // no session is created. We disable redirect-following and assert the 307.
    const ctx = await browser.newContext();
    const res = await ctx.request.post(`${BASE}/api/practice/create`, {
      data: { playerId: 'fake', displayName: 'fake' },
      maxRedirects: 0,
    });
    // 307 = middleware redirect to /login (auth-protected). Accept 401 too
    // (defense-in-depth in the route handler if middleware is bypassed).
    expect([307, 401]).toContain(res.status());
    const body = await res.text().catch(() => '');
    expect(body).not.toContain('gameId');
    await ctx.close();
  });

  test('invalid gameId renders loading/error screen (no app crash)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/practice/does-not-exist-12345`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const bodyText = (await page.locator('body').innerText()).slice(0, 800);
    // No Next.js application-error stack trace.
    expect(bodyText.toLowerCase()).not.toContain('application error');
    expect(bodyText.toLowerCase()).not.toContain('unhandled');
  });

  test('practice settings persist in localStorage after save', async ({ page }) => {
    test.setTimeout(180_000);
    await page.waitForURL(/\/home/, { timeout: LONG_TIMEOUT });
    await panelStartButton(page).click();
    await expect(page.getByRole('heading', { name: 'Game Settings' }).first()).toBeVisible({ timeout: LONG_TIMEOUT });

    // Toggle timer ON and set a specific value via slider.
    const timerToggle = page.locator('button[class*="lobbyToggleBtn"]').first();
    await timerToggle.click();
    const slider = page.locator('input[type="range"]').first();
    await slider.fill('300');

    // Deselect to a single era.
    const selectAllBtn = page.getByRole('button', { name: /Select all|Deselect all/ }).first();
    if ((await selectAllBtn.textContent()) === 'Deselect all') {
      await selectAllBtn.click();
    }

    await modalStartButton(page).click();
    await page.waitForURL(/\/practice\/[a-zA-Z0-9-]+/, { timeout: LONG_TIMEOUT });

    const stored = await page.evaluate(() => localStorage.getItem('practice_settings'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed.roundTimerSec).toBe(300);
    expect(Array.isArray(parsed.selectedEras)).toBeTruthy();
    expect(typeof parsed.yearMin).toBe('number');
    expect(typeof parsed.yearMax).toBe('number');
  });
});
