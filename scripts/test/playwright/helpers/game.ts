import { Page, expect } from '@playwright/test';

export type GamePhase = 'LOBBY' | 'ROUND_ACTIVE' | 'ROUND_COMPLETE' | 'SESSION_COMPLETE';

/**
 * Wait for the game to reach a specific phase
 */
export async function waitForPhase(page: Page, phase: GamePhase, timeout: number = 15000): Promise<void> {
  await page.waitForFunction(
    (expectedPhase) => {
      // Check via DOM indicators
      const bodyText = document.body.innerText || '';

      if (expectedPhase === 'LOBBY') {
        return bodyText.includes('Lobby') || bodyText.includes('Ready') || bodyText.includes('Waiting');
      }
      if (expectedPhase === 'ROUND_ACTIVE') {
        return bodyText.includes('Where') || bodyText.includes('When') ||
               document.querySelector('[class*="RoundActive"]') !== null ||
               document.querySelector('canvas, .leaflet-container') !== null;
      }
      if (expectedPhase === 'ROUND_COMPLETE') {
        return bodyText.includes('Results') || bodyText.includes('Round Complete') ||
               bodyText.includes('Score') || document.querySelector('[class*="RoundComplete"]') !== null;
      }
      if (expectedPhase === 'SESSION_COMPLETE') {
        return bodyText.includes('Session Complete') || bodyText.includes('Final') ||
               bodyText.includes('Game Over') || document.querySelector('[class*="SessionComplete"]') !== null;
      }
      return false;
    },
    phase,
    { timeout }
  );
}

/**
 * Submit a guess with location and year
 */
export async function submitGuess(
  page: Page,
  { lat, lng, year }: { lat: number; lng: number; year: number }
): Promise<void> {
  // Wait for the map to be ready
  const map = page.locator('.leaflet-container, canvas, [class*="map"]').first();
  await map.waitFor({ state: 'visible', timeout: 10000 });

  // Click on the map to set location
  const mapBox = await map.boundingBox();
  if (mapBox) {
    // Click near the center of the map
    await map.click({
      x: mapBox.width / 2,
      y: mapBox.height / 2,
    });
  }

  await page.waitForTimeout(300);

  // Set the year using the year slider/input
  const yearInput = page.locator('input[type="range"], [class*="year"], [class*="Year"]').first();
  if (await yearInput.isVisible().catch(() => false)) {
    await yearInput.fill(year.toString());
  }

  // Alternative: use the year slider directly
  const yearSlider = page.locator('[class*="slider"], [class*="Slider"]').first();
  if (await yearSlider.isVisible().catch(() => false)) {
    // Try to set the year by clicking on specific positions
    const sliderBox = await yearSlider.boundingBox();
    if (sliderBox) {
      // Click and drag to set year (simplified)
      await yearSlider.click({
        x: sliderBox.width * 0.5,
        y: sliderBox.height / 2,
      });
    }
  }

  await page.waitForTimeout(300);

  // Click the submit button
  const submitButton = page.locator('button:has-text("Submit"), button[class*="submit"], button[class*="Submit"]').first();
  await expect(submitButton).toBeVisible();
  await submitButton.click();

  // Wait for submission to register
  await page.waitForTimeout(1000);
}

/**
 * Advance to the next round
 */
export async function advanceToNextRound(page: Page): Promise<void> {
  // Look for next round button
  const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue"), button[class*="next"]').first();

  if (await nextButton.isVisible().catch(() => false)) {
    await nextButton.click();
    await page.waitForTimeout(1000);
  } else {
    // Wait for auto-advance
    await page.waitForTimeout(5000);
  }
}

/**
 * Check if an element has a specific class
 */
export async function hasClass(page: Page, selector: string, className: string): Promise<boolean> {
  return await page.evaluate(
    ({ sel, cls }) => {
      const el = document.querySelector(sel);
      return el ? el.classList.contains(cls) : false;
    },
    { sel: selector, cls: className }
  );
}

/**
 * Get computed style property
 */
export async function getComputedStyle(
  page: Page,
  selector: string,
  property: string
): Promise<string> {
  return await page.evaluate(
    ({ sel, prop }) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      const style = window.getComputedStyle(el);
      return style.getPropertyValue(prop);
    },
    { sel: selector, prop: property }
  );
}

/**
 * Toggle ready status in lobby
 */
export async function toggleReady(page: Page): Promise<void> {
  const readyButton = page.locator('button:has-text("Ready"), button:has-text("I\'m Ready"), button[class*="ready"]').first();
  await expect(readyButton).toBeVisible();
  await readyButton.click();
  await page.waitForTimeout(500);
}

/**
 * Start the game (host only)
 */
export async function startGame(page: Page): Promise<void> {
  const startButton = page.locator('button:has-text("Start"), button[class*="start"]').first();
  await expect(startButton).toBeVisible();
  await startButton.click();
  await page.waitForTimeout(2000);
}

/**
 * Open settings modal
 */
export async function openSettings(page: Page): Promise<void> {
  const settingsButton = page.locator('button:has-text("Settings"), button[aria-label*="settings"], button[class*="settings"]').first();
  if (await settingsButton.isVisible().catch(() => false)) {
    await settingsButton.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Select era preset in lobby
 */
export async function selectEra(page: Page, eraName: string): Promise<void> {
  const eraChip = page.locator(`button:has-text("${eraName}"), [class*="era"]:has-text("${eraName}"), [class*="Era"]:has-text("${eraName}")`).first();
  if (await eraChip.isVisible().catch(() => false)) {
    await eraChip.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Get current snapshot status from page
 */
export async function getSnapshotStatus(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    // Try to find status in various ways
    const statusEl = document.querySelector('[data-status], [class*="status"], [class*="Status"]');
    if (statusEl) {
      return statusEl.getAttribute('data-status') || statusEl.textContent;
    }

    // Check URL for clues
    const path = window.location.pathname;
    if (path.includes('lobby')) return 'LOBBY';

    // Check for phase indicators in DOM
    const bodyText = document.body.innerText || '';
    if (bodyText.includes('Round Complete') || bodyText.includes('Results')) return 'ROUND_COMPLETE';
    if (bodyText.includes('Game Over') || bodyText.includes('Session Complete')) return 'SESSION_COMPLETE';
    if (bodyText.includes('Where') || bodyText.includes('When')) return 'ROUND_ACTIVE';

    return null;
  });
}
