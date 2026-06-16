import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test.describe('TASK 6 - Welcome modal', () => {
  let testUserEmail: string;
  let testUserPassword: string;
  let testUserId: string;

  test.beforeAll(async () => {
    // Create a fresh user via Supabase service role API
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    testUserEmail = `gh-welcome-test-${Date.now()}@test.guess-history.com`;
    testUserPassword = 'TestPass123!';

    const { data, error } = await supabase.auth.admin.createUser({
      email: testUserEmail,
      password: testUserPassword,
      email_confirm: true,
    });

    if (error) {
      throw new Error(`Failed to create test user: ${error.message}`);
    }

    testUserId = data.user!.id;

    // Create profile
    await supabase.from('profiles').upsert({
      id: testUserId,
      display_name: 'WelcomeTestUser',
      avatar_url: null,
    });
  });

  test.afterAll(async () => {
    // Clean up test user
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    await supabase.from('profiles').delete().eq('id', testUserId);
    await supabase.auth.admin.deleteUser(testUserId);
  });

  test('welcome modal becomes visible within 5 seconds of sign-in for new user', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Sign in with the fresh user
    await page.evaluate(async ({ email, password, supabaseUrl, anonKey }) => {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, anonKey);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }, {
      email: testUserEmail,
      password: testUserPassword,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });

    // Reload to trigger welcome modal
    await page.reload();

    // Wait for welcome modal to appear (within 5 seconds)
    const welcomeModal = page.locator('
      [class*="welcome"],
      [class*="Welcome"],
      [role="dialog"]:has-text("Welcome")
    ').first();

    await welcomeModal.waitFor({ state: 'visible', timeout: 5000 });

    // Assert modal is visible
    await expect(welcomeModal).toBeVisible();

    // Check for expected welcome content
    const welcomeText = await welcomeModal.locator('text=/Welcome|welcome/i').first();
    await expect(welcomeText).toBeVisible();
  });
});
