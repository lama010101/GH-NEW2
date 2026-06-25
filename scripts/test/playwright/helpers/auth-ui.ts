import { Page } from '@playwright/test';
import { TestUser } from '../fixtures/auth';

const AUTH_TIMEOUT = 20000;
const AUTH_MODAL_APPEAR_TIMEOUT = 10000;

/**
 * Log in a single user through the AuthModal UI.
 *
 * The AuthModal is opened by the app when an unauthenticated user visits a
 * protected route. This helper fills email/password, submits, and waits for
 * the modal to disappear.
 */
export async function loginViaAuthModal(page: Page, user: TestUser): Promise<void> {
  console.log(`[AUTH] Logging in ${user.email} via AuthModal...`);

  const modal = page.getByTestId('auth-modal').first();
  await modal.waitFor({ state: 'visible', timeout: AUTH_TIMEOUT });

  const emailInput = modal.getByTestId('auth-email-input').first();
  const passwordInput = modal.getByTestId('auth-password-input').first();
  const submitBtn = modal.getByTestId('auth-submit-btn').first();

  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);

  // Click submit and wait for the modal to close
  await submitBtn.click();
  await modal.waitFor({ state: 'detached', timeout: AUTH_TIMEOUT });

  console.log(`[AUTH] ${user.email} logged in successfully`);
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

  await page.goto(`${baseURL}/account`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const signOutBtn = page.getByRole('button', { name: 'Sign out' }).first();
  await signOutBtn.waitFor({ state: 'visible', timeout: AUTH_TIMEOUT });
  await signOutBtn.click();

  // Wait for redirect to home page (router.push('/'))
  await page.waitForURL(`${baseURL}/`, { timeout: AUTH_TIMEOUT }).catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);

  console.log('[AUTH] Signed out successfully');
}
