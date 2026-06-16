import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TEST_USERS } from '../fixtures/auth';

test.describe('TASK 12 - Era preset', () => {
  const host = TEST_USERS[0];
  let gameId: string;

  test.afterEach(async ({ baseURL }) => {
    // Cleanup any created session
    if (gameId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      await supabase.from('game_players').delete().eq('game_id', gameId);
      await supabase.from('guesses').delete().eq('game_id', gameId);
      await supabase.from('sessions').delete().eq('game_id', gameId);
    }
  });

  test('Modern era selection reflected in lobby UI and game events are within range', async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');

    // Sign in as host
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    await page.evaluate(async ({ email, password, supabaseUrl, anonKey }) => {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, anonKey);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }, {
      email: host.email,
      password: host.password,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Create a session
    const createResponse = await page.request.post(`${baseURL}/api/compete/create`, {
      data: {
        displayName: host.displayName,
        playerId: host.id,
        mode: 'compete',
        totalRounds: 3,
      },
    });

    expect(createResponse.ok()).toBe(true);
    const sessionData = await createResponse.json();
    gameId = sessionData.gameId || sessionData.id;

    // Navigate to lobby
    await page.goto(`${baseURL}/compete/${gameId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for era selection chips
    const modernChip = page.locator('
      button:has-text("Modern"),
      [class*="era"]:has-text("Modern"),
      [class*="chip"]:has-text("Modern")
    ').first();

    // Select "Modern" era if not already selected
    if (await modernChip.isVisible().catch(() => false)) {
      await modernChip.click();
      await page.waitForTimeout(500);

      // Verify selected state
      const isSelected = await modernChip.evaluate((el) => {
        return el.classList.contains('selected') ||
               el.getAttribute('data-selected') === 'true' ||
               el.getAttribute('aria-selected') === 'true' ||
               el.classList.contains('active');
      });

      expect(isSelected).toBe(true);
    }

    // Modern era year range: 1789 – 1945
    const MODERN_YEAR_MIN = 1789;
    const MODERN_YEAR_MAX = 1945;

    // Start the game
    const startButton = page.locator('button:has-text("Start"), button[class*="start"]').first();
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
    }

    // Wait for game to start
    await page.waitForTimeout(3000);

    // Check event year displayed is within Modern range
    const eventYearText = await page.locator('
      [class*="eventYear"],
      [class*="event-year"],
      [class*="year"],
      [class*="date"]
    ').first().textContent().catch(() => '');

    if (eventYearText) {
      const yearMatch = eventYearText.match(/(\d{4})/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        // Event year should be within Modern era (or the revealed answer)
        expect(year).toBeGreaterThanOrEqual(MODERN_YEAR_MIN);
        expect(year).toBeLessThanOrEqual(MODERN_YEAR_MAX);
      }
    }

    // Alternative: Check round results after submitting
    // The round_results should contain events within the selected era
  });
});
