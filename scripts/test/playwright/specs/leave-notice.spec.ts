import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';
import { authenticatePage, getSession } from '../helpers/auth-cookie';
import { CompeteWSClient } from '../orchestrator/websocketClient';
import { submitGuessViaUI } from '../helpers/compete-ui';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────
// MP-BUILD-LEFTPLAYER-NOTICE-1021-004 — leave toast + solo banner e2e.
// Sync games only. Real stack: localhost Next + PartyKit + PROD Supabase.
// Auth: cookie injection via authenticatePage (same as sync golden path).
// Sessions created here are tracked in createdGameIds and deleted in
// afterAll; test users come from the global fixture teardown.
// ─────────────────────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PARTYKIT_HOST =
  process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const NAV_TIMEOUT = 30000;
const STATE_TIMEOUT = 60000;
const LEAVE_PROPAGATE_MS = 35000; // grace (15–20s) + snapshot + render slack
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

const createdGameIds = new Set<string>();
const TOAST = '[data-testid="leave-toast"]';
const BANNER = '[data-testid="solo-banner"]';

let supa: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!supa) {
    supa = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SECRET_KEY_PROD || '',
      { auth: { persistSession: false } },
    );
  }
  return supa;
}

async function makeGame(host: Page, user: (typeof TEST_USERS)[0]): Promise<string> {
  const res = await host.request.post(`${BASE_URL}/api/compete/create`, {
    data: { displayName: user.displayName, playerId: user.id, mode: 'sync', roundTimerSec: 120 },
    timeout: NAV_TIMEOUT,
  });
  expect(res.ok(), `create failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const gameId = body.gameId || body.id;
  createdGameIds.add(gameId);
  console.log(`[LEAVENOTICE] game ${gameId}`);
  return gameId;
}

async function joinLobby(pages: Page[], gameId: string) {
  await Promise.all(pages.map((p) => p.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })));
  await Promise.all(pages.map((p) => p.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT })));
}

async function readyAll(pages: Page[]) {
  await Promise.all(pages.map((p) => p.getByTestId('lobby-ready-btn').first().click()));
}

async function observeWS(gameId: string, user: (typeof TEST_USERS)[0]): Promise<CompeteWSClient> {
  const { accessToken } = await getSession(user);
  const client = new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST,
    gameId,
    user,
    displayName: user.displayName,
    accessToken,
    onStateUpdate: (s) => console.log(`[WS:${user.displayName}] ${s.status} r${s.currentRoundIndex} active=${s.players.filter((p) => !p.leftAt).length}`),
    onError: (m) => console.log(`[WS:${user.displayName}] ERROR ${m}`),
  });
  await client.connect();
  return client;
}

/** Poll the DOM for a leave toast containing the departed player's name. */
async function expectLeaveToast(page: Page, name: string, who: string) {
  const loc = page.locator(TOAST).filter({ hasText: name });
  await expect(loc, `${who} should see "${name} left the game" toast`).toHaveCount(1, { timeout: LEAVE_PROPAGATE_MS });
  const text = await loc.first().textContent();
  console.log(`[LEAVENOTICE] ${who} toast: "${text?.trim()}"`);
}

async function boxes(page: Page, label: string) {
  const grab = async (sel: string) => {
    const b = await page.locator(sel).first().boundingBox().catch(() => null);
    console.log(`[S6] ${label} ${sel} box=${JSON.stringify(b)}`);
    return b;
  };
  const intersect = (a: any, b: any) =>
    !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const out: { toast: any; banner: any; violations: string[] } = { toast: null, banner: null, violations: [] };
  out.toast = await grab(TOAST);
  out.banner = await grab(BANNER);
  for (const sel of ['[data-testid="round-bottom-panel"]', '[class*="bottomBarWrap"]', '[class*="timerWrapper"]', '[class*="roundPill"]', '[class*="opponentList"]']) {
    const el = await grab(sel);
    if (intersect(out.toast, el)) out.violations.push(`toast∩${sel}`);
    if (intersect(out.banner, el)) out.violations.push(`banner∩${sel}`);
  }
  return out;
}

test.describe('Leave notices (sync)', () => {
  test('S1+S2+S3: toasts on others leaving, solo banner, continue-solo persists', async () => {
    const browser = await chromium.launch({ headless: true });
    const [ctxA, ctxB, ctxC] = await Promise.all([
      browser.newContext(DESKTOP), browser.newContext(DESKTOP), browser.newContext(DESKTOP)]);
    const [pageA, pageB, pageC] = await Promise.all([ctxA.newPage(), ctxB.newPage(), ctxC.newPage()]);
    try {
      const [A, B, C] = TEST_USERS;
      await Promise.all([authenticatePage(pageA, A), authenticatePage(pageB, B), authenticatePage(pageC, C)]);
      const gameId = await makeGame(pageA, A);
      await joinLobby([pageA, pageB, pageC], gameId);
      await readyAll([pageA, pageB, pageC]);
      const wsA = await observeWS(gameId, A);
      await wsA.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE_TIMEOUT);

      // S1 — C leaves (close page); A and B each see exactly one toast, no banner.
      await pageC.close();
      await expectLeaveToast(pageA, C.displayName, 'A');
      await expectLeaveToast(pageB, C.displayName, 'B');
      expect(await pageA.locator(TOAST).count(), 'A toast count must be exactly 1').toBe(1);
      expect(await pageB.locator(TOAST).count(), 'B toast count must be exactly 1').toBe(1);
      expect(await pageA.locator(BANNER).count(), 'A must not see solo banner yet').toBe(0);
      expect(await pageB.locator(BANNER).count(), 'B must not see solo banner yet').toBe(0);
      console.log('[LEAVENOTICE] S1 PASS: toast on A + B exactly once, no banner');

      // S2 — B leaves; A (sole active) gets B's toast + the banner; guessing still works.
      await pageB.close();
      await expectLeaveToast(pageA, B.displayName, 'A');
      await expect(pageA.locator(BANNER), 'A must see solo banner').toBeVisible({ timeout: LEAVE_PROPAGATE_MS });
      await expect(pageA.getByTestId('solo-continue-btn')).toBeVisible();
      await expect(pageA.getByTestId('solo-exit-btn')).toBeVisible();
      console.log('[LEAVENOTICE] S2 banner visible with both buttons');
      // banner is non-blocking: A can still place a guess
      await submitGuessViaUI(pageA, { year: 1980, lat: 40, lng: 10 });
      await wsA.waitForState((s) => s.players.some((p) => p.playerId === A.id && p.hasSubmitted), STATE_TIMEOUT);
      expect(await pageA.locator(BANNER).count(), 'banner still visible while/after guessing').toBeGreaterThanOrEqual(1);
      console.log('[LEAVENOTICE] S2 PASS: guess placed while banner visible');

      // S3 — Continue solo dismisses for the session; reload keeps it dismissed; no toast replay.
      await pageA.getByTestId('solo-continue-btn').click();
      await expect(pageA.locator(BANNER)).toHaveCount(0);
      await pageA.reload({ waitUntil: 'domcontentloaded' });
      await pageA.locator('[data-testid="round-complete-section"],[data-testid="round-active-section"]').first()
        .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
      await pageA.waitForTimeout(5000); // > toast lifetime — nothing may re-appear
      expect(await pageA.locator(BANNER).count(), 'banner must stay dismissed after reload').toBe(0);
      expect(await pageA.locator(TOAST).count(), 'no toast replay after reload').toBe(0);
      console.log('[LEAVENOTICE] S3 PASS: banner dismissed persists across reload, no toast replay');
    } finally {
      await browser.close();
    }
  });

  test('S4: Exit game → /home and DO marks left_at', async () => {
    const browser = await chromium.launch({ headless: true });
    const [ctxA, ctxB, ctxC] = await Promise.all([
      browser.newContext(DESKTOP), browser.newContext(DESKTOP), browser.newContext(DESKTOP)]);
    const [pageA, pageB, pageC] = await Promise.all([ctxA.newPage(), ctxB.newPage(), ctxC.newPage()]);
    try {
      const [A, B, C] = TEST_USERS;
      await Promise.all([authenticatePage(pageA, A), authenticatePage(pageB, B), authenticatePage(pageC, C)]);
      const gameId = await makeGame(pageA, A);
      await joinLobby([pageA, pageB, pageC], gameId);
      await readyAll([pageA, pageB, pageC]);
      const wsA = await observeWS(gameId, A);
      await wsA.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE_TIMEOUT);
      await pageC.close();
      await pageB.close();
      await expect(pageA.locator(BANNER), 'A must see solo banner').toBeVisible({ timeout: LEAVE_PROPAGATE_MS * 2 });
      await pageA.getByTestId('solo-exit-btn').click();
      await pageA.waitForURL('**/home**', { timeout: NAV_TIMEOUT });
      console.log(`[LEAVENOTICE] S4 navigated to ${pageA.url()}`);
      // DO marks A left after grace — poll prod DB
      const t0 = Date.now();
      let leftAt: string | null = null;
      while (Date.now() - t0 < LEAVE_PROPAGATE_MS) {
        const { data } = await db().from('session_players').select('left_at')
          .eq('game_id', gameId).eq('player_id', A.id).single();
        leftAt = data?.left_at ?? null;
        if (leftAt) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      expect(leftAt, `A left_at must become non-null within ${LEAVE_PROPAGATE_MS}ms`).toBeTruthy();
      console.log(`[LEAVENOTICE] S4 PASS: /home reached; A.left_at=${leftAt}`);
    } finally {
      await browser.close();
    }
  });

  test('S5: transient offline under grace → nothing shown', async () => {
    const browser = await chromium.launch({ headless: true });
    const [ctxA, ctxB] = await Promise.all([browser.newContext(DESKTOP), browser.newContext(DESKTOP)]);
    const [pageA, pageB] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);
    try {
      const [A, B] = TEST_USERS;
      await Promise.all([authenticatePage(pageA, A), authenticatePage(pageB, B)]);
      const gameId = await makeGame(pageA, A);
      await joinLobby([pageA, pageB], gameId);
      await readyAll([pageA, pageB]);
      const wsA = await observeWS(gameId, A);
      await wsA.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE_TIMEOUT);
      await ctxB.setOffline(true);
      await pageA.waitForTimeout(8000); // < LEAVE_GRACE (15s + jitter)
      await ctxB.setOffline(false);
      await pageA.waitForTimeout(30000); // past grace window — nothing may have fired
      expect(await pageA.locator(TOAST).count(), 'no toast for transient drop').toBe(0);
      expect(await pageA.locator(BANNER).count(), 'no banner for transient drop').toBe(0);
      const snap = wsA.getLastSnapshot();
      const bRow = snap?.players.find((p) => p.playerId === B.id);
      expect(bRow?.leftAt ?? null, 'B must not be marked left after transient drop').toBeNull();
      console.log('[LEAVENOTICE] S5 PASS: transient 8s offline produced no toast/banner/leftAt');
    } finally {
      await browser.close();
    }
  });

  test('S6: mobile 390x844 — toast/banner clear fixed UI in both phases', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      // Phase 1 — ROUND_ACTIVE: 3 players, C leaves then B leaves → toast+banner on A.
      const [ctxA, ctxB, ctxC] = await Promise.all([
        browser.newContext(MOBILE), browser.newContext(MOBILE), browser.newContext(MOBILE)]);
      const [pageA, pageB, pageC] = await Promise.all([ctxA.newPage(), ctxB.newPage(), ctxC.newPage()]);
      const [A, B, C] = TEST_USERS;
      await Promise.all([authenticatePage(pageA, A), authenticatePage(pageB, B), authenticatePage(pageC, C)]);
      const gameId = await makeGame(pageA, A);
      await joinLobby([pageA, pageB, pageC], gameId);
      await readyAll([pageA, pageB, pageC]);
      const wsA = await observeWS(gameId, A);
      await wsA.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE_TIMEOUT);
      await pageC.close();
      await expectLeaveToast(pageA, C.displayName, 'A-mobile');
      await pageB.close();
      await expectLeaveToast(pageA, B.displayName, 'A-mobile');
      await expect(pageA.locator(BANNER)).toBeVisible({ timeout: LEAVE_PROPAGATE_MS });
      const r1 = await boxes(pageA, 'ROUND_ACTIVE');
      expect(r1.banner, 'banner must be visible in ROUND_ACTIVE').toBeTruthy();
      expect(r1.violations, `ROUND_ACTIVE overlaps: ${r1.violations}`).toEqual([]);
      console.log('[LEAVENOTICE] S6 ROUND_ACTIVE PASS: boxes clear of fixed UI');
      await ctxA.close(); await ctxB.close(); await ctxC.close();

      // Phase 2 — ROUND_COMPLETE: 4 players, C+D leave in round, A+B submit,
      // then B leaves during results → toast+banner on A in ROUND_COMPLETE.
      const [ctxA2, ctxB2, ctxC2, ctxD2] = await Promise.all([
        browser.newContext(MOBILE), browser.newContext(MOBILE), browser.newContext(MOBILE), browser.newContext(MOBILE)]);
      const [pageA2, pageB2, pageC2, pageD2] = await Promise.all([ctxA2.newPage(), ctxB2.newPage(), ctxC2.newPage(), ctxD2.newPage()]);
      const D = TEST_USERS[3];
      await Promise.all([authenticatePage(pageA2, A), authenticatePage(pageB2, B), authenticatePage(pageC2, C), authenticatePage(pageD2, D)]);
      const gameId2 = await makeGame(pageA2, A);
      await joinLobby([pageA2, pageB2, pageC2, pageD2], gameId2);
      await readyAll([pageA2, pageB2, pageC2, pageD2]);
      const wsA2 = await observeWS(gameId2, A);
      await wsA2.waitForState((s) => s.status === 'ROUND_ACTIVE', STATE_TIMEOUT);
      await pageC2.close();
      await pageD2.close();
      await expectLeaveToast(pageA2, C.displayName, 'A-mobile-2');
      // A and B submit → ROUND_COMPLETE while B still active
      await submitGuessViaUI(pageA2, { year: 1980, lat: 40, lng: 10 });
      await submitGuessViaUI(pageB2, { year: 1990, lat: 41, lng: 11 });
      await wsA2.waitForState((s) => s.status === 'ROUND_COMPLETE', STATE_TIMEOUT);
      await pageB2.close(); // B leaves during ROUND_COMPLETE → toast + banner
      await expectLeaveToast(pageA2, B.displayName, 'A-mobile-2');
      await expect(pageA2.locator(BANNER)).toBeVisible({ timeout: LEAVE_PROPAGATE_MS });
      const r2 = await boxes(pageA2, 'ROUND_COMPLETE');
      expect(r2.banner, 'banner must be visible in ROUND_COMPLETE').toBeTruthy();
      expect(r2.violations, `ROUND_COMPLETE overlaps: ${r2.violations}`).toEqual([]);
      console.log('[LEAVENOTICE] S6 ROUND_COMPLETE PASS: boxes clear of fixed UI');
      await ctxA2.close(); await ctxB2.close(); await ctxC2.close(); await ctxD2.close();
    } finally {
      await browser.close();
    }
  });

  test('S7: lobby leave → no toast, no banner', async () => {
    const browser = await chromium.launch({ headless: true });
    const [ctxA, ctxB, ctxC] = await Promise.all([
      browser.newContext(DESKTOP), browser.newContext(DESKTOP), browser.newContext(DESKTOP)]);
    const [pageA, pageB, pageC] = await Promise.all([ctxA.newPage(), ctxB.newPage(), ctxC.newPage()]);
    try {
      const [A, B, C] = TEST_USERS;
      await Promise.all([authenticatePage(pageA, A), authenticatePage(pageB, B), authenticatePage(pageC, C)]);
      const gameId = await makeGame(pageA, A);
      await joinLobby([pageA, pageB, pageC], gameId);
      await pageC.close(); // leave while still in LOBBY (never ready)
      await pageA.waitForTimeout(26000); // > grace + slack
      expect(await pageA.locator(TOAST).count(), 'no toast in LOBBY').toBe(0);
      expect(await pageA.locator(BANNER).count(), 'no banner in LOBBY').toBe(0);
      expect(await pageB.locator(TOAST).count(), 'no toast in LOBBY (B)').toBe(0);
      console.log('[LEAVENOTICE] S7 PASS: lobby leave produced no notices');
    } finally {
      await browser.close();
    }
  });
});

test.afterAll(async () => {
  const ids = [...createdGameIds];
  if (ids.length === 0) return;
  console.log(`[LEAVENOTICE-TEARDOWN] sessions to delete: ${ids.join(', ')}`);
  const s = db();
  const CHILD = ['player_round_events', 'round_events', 'round_commits', 'round_results', 'round_hints', 'session_players', 'game_invitations'];
  for (const t of CHILD) {
    const { error } = await s.from(t).delete().in('game_id', ids);
    console.log(`[LEAVENOTICE-TEARDOWN] ${t} ${error ? 'ERR ' + error.message : 'ok'}`);
  }
  const { error } = await s.from('sessions').delete().in('game_id', ids);
  console.log(`[LEAVENOTICE-TEARDOWN] sessions ${error ? 'ERR ' + error.message : 'ok'}`);
});
