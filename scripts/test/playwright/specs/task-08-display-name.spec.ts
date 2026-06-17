import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TEST_USERS } from '../fixtures/auth';

test.describe.skip('TASK 8 - Stale display name', () => {
  const user = TEST_USERS[0];

  test('updated display name appears in search results', async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');

    // Update display_name via Supabase service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const newDisplayName = `UpdatedName_${Date.now()}`;

    await supabase.from('profiles').update({
      display_name: newDisplayName,
    }).eq('id', user.id);

    // Sign in as the user
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

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

    // Reload to apply auth
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Navigate to compete/lobby page
    await page.goto(`${baseURL}/compete`);
    await page.waitForTimeout(1500);

    // Look for search functionality in invite panel
    const searchInput = page.locator(`
      input[type="search"],
      input[placeholder*="search" i],
      input[placeholder*="player" i],
      input[class*="search"]
    `).first();

    if (await searchInput.isVisible().catch(() => false)) {
      // Trigger a search that might show this user
      await searchInput.fill(user.displayName);
      await page.waitForTimeout(500);

      // Check if updated name appears
      const searchResults = page.locator('[class*="searchResults"], [class*="results"]').first();
      const resultsText = await searchResults.textContent().catch(() => '');

      // The updated name should appear somewhere in the UI
      const hasUpdatedName = resultsText.includes(newDisplayName) ||
                            await page.locator(`text=${newDisplayName}`).first().isVisible().catch(() => false);

      // If search doesn't show the name directly, check profile area
      if (!hasUpdatedName) {
        const profileName = await page.locator('[class*="profile"], [class*="displayName"]').first().textContent().catch(() => '');
        expect(profileName.includes(newDisplayName)).toBe(true);
      }
    } else {
      // If no search, check for profile display in header or elsewhere
      await page.goto(baseURL);
      await page.waitForTimeout(1000);

      // Profile name should show updated value
      const nameIndicator = await page.locator(`text=${newDisplayName}`).first().isVisible().catch(() => false);
      expect(nameIndicator).toBe(true);
    }

    // Restore original name
    await supabase.from('profiles').update({
      display_name: user.displayName,
    }).eq('id', user.id);
  });
});
