import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

const COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket },
  });
}

async function signInAndGetCookieValue(email: string, password: string): Promise<string> {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket },
  });

  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Failed to sign in ${email}: ${error?.message || 'no session'}`);
  }

  const payload = JSON.stringify(data.session);
  const encoded = Buffer.from(payload).toString('base64url');
  return `base64-${encoded}`;
}

test.describe('admin/openrouter auth gate', () => {
  const timestamp = Date.now();
  const adminEmail = `gh-admin-openrouter-${timestamp}@test.guess-history.com`;
  const nonAdminEmail = `gh-nonadmin-openrouter-${timestamp}@test.guess-history.com`;
  const testPassword = 'TestPass123!';

  let adminUserId = '';
  let nonAdminUserId = '';

  test.beforeAll(async () => {
    const supabase = getServiceClient();

    const adminResult = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });
    if (adminResult.error) {
      throw new Error(`Failed to create admin user: ${adminResult.error.message}`);
    }
    adminUserId = adminResult.data.user?.id || '';

    const nonAdminResult = await supabase.auth.admin.createUser({
      email: nonAdminEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (nonAdminResult.error) {
      throw new Error(`Failed to create non-admin user: ${nonAdminResult.error.message}`);
    }
    nonAdminUserId = nonAdminResult.data.user?.id || '';
  });

  test.afterAll(async () => {
    const supabase = getServiceClient();
    if (adminUserId) {
      await supabase.from('profiles').delete().eq('id', adminUserId);
      await supabase.auth.admin.deleteUser(adminUserId);
    }
    if (nonAdminUserId) {
      await supabase.from('profiles').delete().eq('id', nonAdminUserId);
      await supabase.auth.admin.deleteUser(nonAdminUserId);
    }
  });

  test('unauthenticated visitor is redirected away from /admin/openrouter', async ({ page }) => {
    await page.goto('/admin/openrouter');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('/admin/openrouter');
    await expect(page.locator('text=OpenRouter AI Player Activity')).toHaveCount(0);
  });

  test('authenticated non-admin user is redirected away from /admin/openrouter', async ({ page, context }) => {
    const cookieValue = await signInAndGetCookieValue(nonAdminEmail, testPassword);
    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        sameSite: 'Lax',
      },
    ]);

    await page.goto('/admin/openrouter');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('/admin/openrouter');
    await expect(page.locator('text=OpenRouter AI Player Activity')).toHaveCount(0);
  });

  test('authenticated admin user can view /admin/openrouter', async ({ page, context }) => {
    const cookieValue = await signInAndGetCookieValue(adminEmail, testPassword);
    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        sameSite: 'Lax',
      },
    ]);

    await page.goto('/admin/openrouter');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/admin/openrouter');
    await expect(page.locator('text=OpenRouter AI Player Activity')).toBeVisible();
    await expect(page.locator('text=Total Cost').first()).toBeVisible();
  });
});
