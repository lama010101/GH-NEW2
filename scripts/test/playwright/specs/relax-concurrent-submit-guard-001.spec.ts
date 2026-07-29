import { test, expect, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { TEST_USERS, fetchAccessToken } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, CompeteSnapshot } from '../orchestrator/websocketClient';

// ─────────────────────────────────────────────────────────────────────
// MP-BUILD-RELAX-CONCURRENT-SUBMIT-GUARD-001
//
// 1. True-concurrent submit: multiple Relax players submit round 0 at the
//    same instant (Promise.all). Each read-only observer records every
//    STATE_UPDATE and asserts no per-player regression of status,
//    hasSubmitted, currentRoundIndex, snapshotVersion, or dbVersion.
//
// 2. Absent-player semantics: one player lets the per-round timer expire.
//    That player's hasSubmitted must be false and didSubmit must be false
//    in the round results, while a player who manually submitted shows
//    hasSubmitted=true and didSubmit=true.
//
// Uses per-player read-only WebSocket observers so the broadcast payload
// itself is asserted, not only the UI.
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
const ROUND_TIMER_FOR_ABSENT_SEC = 15;
const CONCURRENT_ITERATIONS = 3;

type Violation = string;

type DbVersion = {
  roundEventVersion: number;
  playerEventVersions: Record<string, number>;
};

function isAtLeastAsNewForPlayer(playerId: string, incoming: DbVersion, last: DbVersion | undefined): boolean {
  if (!last) return true;
  if (incoming.roundEventVersion < last.roundEventVersion) return false;
  const incomingVersion = incoming.playerEventVersions[playerId] ?? 0;
  const lastVersion = last.playerEventVersions[playerId] ?? 0;
  return incomingVersion >= lastVersion;
}

function createObserver(label: string, playerId: string, violations: Violation[]) {
  const history: CompeteSnapshot[] = [];
  let hasSeenOwnViewer = false;
  const everSubmittedRound = new Map<number, boolean>();
  const everCompletedRound = new Map<number, boolean>();

  return {
    history,
    onStateUpdate(snapshot: CompeteSnapshot) {
      history.push(snapshot);
      const round = snapshot.currentRoundIndex;
      const me = snapshot.players.find((p) => p.playerId === playerId);
      const hasSubmitted = me?.hasSubmitted ?? false;

      if (snapshot.viewerPlayerId === playerId) {
        hasSeenOwnViewer = true;
      }
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
        const prev = history[history.length - 2];
        if (snapshot.currentRoundIndex < prev.currentRoundIndex) {
          violations.push(
            `${label} currentRoundIndex regressed: ${prev.currentRoundIndex} -> ${snapshot.currentRoundIndex} (snapshot #${history.length})`,
          );
        }
        if (prev.snapshotVersion !== undefined && snapshot.snapshotVersion !== undefined) {
          if (snapshot.snapshotVersion < prev.snapshotVersion) {
            violations.push(
              `${label} snapshotVersion regressed: ${prev.snapshotVersion} -> ${snapshot.snapshotVersion} (snapshot #${history.length})`,
            );
          }
        }
        if (prev.dbVersion && snapshot.dbVersion) {
          if (!isAtLeastAsNewForPlayer(playerId, snapshot.dbVersion, prev.dbVersion)) {
            violations.push(
              `${label} dbVersion regressed at snapshot #${history.length} (round=${round})`,
            );
          }
        }
      }

      if (everCompletedRound.get(round) && snapshot.status === 'ROUND_ACTIVE') {
        violations.push(
          `${label} status regressed from ROUND_COMPLETE to ROUND_ACTIVE for round ${round} (snapshot #${history.length})`,
        );
      }
      if (everSubmittedRound.get(round) && !hasSubmitted) {
        violations.push(
          `${label} hasSubmitted regressed to false for round ${round} (snapshot #${history.length})`,
        );
      }

      if (snapshot.status === 'ROUND_COMPLETE') {
        everCompletedRound.set(round, true);
      }
      if (hasSubmitted) {
        everSubmittedRound.set(round, true);
      }
    },
  };
}

async function createReadonlyClient(
  gameId: string,
  user: (typeof TEST_USERS)[0],
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

async function createAsyncGame(hostPage: Page, hostUser: (typeof TEST_USERS)[0]): Promise<string> {
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
  return client.waitForState(predicate, timeoutMs);
}

function dumpStates(clients: CompeteWSClient[], labels: string[]): string {
  return labels
    .map((label, i) => {
      const s = clients[i].getLastSnapshot();
      return `${label}: status=${s?.status} round=${s?.currentRoundIndex} viewer=${s?.viewerPlayerId?.slice(0, 8)} hasSubmitted=${s?.players.find((p) => p.playerId === clients[i].user.id)?.hasSubmitted}`;
    })
    .join('\n');
}

test.describe('Relax concurrent-submit guard (MP-BUILD-RELAX-CONCURRENT-SUBMIT-GUARD-001)', () => {
  test.beforeAll(async () => {
    const server = fs.readFileSync(path.resolve(process.cwd(), 'partykit/server.ts'), 'utf8');
    expect(server, 'KC-002: broadcastStateUpdate must not use room.broadcast()').not.toMatch(
      /room\.broadcast\(/,
    );
  });

  test(`TEST 1: ${CONCURRENT_ITERATIONS} iterations of true-concurrent submit for 3 players`, async () => {
    test.setTimeout(600000);

    for (let iter = 0; iter < CONCURRENT_ITERATIONS; iter++) {
      const violations: Violation[] = [];
      const browser = await chromium.launch({ headless: true });
      try {
        const contexts = await Promise.all([
          browser.newContext(DESKTOP_PRESET),
          browser.newContext(DESKTOP_PRESET),
          browser.newContext(DESKTOP_PRESET),
        ]);
        const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
        const users = [TEST_USERS[0], TEST_USERS[1], TEST_USERS[2]];
        const labels = ['Host', 'Guest1', 'Guest2'];

        for (let i = 0; i < pages.length; i++) {
          await pages[i].goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
          await ensureLoggedIn(pages[i], users[i]);
        }

        const gameId = await createAsyncGame(pages[0], users[0]);
        console.log(`[CONCURRENT-${iter}] async game: ${gameId}`);

        for (const page of pages) {
          await page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        }

        const clients = await Promise.all(
          users.map((user, i) => createReadonlyClient(gameId, user, user.id, labels[i], violations)),
        );

        await Promise.all(
          clients.map((client, i) =>
            waitForClientState(client, (s) => s.status === 'LOBBY', STATE_TIMEOUT).then(() =>
              console.log(`[CONCURRENT-${iter}] ${labels[i]} LOBBY (round=${client.getLastSnapshot()?.currentRoundIndex})`),
            ),
          ),
        );

        // All ready up -> auto-start in async
        await Promise.all(clients.map((c) => c.toggleReady()));
        await Promise.all(
          clients.map((client, i) =>
            waitForClientState(client, (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT).then(() =>
              console.log(`[CONCURRENT-${iter}] ${labels[i]} ROUND_ACTIVE round=0`),
            ),
          ),
        );

        // Fire all submits at the same instant — no sequential awaits.
        const guesses = [
          { roundIndex: 0, year: 1500, lat: 20, lng: 30 },
          { roundIndex: 0, year: 1600, lat: 40, lng: 50 },
          { roundIndex: 0, year: 1700, lat: 60, lng: 70 },
        ];
        await Promise.all(
          clients.map((c, i) => c.submitGuess(guesses[i].roundIndex, guesses[i].year, guesses[i].lat, guesses[i].lng)),
        );

        await Promise.all(
          clients.map((client, i) =>
            waitForClientState(client, (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0, STATE_TIMEOUT).then(() =>
              console.log(`[CONCURRENT-${iter}] ${labels[i]} ROUND_COMPLETE round=0`),
            ),
          ),
        );

        // Give any late / stale snapshots a window to arrive and (hopefully) be dropped.
        await pages[0].waitForTimeout(3000);

        console.log(`[CONCURRENT-${iter}] final states:\n` + dumpStates(clients, labels));

        for (const client of clients) {
          const s = client.getLastSnapshot();
          const me = s?.players.find((p) => p.playerId === client.user.id);
          expect(me?.hasSubmitted, `${client.user.displayName} should have hasSubmitted=true`).toBe(true);
          expect(s?.status, `${client.user.displayName} should be ROUND_COMPLETE`).toBe('ROUND_COMPLETE');
        }

        expect(violations, `Concurrent submit violations (iter ${iter}):\n${violations.join('\n')}`).toEqual([]);
      } finally {
        await browser.close();
      }
    }
  });

  test('TEST 2: timer-expired absent player has hasSubmitted=false and didSubmit=false', async () => {
    test.setTimeout(120000);
    const violations: Violation[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
      const contexts = await Promise.all([browser.newContext(DESKTOP_PRESET), browser.newContext(DESKTOP_PRESET)]);
      const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
      const [hostUser, absentUser] = [TEST_USERS[0], TEST_USERS[1]];
      const [hostLabel, absentLabel] = ['Host', 'Absent'];

      for (let i = 0; i < pages.length; i++) {
        await pages[i].goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await ensureLoggedIn(pages[i], [hostUser, absentUser][i]);
      }

      const gameId = await createAsyncGame(pages[0], hostUser);
      console.log(`[ABSENT-TEST] async game: ${gameId}`);

      for (const page of pages) {
        await page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      }

      const hostClient = await createReadonlyClient(gameId, hostUser, hostUser.id, hostLabel, violations);
      const absentClient = await createReadonlyClient(gameId, absentUser, absentUser.id, absentLabel, violations);

      await Promise.all([
        waitForClientState(hostClient, (s) => s.status === 'LOBBY', STATE_TIMEOUT),
        waitForClientState(absentClient, (s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      // Set a short per-round timer before starting so the absent player expires.
      hostClient.setTimer(ROUND_TIMER_FOR_ABSENT_SEC);
      await waitForClientState(hostClient, (s) => s.config?.roundTimerSec === ROUND_TIMER_FOR_ABSENT_SEC, STATE_TIMEOUT);

      await Promise.all([hostClient.toggleReady(), absentClient.toggleReady()]);
      await Promise.all([
        waitForClientState(hostClient, (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
        waitForClientState(absentClient, (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      ]);

      // Host submits quickly; absent player does nothing and should expire.
      hostClient.submitGuess(0, 1500, 20, 30);
      await waitForClientState(hostClient, (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0, STATE_TIMEOUT);
      console.log('[ABSENT-TEST] Host ROUND_COMPLETE round=0');

      // Wait for the absent player's per-player timer to expire and the DO alarm to mark absent.
      await waitForClientState(
        absentClient,
        (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0,
        ROUND_TIMER_FOR_ABSENT_SEC * 1000 + 20000,
      );
      console.log('[ABSENT-TEST] Absent ROUND_COMPLETE round=0 (timer expired)');

      // Give the final broadcast a moment to settle.
      await pages[0].waitForTimeout(2000);

      const hostSnapshot = hostClient.getLastSnapshot();
      const absentSnapshot = absentClient.getLastSnapshot();
      const hostPlayer = hostSnapshot?.players.find((p) => p.playerId === hostUser.id);
      const absentPlayer = absentSnapshot?.players.find((p) => p.playerId === absentUser.id);

      console.log(`[ABSENT-TEST] Host: status=${hostSnapshot?.status} round=${hostSnapshot?.currentRoundIndex} hasSubmitted=${hostPlayer?.hasSubmitted}`);
      console.log(`[ABSENT-TEST] Absent: status=${absentSnapshot?.status} round=${absentSnapshot?.currentRoundIndex} hasSubmitted=${absentPlayer?.hasSubmitted}`);

      expect(hostPlayer?.hasSubmitted).toBe(true);
      expect(absentPlayer?.hasSubmitted).toBe(false);
      expect(violations, `Absent-player test violations:\n${violations.join('\n')}`).toEqual([]);

      // Verify scoring semantics separately: didSubmit should be false for absent, true for host.
      const resultsRes = await pages[0].request.get(`${BASE_URL}/api/compete/${gameId}/round/0/results`);
      expect(resultsRes.ok(), `Get round results failed: ${resultsRes.status()}`).toBeTruthy();
      const resultsData = (await resultsRes.json()) as { results: Array<{ playerId: string; didSubmit: boolean }> };
      const hostResult = resultsData.results.find((r) => r.playerId === hostUser.id);
      const absentResult = resultsData.results.find((r) => r.playerId === absentUser.id);

      expect(hostResult?.didSubmit).toBe(true);
      expect(absentResult?.didSubmit).toBe(false);
    } finally {
      await browser.close();
    }
  });
});
