import { test, expect, chromium } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_USERS } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, CompeteSnapshot } from '../orchestrator/websocketClient';
import { submitGuessViaUI } from '../helpers/compete-ui';

const PARTYKIT_HOST = process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const DISCONNECT_MS = Number(process.env.RUSH_RECONNECT_DISCONNECT_MS || 15000);
const OUTPUT_FILE = process.env.RUSH_RECONNECT_LOG_FILE || path.resolve(process.cwd(), 'docs/baseline/rush-reconnect-default.log');

const DESKTOP_PRESET = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

interface LogLine { source: string; msg: string; }

function snapshotLine(label: string, s: CompeteSnapshot | null): string {
  if (!s) return `[${label}] snapshot=null`;
  const v = (s as any).snapshotVersion;
  return `[${label}] status=${s.status} round=${s.currentRoundIndex} snapshotVersion=${v === undefined ? 'undefined' : v}`;
}

async function createObserver(gameId: string, user: typeof TEST_USERS[0], logs: LogLine[], name: string): Promise<CompeteWSClient> {
  const { fetchAccessToken } = await import('../fixtures/auth');
  const token = await fetchAccessToken(user);
  const client = new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST,
    gameId,
    user,
    displayName: user.displayName,
    accessToken: token,
    onStateUpdate: (snapshot) => {
      const line = `[WS:${name}] ${snapshotLine(name, snapshot)}`;
      console.log(line);
      logs.push({ source: 'ws', msg: line });
    },
    onError: (msg) => {
      const line = `[WS:${name}] ERROR: ${msg}`;
      console.error(line);
      logs.push({ source: 'ws', msg: line });
    },
  });
  await client.connect();
  return client;
}

function attachConsole(page: Page, logs: LogLine[], prefix: string) {
  page.on('console', (c) => {
    const text = c.text();
    if (text.includes('[CompeteWebSocket]') || text.includes('snapshotVersion') || text.includes('[PartyKit]')) {
      const line = `[${prefix}][${c.type()}] ${text}`;
      console.log(line);
      logs.push({ source: 'console', msg: line });
    }
  });
}

async function waitForRoundActive(page: Page, timeout = 60000) {
  await page.locator('[data-testid="round-image-container"]').first().waitFor({ state: 'visible', timeout });
  await expect(page.locator('[data-testid="round-active-section"]').first()).toBeVisible({ timeout });
}

async function waitForAnyGameShell(page: Page, timeout = 60000) {
  await Promise.any([
    page.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout }).then(() => 'lobby'),
    page.locator('[data-testid="round-active-section"]').first().waitFor({ state: 'visible', timeout }).then(() => 'active'),
    page.locator('[data-testid="round-complete-section"]').first().waitFor({ state: 'visible', timeout }).then(() => 'complete'),
  ]).catch(() => 'none');
}

async function getVisibleStatus(page: Page): Promise<string> {
  const root = page.locator('[data-testid="lobby-shell"], [data-testid="round-active-section"], [data-testid="round-complete-section"]').first();
  const testid = await root.getAttribute('data-testid').catch(() => 'unknown');
  if (testid?.includes('lobby')) return 'LOBBY';
  if (testid?.includes('active')) return 'ROUND_ACTIVE';
  if (testid?.includes('complete')) return 'ROUND_COMPLETE';
  return 'unknown';
}

async function submitIfRoundActive(page: Page) {
  try {
    await submitGuessViaUI(page, { year: 1950, lat: 40, lng: 0 });
  } catch (e) {
    console.log(`[INFO] submit skipped: ${(e as Error).message}`);
  }
}

test('Rush mid-round reconnect smoke — guest then host', async () => {
  const logs: LogLine[] = [];
  const browser = await chromium.launch({ headless: true });
  const outputPath = typeof OUTPUT_FILE === 'string' ? OUTPUT_FILE : OUTPUT_FILE.toString();

  try {
    logs.push({ source: 'info', msg: `=== Rush Reconnect Smoke ===` });
    logs.push({ source: 'info', msg: `BASE_URL=${BASE_URL} PARTYKIT_HOST=${PARTYKIT_HOST} DISCONNECT_MS=${DISCONNECT_MS}` });

    const [hostCtx, guestCtx] = await Promise.all([
      browser.newContext(DESKTOP_PRESET),
      browser.newContext(DESKTOP_PRESET),
    ]);
    const [hostPage, guestPage] = await Promise.all([
      hostCtx.newPage(),
      guestCtx.newPage(),
    ]);
    attachConsole(hostPage, logs, 'HOST');
    attachConsole(guestPage, logs, 'GUEST');

    // Login
    await Promise.all([
      hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 }),
      guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 }),
    ]);
    await Promise.all([
      ensureLoggedIn(hostPage, TEST_USERS[0]),
      ensureLoggedIn(guestPage, TEST_USERS[1]),
    ]);

    // Create sync game
    const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
      data: {
        displayName: TEST_USERS[0].displayName,
        playerId: TEST_USERS[0].id,
        mode: 'sync',
        totalRounds: 2,
        roundTimerSec: 120,
      },
      timeout: 30000,
    });
    expect(createRes.ok(), `Create game failed: ${createRes.status()}`).toBeTruthy();
    const sessionData = await createRes.json();
    const gameId = sessionData.gameId || sessionData.id;
    logs.push({ source: 'info', msg: `Game created: ${gameId}` });

    // Navigate
    await Promise.all([
      hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: 30000 }),
      guestPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: 30000 }),
    ]);
    await Promise.all([
      hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: 60000 }),
      guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: 60000 }),
    ]);

    const hostWS = await createObserver(gameId, TEST_USERS[0], logs, 'HOST');
    const guestWS = await createObserver(gameId, TEST_USERS[1], logs, 'GUEST');

    await Promise.all([
      hostWS.waitForState((s) => s.status === 'LOBBY', 60000),
      guestWS.waitForState((s) => s.status === 'LOBBY', 60000),
    ]);

    // Ready up
    await Promise.all([
      hostPage.getByTestId('lobby-ready-btn').first().click(),
      guestPage.getByTestId('lobby-ready-btn').first().click(),
    ]);
    await Promise.all([
      hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE', 60000),
      guestWS.waitForState((s) => s.status === 'ROUND_ACTIVE', 60000),
    ]);
    await waitForRoundActive(hostPage, 30000);
    await waitForRoundActive(guestPage, 30000);
    logs.push({ source: 'info', msg: `Round active before disconnect` });

    // Scenario A: Guest closes tab, waits, reopens
    logs.push({ source: 'info', msg: `--- GUEST DISCONNECT (${DISCONNECT_MS}ms) ---` });
    await guestPage.close();
    await new Promise((r) => setTimeout(r, DISCONNECT_MS));
    const guestPage2 = await guestCtx.newPage();
    attachConsole(guestPage2, logs, 'GUEST2');
    await guestPage2.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForAnyGameShell(guestPage2, 60000);
    const guest2Status = await getVisibleStatus(guestPage2);
    logs.push({ source: 'info', msg: `GUEST2 visible status after reconnect: ${guest2Status}` });

    const guest2WS = await createObserver(gameId, TEST_USERS[1], logs, 'GUEST2-WS');
    await guest2WS.waitForState((s) => s.status !== 'LOBBY' || s.players.length >= 2, 60000, true);
    logs.push({ source: 'info', msg: `GUEST2 WS last: ${snapshotLine('GUEST2-WS', guest2WS.getLastSnapshot())}` });

    // If rejoined in round, try to complete it
    if (guest2Status === 'ROUND_ACTIVE') {
      await submitGuessViaUI(hostPage, { year: 1950, lat: 40, lng: 0 });
      await submitGuessViaUI(guestPage2, { year: 1960, lat: 41, lng: 1 });
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'ROUND_COMPLETE', 60000),
        guest2WS.waitForState((s) => s.status === 'ROUND_COMPLETE', 60000),
      ]);
      logs.push({ source: 'info', msg: `Round completed after guest reconnect` });
    } else {
      logs.push({ source: 'info', msg: `GUEST2 did not land in ROUND_ACTIVE; skipping submit` });
    }

    // Scenario B: Host closes tab, waits, reopens
    // Need get back to ROUND_ACTIVE round 1 or later. If currently ROUND_COMPLETE, ready next.
    if (guest2Status === 'ROUND_COMPLETE') {
      await hostPage.getByTestId('round-next-btn').first().click();
      try { await guestPage2.getByTestId('round-next-btn').first().click(); } catch {}
      await hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1, 60000);
      await waitForRoundActive(hostPage, 30000);
      try { await waitForRoundActive(guestPage2, 30000); } catch {}
    }

    logs.push({ source: 'info', msg: `--- HOST DISCONNECT (${DISCONNECT_MS}ms) ---` });
    await hostPage.close();
    await new Promise((r) => setTimeout(r, DISCONNECT_MS));
    const hostPage2 = await hostCtx.newPage();
    attachConsole(hostPage2, logs, 'HOST2');
    await hostPage2.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForAnyGameShell(hostPage2, 60000);
    const host2Status = await getVisibleStatus(hostPage2);
    logs.push({ source: 'info', msg: `HOST2 visible status after reconnect: ${host2Status}` });

    const host2WS = await createObserver(gameId, TEST_USERS[0], logs, 'HOST2-WS');
    await host2WS.waitForState((s) => s.status !== 'LOBBY' || s.players.length >= 2, 60000, true);
    logs.push({ source: 'info', msg: `HOST2 WS last: ${snapshotLine('HOST2-WS', host2WS.getLastSnapshot())}` });

    if (host2Status === 'ROUND_ACTIVE') {
      await submitGuessViaUI(hostPage2, { year: 1950, lat: 40, lng: 0 });
      await submitIfRoundActive(guestPage2);
      await Promise.all([
        host2WS.waitForState((s) => s.status === 'ROUND_COMPLETE', 60000),
        guest2WS.waitForState((s) => s.status === 'ROUND_COMPLETE', 60000),
      ]);
      logs.push({ source: 'info', msg: `Round completed after host reconnect` });
    } else {
      logs.push({ source: 'info', msg: `HOST2 did not land in ROUND_ACTIVE; skipping submit` });
    }

    logs.push({ source: 'info', msg: `=== Smoke complete ===` });
  } finally {
    await browser.close();
    fs.writeFileSync(outputPath, logs.map((l) => l.msg).join('\n') + '\n');
    console.log(`[RUSH-RECONNECT] Logs written to ${outputPath}`);
  }
});
