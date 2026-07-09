// =============================================================================
// MP-STAB-AUTH-RESILIENCE-002-PHASE-E — Dirty-state verification (Playwright)
// =============================================================================
// Read-only verification. No source edits. Scratch script — deleted after run.
//
// Run:  npx tsx scripts/test/_scratch/auth-resilience-e2e.ts
//
// Scenarios:
//   PW-EXPIRED-TOKEN-RELOAD-001  expired token -> page loads (refresh resolves)
//   PW-EXPIRED-TOKEN-RELOAD-002  expired token + network failure -> escape hatch
//   PW-GUEST-LOBBY-RELOAD-003    guest reloads mid-lobby -> reconnects
//   PW-HOST-ROUND-RELOAD-004     host reloads mid-round -> re-enters round
//   PW-GUEST-ROUND-RELOAD-005    guest reloads mid-round -> re-enters round
// =============================================================================
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const AUTH_COOKIE_NAME = 'sb-gzvixlvkwjsrtmtybtkf-auth-token';
const SUPABASE_HOST = 'gzvixlvkwjsrtmtybtkf.supabase.co';
const SHOT_DIR = path.resolve(process.cwd(), 'scripts/test/_scratch/screenshots-e');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const PLAYER1 = { email: 'gh-test-player-1@test.guess-history.com', password: 'TestPass123!', name: 'TestPlayer1' };
const PLAYER2 = { email: 'gh-test-player-2@test.guess-history.com', password: 'TestPass123!', name: 'TestPlayer2' };

const results: { id: string; verdict: 'PASS' | 'FAIL' | 'UNRUNNABLE'; evidence: string }[] = [];

function log(msg: string): void { console.log(msg); }

async function loginViaAuthModal(page: Page, email: string, password: string): Promise<void> {
  const modal = page.getByTestId('auth-modal').first();
  await modal.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(2000);
  const submitBtn = modal.getByTestId('auth-submit-btn').first();
  await submitBtn.waitFor({ state: 'attached', timeout: 60000 });
  await modal.getByTestId('auth-email-input').first().fill(email);
  await modal.getByTestId('auth-password-input').first().fill(password);
  await submitBtn.click();
  // wait for auth cookie
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const cookies = await page.context().cookies();
    if (cookies.some(c => c.name === AUTH_COOKIE_NAME || c.name.startsWith(`${AUTH_COOKIE_NAME}.`))) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`login: auth cookie not set for ${email}`);
}

/** Capture storageState, mutate the sb-*-auth-token localStorage entry to be expired, write temp file. */
async function buildExpiredStorageState(ctx: BrowserContext): Promise<string> {
  const state = await ctx.storageState();
  let mutated = false;
  for (const origin of state.origins) {
    if (!origin.localStorage) continue;
    for (const item of origin.localStorage) {
      if (item.name === AUTH_COOKIE_NAME || item.name.startsWith(`${AUTH_COOKIE_NAME}.`)) {
        try {
          const parsed = JSON.parse(item.value);
          if (parsed && typeof parsed === 'object') {
            parsed.expires_at = Math.floor(Date.now() / 1000) - 3600; // 1h in the past
            item.value = JSON.stringify(parsed);
            mutated = true;
            log(`  [setup] mutated localStorage key "${item.name}" -> expires_at=${parsed.expires_at}`);
          }
        } catch { /* not JSON — skip */ }
      }
    }
  }
  if (!mutated) log('  [setup] WARNING: no sb-*-auth-token localStorage entry found to mutate');
  const tmp = path.join(os.tmpdir(), `pw-expired-state-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(state));
  log(`  [setup] wrote expired storageState -> ${tmp}`);
  return tmp;
}

async function homeIsAuthenticated(page: Page): Promise<{ ready: boolean; hasError: boolean; stillLoading: boolean; bodySnippet: string }> {
  const body = await page.evaluate(() => document.body?.innerText?.slice(0, 400) ?? '');
  const hasError = body.includes('Something went wrong');
  // "Loading" alone (common.loading) indicates still-loading state
  const stillLoading = !body.includes('Where and when did it happen?') && body.toLowerCase().includes('loading') && !hasError;
  const ready = body.includes('Where and when did it happen?');
  return { ready, hasError, stillLoading, bodySnippet: body.replace(/\s+/g, ' ').slice(0, 200) };
}

// ---------------------------------------------------------------------------
// SCENARIO 001 — expired token -> page loads (refresh resolves)
// ---------------------------------------------------------------------------
async function scenario001(): Promise<void> {
  const id = 'PW-EXPIRED-TOKEN-RELOAD-001';
  log('\n================================================================');
  log(` ${id} — expired token -> page loads (refresh resolves)`);
  log('================================================================');
  const browser = await chromium.launch({ headless: true });
  const consoleLogs: string[] = [];
  let tmpState = '';
  try {
    // Step 1: log in to obtain a real session, then capture+expire storageState
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));
    log('  [1] navigating to /login?next=/home to trigger AuthModal');
    await page.goto(`${BASE_URL}/login?next=/home`, { waitUntil: 'domcontentloaded' });
    await loginViaAuthModal(page, PLAYER1.email, PLAYER1.password);
    log('  [1] login OK, capturing storageState');
    tmpState = await buildExpiredStorageState(ctx);
    await ctx.close();

    // Step 2: launch fresh context with expired storageState, navigate /home
    const ctx2 = await browser.newContext({ storageState: tmpState });
    const page2 = await ctx2.newPage();
    const logs2: string[] = [];
    page2.on('console', m => logs2.push(`[${m.type()}] ${m.text()}`));
    page2.on('pageerror', e => logs2.push(`[pageerror] ${e.message}`));
    log('  [2] navigating to /home with EXPIRED token storageState');
    await page2.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
    // Wait up to 15s for authenticated UI
    const start = Date.now();
    let outcome: { ready: boolean; hasError: boolean; stillLoading: boolean; bodySnippet: string } | null = null;
    while (Date.now() - start < 15000) {
      await page2.waitForTimeout(500);
      const o = await homeIsAuthenticated(page2);
      if (o.ready || o.hasError) { outcome = o; break; }
    }
    if (!outcome) outcome = await homeIsAuthenticated(page2);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const shot = path.join(SHOT_DIR, `${id}.png`);
    await page2.screenshot({ path: shot });
    const url = page2.url();
    log(`  [result] elapsed=${elapsed}s url=${url}`);
    log(`  [result] ready=${outcome.ready} hasError=${outcome.hasError} stillLoading=${outcome.stillLoading}`);
    log(`  [result] bodySnippet="${outcome.bodySnippet}"`);
    log(`  [result] screenshot=${shot}`);
    log(`  [console] ${logs2.slice(-15).join(' | ')}`);
    const pass = outcome.ready && !outcome.hasError;
    results.push({ id, verdict: pass ? 'PASS' : 'FAIL', evidence: `ready=${outcome.ready} hasError=${outcome.hasError} stillLoading=${outcome.stillLoading} elapsed=${elapsed}s url=${url} body="${outcome.bodySnippet}" screenshot=${shot} consoleTail=${logs2.slice(-15).join(' | ')}` });
    await ctx2.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`  [EXCEPTION] ${msg}`);
    results.push({ id, verdict: 'FAIL', evidence: `exception: ${msg}` });
  } finally {
    if (tmpState && fs.existsSync(tmpState)) fs.unlinkSync(tmpState);
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// SCENARIO 002 — expired token + network failure -> escape hatch
// ---------------------------------------------------------------------------
async function scenario002(): Promise<void> {
  const id = 'PW-EXPIRED-TOKEN-RELOAD-002';
  log('\n================================================================');
  log(` ${id} — expired token + network failure -> escape hatch`);
  log('================================================================');
  const browser = await chromium.launch({ headless: true });
  let tmpState = '';
  try {
    // Reuse a login to get a real session, then expire it
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    log('  [1] logging in to obtain real session');
    await page.goto(`${BASE_URL}/login?next=/home`, { waitUntil: 'domcontentloaded' });
    await loginViaAuthModal(page, PLAYER1.email, PLAYER1.password);
    tmpState = await buildExpiredStorageState(ctx);
    await ctx.close();

    // New context with expired state + abort supabase token refresh
    const ctx2 = await browser.newContext({ storageState: tmpState });
    const page2 = await ctx2.newPage();
    const logs2: string[] = [];
    page2.on('console', m => logs2.push(`[${m.type()}] ${m.text()}`));
    page2.on('pageerror', e => logs2.push(`[pageerror] ${e.message}`));
    let authRequestsAfterClick = 0;
    await page2.route(`**/${SUPABASE_HOST}/auth/v1/token**`, route => {
      authRequestsAfterClick++; // counts all token requests (we can't easily split pre/post click here)
      log(`  [route] ABORT supabase token request: ${route.request().url()}`);
      return route.abort();
    });
    log('  [2] navigating to /home with expired token + aborted refresh');
    await page2.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
    // Wait 12s for the 10s loading-timeout escape hatch to appear
    log('  [3] waiting 12s for escape hatch (10s loading timeout)');
    await page2.waitForTimeout(12000);
    const shotBefore = path.join(SHOT_DIR, `${id}-before.png`);
    await page2.screenshot({ path: shotBefore });
    const bodyBefore = await page2.evaluate(() => document.body?.innerText?.slice(0, 300) ?? '');
    log(`  [3] bodyBefore="${bodyBefore.replace(/\s+/g, ' ').slice(0, 200)}"`);
    log(`  [3] screenshotBefore=${shotBefore}`);

    // Click the "Clear session & restart" escape hatch button
    const clearBtn = page2.locator('button', { hasText: 'Clear session & restart' }).first();
    const btnVisible = await clearBtn.isVisible().catch(() => false);
    log(`  [4] escape-hatch button visible=${btnVisible}`);
    if (!btnVisible) {
      const shot = path.join(SHOT_DIR, `${id}-nohatch.png`);
      await page2.screenshot({ path: shot });
      results.push({ id, verdict: 'FAIL', evidence: `escape hatch button not visible after 12s. body="${bodyBefore.replace(/\s+/g, ' ')}" screenshot=${shot}` });
      await ctx2.close();
      return;
    }
    const authRequestsBeforeClick = authRequestsAfterClick;
    await clearBtn.click();
    log('  [5] clicked escape hatch, waiting for /login navigation');
    await page2.waitForURL(/\/login/, { timeout: 15000 }).catch(() => undefined);
    await page2.waitForLoadState('domcontentloaded').catch(() => undefined);
    await page2.waitForTimeout(1500);
    const shotAfter = path.join(SHOT_DIR, `${id}-after.png`);
    await page2.screenshot({ path: shotAfter });
    const urlAfter = page2.url();
    const cookiesAfter = await ctx2.cookies();
    const sbCookies = cookiesAfter.filter(c => c.name.startsWith('sb-'));
    const authReqsAfterClick = authRequestsAfterClick - authRequestsBeforeClick;
    log(`  [result] urlAfter=${urlAfter}`);
    log(`  [result] sb-* cookies remaining=${sbCookies.length} names=[${sbCookies.map(c => c.name).join(',')}]`);
    log(`  [result] auth token requests AFTER click=${authReqsAfterClick}`);
    log(`  [result] screenshotAfter=${shotAfter}`);
    log(`  [console] ${logs2.slice(-15).join(' | ')}`);
    const navigatedToLogin = /\/login/.test(urlAfter) || urlAfter === `${BASE_URL}/` || urlAfter === `${BASE_URL}`;
    const noSbCookies = sbCookies.length === 0;
    const pass = btnVisible && navigatedToLogin && noSbCookies && authReqsAfterClick === 0;
    results.push({ id, verdict: pass ? 'PASS' : 'FAIL', evidence: `btnVisible=${btnVisible} navigatedToLogin=${navigatedToLogin} (url=${urlAfter}) sbCookiesRemaining=${sbCookies.length} authReqsAfterClick=${authReqsAfterClick} screenshotBefore=${shotBefore} screenshotAfter=${shotAfter} consoleTail=${logs2.slice(-15).join(' | ')}` });
    await ctx2.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`  [EXCEPTION] ${msg}`);
    results.push({ id, verdict: 'FAIL', evidence: `exception: ${msg}` });
  } finally {
    if (tmpState && fs.existsSync(tmpState)) fs.unlinkSync(tmpState);
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Helper: create a game as host on /compete, return gameId from URL
// ---------------------------------------------------------------------------
async function createGameAsHost(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/compete`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Default mode is "create". Click "Create Game" button.
  const createBtn = page.locator('button', { hasText: 'Create Game' }).first();
  await createBtn.waitFor({ state: 'visible', timeout: 15000 });
  await createBtn.click();
  // Wait for navigation to /compete/[gameId]
  await page.waitForURL(/\/compete\/[A-Z0-9]{6,}/, { timeout: 30000 });
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  const url = page.url();
  const m = url.match(/\/compete\/([A-Z0-9]{6,})/);
  if (!m) throw new Error(`createGameAsHost: could not parse gameId from ${url}`);
  return m[1];
}

async function joinGame(page: Page, gameId: string): Promise<void> {
  await page.goto(`${BASE_URL}/compete`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Switch to "Join" tab
  const joinTab = page.locator('button', { hasText: 'Join' }).first();
  await joinTab.waitFor({ state: 'visible', timeout: 15000 });
  await joinTab.click();
  const codeInput = page.locator('#join-game-id').first();
  await codeInput.waitFor({ state: 'visible', timeout: 10000 });
  await codeInput.fill(gameId);
  const joinBtn = page.locator('button', { hasText: 'Join Game' }).first();
  await joinBtn.click();
  await page.waitForURL(new RegExp(`/compete/${gameId}`), { timeout: 30000 });
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}

async function waitForLobby(page: Page, timeout = 20000): Promise<boolean> {
  try {
    await page.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout });
    return true;
  } catch { return false; }
}

async function waitForRoundActive(page: Page, timeout = 30000): Promise<{ ok: boolean; roundIndex: string | null }> {
  try {
    await page.locator('[data-testid="round-active-section"]').first().waitFor({ state: 'visible', timeout });
    const ri = await page.locator('[data-testid="round-active-section"]').first().getAttribute('data-round-index');
    return { ok: true, roundIndex: ri };
  } catch { return { ok: false, roundIndex: null }; }
}

async function clickReady(page: Page): Promise<void> {
  const btn = page.locator('[data-testid="lobby-ready-btn"]').first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  // Only click if not already ready
  const txt = (await btn.innerText().catch(() => '')).toLowerCase();
  if (!txt.includes('waiting') && !txt.includes('ready')) {
    await btn.click();
  } else {
    log(`    [ready] already ready (text="${txt}")`);
  }
}

// ---------------------------------------------------------------------------
// SCENARIOS 003-005 — two-player lobby + round reloads
// ---------------------------------------------------------------------------
async function scenarios003to005(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    // ---- Setup: two authenticated contexts ----
    log('\n================================================================');
    log(' 003-005 SETUP — two authenticated contexts');
    log('================================================================');
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const logsA: string[] = []; const logsB: string[] = [];
    pageA.on('console', m => logsA.push(`[${m.type()}] ${m.text()}`));
    pageA.on('pageerror', e => logsA.push(`[pageerror] ${e.message}`));
    pageB.on('console', m => logsB.push(`[${m.type()}] ${m.text()}`));
    pageB.on('pageerror', e => logsB.push(`[pageerror] ${e.message}`));

    log('  [setup] logging in host (player 1)');
    await pageA.goto(`${BASE_URL}/login?next=/home`, { waitUntil: 'domcontentloaded' });
    await loginViaAuthModal(pageA, PLAYER1.email, PLAYER1.password);
    log('  [setup] logging in guest (player 2)');
    await pageB.goto(`${BASE_URL}/login?next=/home`, { waitUntil: 'domcontentloaded' });
    await loginViaAuthModal(pageB, PLAYER2.email, PLAYER2.password);

    // ---- Create + join ----
    log('  [setup] host creating game');
    const gameId = await createGameAsHost(pageA);
    log(`  [setup] gameId=${gameId}`);
    log('  [setup] guest joining game');
    await joinGame(pageB, gameId);

    log('  [setup] waiting for lobby on both contexts');
    const lobbyA = await waitForLobby(pageA);
    const lobbyB = await waitForLobby(pageB);
    log(`  [setup] lobbyA=${lobbyA} lobbyB=${lobbyB}`);
    if (!lobbyA || !lobbyB) {
      const shotA = path.join(SHOT_DIR, '003-005-setup-fail-A.png');
      const shotB = path.join(SHOT_DIR, '003-005-setup-fail-B.png');
      await pageA.screenshot({ path: shotA }).catch(() => undefined);
      await pageB.screenshot({ path: shotB }).catch(() => undefined);
      for (const sid of ['PW-GUEST-LOBBY-RELOAD-003', 'PW-HOST-ROUND-RELOAD-004', 'PW-GUEST-ROUND-RELOAD-005']) {
        results.push({ id: sid, verdict: 'UNRUNNABLE', evidence: `lobby setup failed: lobbyA=${lobbyA} lobbyB=${lobbyB} gameId=${gameId} shotA=${shotA} shotB=${shotB}` });
      }
      await ctxA.close(); await ctxB.close();
      return;
    }

    // Wait for roster to show 2 players
    await pageA.waitForTimeout(2500);
    const rosterCountA = await pageA.locator('[data-testid="lobby-roster"] [data-testid^="lobby-player-"]').count();
    log(`  [setup] host roster player rows=${rosterCountA}`);

    // ---- 003: guest reload mid-lobby ----
    {
      const id = 'PW-GUEST-LOBBY-RELOAD-003';
      log('\n----------------------------------------------------------------');
      log(` ${id} — guest reloads mid-lobby`);
      log('----------------------------------------------------------------');
      const shotBefore = path.join(SHOT_DIR, `${id}-before.png`);
      await pageB.screenshot({ path: shotBefore });
      log(`  [003] screenshotBefore=${shotBefore}`);
      log('  [003] reloading guest (context B)');
      await pageB.reload({ waitUntil: 'domcontentloaded' });
      const lobbyAfter = await waitForLobby(pageB, 15000);
      const shotAfter = path.join(SHOT_DIR, `${id}-after.png`);
      await pageB.screenshot({ path: shotAfter });
      const bodyB = await pageB.evaluate(() => document.body?.innerText?.slice(0, 300) ?? '');
      const hasError = bodyB.includes('Something went wrong');
      log(`  [003] lobbyAfterReload=${lobbyAfter} hasError=${hasError}`);
      log(`  [003] bodySnippet="${bodyB.replace(/\s+/g, ' ').slice(0, 180)}"`);
      log(`  [003] screenshotAfter=${shotAfter}`);
      log(`  [003] consoleTail=${logsB.slice(-10).join(' | ')}`);
      const pass = lobbyAfter && !hasError;
      results.push({ id, verdict: pass ? 'PASS' : 'FAIL', evidence: `lobbyAfterReload=${lobbyAfter} hasError=${hasError} body="${bodyB.replace(/\s+/g, ' ').slice(0, 120)}" screenshotBefore=${shotBefore} screenshotAfter=${shotAfter} consoleTail=${logsB.slice(-10).join(' | ')}` });
    }

    // ---- Start the game: both ready ----
    log('\n  [start] both players clicking Ready to start the game');
    await clickReady(pageA);
    await pageA.waitForTimeout(500);
    await clickReady(pageB);
    log('  [start] waiting for ROUND_ACTIVE on both contexts');
    const raA = await waitForRoundActive(pageA, 40000);
    const raB = await waitForRoundActive(pageB, 40000);
    log(`  [start] roundActiveA=${raA.ok} idx=${raA.roundIndex} roundActiveB=${raB.ok} idx=${raB.roundIndex}`);

    if (!raA.ok || !raB.ok) {
      const shotA = path.join(SHOT_DIR, '004-005-start-fail-A.png');
      const shotB = path.join(SHOT_DIR, '004-005-start-fail-B.png');
      await pageA.screenshot({ path: shotA }).catch(() => undefined);
      await pageB.screenshot({ path: shotB }).catch(() => undefined);
      for (const sid of ['PW-HOST-ROUND-RELOAD-004', 'PW-GUEST-ROUND-RELOAD-005']) {
        results.push({ id: sid, verdict: 'UNRUNNABLE', evidence: `round did not start: raA=${raA.ok} raB=${raB.ok} shotA=${shotA} shotB=${shotB}` });
      }
      await ctxA.close(); await ctxB.close();
      return;
    }

    // ---- 004: host reload mid-round ----
    {
      const id = 'PW-HOST-ROUND-RELOAD-004';
      log('\n----------------------------------------------------------------');
      log(` ${id} — host reloads mid-round`);
      log('----------------------------------------------------------------');
      const shotBefore = path.join(SHOT_DIR, `${id}-before.png`);
      await pageA.screenshot({ path: shotBefore });
      const idxBefore = raA.roundIndex;
      log(`  [004] roundIndexBefore=${idxBefore} screenshotBefore=${shotBefore}`);
      log('  [004] reloading host (context A)');
      await pageA.reload({ waitUntil: 'domcontentloaded' });
      const raAfter = await waitForRoundActive(pageA, 15000);
      const shotAfter = path.join(SHOT_DIR, `${id}-after.png`);
      await pageA.screenshot({ path: shotAfter });
      const bodyA = await pageA.evaluate(() => document.body?.innerText?.slice(0, 300) ?? '');
      const hasError = bodyA.includes('Something went wrong');
      log(`  [004] roundActiveAfter=${raAfter.ok} idx=${raAfter.roundIndex} hasError=${hasError}`);
      log(`  [004] bodySnippet="${bodyA.replace(/\s+/g, ' ').slice(0, 180)}"`);
      log(`  [004] screenshotAfter=${shotAfter}`);
      log(`  [004] consoleTail=${logsA.slice(-10).join(' | ')}`);
      const sameRound = raAfter.roundIndex === idxBefore;
      const pass = raAfter.ok && !hasError && sameRound;
      results.push({ id, verdict: pass ? 'PASS' : 'FAIL', evidence: `roundActiveAfter=${raAfter.ok} idxAfter=${raAfter.roundIndex} idxBefore=${idxBefore} sameRound=${sameRound} hasError=${hasError} body="${bodyA.replace(/\s+/g, ' ').slice(0, 120)}" screenshotBefore=${shotBefore} screenshotAfter=${shotAfter} consoleTail=${logsA.slice(-10).join(' | ')}` });
    }

    // ---- 005: guest reload mid-round ----
    {
      const id = 'PW-GUEST-ROUND-RELOAD-005';
      log('\n----------------------------------------------------------------');
      log(` ${id} — guest reloads mid-round`);
      log('----------------------------------------------------------------');
      const shotBefore = path.join(SHOT_DIR, `${id}-before.png`);
      await pageB.screenshot({ path: shotBefore });
      const idxBefore = raB.roundIndex;
      log(`  [005] roundIndexBefore=${idxBefore} screenshotBefore=${shotBefore}`);
      log('  [005] reloading guest (context B)');
      await pageB.reload({ waitUntil: 'domcontentloaded' });
      const raAfter = await waitForRoundActive(pageB, 15000);
      const shotAfter = path.join(SHOT_DIR, `${id}-after.png`);
      await pageB.screenshot({ path: shotAfter });
      const bodyB = await pageB.evaluate(() => document.body?.innerText?.slice(0, 300) ?? '');
      const hasError = bodyB.includes('Something went wrong');
      log(`  [005] roundActiveAfter=${raAfter.ok} idx=${raAfter.roundIndex} hasError=${hasError}`);
      log(`  [005] bodySnippet="${bodyB.replace(/\s+/g, ' ').slice(0, 180)}"`);
      log(`  [005] screenshotAfter=${shotAfter}`);
      log(`  [005] consoleTail=${logsB.slice(-10).join(' | ')}`);
      const sameRound = raAfter.roundIndex === idxBefore;
      const pass = raAfter.ok && !hasError && sameRound;
      results.push({ id, verdict: pass ? 'PASS' : 'FAIL', evidence: `roundActiveAfter=${raAfter.ok} idxAfter=${raAfter.roundIndex} idxBefore=${idxBefore} sameRound=${sameRound} hasError=${hasError} body="${bodyB.replace(/\s+/g, ' ').slice(0, 120)}" screenshotBefore=${shotBefore} screenshotAfter=${shotAfter} consoleTail=${logsB.slice(-10).join(' | ')}` });
    }

    await ctxA.close();
    await ctxB.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`  [EXCEPTION 003-005] ${msg}`);
    for (const sid of ['PW-GUEST-LOBBY-RELOAD-003', 'PW-HOST-ROUND-RELOAD-004', 'PW-GUEST-ROUND-RELOAD-005']) {
      if (!results.find(r => r.id === sid)) results.push({ id: sid, verdict: 'FAIL', evidence: `exception: ${msg}` });
    }
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  log('================================================================');
  log(' MP-STAB-AUTH-RESILIENCE-002-PHASE-E — Playwright dirty-state verification');
  log(` BASE_URL=${BASE_URL}  SHOT_DIR=${SHOT_DIR}`);
  log('================================================================');
  await scenario001();
  await scenario002();
  await scenarios003to005();

  log('\n================================================================');
  log(' VERDICTS');
  log('================================================================');
  for (const r of results) {
    log(` ${r.id}: ${r.verdict}`);
    log(`   evidence: ${r.evidence}`);
  }
  const allPass = results.every(r => r.verdict === 'PASS');
  log(`\nOVERALL: ${allPass ? 'ALL PASS' : 'FAILURES/UNRUNNABLE PRESENT'}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
