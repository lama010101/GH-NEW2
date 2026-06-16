import { test, expect } from '@playwright/test';
import { createSinglePlayerSession } from '../fixtures/session';
import { TEST_USERS } from '../fixtures/auth';
import { waitForPhase } from '../helpers/game';

test.describe('TASK 5 - Resume game link', () => {
  test('resume link visible when navigating away from active session', async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');

    const user = TEST_USERS[0];

    // Sign in
    await page.goto(baseURL);
    await page.evaluate(async ({ email, password, supabaseUrl, anonKey }) => {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, anonKey);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }, {
      email: user.email,
      password: user.password,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    await page.reload();

    // Create a session
    const { gameId } = await createSinglePlayerSession(page, baseURL, 0);

    // Wait for LOBBY or game to be active
    await page.waitForTimeout(2000);

    // Navigate to home page mid-session
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    // Look for "Your turn" or resume link on the Compete card
    const competeCard = page.locator('
      [class*="compete"],
      [class*="Compete"],
      a[href*="/compete"]
    ').first();

    // Check for resume link text
    const resumeLink = page.locator('
      a:has-text("Your turn"),
      a:has-text("Resume"),
      button:has-text("Your turn"),
      button:has-text("Resume"),
      [class*="resume"]
    ').first();

    if (await resumeLink.isVisible().catch(() => false)) {
      const href = await resumeLink.getAttribute('href');
      expect(href).toContain(`/compete/${gameId}`);
    } else {
      // Alternative: check for active game indicator on compete card
      const activeIndicator = competeCard.locator('
        text=/active|playing|your turn|resume/i,
        [class*="active"],
        [class*="playing"]
      ').first();

      const hasActiveGame = await activeIndicator.isVisible().catch(() => false);
      expect(hasActiveGame).toBe(true);
    }
  });
});
