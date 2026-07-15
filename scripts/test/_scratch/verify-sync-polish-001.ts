// BUG-FIX-SYNC-POLISH-001-VERIFY — live smoke test for B2 (timer z-index) + B3 (avatar in ready section)
// READ-ONLY w.r.t. application code. Reuses ensureLoggedIn, submitGuessViaUI, CompeteWSClient, TEST_USERS.
// Run: npx tsx scripts/test/_scratch/verify-sync-polish-001.ts

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { chromium } from 'playwright';
import * as path from 'path';
import { TEST_USERS, fetchAccessToken } from '../playwright/fixtures/auth';
import { ensureLoggedIn } from '../playwright/helpers/auth-ui';
import { submitGuessViaUI } from '../playwright/helpers/compete-ui';
import { CompeteWSClient } from '../playwright/orchestrator/websocketClient';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const PARTYKIT_HOST = process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
const SCRATCH_DIR = path.resolve(process.cwd(), 'scripts/test/_scratch');
const NAV = 30000;
const STATE = 60000;
const NET = 120000; // single generous network timeout
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

async function mkWS(gameId: string, user: typeof TEST_USERS[0]): Promise<CompeteWSClient> {
  const accessToken = await fetchAccessToken(user);
  const c = new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST, gameId, user, displayName: user.displayName, accessToken,
    onStateUpdate: (s) => console.log(`[WS:${user.displayName}] ${s.status} round=${s.currentRoundIndex} readyForNext=${JSON.stringify(s.readyForNext)}`),
    onError: (m) => console.error(`[WS:${user.displayName}] ERROR: ${m}`),
  });
  await c.connect();
  return c;
}

async function main() {
  const verdicts: string[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const [hostCtx, guestCtx] = await Promise.all([browser.newContext(DESKTOP), browser.newContext(DESKTOP)]);
    const [hostPage, guestPage] = await Promise.all([hostCtx.newPage(), guestCtx.newPage()]);

    // Capture console errors
    const hostErrors: string[] = [];
    const guestErrors: string[] = [];
    hostPage.on('console', (msg) => { if (msg.type() === 'error') hostErrors.push(msg.text()); });
    hostPage.on('pageerror', (err) => hostErrors.push(`PAGE_ERROR: ${err.message}`));
    guestPage.on('console', (msg) => { if (msg.type() === 'error') guestErrors.push(msg.text()); });
    guestPage.on('pageerror', (err) => guestErrors.push(`PAGE_ERROR: ${err.message}`));

    console.log('\n=== S1: LOGIN ===');
    await Promise.all([
      hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NET }),
      guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NET }),
    ]);
    await Promise.all([ensureLoggedIn(hostPage, TEST_USERS[0]), ensureLoggedIn(guestPage, TEST_USERS[1])]);
    await Promise.all([
      hostPage.waitForLoadState('domcontentloaded').catch(() => undefined),
      guestPage.waitForLoadState('domcontentloaded').catch(() => undefined),
    ]);
    console.log('[VERIFY] both logged in');

    console.log('\n=== S2: CREATE GAME ===');
    const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
      data: { displayName: TEST_USERS[0].displayName, playerId: TEST_USERS[0].id, mode: 'sync', totalRounds: 3, roundTimerSec: 120 },
      timeout: NET,
    });
    if (!createRes.ok()) throw new Error(`Create game failed: ${createRes.status()}`);
    const sd = await createRes.json();
    const gameId = sd.gameId || sd.id;
    if (!gameId) throw new Error('no gameId');
    console.log(`[VERIFY] game: ${gameId}`);

    console.log('\n=== S3: NAVIGATE + WS ===');
    await Promise.all([
      hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NET }),
      guestPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NET }),
    ]);
    console.log(`[VERIFY] host URL: ${hostPage.url()}`);
    console.log(`[VERIFY] guest URL: ${guestPage.url()}`);
    // Check if redirected to /login
    const hostUrl = hostPage.url();
    const guestUrl = guestPage.url();
    if (hostUrl.includes('/login') || guestUrl.includes('/login')) {
      throw new Error(`Redirected to login — host: ${hostUrl}, guest: ${guestUrl}`);
    }
    // Wait for the page to settle (networkidle can be slow but DOM is ready)
    await Promise.all([
      hostPage.waitForLoadState('networkidle').catch(() => undefined),
      guestPage.waitForLoadState('networkidle').catch(() => undefined),
    ]);
    // Log all testids on the page for debugging
    const hostTestids = await hostPage.evaluate(() => Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')).filter(Boolean)).catch(() => []);
    console.log(`[VERIFY] host testids: ${JSON.stringify(hostTestids)}`);
    const hostBody = await hostPage.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
    console.log(`[VERIFY] host body text: ${JSON.stringify(hostBody)}`);
    console.log(`[VERIFY] host console errors: ${JSON.stringify(hostErrors.slice(0, 10))}`);
    await Promise.all([
      hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: NET }),
      guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: NET }),
    ]);
    const hostWS = await mkWS(gameId, TEST_USERS[0]);
    const guestWS = await mkWS(gameId, TEST_USERS[1]);
    await Promise.all([
      hostWS.waitForState((s) => s.status === 'LOBBY', STATE),
      guestWS.waitForState((s) => s.status === 'LOBBY', STATE),
    ]);
    console.log('[VERIFY] LOBBY reached');

    console.log('\n=== S4: READY + START ===');
    await Promise.all([
      hostPage.getByTestId('lobby-ready-btn').first().click(),
      guestPage.getByTestId('lobby-ready-btn').first().click(),
    ]);
    await Promise.all([
      hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE),
      guestWS.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE),
    ]);
    await hostPage.getByTestId('round-active-section').first().waitFor({ state: 'visible', timeout: STATE });
    await guestPage.getByTestId('round-active-section').first().waitFor({ state: 'visible', timeout: STATE });
    await hostPage.locator('[class*="timerWrapper"]').first().waitFor({ state: 'visible', timeout: 15000 });
    console.log('[VERIFY] ROUND_ACTIVE round 0; timer visible');

    // ════════════════════════════════════════════════════════════════════════
    // B2 CHECK — timer visible & not occluded when WHERE/WHEN sheet open
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n=== B2 CHECK ===');

    // --- B2a: WHERE sheet ---
    console.log('--- B2a: WHERE sheet ---');
    await hostPage.evaluate(() => {
      const b = document.querySelector('[data-testid="round-where-btn"]') as HTMLButtonElement;
      if (b) b.click();
    });
    await hostPage.locator('.leaflet-container').first().waitFor({ state: 'visible', timeout: 15000 });
    await hostPage.waitForTimeout(500);

    const b2Where = await hostPage.evaluate(() => {
      const timer = document.querySelector('[class*="timerWrapper"]') as HTMLElement | null;
      if (!timer) return { error: 'timerWrapper not found', isDescendant: false };
      const r = timer.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy) as Element | null;
      return {
        timerBox: { x: r.x, y: r.y, w: r.width, h: r.height, cx, cy },
        hitTag: hit ? hit.tagName : null,
        hitClass: hit ? String(hit.className).slice(0, 120) : null,
        hitDataTestid: hit ? hit.getAttribute('data-testid') : null,
        isDescendant: hit ? (hit === timer || timer.contains(hit)) : false,
      };
    });
    console.log('[B2-WHERE] elementFromPoint:', JSON.stringify(b2Where, null, 2));
    const b2WherePass = !('error' in b2Where) && (b2Where as any).isDescendant === true;
    verdicts.push(`B2 WHERE sheet: ${b2WherePass ? 'PASS' : 'FAIL'} — raw: ${JSON.stringify(b2Where)}`);
    await hostPage.screenshot({ path: path.join(SCRATCH_DIR, 'b2-where-sheet.png') });

    await hostPage.evaluate(() => { const bd = document.querySelector('[class*="sheetBackdrop"]') as HTMLElement; if (bd) bd.click(); });
    await hostPage.waitForTimeout(400);

    // --- B2b: WHEN sheet ---
    console.log('--- B2b: WHEN sheet ---');
    await hostPage.getByTestId('round-when-btn').first().click({ force: true, timeout: 15000 });
    await hostPage.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((b) => /^\d{3,4}$/.test((b.textContent || '').trim())), { timeout: 15000 });
    await hostPage.waitForTimeout(500);

    const b2When = await hostPage.evaluate(() => {
      const timer = document.querySelector('[class*="timerWrapper"]') as HTMLElement | null;
      if (!timer) return { error: 'timerWrapper not found', isDescendant: false };
      const r = timer.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy) as Element | null;
      return {
        timerBox: { x: r.x, y: r.y, w: r.width, h: r.height, cx, cy },
        hitTag: hit ? hit.tagName : null,
        hitClass: hit ? String(hit.className).slice(0, 120) : null,
        hitDataTestid: hit ? hit.getAttribute('data-testid') : null,
        isDescendant: hit ? (hit === timer || timer.contains(hit)) : false,
      };
    });
    console.log('[B2-WHEN] elementFromPoint:', JSON.stringify(b2When, null, 2));
    const b2WhenPass = !('error' in b2When) && (b2When as any).isDescendant === true;
    verdicts.push(`B2 WHEN sheet: ${b2WhenPass ? 'PASS' : 'FAIL'} — raw: ${JSON.stringify(b2When)}`);
    await hostPage.screenshot({ path: path.join(SCRATCH_DIR, 'b2-when-sheet.png') });

    await hostPage.evaluate(() => { const bd = document.querySelector('[class*="sheetBackdrop"]') as HTMLElement; if (bd) bd.click(); });
    await hostPage.waitForTimeout(400);

    // ════════════════════════════════════════════════════════════════════════
    // S5: both submit → ROUND_COMPLETE
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n=== S5: SUBMIT → ROUND_COMPLETE ===');
    await Promise.all([
      submitGuessViaUI(hostPage, { year: 1950, lat: 40, lng: 0 }),
      submitGuessViaUI(guestPage, { year: 1960, lat: 41, lng: 1 }),
    ]);
    // Wait for ROUND_COMPLETE via DOM (WS waitForState has a history-check race)
    await hostPage.getByTestId('round-complete-section').first().waitFor({ state: 'visible', timeout: NET });
    await guestPage.getByTestId('round-complete-section').first().waitFor({ state: 'visible', timeout: NET });
    console.log('[VERIFY] ROUND_COMPLETE round 0');

    // ════════════════════════════════════════════════════════════════════════
    // B3 CHECK — avatar in readyForNext row
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n=== B3 CHECK ===');

    // B3a: host clicks Next Round; assert host's own entry has avatar+name+✓
    console.log('--- B3a: host clicks Next Round ---');
    // Wait for the Next button to be enabled (not disabled, not busy)
    await hostPage.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="round-next-btn"]') as HTMLButtonElement;
      return btn && !btn.disabled;
    }, { timeout: 30000 });
    console.log('[B3a] next button enabled, clicking');

    // Install MutationObserver to capture the readyNames row even if auto-advance is fast
    await hostPage.evaluate(() => {
      (window as any).__b3Rows = [];
      const obs = new MutationObserver(() => {
        const row = document.querySelector('[class*="readyNames"]');
        if (row) (window as any).__b3Rows.push({ t: Date.now(), html: row.outerHTML });
      });
      const root = document.querySelector('[data-testid="round-complete-section"]') || document.body;
      obs.observe(root, { childList: true, subtree: true, characterData: true });
      (window as any).__b3Obs = obs;
    });
    await hostPage.getByTestId('round-next-btn').first().click();

    // Poll DOM for readyNames row to appear (up to 30s)
    let b3aRowFound = false;
    for (let i = 0; i < 300; i++) {
      const found = await hostPage.evaluate(() => !!document.querySelector('[class*="readyNames"]'));
      if (found) { b3aRowFound = true; break; }
      await hostPage.waitForTimeout(100);
    }
    await hostPage.waitForTimeout(300);

    const b3a = await hostPage.evaluate((hostName) => {
      const row = document.querySelector('[class*="readyNames"]');
      if (!row) {
        const captured = (window as any).__b3Rows || [];
        return { error: 'readyNames not found', b3aRowFound: false, capturedCount: captured.length, captured: captured.slice(-3) };
      }
      const entries = Array.from(row.querySelectorAll('[class*="readyName"]')) as HTMLElement[];
      const parsed = entries.map((el) => {
        const img = el.querySelector('img');
        const spans = Array.from(el.querySelectorAll('span'));
        const text = el.textContent || '';
        const avatarSpan = spans.find((s) => { const t = (s.textContent || '').trim(); return t.length === 1 && /[A-Z]/.test(t) && !(s as HTMLElement).style.backgroundImage; });
        return { text: text.trim(), hasCheck: text.includes('✓'), hasAvatarImg: !!img, hasAvatarSpan: !!avatarSpan, avatarSpanText: avatarSpan ? avatarSpan.textContent : null, outerHTML: el.outerHTML.slice(0, 400) };
      });
      return { rowOuterHTML: row.outerHTML.slice(0, 1200), entryCount: entries.length, parsed, hostName };
    }, TEST_USERS[0].displayName);
    console.log('[B3a-own] result:', JSON.stringify(b3a, null, 2));
    const b3aParsed = (b3a as any).parsed || [];
    const b3aPass = !('error' in b3a)
      && b3aParsed.length === 1
      && b3aParsed[0].hasCheck === true
      && (b3aParsed[0].hasAvatarImg === true || b3aParsed[0].hasAvatarSpan === true)
      && b3aParsed[0].text.includes(TEST_USERS[0].displayName);
    verdicts.push(`B3 own entry (avatar+name+✓): ${b3aPass ? 'PASS' : 'FAIL'} — raw: ${JSON.stringify(b3a)}`);

    // B3b: guest (before clicking) sees host's entry with avatar
    console.log('--- B3b: guest sees host entry ---');
    // Poll guest DOM for readyNames row (the host's READY_NEXT should broadcast)
    let b3bRowFound = false;
    for (let i = 0; i < 300; i++) {
      const found = await guestPage.evaluate(() => {
        const row = document.querySelector('[class*="readyNames"]');
        if (!row) return false;
        const entries = row.querySelectorAll('[class*="readyName"]');
        return entries.length > 0;
      });
      if (found) { b3bRowFound = true; break; }
      await guestPage.waitForTimeout(100);
    }
    await guestPage.waitForTimeout(300);

    const b3b = await guestPage.evaluate((hostName) => {
      const row = document.querySelector('[class*="readyNames"]');
      if (!row) return { error: 'readyNames not found in guest', b3bRowFound: false };
      const entries = Array.from(row.querySelectorAll('[class*="readyName"]')) as HTMLElement[];
      const hostEntry = entries.find((e) => (e.textContent || '').includes(hostName));
      if (!hostEntry) return { error: 'host entry not found in guest row', rowHTML: row.outerHTML.slice(0, 800), entryCount: entries.length };
      const img = hostEntry.querySelector('img');
      const spans = Array.from(hostEntry.querySelectorAll('span'));
      const avatarSpan = spans.find((s) => { const t = (s.textContent || '').trim(); return t.length === 1 && /[A-Z]/.test(t) && !(s as HTMLElement).style.backgroundImage; });
      return { hostEntryOuterHTML: hostEntry.outerHTML.slice(0, 400), hasAvatarImg: !!img, hasAvatarSpan: !!avatarSpan, hasCheck: (hostEntry.textContent || '').includes('✓'), text: (hostEntry.textContent || '').trim() };
    }, TEST_USERS[0].displayName);
    console.log('[B3b-other] result:', JSON.stringify(b3b, null, 2));
    const b3bPass = !('error' in b3b)
      && ((b3b as any).hasAvatarImg === true || (b3b as any).hasAvatarSpan === true)
      && (b3b as any).hasCheck === true
      && (b3b as any).text.includes(TEST_USERS[0].displayName);
    verdicts.push(`B3 other player's entry: ${b3bPass ? 'PASS' : 'FAIL'} — raw: ${JSON.stringify(b3b)}`);

    await guestPage.screenshot({ path: path.join(SCRATCH_DIR, 'b3-ready-row-guest.png') });
    await hostPage.screenshot({ path: path.join(SCRATCH_DIR, 'b3-ready-row-host.png') });

    // B3c: guest clicks Next Round; capture both entries before auto-advance
    console.log('--- B3c: guest clicks Next Round (capture both) ---');
    await guestPage.evaluate(() => {
      (window as any).__b3cRows = [];
      const obs = new MutationObserver(() => {
        const row = document.querySelector('[class*="readyNames"]');
        if (row) { const e = Array.from(row.querySelectorAll('[class*="readyName"]')); if (e.length >= 2) (window as any).__b3cRows.push({ t: Date.now(), html: row.outerHTML, count: e.length }); }
      });
      const root = document.querySelector('[data-testid="round-complete-section"]');
      if (root) obs.observe(root, { childList: true, subtree: true, characterData: true });
      (window as any).__b3cObs = obs;
    });
    await guestPage.getByTestId('round-next-btn').first().click();
    let b3c: any = null;
    for (let i = 0; i < 50; i++) {
      const captured = await guestPage.evaluate(() => (window as any).__b3cRows || []);
      if (captured.length > 0) { b3c = captured[captured.length - 1]; break; }
      await guestPage.waitForTimeout(100);
    }
    if (!b3c) {
      b3c = await guestPage.evaluate(() => {
        const row = document.querySelector('[class*="readyNames"]');
        if (!row) return { error: 'no readyNames row at read time', captured: (window as any).__b3cRows || [] };
        const entries = Array.from(row.querySelectorAll('[class*="readyName"]'));
        return { count: entries.length, html: row.outerHTML.slice(0, 1200), captured: (window as any).__b3cRows || [] };
      });
    }
    console.log('[B3c-both] captured:', JSON.stringify(b3c, null, 2));

    await hostPage.evaluate(() => { try { (window as any).__b3Obs?.disconnect(); } catch {} });
    await guestPage.evaluate(() => { try { (window as any).__b3cObs?.disconnect(); } catch {} });

    console.log('\n=== S6: abandoning game ===');
    hostWS.close(); guestWS.close();

    console.log('\n\n========== VERDICT ==========');
    for (const v of verdicts) console.log(v);
    console.log('=============================\n');
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('[VERIFY] FATAL:', err); process.exit(1); });
