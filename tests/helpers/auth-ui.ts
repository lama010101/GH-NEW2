import { Page } from '@playwright/test';
import { TestUser } from './auth';

// Timeouts raised from 20s/10s to 60s/30s to accommodate slow dev-server
// cold compiles and Supabase auth latency when 6 browsers log in sequentially
// under load. In single-browser tests the modal typically detaches in ~7s,
// but the 6-browser pool + globalSetup creates enough contention to exceed
// the original 20s budget.
const AUTH_TIMEOUT = 120000;
const AUTH_MODAL_APPEAR_TIMEOUT = 60000;

/** Supabase auth session cookie name (project ref gzvixlvkwjsrtmtybtkf). */
const AUTH_COOKIE_NAME = 'sb-gzvixlvkwjsrtmtybtkf-auth-token';

/**
 * Poll the browser context for the Supabase auth-token cookie.
 * Resolves true once the cookie (or any chunked variant) is present.
 */
async function waitForAuthCookie(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cookies = await page.context().cookies();
    const found = cookies.some(
      (c) => c.name === AUTH_COOKIE_NAME || c.name.startsWith(`${AUTH_COOKIE_NAME}.`),
    );
    if (found) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * Log in a single user through the AuthModal UI.
 *
 * The AuthModal is opened by the app when an unauthenticated user visits a
 * protected route. This helper fills email/password, submits, and waits for
 * the Supabase auth-token cookie to appear.
 *
 * NOTE: We wait for the auth cookie rather than the modal to detach because
 * the AuthModal's onAuthStateChange → onClose → router.replace chain does
 * not always fire reliably under load. The auth cookie is the true source
 * of truth for authentication — once it's set, the user is logged in
 * regardless of whether the modal visually closed.
 */
export async function loginViaAuthModal(page: Page, user: TestUser): Promise<void> {
  console.log(`[AUTH] Logging in ${user.email} via AuthModal...`);

  const modal = page.getByTestId('auth-modal').first();
  await modal.waitFor({ state: 'visible', timeout: AUTH_TIMEOUT });

  // Wait for the page to finish hydrating before interacting with the form.
  // Under heavy load (6 browsers + dev server cold compile), the modal DOM
  // can appear before React hydrates, so fill()/click() would operate on
  // inputs whose onChange handlers aren't yet attached — the React state
  // never updates and signInWithPassword is never called.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Additional hydration buffer: networkidle fires when the network is quiet,
  // but React hydration may still be in progress. Wait for the submit button
  // to be enabled (loading=false) as a hydration proxy.
  const submitBtn = modal.getByTestId('auth-submit-btn').first();
  await submitBtn.waitFor({ state: 'attached', timeout: AUTH_TIMEOUT });
  await page.waitForTimeout(2000);

  const emailInput = modal.getByTestId('auth-email-input').first();
  const passwordInput = modal.getByTestId('auth-password-input').first();

  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);

  // Click submit and wait for the auth cookie to appear
  await submitBtn.click();
  const cookieFound = await waitForAuthCookie(page, AUTH_TIMEOUT);

  if (!cookieFound) {
    throw new Error(`[AUTH] ${user.email}: auth cookie not set within ${AUTH_TIMEOUT}ms after submit`);
  }

  console.log(`[AUTH] ${user.email} logged in successfully (auth cookie set)`);
}

/**
 * Ensure a user is logged in on the given page.
 *
 * If the AuthModal is present, perform UI login. If it is not present, the
 * user is already authenticated.
 */
export async function ensureLoggedIn(page: Page, user: TestUser): Promise<void> {
  const modal = page.getByTestId('auth-modal').first();
  const appeared = await modal.waitFor({ state: 'visible', timeout: AUTH_MODAL_APPEAR_TIMEOUT })
    .then(() => true)
    .catch(() => false);

  if (appeared) {
    await loginViaAuthModal(page, user);
  } else {
    console.log(`[AUTH] ${user.email} already authenticated`);
  }
}

/**
 * Sign out the current user via the account page UI.
 *
 * Navigates to /account, clicks the "Sign out" button (i18n key nav.sign_out,
 * no data-testid present — selected by accessible role + name), and waits for
 * the redirect to the home page (router.push('/') in account/page.tsx).
 */
export async function signOutViaUI(page: Page, baseURL: string): Promise<void> {
  console.log('[AUTH] Signing out via account page UI...');

  // Navigate to /account with retry — the page redirects to /login if
  // identity hasn't loaded yet (useIdentity bootstraps asynchronously).
  // Retry up to 3 times with 5s backoff.
  let signOutBtn = page.getByRole('button', { name: 'Sign out' }).first();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${baseURL}/account`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Check if redirected to /login (identity not loaded yet)
    const url = page.url();
    if (url.includes('/login')) {
      console.warn(`[AUTH] /account redirected to /login (attempt ${attempt + 1}), retrying in 5s...`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    // Wait for sign-out button to appear (identity loaded, page rendered)
    try {
      await signOutBtn.waitFor({ state: 'visible', timeout: 30000 });
      break;
    } catch {
      console.warn(`[AUTH] Sign out button not visible (attempt ${attempt + 1}), retrying...`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 5000));
    }
  }

  await signOutBtn.click();

  // Wait for redirect to home page (window.location.href = '/')
  await page.waitForURL(`${baseURL}/`, { timeout: AUTH_TIMEOUT }).catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);

  console.log('[AUTH] Signed out successfully');
}
