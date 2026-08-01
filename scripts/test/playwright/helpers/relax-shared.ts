import { Page, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TEST_USERS, fetchAccessToken, TestUser } from '../fixtures/auth';
import { CompeteWSClient, CompeteSnapshot } from '../orchestrator/websocketClient';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export const PARTYKIT_HOST =
  process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
export const PARTYKIT_SECRET = process.env.PARTYKIT_SECRET || 'local-dev-secret';

export const NAV_TIMEOUT = 60000;
export const STATE_TIMEOUT = 60000;

export const DESKTOP_PRESET = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

export const BANNED_TEXT = ['waiting for others', 'starting soon', 'players ready'];

export type Violation = string;

function isAtLeastAsNewForPlayer(
  playerId: string,
  incoming: { roundEventVersion: number; playerEventVersions: Record<string, number> },
  last: { roundEventVersion: number; playerEventVersions: Record<string, number> } | undefined,
): boolean {
  if (!last) return true;
  if (incoming.roundEventVersion < last.roundEventVersion) return false;
  const incomingVersion = incoming.playerEventVersions[playerId] ?? 0;
  const lastVersion = last.playerEventVersions[playerId] ?? 0;
  return incomingVersion >= lastVersion;
}

export function createInvariantObserver(
  label: string,
  playerId: string,
  violations: Violation[],
) {
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
            `${label} currentRoundIndex regressed: ${prev.currentRoundIndex} -> ${snapshot.currentRoundIndex}`,
          );
        }
        if (
          prev.snapshotVersion !== undefined &&
          snapshot.snapshotVersion !== undefined &&
          snapshot.snapshotVersion < prev.snapshotVersion
        ) {
          violations.push(
            `${label} snapshotVersion regressed: ${prev.snapshotVersion} -> ${snapshot.snapshotVersion}`,
          );
        }
        if (prev.dbVersion && snapshot.dbVersion) {
          if (!isAtLeastAsNewForPlayer(playerId, snapshot.dbVersion, prev.dbVersion)) {
            violations.push(`${label} dbVersion regressed at round ${round}`);
          }
        }
      }

      if (everCompletedRound.get(round) && snapshot.status === 'ROUND_ACTIVE') {
        violations.push(
          `${label} status regressed from ROUND_COMPLETE to ROUND_ACTIVE for round ${round}`,
        );
      }
      if (everSubmittedRound.get(round) && !hasSubmitted) {
        violations.push(`${label} hasSubmitted regressed to false for round ${round}`);
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

export async function assertNoBannedText(
  page: Page,
  label: string,
  violations: Violation[],
): Promise<void> {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const lower = text.toLowerCase();
  for (const banned of BANNED_TEXT) {
    if (lower.includes(banned)) {
      violations.push(`[${label}] Banned text found: "${banned}"`);
    }
  }
}

export async function createAsyncGame(
  hostPage: Page,
  hostUser: TestUser,
  opts: { roundTimerSec?: number; totalRounds?: number } = {},
): Promise<string> {
  const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
    data: {
      displayName: hostUser.displayName,
      playerId: hostUser.id,
      mode: 'async',
      totalRounds: opts.totalRounds ?? 5,
      roundTimerSec: opts.roundTimerSec ?? 0,
    },
    timeout: NAV_TIMEOUT,
  });
  expect(createRes.ok(), `Create async game failed: ${createRes.status()}`).toBeTruthy();
  const sessionData = await createRes.json();
  const gameId = sessionData.gameId || sessionData.id;
  expect(gameId, 'Create game returned no gameId').toBeTruthy();
  return gameId as string;
}

export async function createReadonlyClient(
  gameId: string,
  user: TestUser,
  playerId: string,
  label: string,
  violations: Violation[],
): Promise<CompeteWSClient> {
  const accessToken = await fetchAccessToken(user);
  const observer = createInvariantObserver(label, playerId, violations);
  const timerClampedEvents: string[] = [];
  const client = new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST,
    gameId,
    user,
    displayName: user.displayName,
    accessToken,
    onStateUpdate: (s) => observer.onStateUpdate(s as CompeteSnapshot),
    onError: (msg) => violations.push(`${label} WS error: ${msg}`),
    onTimerClamped: () => timerClampedEvents.push(`${label} TIMER_CLAMPED`),
  });
  (client as any).__timerClamped = timerClampedEvents;
  await client.connect();
  return client;
}

export function getTimerClampedEvents(client: CompeteWSClient): string[] {
  return ((client as any).__timerClamped as string[]) ?? [];
}

export async function startPlayerViaWS(client: CompeteWSClient): Promise<void> {
  // In async (Relax) the ready flag is informational; the START_GAME message
  // triggers the per-player start endpoint for the sending player.
  client.toggleReady();
  await client.waitForState(
    (s) => s.players.find((p) => p.playerId === client.user.id)?.ready === true,
    30000,
  );
  client.startGame();
  await client.waitForState(
    (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex >= 0,
    STATE_TIMEOUT,
  );
}

export async function completeAllRoundsViaWS(client: CompeteWSClient): Promise<void> {
  for (let round = 0; round < 5; round++) {
    client.submitGuess(round, 1900, 0, 0);
    if (round < 4) {
      await client.waitForState(
        (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === round,
        STATE_TIMEOUT,
      );
      await new Promise((r) => setTimeout(r, 200));
      client.readyNext(round);
      await client.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === round + 1,
        STATE_TIMEOUT,
      );
    } else {
      await client.waitForState((s) => s.status === 'SESSION_COMPLETE', STATE_TIMEOUT);
    }
  }
}

export async function submitGuessViaWS(
  client: CompeteWSClient,
  round: number,
  year = 1900,
  lat = 0,
  lng = 0,
): Promise<void> {
  client.submitGuess(round, year, lat, lng);
  await client.waitForState(
    (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === round,
    STATE_TIMEOUT,
  );
}

export async function advanceToNextRoundViaWS(client: CompeteWSClient, round: number): Promise<void> {
  client.readyNext(round);
  await client.waitForState(
    (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === round + 1,
    STATE_TIMEOUT,
  );
}

export async function waitForRoundActive(page: Page, timeout = 60000): Promise<void> {
  await page.locator('[data-testid="round-image-container"]').first().waitFor({ state: 'visible', timeout });
  await expect(page.locator('[data-testid="round-active-section"]').first()).toBeVisible({ timeout });
}

export async function waitForRoundComplete(page: Page, timeout = 60000): Promise<void> {
  await expect(page.locator('[data-testid="round-complete-section"]').first()).toBeVisible({ timeout });
}

export async function getVisibleStatus(page: Page): Promise<string> {
  const root = page
    .locator('[data-testid="lobby-shell"], [data-testid="round-active-section"], [data-testid="round-complete-section"], [data-testid="session-complete-section"]')
    .first();
  const testid = await root.getAttribute('data-testid').catch(() => 'unknown');
  if (testid?.includes('lobby')) return 'LOBBY';
  if (testid?.includes('active')) return 'ROUND_ACTIVE';
  if (testid?.includes('complete') && !testid?.includes('session')) return 'ROUND_COMPLETE';
  if (testid?.includes('session-complete')) return 'SESSION_COMPLETE';
  return 'unknown';
}

export async function updateSessionDeadline(gameId: string, deadline: Date): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables for direct DB inspection');
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket },
  });
  const { error } = await supabase
    .from('sessions')
    .update({ session_deadline: deadline.toISOString() })
    .eq('game_id', gameId);
  if (error) throw new Error(`Failed to update session deadline: ${error.message}`);
}

export async function finalizeSessionDeadline(gameId: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/compete/${encodeURIComponent(gameId)}/finalize-deadline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-partykit-secret': PARTYKIT_SECRET,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`finalize-deadline failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getRoundResults(page: Page, gameId: string, roundIndex: number) {
  const res = await page.request.get(`${BASE_URL}/api/compete/${encodeURIComponent(gameId)}/round/${roundIndex}/results`);
  expect(res.ok(), `Get round results failed: ${res.status()}`).toBeTruthy();
  return (await res.json()) as {
    results: Array<{
      playerId: string;
      score: number;
      rank: number;
      accuracy: number;
      locationScore: number;
      didSubmit: boolean;
      guessYear: number | null;
      guessLat: number | null;
      guessLng: number | null;
      timeScore: number;
      cumulativeScore: number;
      cumulativeAccuracy: number;
    }>;
  };
}

export async function takeScreenshot(page: Page, name: string): Promise<string> {
  const fileName = `test-results/relax-6p-${name}.png`;
  await page.screenshot({ path: fileName, fullPage: false });
  return fileName;
}

export function formatViolationReport(violations: Violation[]): string {
  if (violations.length === 0) return '';
  return `\nViolations:\n${violations.map((v) => `  - ${v}`).join('\n')}`;
}

export { TEST_USERS, TestUser };
