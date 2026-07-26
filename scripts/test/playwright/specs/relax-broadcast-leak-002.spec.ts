import { test, expect, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { TEST_USERS, fetchAccessToken } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, CompeteSnapshot } from '../orchestrator/websocketClient';

// ─────────────────────────────────────────────────────────────────────
// MP-BUILD-RELAX-BROADCAST-LEAK-002 live smoke test
//
// Two scenarios covering Root Causes 1 & 2 from MP-INV-RELAX-LIVE-BREAK-002:
//   1. Four-player Relax: all submit Round 1, all click Next. Each player must
//      advance to Round 2 independently, no socket may receive another player's
//      per-player view, and currentRoundIndex may never regress.
//   2. Guest submits & advances while host does not. Guest reaches Round 2;
//      host must stay on Round 1 with its own viewerPlayerId.
//
// Uses per-player read-only WebSocket observers so the broadcast payload itself
// is asserted, not only the UI.
// ─────────────────────────────────────────────────────────────────────

const PARTYKIT_HOST =
  process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

const DESKTOP_PRESET = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

const NAV_TIMEOUT = 30000;
const STATE_TIMEOUT = 60000;

type Violation = string;

async function submitGuess(
  page: Page,
  { yearFraction, mapFractionX, mapFractionY }: { yearFraction: number; mapFractionX: number; mapFractionY: number },
): Promise<void> {
  await page.getByTestId('round-when-btn').first().click({ force: true, timeout: 15000 });

  let pickedYear: string | null = null;
  for (let attempt = 0; attempt < 8 && pickedYear === null; attempt++) {
    await page.waitForTimeout(300);
    pickedYear = await page.evaluate((fraction) => {
      const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      const yearBtns = btns.filter((b) => /^\d{3,4}$/.test((b.textContent || '').trim()));
      if (yearBtns.length === 0) return null;
      const idx = Math.min(yearBtns.length - 1, Math.max(0, Math.floor(yearBtns.length * fraction)));
      const target = yearBtns[idx];
      target.click();
      return (target.textContent || '').trim();
    }, yearFraction);
  }
  if (pickedYear === null) {
    throw new Error('submitGuess: no year buttons found in WHEN sheet after 8 attempts');
  }

  await page.evaluate(() => {
    const backdrop = document.querySelector('[class*="sheetBackdrop"]') as HTMLElement | null;
    if (backdrop) backdrop.click();
  }).catch(() => undefined);
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="round-where-btn"]') as HTMLButtonElement | null;
    if (btn) btn.click();
  });
  const map = page.locator('.leaflet-container').first();
  await map.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(500);
  const box = await map.boundingBox();
  if (!box) throw new Error('submitGuess: WHERE map has no bounding box');
  await map.click({
    position: { x: box.width * mapFractionX, y: box.height * mapFractionY },
    force: true,
    timeout: 15000,
  });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const backdrop = document.querySelector('[class*="sheetBackdrop"]') as HTMLElement | null;
    if (backdrop) backdrop.click();
  }).catch(() => undefined);
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="round-submit-btn"]') as HTMLButtonElement | null;
    if (btn) btn.click();
  });
}

function createObserver(label: string, playerId: string, violations: Violation[]) {
  const history: CompeteSnapshot[] = [];
  let hasSeenOwnViewer = false;
  return {
    history,
    onStateUpdate(snapshot: CompeteSnapshot) {
      history.push(snapshot);
      if (snapshot.viewerPlayerId === playerId) {
        hasSeenOwnViewer = true;
      }
      // viewerPlayerId: null is the server's pre-JOIN_ROOM loading-state unblock;
      // only flag it once the observer has already received its own per-player view.
      if (snapshot.viewerPlayerId !== null && snapshot.viewerPlayerId !== playerId) {
        violations.push(
          `${label} received snapshot for wrong viewer: ${snapshot.viewerPlayerId} (expected ${playerId})`,
        );
      } else if (hasSeenOwnViewer && snapshot.viewerPlayerId === null) {
        violations.push(
          `${label} received base snapshot with null viewer after already seeing its own view`,
        );
      }
      if (history.length >= 2) {
        const prev = history[history.length - 2].currentRoundIndex;
        const curr = snapshot.currentRoundIndex;
        if (curr < prev) {
          violations.push(
            `${label} currentRoundIndex regressed: ${prev} -> ${curr} (snapshot #${history.length})`,
          );
        }
      }
      if (snapshot.currentRoundIndex === 0 && history.length > 1) {
        const everAdvanced = history.some((s) => s.currentRoundIndex >= 1);
        if (everAdvanced) {
          violations.push(
            `${label} was sent back to round 0 after already advancing (snapshot #${history.length})`,
          );
        }
      }
    },
  };
}

async function createReadonlyClient(
  gameId: string,
  user: typeof TEST_USERS[0],
  playerId: string,
  label: string,
  violations: Violation[],
): Promise<CompeteWSClient> {
  const accessToken = await fetchAccessToken(user);
  const observer = createObserver(label, playerId, violations);
  const client = new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST,
    gameId,
    user,
    displayName: user.displayName,
    accessToken,
    onStateUpdate: (s) => observer.onStateUpdate(s as CompeteSnapshot),
    onError: (msg) => violations.push(`${label} WS error: ${msg}`),
  });
  await client.connect();
  return client;
}

async function createAsyncGame(hostPage: any, hostUser: typeof TEST_USERS[0]): Promise<string> {
  const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
    data: {
      displayName: hostUser.displayName,
      playerId: hostUser.id,
      mode: 'async',
      totalRounds: 5,
    },
    timeout: NAV_TIMEOUT,
  });
  expect(createRes.ok(), `Create async game failed: ${createRes.status()}`).toBeTruthy();
  const sessionData = await createRes.json();
  const gameId = sessionData.gameId || sessionData.id;
  expect(gameId, 'Create game returned no gameId').toBeTruthy();
  return gameId as string;
}

async function waitForClientState(
  client: CompeteWSClient,
  predicate: (s: CompeteSnapshot) => boolean,
  timeoutMs = STATE_TIMEOUT,
): Promise<CompeteSnapshot> {
  const last = client.getLastSnapshot();
  if (last && predicate(last)) return last;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const final = client.getLastSnapshot();
      reject(
        new Error(
          `waitForClientState timeout; last=${JSON.stringify(final?.status)}:${final?.currentRoundIndex}`,
        ),
      );
    }, timeoutMs);
    const check = () => {
      const s = client.getLastSnapshot();
      if (s && predicate(s)) {
        clearTimeout(timer);
        resolve(s);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

async function readyUp(page: Page) {
  const btn = page.getByTestId('lobby-ready-btn').first();
  await btn.waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
  await btn.click();
}

async function advanceRound(page: Page) {
  const btn = page.getByTestId('round-next-btn').first();
  await btn.waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
  await btn.click();
}

function dumpStates(clients: CompeteWSClient[], labels: string[]): string {
  return labels
    .map((label, i) => {
      const s = clients[i].getLastSnapshot();
      return `${label}: status=${s?.status} round=${s?.currentRoundIndex} viewer=${s?.viewerPlayerId?.slice(0, 8)}`;
    })
    .join('\n');
}

test.describe('Relax broadcast leak (MP-BUILD-RELAX-BROADCAST-LEAK-002)', () => {
  test.beforeAll(async () => {
    const server = fs.readFileSync(path.resolve(process.cwd(), 'partykit/server.ts'), 'utf8');
    expect(server, 'KC-002: broadcastStateUpdate must not use room.broadcast()').not.toMatch(
      /room\.broadcast\(/,
    );
  });

  test('TEST 1: host + 3 guests submit round 1 and click Next independently', async () => {
    test.setTimeout(600000);
    const violations: Violation[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
      const contexts = await Promise.all([
        browser.newContext(DESKTOP_PRESET),
        browser.newContext(DESKTOP_PRESET),
        browser.newContext(DESKTOP_PRESET),
        browser.newContext(DESKTOP_PRESET),
      ]);
      const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
      const users = [TEST_USERS[0], TEST_USERS[1], TEST_USERS[2], TEST_USERS[3]];
      const labels = ['Host', 'Guest1', 'Guest2', 'Guest3'];

      for (let i = 0; i < pages.length; i++) {
        await pages[i].goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await ensureLoggedIn(pages[i], users[i]);
      }

      const gameId = await createAsyncGame(pages[0], users[0]);
      console.log(`[RELAX-SMOKE-1] async game: ${gameId}`);

      for (const page of pages) {
        await page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      }

      const clients = await Promise.all(
        users.map((user, i) => createReadonlyClient(gameId, user, user.id, labels[i], violations)),
      );

      await Promise.all(
        clients.map((client, i) =>
          waitForClientState(client, (s) => s.status === 'LOBBY', STATE_TIMEOUT).then(() =>
            console.log(`[RELAX-SMOKE-1] ${labels[i]} LOBBY (round=${client.getLastSnapshot()?.currentRoundIndex})`),
          ),
        ),
      );

      // All ready up -> auto-start
      await Promise.all(pages.map((page) => readyUp(page)));
      await Promise.all(
        clients.map((client, i) =>
          waitForClientState(client, (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT).then(() =>
            console.log(`[RELAX-SMOKE-1] ${labels[i]} ROUND_ACTIVE round=${client.getLastSnapshot()?.currentRoundIndex}`),
          ),
        ),
      );

      // Sequential submit so every player really lands in ROUND_COMPLETE
      const fractions = [
        { yearFraction: 0.2, mapFractionX: 0.25, mapFractionY: 0.35 },
        { yearFraction: 0.4, mapFractionX: 0.75, mapFractionY: 0.3 },
        { yearFraction: 0.6, mapFractionX: 0.3, mapFractionY: 0.7 },
        { yearFraction: 0.8, mapFractionX: 0.8, mapFractionY: 0.65 },
      ];
      for (let i = 0; i < pages.length; i++) {
        await submitGuess(pages[i], fractions[i]);
        await waitForClientState(
          clients[i],
          (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0,
          STATE_TIMEOUT,
        );
        console.log(`[RELAX-SMOKE-1] ${labels[i]} ROUND_COMPLETE round=0`);
      }

      // Sequential Next: each advances independently to Round 2
      for (let i = 0; i < pages.length; i++) {
        await advanceRound(pages[i]);
        await waitForClientState(
          clients[i],
          (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1,
          STATE_TIMEOUT,
        );
        console.log(`[RELAX-SMOKE-1] ${labels[i]} ROUND_ACTIVE round=1`);
      }

      console.log('[RELAX-SMOKE-1] final states:\n' + dumpStates(clients, labels));
      expect(violations, `Broadcast leak violations:\n${violations.join('\n')}`).toEqual([]);
      expect(
        clients.every((c) => {
          const s = c.getLastSnapshot();
          return s?.status === 'ROUND_ACTIVE' && s?.currentRoundIndex === 1;
        }),
      ).toBe(true);
    } finally {
      await browser.close();
    }
  });

  test('TEST 2: guest submits and advances while host does not', async () => {
    test.setTimeout(600000);
    const violations: Violation[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
      const [hostCtx, guestCtx] = await Promise.all([
        browser.newContext(DESKTOP_PRESET),
        browser.newContext(DESKTOP_PRESET),
      ]);
      const [hostPage, guestPage] = await Promise.all([hostCtx.newPage(), guestCtx.newPage()]);
      const hostUser = TEST_USERS[0];
      const guestUser = TEST_USERS[1];

      await hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await ensureLoggedIn(hostPage, hostUser);
      await guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await ensureLoggedIn(guestPage, guestUser);

      const gameId = await createAsyncGame(hostPage, hostUser);
      console.log(`[RELAX-SMOKE-2] async game: ${gameId}`);

      await Promise.all([
        hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);

      const hostClient = await createReadonlyClient(gameId, hostUser, hostUser.id, 'Host', violations);
      const guestClient = await createReadonlyClient(gameId, guestUser, guestUser.id, 'Guest', violations);

      await Promise.all([
        waitForClientState(hostClient, (s) => s.status === 'LOBBY', STATE_TIMEOUT),
        waitForClientState(guestClient, (s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      await Promise.all([readyUp(hostPage), readyUp(guestPage)]);
      await Promise.all([
        waitForClientState(hostClient, (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
        waitForClientState(guestClient, (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      ]);

      // Guest submits and immediately advances; host does nothing
      await submitGuess(guestPage, { yearFraction: 0.5, mapFractionX: 0.6, mapFractionY: 0.4 });
      await waitForClientState(guestClient, (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0, STATE_TIMEOUT);
      console.log(`[RELAX-SMOKE-2] Guest ROUND_COMPLETE round=0`);
      await advanceRound(guestPage);
      await waitForClientState(guestClient, (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1, STATE_TIMEOUT);
      console.log(`[RELAX-SMOKE-2] Guest ROUND_ACTIVE round=1`);

      // Give host a short window to see if it was wrongly overwritten by guest's advance
      await hostPage.waitForTimeout(3000);

      const hostState = hostClient.getLastSnapshot();
      const guestState = guestClient.getLastSnapshot();
      console.log(`[RELAX-SMOKE-2] Host: status=${hostState?.status} round=${hostState?.currentRoundIndex} viewer=${hostState?.viewerPlayerId?.slice(0, 8)}`);
      console.log(`[RELAX-SMOKE-2] Guest: status=${guestState?.status} round=${guestState?.currentRoundIndex} viewer=${guestState?.viewerPlayerId?.slice(0, 8)}`);

      expect(violations, `Broadcast leak violations:\n${violations.join('\n')}`).toEqual([]);
      expect(hostState?.status).toBe('ROUND_ACTIVE');
      expect(hostState?.currentRoundIndex).toBe(0);
      expect(hostState?.viewerPlayerId).toBe(hostUser.id);
      expect(guestState?.status).toBe('ROUND_ACTIVE');
      expect(guestState?.currentRoundIndex).toBe(1);
      expect(guestState?.viewerPlayerId).toBe(guestUser.id);
    } finally {
      await browser.close();
    }
  });
});
