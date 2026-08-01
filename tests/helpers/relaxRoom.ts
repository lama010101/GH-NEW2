import { Browser, Page, expect } from '@playwright/test';
import { TEST_USERS, fetchAccessToken } from '../../scripts/test/playwright/fixtures/auth';
import { ensureLoggedIn } from '../../scripts/test/playwright/helpers/auth-ui';
import {
  CompeteWSClient,
  CompeteSnapshot,
} from '../../scripts/test/playwright/orchestrator/websocketClient';
import { createSnapshotObserver, SnapshotObserver } from './relaxAssertions';

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
const LOGIN_TIMEOUT = 120000;

export type TestUser = (typeof TEST_USERS)[0];

export type BasePlayer = CompeteSnapshot['players'][number];
export type RelaxPlayer = BasePlayer & {
  roundStatus?: 'invited' | 'joined' | 'ready' | 'playing' | 'finished';
  currentRoundIndex?: number | null;
};

export type BaseConfig = CompeteSnapshot['config'];
export type RelaxConfig = BaseConfig & {
  sessionDeadlineDays?: number | null;
  sessionDeadline?: string | null;
  selectedRegions?: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  referenceYear?: number;
};

export type RelaxSnapshot = Omit<CompeteSnapshot, 'players' | 'config'> & {
  players: RelaxPlayer[];
  config: RelaxConfig;
};

export interface RelaxRoom {
  gameId: string;
  pages: Page[];
  clients: CompeteWSClient[];
  users: TestUser[];
  host: {
    page: Page;
    client: CompeteWSClient;
    user: TestUser;
    index: number;
  };
  contexts: Awaited<ReturnType<Browser['newContext']>>[];
  errors: string[];
  violations: string[];
  observers: SnapshotObserver[];
  close: () => Promise<void>;
}

function createWS(
  gameId: string,
  user: TestUser,
  accessToken: string,
  errors: string[],
  onStateUpdate?: (snapshot: CompeteSnapshot) => void,
): CompeteWSClient {
  return new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST,
    gameId,
    user,
    displayName: user.displayName,
    accessToken,
    onStateUpdate: (snapshot: CompeteSnapshot) => {
      console.log(
        `[WS:${user.displayName}] status=${snapshot.status} round=${snapshot.currentRoundIndex} viewer=${snapshot.viewerPlayerId?.slice(0, 8) ?? 'null'}`,
      );
      onStateUpdate?.(snapshot);
    },
    onError: (msg) => {
      console.error(`[WS:${user.displayName}] ERROR: ${msg}`);
      errors.push(`[${user.displayName}] ${msg}`);
    },
  });
}

export async function create6PlayerRelaxRoom(
  browser: Browser,
  opts: { totalRounds?: number; roundTimerSec?: number } = {},
): Promise<RelaxRoom> {
  const users = TEST_USERS.slice(0, 6);
  const errors: string[] = [];
  const violations: string[] = [];

  const contexts = await Promise.all(
    Array.from({ length: users.length }).map(() => browser.newContext(DESKTOP_PRESET)),
  );
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  // Log each player in through the AuthModal. Do this sequentially to avoid
  // overwhelming the Supabase auth endpoint under the 6-browser cold start.
  for (let i = 0; i < users.length; i++) {
    const page = pages[i];
    const user = users[i];
    await page.goto(`${BASE_URL}/login`, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });
    await ensureLoggedIn(page, user);
    console.log(`[RELAX-ROOM] ${user.displayName} logged in`);
  }

  // Host creates an async session.
  const hostIndex = 0;
  const hostUser = users[hostIndex];
  const hostPage = pages[hostIndex];
  // WebKit's page.request may not include the context's auth cookies in this
  // Playwright build, so explicitly forward the Supabase cookie on the
  // create request to avoid 403 "playerId must match authenticated user".
  const cookies = await hostPage.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
    headers: { cookie: cookieHeader },
    data: {
      displayName: hostUser.displayName,
      playerId: hostUser.id,
      mode: 'async',
      totalRounds: opts.totalRounds ?? 5,
      roundTimerSec: opts.roundTimerSec ?? 0,
    },
    timeout: NAV_TIMEOUT,
  });
  if (!createRes.ok()) {
    throw new Error(`Create game failed: ${createRes.status()} ${await createRes.text()}`);
  }
  const sessionData = await createRes.json();
  const gameId = (sessionData.gameId || sessionData.id) as string;
  if (!gameId) {
    throw new Error('Create game returned no gameId');
  }
  console.log(`[RELAX-ROOM] Created async game: ${gameId}`);

  // All players navigate to the session.
  await Promise.all(
    pages.map((page) =>
      page.goto(`${BASE_URL}/compete/${gameId}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT,
      }),
    ),
  );

  // Wait for the lobby shell to render in every browser.
  await Promise.all(
    pages.map((page) =>
      page
        .locator('[data-testid="lobby-shell"]')
        .first()
        .waitFor({ state: 'visible', timeout: LOGIN_TIMEOUT }),
    ),
  );

  // Attach one WebSocket orchestrator per player for authoritative state.
  // Each client also gets a snapshot observer so monotonic / viewerPlayerId
  // invariants are checked from the first STATE_UPDATE onward.
  const tokens = await Promise.all(users.map((u) => fetchAccessToken(u)));
  const observers: SnapshotObserver[] = users.map((user, i) =>
    createSnapshotObserver(user.id, users[i].displayName, violations),
  );
  const clients = users.map((user, i) =>
    createWS(
      gameId,
      user,
      tokens[i],
      errors,
      (snapshot: CompeteSnapshot) => observers[i].onStateUpdate(snapshot as RelaxSnapshot),
    ),
  );
  await Promise.all(clients.map((c) => c.connect()));

  // Wait until every player sees itself and the full 6-player roster in LOBBY.
  await Promise.all(
    clients.map((client) =>
      client.waitForState(
        (s) => s.status === 'LOBBY' && s.players.filter((p) => p.leftAt === null).length === 6,
        STATE_TIMEOUT,
      ),
    ),
  );

  const hostClient = clients[hostIndex];

  return {
    gameId,
    pages,
    clients,
    users,
    host: { page: hostPage, client: hostClient, user: hostUser, index: hostIndex },
    contexts,
    errors,
    violations,
    observers,
    close: async () => {
      clients.forEach((c) => c.close());
      await Promise.all(contexts.map((ctx) => ctx.close().catch(() => undefined)));
    },
  };
}

export async function getRosterRowText(page: Page, playerId: string): Promise<string> {
  const row = page.locator(`[data-testid="lobby-player-${playerId}"]`).first();
  return (await row.textContent({ timeout: 10000 }).catch(() => '')) ?? '';
}

export async function assertRosterCount(page: Page, count: number, label: string): Promise<void> {
  await expect(
    page.locator('[data-testid^="lobby-player-"]'),
    `${label}: roster should show ${count} players`,
  ).toHaveCount(count, { timeout: 10000 });
}

export function getPlayerStatus(snapshot: RelaxSnapshot, playerId: string): string | undefined {
  return snapshot.players.find((p) => p.playerId === playerId)?.roundStatus;
}
