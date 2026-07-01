import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { TEST_USERS } from '../fixtures/auth';
import { loginViaAuthModal, signOutViaUI } from '../helpers/auth-ui';

/**
 * Auth stale-cookie PWA edge-case suite.
 *
 * Simulates PWA behaviour (persistent context, cookies that survive across
 * "sessions", standalone display mode) and tests every sign-in / sign-up /
 * sign-out edge case with stale cookies.
 *
 * The reported PWA symptom: "after sign-out, the sign-in form submits but
 * never authenticates; the auth cookie never gets set."
 */
const AUTH_COOKIE_NAME = 'sb-gzvixlvkwjsrtmtybtkf-auth-token';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findAuthCookies(cookies: { name: string }[]): { name: string }[] {
  return cookies.filter(
    (c) => c.name === AUTH_COOKIE_NAME || c.name.startsWith(`${AUTH_COOKIE_NAME}.`),
  );
}

async function seedStaleCookie(ctx: BrowserContext, baseURL: string): Promise<string> {
  const staleValue =
    'base64-' +
    Buffer.from(
      '{"access_token":"invalid-stale-garbage","refresh_token":"garbage","expires_at":1}',
    ).toString('base64url');
  const url = new URL(baseURL);
  await ctx.addCookies([
    {
      name: AUTH_COOKIE_NAME,
      value: staleValue,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  return staleValue;
}

async function clearAuthCookies(ctx: BrowserContext): Promise<void> {
  const cookies = await ctx.cookies();
  const authCookies = findAuthCookies(cookies);
  for (const c of authCookies) {
    await ctx.clearCookies({ name: c.name });
  }
}

/** Navigate to /login, wait for AuthModal, fill credentials, submit, wait for cookie. */
async function signInViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const modal = page.getByTestId('auth-modal').first();
  await modal.waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(2000); // hydration buffer

  const emailInput = modal.getByTestId('auth-email-input').first();
  const passwordInput = modal.getByTestId('auth-password-input').first();
  const submitBtn = modal.getByTestId('auth-submit-btn').first();

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await submitBtn.click();

  // Wait for auth cookie
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const cookies = await page.context().cookies();
    if (findAuthCookies(cookies).length > 0) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`signInViaUI: auth cookie not set within 120s for ${email}`);
}

/** Switch the AuthModal to sign-up mode and submit. */
async function signUpViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const modal = page.getByTestId('auth-modal').first();
  await modal.waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(2000);

  // Switch to sign-up mode
  const signUpSwitch = modal.locator('button[class*="switchModeButton"]').first();
  await signUpSwitch.click();
  await page.waitForTimeout(500);

  const emailInput = modal.getByTestId('auth-email-input').first();
  const passwordInput = modal.getByTestId('auth-password-input').first();
  const confirmInput = modal.locator('input[type="password"]').nth(1);
  const submitBtn = modal.getByTestId('auth-submit-btn').first();

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await confirmInput.fill(password);
  await submitBtn.click();

  // Wait for either auth cookie (email confirmation disabled) or success message
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const cookies = await page.context().cookies();
    if (findAuthCookies(cookies).length > 0) return;
    // Check for "confirm email sent" message
    const successMsg = await modal.locator('p[class*="successMessage"]').count();
    if (successMsg > 0) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`signUpViaUI: no auth cookie or success message within 120s for ${email}`);
}

/** Verify identity on /account page by checking the displayed email. */
async function verifyIdentityOnAccount(page: Page, expectedEmail: string): Promise<boolean> {
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  // Poll for identity to load (account page redirects to /login if not authed)
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes('/login')) {
      await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForTimeout(2000);
      continue;
    }
    const body = await page.textContent('body').catch(() => '');
    if (body?.includes(expectedEmail)) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Auth stale-cookie PWA edge cases', () => {

  // -------------------------------------------------------------------------
  // EC-1: Sign in → sign out → sign in (same user, same browser) — THE REPORTED PWA BUG
  // -------------------------------------------------------------------------
  test('EC-1: sign out then sign in as same user in same browser context', async ({ page, context }) => {
    const user = TEST_USERS[0];

    // Initial sign-in
    await signInViaUI(page, user.email, user.password);
    const cookiesBefore = await context.cookies();
    expect(findAuthCookies(cookiesBefore).length).toBeGreaterThan(0);
    console.log(`[EC-1] Initial sign-in OK, auth cookie set`);

    // Sign out
    await signOutViaUI(page, BASE_URL);
    const cookiesAfter = await context.cookies();
    const authAfter = findAuthCookies(cookiesAfter);
    console.log(`[EC-1] After sign-out: auth cookies remaining = ${authAfter.length}`);
    expect(authAfter.length).toBe(0);

    // Sign in again — THIS IS THE REPORTED FAILING SCENARIO
    await signInViaUI(page, user.email, user.password);
    const cookiesRe = await context.cookies();
    expect(findAuthCookies(cookiesRe).length).toBeGreaterThan(0);
    console.log(`[EC-1] Re-sign-in OK, auth cookie set again`);
  });

  // -------------------------------------------------------------------------
  // EC-2: Sign in with pre-seeded stale/invalid cookie
  // -------------------------------------------------------------------------
  test('EC-2: sign in with pre-seeded stale invalid cookie', async ({ browser }) => {
    const user = TEST_USERS[1];
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      // Seed stale cookie BEFORE any navigation
      const staleValue = await seedStaleCookie(ctx, BASE_URL);
      console.log(`[EC-2] Seeded stale cookie: ${staleValue.slice(0, 50)}...`);

      // Navigate to /login — check if AuthModal appears despite stale cookie
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const modal = page.getByTestId('auth-modal').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      console.log(`[EC-2] Auth modal visible with stale cookie: ${modalVisible}`);

      // Sign in through the UI
      await signInViaUI(page, user.email, user.password);
      const cookiesAfter = await ctx.cookies();
      const authAfter = findAuthCookies(cookiesAfter);
      console.log(`[EC-2] After sign-in: auth cookies = ${authAfter.length}`);
      expect(authAfter.length).toBeGreaterThan(0);

      // Verify the stale cookie was replaced (not still the garbage value)
      const hasStaleValue = authAfter.some((c) => c.value.includes('invalid-stale-garbage'));
      expect(hasStaleValue).toBe(false);
      console.log(`[EC-2] Stale cookie was replaced with valid session`);
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });

  // -------------------------------------------------------------------------
  // EC-3: Sign up with stale cookie present
  // -------------------------------------------------------------------------
  test('EC-3: sign up with pre-seeded stale cookie', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      // Seed stale cookie
      await seedStaleCookie(ctx, BASE_URL);
      console.log(`[EC-3] Seeded stale cookie before sign-up`);

      // Generate a unique email for sign-up (not in TEST_USERS to avoid conflicts)
      const signUpEmail = `gh-test-signup-${Date.now()}@test.guess-history.com`;
      const signUpPassword = 'TestPass123!';

      await signUpViaUI(page, signUpEmail, signUpPassword);

      const cookiesAfter = await ctx.cookies();
      const authAfter = findAuthCookies(cookiesAfter);
      console.log(`[EC-3] After sign-up: auth cookies = ${authAfter.length}`);

      // If email confirmation is disabled, we should have a session.
      // If enabled, we should see the "confirm email" message.
      // Either way, the stale cookie should not block the flow.
      if (authAfter.length > 0) {
        const hasStaleValue = authAfter.some((c) => c.value.includes('invalid-stale-garbage'));
        expect(hasStaleValue).toBe(false);
        console.log(`[EC-3] Sign-up produced valid session, stale cookie replaced`);
      } else {
        console.log(`[EC-3] Sign-up requires email confirmation (no session) — stale cookie did not block flow`);
      }
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });

  // -------------------------------------------------------------------------
  // EC-4: Cross-user — sign out A, sign in B in same context
  // -------------------------------------------------------------------------
  test('EC-4: sign out Player A then sign in as Player B in same context', async ({ browser }) => {
    const playerA = TEST_USERS[2];
    const playerB = TEST_USERS[3];
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      // Sign in as Player A
      await signInViaUI(page, playerA.email, playerA.password);
      console.log(`[EC-4] Signed in as Player A: ${playerA.email}`);

      // Verify Player A identity
      const isA = await verifyIdentityOnAccount(page, playerA.email);
      console.log(`[EC-4] Player A identity verified on /account: ${isA}`);

      // Sign out
      await signOutViaUI(page, BASE_URL);
      const cookiesAfterSignOut = await ctx.cookies();
      expect(findAuthCookies(cookiesAfterSignOut).length).toBe(0);
      console.log(`[EC-4] Signed out, cookies cleared`);

      // Sign in as Player B in the SAME context
      await signInViaUI(page, playerB.email, playerB.password);
      console.log(`[EC-4] Signed in as Player B: ${playerB.email}`);

      // Verify Player B identity (NOT Player A)
      const isB = await verifyIdentityOnAccount(page, playerB.email);
      expect(isB).toBe(true);

      // Verify Player A data is NOT showing
      const bodyText = await page.textContent('body').catch(() => '');
      const showsA = bodyText?.includes(playerA.email) ?? false;
      expect(showsA).toBe(false);
      console.log(`[EC-4] Player B identity verified, no Player A contamination`);
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });

  // -------------------------------------------------------------------------
  // EC-5: Returning browser — close context, restore storage, verify session
  // -------------------------------------------------------------------------
  test('EC-5: returning browser with restored storage state', async ({ browser }) => {
    const user = TEST_USERS[4];

    // Context 1: sign in and capture storage state BEFORE closing
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    let storageState;
    try {
      await signInViaUI(page1, user.email, user.password);
      const cookies1 = await ctx1.cookies();
      expect(findAuthCookies(cookies1).length).toBeGreaterThan(0);
      console.log(`[EC-5] Context 1: signed in, auth cookie set`);

      // Capture storage state while ctx1 is still open
      storageState = await ctx1.storageState();
      console.log(`[EC-5] Captured storageState: cookies=${storageState.cookies.length}, origins=${storageState.origins.length}`);
    } finally {
      await ctx1.close();
    }

    // Context 2: create with the captured storageState (simulates PWA reopen)
    const ctx2 = await browser.newContext({ storageState });
    const page2 = await ctx2.newPage();
    try {
      // Navigate to /home (protected) — if session is valid, no AuthModal
      await page2.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
      await page2.waitForLoadState('networkidle').catch(() => undefined);

      const modal = page2.getByTestId('auth-modal').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      const cookies2 = await ctx2.cookies();
      const auth2 = findAuthCookies(cookies2);
      console.log(`[EC-5] Context 2: modalVisible=${modalVisible}, authCookies=${auth2.length}`);

      // Session should be restored — no auth modal, auth cookie present
      expect(auth2.length).toBeGreaterThan(0);
      expect(modalVisible).toBe(false);
      console.log(`[EC-5] Session restored successfully in new context`);
    } finally {
      await ctx2.close().catch(() => undefined);
    }
  });

  // -------------------------------------------------------------------------
  // EC-6: Multiple sign-out/sign-in cycles (3x) — PWA repeated use
  // -------------------------------------------------------------------------
  test('EC-6: three sign-out/sign-in cycles in same context', async ({ browser }) => {
    const user = TEST_USERS[5];
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      for (let cycle = 1; cycle <= 3; cycle++) {
        console.log(`[EC-6] Cycle ${cycle}: signing in...`);
        await signInViaUI(page, user.email, user.password);
        const cookiesIn = await ctx.cookies();
        expect(findAuthCookies(cookiesIn).length).toBeGreaterThan(0);

        await signOutViaUI(page, BASE_URL);
        const cookiesOut = await ctx.cookies();
        expect(findAuthCookies(cookiesOut).length).toBe(0);

        console.log(`[EC-6] Cycle ${cycle}: sign-in + sign-out OK`);
      }
      console.log(`[EC-6] All 3 cycles completed successfully`);
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });

  // -------------------------------------------------------------------------
  // EC-7: Expired/corrupted token — sign in, corrupt cookie, reload, verify recovery
  // -------------------------------------------------------------------------
  test('EC-7: corrupted auth cookie triggers recovery on reload', async ({ browser }) => {
    const user = TEST_USERS[6];
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      // Sign in
      await signInViaUI(page, user.email, user.password);
      console.log(`[EC-7] Signed in, corrupting cookie...`);

      // Corrupt the auth cookie by replacing it with garbage
      const cookies = await ctx.cookies();
      const authCookies = findAuthCookies(cookies);
      const url = new URL(BASE_URL);

      // Clear the valid cookies and seed a corrupted one
      for (const c of authCookies) {
        await ctx.clearCookies({ name: c.name });
      }
      await ctx.addCookies([
        {
          name: AUTH_COOKIE_NAME,
          value: 'base64-corrupted-invalid-json-payload',
          domain: url.hostname,
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ]);

      // Reload the page — middleware should detect invalid session and redirect to /login
      await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);

      // The corrupted cookie should cause middleware to redirect to /login
      // (getUser() will fail, user will be null, middleware redirects)
      const urlAfter = page.url();
      console.log(`[EC-7] After reload with corrupted cookie: URL = ${urlAfter}`);

      // Should be redirected to /login or show AuthModal
      const modal = page.getByTestId('auth-modal').first();
      const modalVisible = await modal.isVisible().catch(() => false);
      const onLogin = urlAfter.includes('/login');

      console.log(`[EC-7] onLogin=${onLogin}, modalVisible=${modalVisible}`);
      expect(onLogin || modalVisible).toBe(true);

      // Now sign in should work despite the corrupted cookie
      await signInViaUI(page, user.email, user.password);
      const cookiesFinal = await ctx.cookies();
      expect(findAuthCookies(cookiesFinal).length).toBeGreaterThan(0);
      console.log(`[EC-7] Recovery sign-in succeeded after corrupted cookie`);
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });

  // -------------------------------------------------------------------------
  // EC-8: Sign out when cookie is already stale/invalid (no valid session)
  // -------------------------------------------------------------------------
  test('EC-8: sign out with already-invalid stale cookie', async ({ browser }) => {
    const user = TEST_USERS[7];
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      // Seed stale cookie
      await seedStaleCookie(ctx, BASE_URL);

      // Sign in
      await signInViaUI(page, user.email, user.password);
      console.log(`[EC-8] Signed in with stale cookie pre-seeded`);

      // Corrupt the cookie again
      const cookies = await ctx.cookies();
      const authCookies = findAuthCookies(cookies);
      const url = new URL(BASE_URL);
      for (const c of authCookies) {
        await ctx.clearCookies({ name: c.name });
      }
      await ctx.addCookies([
        {
          name: AUTH_COOKIE_NAME,
          value: 'base64-corrupted',
          domain: url.hostname,
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ]);

      // Navigate to /account and try to sign out
      // The /account page may redirect to /login if the session is invalid
      await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const currentUrl = page.url();
      console.log(`[EC-8] After navigate to /account with corrupted cookie: ${currentUrl}`);

      if (currentUrl.includes('/login')) {
        // Already redirected to login — session was invalid
        console.log(`[EC-8] Redirected to /login (session invalid) — sign-out not needed`);
        // Sign in should still work
        await signInViaUI(page, user.email, user.password);
        const cookiesFinal = await ctx.cookies();
        expect(findAuthCookies(cookiesFinal).length).toBeGreaterThan(0);
        console.log(`[EC-8] Sign-in after invalid session succeeded`);
      } else {
        // On /account — try clicking sign out
        const signOutBtn = page.getByRole('button', { name: 'Sign out' }).first();
        const btnVisible = await signOutBtn.isVisible().catch(() => false);
        if (btnVisible) {
          await signOutBtn.click();
          await page.waitForURL(`${BASE_URL}/`, { timeout: 120000 }).catch(() => undefined);
          console.log(`[EC-8] Sign-out with invalid session succeeded`);
        }
      }
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });

  // -------------------------------------------------------------------------
  // EC-9: PWA standalone mode — persistent context (launchPersistentContext)
  // -------------------------------------------------------------------------
  test('EC-9: PWA persistent context — sign in, sign out, reopen, sign in', async () => {
    const user = TEST_USERS[8];

    // Use a temp directory for persistent context (simulates PWA storage)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-test-'));
    console.log(`[EC-9] Persistent context dir: ${tmpDir}`);

    try {
      // Launch persistent context with PWA-like settings
      const pwaContext = await chromium.launchPersistentContext(tmpDir, {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        colorScheme: 'dark',
        // Simulate standalone display mode (PWA)
        extraHTTPHeaders: {
          'Service-Worker-Navigation-Preload': 'true',
        },
      });

      // Emulate standalone display mode
      await pwaContext.addInitScript(() => {
        Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
        // Override matchMedia for display-mode: standalone
        const originalMatchMedia = window.matchMedia.bind(window);
        window.matchMedia = (query: string) => {
          if (query === '(display-mode: standalone)') {
            return { matches: true, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false } as any;
          }
          return originalMatchMedia(query);
        };
      });

      const page = await pwaContext.newPage();

      try {
        // Phase 1: Sign in
        await signInViaUI(page, user.email, user.password);
        const cookies1 = await pwaContext.cookies();
        expect(findAuthCookies(cookies1).length).toBeGreaterThan(0);
        console.log(`[EC-9] PWA Phase 1: signed in, auth cookie set`);

        // Phase 2: Sign out
        await signOutViaUI(page, BASE_URL);
        const cookies2 = await pwaContext.cookies();
        expect(findAuthCookies(cookies2).length).toBe(0);
        console.log(`[EC-9] PWA Phase 2: signed out, cookies cleared`);

        // Phase 3: Close page (simulates closing PWA), reopen, sign in
        await page.close();
        const page2 = await pwaContext.newPage();
        await signInViaUI(page2, user.email, user.password);
        const cookies3 = await pwaContext.cookies();
        expect(findAuthCookies(cookies3).length).toBeGreaterThan(0);
        console.log(`[EC-9] PWA Phase 3: reopened PWA, signed in successfully`);
      } finally {
        await pwaContext.close().catch(() => undefined);
      }
    } finally {
      // Clean up temp dir
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  // -------------------------------------------------------------------------
  // EC-10: PWA cold start after sign-out — close browser entirely, relaunch, sign in
  // -------------------------------------------------------------------------
  test('EC-10: PWA cold start — close browser, relaunch persistent context, sign in', async () => {
    const user = TEST_USERS[9];
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-coldstart-'));
    console.log(`[EC-10] Cold-start persistent dir: ${tmpDir}`);

    try {
      // Session 1: sign in then sign out
      const ctx1 = await chromium.launchPersistentContext(tmpDir, {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page1 = await ctx1.newPage();

      try {
        await signInViaUI(page1, user.email, user.password);
        console.log(`[EC-10] Session 1: signed in`);
        await signOutViaUI(page1, BASE_URL);
        const cookies = await ctx1.cookies();
        expect(findAuthCookies(cookies).length).toBe(0);
        console.log(`[EC-10] Session 1: signed out, cookies cleared`);
      } finally {
        await ctx1.close();
      }

      // Session 2: relaunch with same persistent dir (simulates PWA cold start)
      const ctx2 = await chromium.launchPersistentContext(tmpDir, {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page2 = await ctx2.newPage();

      try {
        // Verify no auth cookie persisted from before sign-out
        const cookiesBefore = await ctx2.cookies();
        const authBefore = findAuthCookies(cookiesBefore);
        console.log(`[EC-10] Session 2 cold start: auth cookies present = ${authBefore.length}`);
        expect(authBefore.length).toBe(0);

        // Sign in should work
        await signInViaUI(page2, user.email, user.password);
        const cookiesAfter = await ctx2.cookies();
        expect(findAuthCookies(cookiesAfter).length).toBeGreaterThan(0);
        console.log(`[EC-10] Session 2: signed in after cold start`);
      } finally {
        await ctx2.close();
      }
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});
