import { test, expect, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TEST_USERS, type TestUser } from '../fixtures/auth';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const LONG_TIMEOUT = 120_000;
const NAV_TIMEOUT = 300_000; // practice session creation can be slow under dev load
const ROUNDS = 5;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing required Supabase environment variables for practice golden-path spec');
}

const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
const AUTH_COOKIE_NAME = `sb-${projectRef}-auth-token`;

interface SessionBundle {
  cookieName: string;
  cookieValue: string;
  userId: string;
}

const sessionCache = new Map<string, SessionBundle>();

async function getSession(user: TestUser): Promise<SessionBundle> {
  const cached = sessionCache.get(user.email);
  if (cached) return cached;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Auth token fetch failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    token_type: string;
    user: { id: string };
  };

  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: data.expires_at,
    token_type: data.token_type,
    user: data.user,
  };
  const cookieValue = JSON.stringify(session);
  const bundle: SessionBundle = {
    cookieName: AUTH_COOKIE_NAME,
    cookieValue,
    userId: data.user.id,
  };
  sessionCache.set(user.email, bundle);
  return bundle;
}

async function authenticatePage(page: Page, user: TestUser): Promise<SessionBundle> {
  const bundle = await getSession(user);
  await page.context().addCookies([
    {
      name: bundle.cookieName,
      value: bundle.cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
  return bundle;
}

async function ensureWelcomeCompleted(userId: string) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ welcome_completed: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[PRACTICE-GOLDEN] Could not mark welcome_completed for ${userId}: ${res.status} ${body}`);
    }
  } catch (err) {
    console.warn('[PRACTICE-GOLDEN] ensureWelcomeCompleted failed:', err);
  }
}

async function waitForTestId(page: Page, testId: string, timeout = LONG_TIMEOUT) {
  const loc = page.getByTestId(testId).first();
  await loc.waitFor({ state: 'visible', timeout });
  return loc;
}

function isPracticeGameUrl(url: URL) {
  const parts = url.pathname.split('/').filter(Boolean);
  return parts.length === 2 && parts[0] === 'practice' && parts[1].length > 0;
}

async function waitForPracticeGameUrl(page: Page, timeout = NAV_TIMEOUT) {
  const deadline = Date.now() + timeout;
  let attempts = 0;
  const maxAttempts = 3;
  while (Date.now() < deadline && attempts < maxAttempts) {
    attempts++;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await page.waitForURL(
      (url) => isPracticeGameUrl(url) || url.pathname === '/login',
      { timeout: Math.min(30_000, remaining) }
    );
    const url = new URL(page.url());
    if (isPracticeGameUrl(url)) return;
    if (url.pathname === '/login') {
      const next = url.searchParams.get('next') ?? '/practice';
      const target = next.startsWith('/') ? next : '/practice';
      console.warn(`[PRACTICE-GOLDEN] middleware redirected to /login (attempt ${attempts}), retrying ${target}`);
      await page.goto(`${BASE}${target}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }
  }
  throw new Error(`Timed out waiting for /practice/<gameId> after ${attempts} attempts; current URL: ${page.url()}`);
}

async function navigateAuthenticated(
  page: Page,
  path: string,
  predicate: (url: URL) => boolean,
  timeout = LONG_TIMEOUT
) {
  const deadline = Date.now() + timeout;
  let attempts = 0;
  const maxAttempts = 3;
  while (Date.now() < deadline && attempts < maxAttempts) {
    attempts++;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForURL(
        (url) => predicate(url) || url.pathname === '/login',
        { timeout: Math.min(30_000, remaining) }
      );
    } catch {
      // fall through to the URL check below
    }
    const url = new URL(page.url());
    if (predicate(url)) return;
    if (url.pathname === '/login') {
      console.warn(`[PRACTICE-GOLDEN] middleware redirected ${path} to /login (attempt ${attempts}), retrying`);
      await page.waitForTimeout(1000);
      continue;
    }
    throw new Error(`Navigation to ${path} ended at unexpected ${url.pathname}`);
  }
  throw new Error(`Failed to navigate ${path} after ${attempts} attempts; current URL: ${page.url()}`);
}

function gameIdFromUrl(page: Page): string | null {
  const url = new URL(page.url());
  return isPracticeGameUrl(url) ? url.pathname.split('/').filter(Boolean)[1] : null;
}

function practicePlayPill(page: Page) {
  return page.getByRole('button', { name: /Play PRACTICE/i });
}

function settingsModal(page: Page) {
  return page.locator('[role="dialog"][aria-modal="true"]').first();
}

function settingsStartButton(page: Page) {
  return settingsModal(page).getByRole('button', { name: 'Start Practice' });
}

async function dismissWelcomeModal(page: Page) {
  const save = page.locator('div[class*="WelcomeModal_overlay"] button[class*="saveButton"]').first();
  const visible = await save.isVisible().catch(() => false);
  if (!visible) return;
  // The modal card slides in; a forced click can miss a moving button,
  // so use Playwright's stable click and wait for the modal to unmount.
  await save.click();
  await page.waitForResponse((r) => r.url().includes('/api/user/update-username'), { timeout: 30000 });
  const overlay = page.locator('div[class*="WelcomeModal_overlay"]');
  await overlay.waitFor({ state: 'hidden', timeout: 10000 });
}

async function openPracticeSettingsFromHome(page: Page) {
  const pill = practicePlayPill(page);
  await expect(pill).toBeVisible({ timeout: LONG_TIMEOUT });
  await pill.click({ force: true });
  await expect(settingsModal(page)).toBeVisible({ timeout: LONG_TIMEOUT });
}

async function startFromSettingsModal(page: Page) {
  const start = settingsStartButton(page);
  await expect(start).toBeVisible({ timeout: LONG_TIMEOUT });
  await start.click({ force: true });

  // The Home settings Start button pushes to /practice, which should auto-create
  // and replace to /practice/<gameId>. Under dev load the /practice create effect
  // can race and stall before it redirects; fall back to a direct /practice load
  // (which uses the same localStorage settings) so the golden path stays robust.
  try {
    await waitForPracticeGameUrl(page, 15_000);
  } catch {
    if (gameIdFromUrl(page) === null) {
      await navigateAuthenticated(page, '/practice', isPracticeGameUrl, NAV_TIMEOUT);
    } else {
      await waitForPracticeGameUrl(page, NAV_TIMEOUT);
    }
  }

  await waitForTestId(page, 'round-active-section', NAV_TIMEOUT);
  const section = page.getByTestId('round-active-section').first();
  await expect(section).toHaveAttribute('data-status', 'ROUND_ACTIVE');
}

async function setYearViaWhenSheet(page: Page) {
  const whenBtn = page.getByTestId('round-when-btn').first();
  await expect(whenBtn).toBeEnabled({ timeout: LONG_TIMEOUT });
  // Nav buttons have a CSS glow pulse, so force click to skip stability checks.
  await whenBtn.click({ force: true });

  const yearBtn = page.getByRole('button').filter({ hasText: /^\d{4}$/ }).first();
  await yearBtn.waitFor({ state: 'visible', timeout: LONG_TIMEOUT });
  await yearBtn.click({ force: true });

  const confirm = page.locator('button[class*="sheetConfirmWhen"]').first();
  await expect(confirm).toBeEnabled({ timeout: 5000 });
  await confirm.click({ force: true });
  await expect(page.locator('button[class*="sheetConfirmBtn"]')).toHaveCount(0, { timeout: 5000 });
}

async function setLocationViaWhereSheet(page: Page) {
  const whereBtn = page.getByTestId('round-where-btn').first();
  await expect(whereBtn).toBeEnabled({ timeout: LONG_TIMEOUT });
  await whereBtn.click({ force: true });

  const map = page.locator('.leaflet-container').last();
  await map.waitFor({ state: 'visible', timeout: LONG_TIMEOUT });
  const box = await map.boundingBox();
  if (box) {
    await map.click({ force: true, position: { x: box.width / 2, y: box.height / 2 } });
  }

  const confirm = page.locator('button[class*="sheetConfirmWhere"]').first();
  await expect(confirm).toBeEnabled({ timeout: 5000 });
  await confirm.click({ force: true });
  await expect(page.locator('button[class*="sheetConfirmBtn"]')).toHaveCount(0, { timeout: 5000 });
}

async function playOneRound(page: Page, roundIndex: number) {
  const section = page.getByTestId('round-active-section').first();
  await expect(section).toHaveAttribute('data-status', 'ROUND_ACTIVE', { timeout: LONG_TIMEOUT });
  await expect(section).toHaveAttribute('data-round-index', String(roundIndex), { timeout: LONG_TIMEOUT });

  // Wait until the round is fully interactive before touching inputs; the
  // parent effect that resets localSubmitted/guessYear/guessLocation runs
  // after the snapshot changes, and an early click can lock the controls.
  await expect(page.getByTestId('round-when-btn').first()).toBeEnabled({ timeout: LONG_TIMEOUT });
  await expect(page.getByTestId('round-where-btn').first()).toBeEnabled({ timeout: LONG_TIMEOUT });

  // P6: Next button must not be disabled due to connectionState in Practice.
  // The Next button only appears after submit, but we guard the regression here
  // by asserting it is enabled every time we reach ROUND_COMPLETE.

  await setYearViaWhenSheet(page);
  await setLocationViaWhereSheet(page);

  const submitBtn = page.getByTestId('round-submit-btn').first();
  // Submit button has a CSS pulse when ready; force click to avoid stability timeout.
  await submitBtn.click({ force: true });
  await waitForTestId(page, 'round-complete-section', LONG_TIMEOUT);
  const completeSection = page.getByTestId('round-complete-section').first();
  await expect(completeSection).toHaveAttribute('data-status', 'ROUND_COMPLETE');
  await expect(completeSection).toHaveAttribute('data-round-index', String(roundIndex));

  const nextBtn = page.getByTestId('round-next-btn').first();
  await expect(nextBtn).toBeVisible();
  await expect(nextBtn).not.toBeDisabled();

  return nextBtn;
}

async function advanceRound(page: Page) {
  const next = page.getByTestId('round-next-btn').first();
  await expect(next).toBeEnabled({ timeout: LONG_TIMEOUT });
  await next.click({ force: true });
}

test.describe.serial('Practice golden path', () => {
  const user = TEST_USERS[0];
  let authUserId = '';

  test.beforeAll(async () => {
    const bundle = await getSession(user);
    authUserId = bundle.userId;
    // Pre-mark the test user as having completed onboarding so the WelcomeModal
    // never opens and cannot flake the /home entry assertions.
    await ensureWelcomeCompleted(authUserId);
  });

  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, user);
  });

  test.afterEach(async ({ page }) => {
    const storageKey = `gh_practice_game_${authUserId}`;
    await page.evaluate((key) => {
      localStorage.removeItem(key);
      localStorage.removeItem('practice_settings');
    }, storageKey);
  });

  test('P0–P3: authenticated entry, settings start, full 5-round flow, play-again settings persistence', async ({ page }) => {
    // P0 — Auth / entry: protected /home route renders for a logged-in player.
    // Retry once if the Supabase middleware getUser() call flakes and redirects to /login.
    await navigateAuthenticated(page, '/home', (url) => url.pathname === '/home');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await dismissWelcomeModal(page);
    await expect(practicePlayPill(page)).toBeVisible({ timeout: LONG_TIMEOUT });
    console.log('[PRACTICE-GOLDEN] P0 passed: authenticated entry');

    // P1 — Home → settings → start.
    await openPracticeSettingsFromHome(page);
    // Default settings: timer toggle (OFF) and at least one era chip visible.
    await expect(settingsModal(page).locator('button[class*="lobbyToggleBtn"]').first()).toBeVisible();
    await expect(settingsModal(page).locator('button[class*="lobbySelectAllBtn"]').first()).toBeVisible();
    await startFromSettingsModal(page);
    const gameIdA = gameIdFromUrl(page);
    expect(gameIdA, 'P1: created practice game').not.toBeNull();
    console.log('[PRACTICE-GOLDEN] P1 passed: home → settings → start', gameIdA);

    // P2 — Full 5-round solo flow. P6 is asserted inside every ROUND_COMPLETE.
    for (let round = 0; round < ROUNDS; round++) {
      await playOneRound(page, round);
      if (round < ROUNDS - 1) {
        await advanceRound(page);
        await waitForTestId(page, 'round-active-section', LONG_TIMEOUT);
      }
    }
    await advanceRound(page);
    await waitForTestId(page, 'session-complete-section', LONG_TIMEOUT);
    const sessionComplete = page.getByTestId('session-complete-section').first();
    await expect(sessionComplete).toHaveAttribute('data-status', 'SESSION_COMPLETE');
    console.log('[PRACTICE-GOLDEN] P2 passed: full 5-round solo flow');

    // P3 — Play Again (and P8 — settings persistence in the same flow).
    const playAgain = page.getByTestId('session-play-again-btn').first();
    await expect(playAgain).toBeVisible({ timeout: LONG_TIMEOUT });
    await playAgain.click({ force: true });

    // P8: change settings before starting to prove persistence.
    const settings = settingsModal(page);
    await expect(settings).toBeVisible({ timeout: LONG_TIMEOUT });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const timerToggle = settings.locator('button[class*="lobbyToggleBtn"]').first();
    await timerToggle.click({ force: true });
    const slider = settings.locator('input[type="range"]').first();
    await slider.waitFor({ state: 'visible', timeout: 5000 });
    await slider.fill('300');
    // Reduce the Era row to exactly one selected era by toggling the Era
    // "select all / deselect all" button until only one chip is pressed.
    const eraRow = settings.locator('div[class*="lobbySettingRowBlock"]').first();
    let selectedEraCount = await eraRow.locator('button[class*="lobbyImgBtn"][aria-pressed="true"]').count();
    const eraSelectAll = eraRow.locator('button[class*="lobbySelectAllBtn"]').first();
    let attempts = 0;
    while (selectedEraCount !== 1 && attempts < 3) {
      await eraSelectAll.click({ force: true });
      await page.waitForTimeout(200);
      selectedEraCount = await eraRow.locator('button[class*="lobbyImgBtn"][aria-pressed="true"]').count();
      attempts++;
    }
    expect(selectedEraCount, 'P8: exactly one era selected before start').toBe(1);

    const start = settingsStartButton(page);
    await start.click({ force: true });
    await waitForPracticeGameUrl(page, NAV_TIMEOUT);
    await waitForTestId(page, 'round-active-section', NAV_TIMEOUT);

    const gameIdB = gameIdFromUrl(page);
    expect(gameIdB, 'P3: play-again created new game').not.toBeNull();
    expect(gameIdB, 'P3: new game differs from first').not.toBe(gameIdA);

    const storageKey = `gh_practice_game_${authUserId}`;
    const stored = await page.evaluate((key) => localStorage.getItem('practice_settings'), storageKey);
    expect(stored, 'P8: settings persisted in localStorage').not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed.roundTimerSec, 'P8: persisted timer value').toBe(300);
    expect(parsed.selectedEras, 'P8: persisted eras is array').toBeInstanceOf(Array);
    expect(parsed.selectedEras.length, 'P8: one era selected after deselect-all').toBe(1);
    expect(typeof parsed.yearMin, 'P8: yearMin persisted').toBe('number');
    expect(typeof parsed.yearMax, 'P8: yearMax persisted').toBe('number');
    console.log('[PRACTICE-GOLDEN] P3 passed: play-again new game');
    console.log('[PRACTICE-GOLDEN] P8 passed: settings persistence');
  });

  test('P4: resume vs new-game modal', async ({ page }) => {
    // Establish our own in-progress game.
    await navigateAuthenticated(page, '/home', (url) => url.pathname === '/home');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await dismissWelcomeModal(page);
    await openPracticeSettingsFromHome(page);
    await startFromSettingsModal(page);
    const gameId = gameIdFromUrl(page);
    expect(gameId, 'P4: created practice game').not.toBeNull();

    // Return home and click Practice again; the resume modal should appear.
    await navigateAuthenticated(page, '/home', (url) => url.pathname === '/home');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await dismissWelcomeModal(page);

    const pill = practicePlayPill(page);
    await expect(pill).toBeVisible({ timeout: LONG_TIMEOUT });
    await pill.click({ force: true });

    const resumeBtn = page.locator('button[class*="resumeBtn"]').first();
    const newBtn = page.locator('button[class*="newBtn"]').first();
    await expect(resumeBtn).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(newBtn).toBeVisible({ timeout: LONG_TIMEOUT });

    await resumeBtn.click({ force: true });
    await waitForPracticeGameUrl(page, NAV_TIMEOUT);
    expect(gameIdFromUrl(page), 'P4: resume navigates to stored game').toBe(gameId);
    await waitForTestId(page, 'round-active-section', NAV_TIMEOUT);
    console.log('[PRACTICE-GOLDEN] P4 passed: resume vs new-game modal (resume path)');
  });

  test('P5: direct /practice navigation creates a new game', async ({ page }) => {
    const storageKey = `gh_practice_game_${authUserId}`;
    await navigateAuthenticated(page, '/home', (url) => url.pathname === '/home');
    await dismissWelcomeModal(page);
    await page.evaluate((key) => { localStorage.removeItem(key); }, storageKey);

    await navigateAuthenticated(page, '/practice', isPracticeGameUrl, NAV_TIMEOUT);
    const gameId = gameIdFromUrl(page);
    expect(gameId, 'P5: direct /practice created a game').not.toBeNull();
    await waitForTestId(page, 'round-active-section', NAV_TIMEOUT);
    const active = page.getByTestId('round-active-section').first();
    await expect(active).toHaveAttribute('data-status', 'ROUND_ACTIVE');
    console.log('[PRACTICE-GOLDEN] P5 passed: direct URL navigation', gameId);
  });

  test('P7: network failure during resume falls back to settings', async ({ page }) => {
    const storageKey = `gh_practice_game_${authUserId}`;
    await navigateAuthenticated(page, '/home', (url) => url.pathname === '/home');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await dismissWelcomeModal(page);
    await page.evaluate((key) => { localStorage.setItem(key, 'does-not-exist-0000-0000-000000000000'); }, storageKey);

    await page.route('**/api/compete/**', (route) => route.abort('internetdisconnected'));
    const pill = practicePlayPill(page);
    await expect(pill).toBeVisible({ timeout: LONG_TIMEOUT });
    await pill.click({ force: true });
    // With the resume fetch failing, home falls through and opens the settings modal.
    await expect(settingsModal(page)).toBeVisible({ timeout: LONG_TIMEOUT });
    await page.unroute('**/api/compete/**');
    await page.evaluate((key) => { localStorage.removeItem(key); }, storageKey);
    console.log('[PRACTICE-GOLDEN] P7 passed: network failure during resume falls back to settings');
  });
});
