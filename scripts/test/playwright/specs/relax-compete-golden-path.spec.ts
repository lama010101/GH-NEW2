import { test, expect, chromium } from '@playwright/test';
import type { Page, Locator, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { TEST_USERS, fetchAccessToken } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, CompeteSnapshot } from '../orchestrator/websocketClient';
import { observeState, assertStateMatches, captureResumeToken, diffResumeTokens } from '../orchestrator/observer';

// ─────────────────────────────────────────────────────────────────────
// MP-GUARD-RELAX-REGRESSION-001 — Relax (async) Compete Golden-Path
//
// Permanent async golden path mirroring sync-compete-golden-path.spec.ts,
// with per-viewer assertions and the staggered-advance scenarios that are
// unique to Relax. Relax sessions are hard-coded to 5 rounds by the game
// mode spec, so the spec progresses through all 5 rounds.
// ─────────────────────────────────────────────────────────────────────

const PARTYKIT_HOST =
  process.env.PARTYKIT_HOST || process.env.NEXT_PUBLIC_PARTY_KIT_HOST || 'localhost:1999';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const DB_URL = process.env.SUPABASE_DB_CONNECTION || '';

const DESKTOP_PRESET = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

const NAV_TIMEOUT = 30000;
const STATE_TIMEOUT = 60000;

interface PlayerRoundResult {
  score: number;
  accuracy: number;
  cumulativeScore: number;
  cumulativeAccuracy: number;
  didSubmit: boolean;
  locationScore: number;
  timeScore: number;
  guessYear: number | null;
  guessLat: number | null;
  guessLng: number | null;
  distanceKm: number | null;
  yearDiff: number | null;
  region: string | null;
  rank: number;
}

interface RelaxRound {
  eventId: string;
  title: string;
  year: number | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  imageUrl: string | null;
  description: string | null;
  hints: unknown[];
  region?: string | null;
  playerRoundResults?: Record<string, PlayerRoundResult>;
}

type RelaxSnapshot = Omit<CompeteSnapshot, 'rounds'> & { rounds: RelaxRound[] };

// ─────────────────────────────────────────────────────────────────────
// Global invariant observer
// ─────────────────────────────────────────────────────────────────────
function createObserver(label: string, playerId: string, violations: string[]) {
  const history: CompeteSnapshot[] = [];
  let hasSeenOwnViewer = false;
  return {
    history,
    onStateUpdate(snapshot: CompeteSnapshot) {
      history.push(snapshot);
      if (snapshot.viewerPlayerId === playerId) hasSeenOwnViewer = true;

      if (snapshot.viewerPlayerId !== null && snapshot.viewerPlayerId !== playerId) {
        violations.push(
          `${label} received snapshot for wrong viewer: ${snapshot.viewerPlayerId} (expected ${playerId})`,
        );
      } else if (hasSeenOwnViewer && snapshot.viewerPlayerId === null) {
        violations.push(`${label} received base snapshot with null viewer after already seeing its own view`);
      }

      if (history.length >= 2) {
        const prev = history[history.length - 2].currentRoundIndex;
        const curr = snapshot.currentRoundIndex;
        if (curr < prev) {
          violations.push(`${label} currentRoundIndex regressed: ${prev} -> ${curr}`);
        }
      }

      if (snapshot.currentRoundIndex === 0 && history.length > 1) {
        const everAdvanced = history.some((s) => s.currentRoundIndex >= 1);
        if (everAdvanced) {
          violations.push(`${label} was sent back to round 0 after already advancing`);
        }
      }

      console.log(
        `[WS:${label}] status=${snapshot.status} round=${snapshot.currentRoundIndex} viewer=${snapshot.viewerPlayerId}`,
      );
    },
  };
}

async function createReadonlyWS(
  gameId: string,
  user: (typeof TEST_USERS)[0],
  errors: string[],
  timerClamped: string[],
  violations: string[],
): Promise<CompeteWSClient> {
  const accessToken = await fetchAccessToken(user);
  const label = user.displayName;
  const observer = createObserver(label, user.id, violations);
  const client = new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST,
    gameId,
    user,
    displayName: user.displayName,
    accessToken,
    onStateUpdate: (snapshot) => observer.onStateUpdate(snapshot),
    onError: (msg) => {
      console.error(`[WS:${label}] ERROR: ${msg}`);
      errors.push(`[${label}] ${msg}`);
    },
    onTimerClamped: (newPhaseEndsAt, clampedToSec) => {
      console.error(`[WS:${label}] TIMER_CLAMPED: ${clampedToSec}s until ${newPhaseEndsAt}`);
      timerClamped.push(`[${label}] clamped to ${clampedToSec}s`);
    },
    onPlayerSubmitted: (playerId, playerName) => {
      console.log(`[WS:${label}] PLAYER_SUBMITTED: ${playerName} (${playerId.slice(0, 8)})`);
    },
  });
  await client.connect();
  return client;
}

async function assertViewerSees(page: Page, snapshot: CompeteSnapshot, label: string): Promise<string[]> {
  // Poll until the browser DOM converges to the WS snapshot.
  // `observeState` returns the first visible section, so during a phase
  // transition the old shell (e.g. LOBBY) can still be present for a few
  // hundred ms while the new one renders. We wait for the DOM to catch up
  // rather than failing on the transient race.
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const observed = await observeState(page, { pollTimeoutMs: 5000 });
    const failures = assertStateMatches(observed, snapshot, label);
    if (failures.length === 0) return [];
    await page.waitForTimeout(200);
  }
  const observed = await observeState(page, { pollTimeoutMs: 5000 });
  return assertStateMatches(observed, snapshot, label);
}

async function submitRelaxGuess(
  page: Page,
  { year, mapFractionX, mapFractionY }: { year: number; mapFractionX: number; mapFractionY: number },
): Promise<void> {
  await page.getByTestId('round-when-btn').first().click({ force: true, timeout: 15000 });
  await page.waitForTimeout(200);

  const input = page.locator('input[type="number"]').first();
  await input.fill(String(year));
  await page.waitForTimeout(200);

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
  const box = await map.boundingBox();
  if (!box) throw new Error('submitRelaxGuess: WHERE map has no bounding box');
  await map.click({
    position: { x: box.width * mapFractionX, y: box.height * mapFractionY },
    force: true,
    timeout: 15000,
  });
  await page.waitForTimeout(200);

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

function chooseYear(
  correctYear: number,
  yearMin: number,
  yearMax: number,
  mode: 'close' | 'far',
): number {
  const clamped = Math.max(yearMin, Math.min(yearMax, correctYear));
  if (mode === 'close') return clamped;
  const distMin = Math.abs(correctYear - yearMin);
  const distMax = Math.abs(yearMax - correctYear);
  return distMax >= distMin ? yearMax : yearMin;
}

function getDbClient(): Client {
  if (!DB_URL) throw new Error('SUPABASE_DB_CONNECTION not set');
  return new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
}

async function readCorrectAnswerForRound(
  db: Client,
  gameId: string,
  roundIndex: number,
): Promise<{ year: number; lat: number; lng: number }> {
  const res = await db.query<{
    event_year: number;
    latitude: number | null;
    longitude: number | null;
  }>(
    `WITH sc AS (
       SELECT payload->'eventIds' AS ids
         FROM round_events
        WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
        ORDER BY id ASC
        LIMIT 1
     )
     SELECT e.event_year, l.latitude, l.longitude
       FROM sc
       JOIN events e ON e.id = (sc.ids->>$2::int)::uuid
       LEFT JOIN locations l ON l.event_id = e.id`,
    [gameId, roundIndex],
  );
  const row = res.rows[0];
  if (!row || row.latitude == null || row.longitude == null) {
    throw new Error(`readCorrectAnswerForRound: round ${roundIndex} event/location not resolvable`);
  }
  return { year: Number(row.event_year), lat: Number(row.latitude), lng: Number(row.longitude) };
}

async function readCommitForRound(
  db: Client,
  gameId: string,
  playerId: string,
  roundIndex: number,
): Promise<{ year: number; lat: number; lng: number }> {
  const deadline = Date.now() + STATE_TIMEOUT;
  while (Date.now() < deadline) {
    const res = await db.query<{
      year_guess: number | null;
      location_lat: number | null;
      location_lng: number | null;
    }>(
      `SELECT year_guess, location_lat, location_lng
         FROM round_commits
        WHERE game_id = $1 AND player_id = $2 AND round_index = $3`,
      [gameId, playerId, roundIndex],
    );
    const row = res.rows[0];
    if (row && row.year_guess != null && row.location_lat != null && row.location_lng != null) {
      return {
        year: Number(row.year_guess),
        lat: Number(row.location_lat),
        lng: Number(row.location_lng),
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`readCommitForRound: no commit for player ${playerId} round ${roundIndex}`);
}

async function readDisplayName(db: Client, gameId: string, playerId: string): Promise<string> {
  const res = await db.query<{ display_name: string }>(
    'SELECT display_name FROM session_players WHERE game_id = $1 AND player_id = $2',
    [gameId, playerId],
  );
  const name = res.rows[0]?.display_name;
  if (!name) throw new Error(`readDisplayName: no roster row for player ${playerId}`);
  return name;
}

async function readTotalScores(
  db: Client,
  gameId: string,
): Promise<Map<string, { totalScore: number; avgAccuracy: number }>> {
  const res = await db.query<{
    player_id: string;
    total_score: string;
    avg_accuracy: string;
  }>(
    `SELECT player_id,
            SUM(score) AS total_score,
            AVG((location_score + time_score) / 2.0) AS avg_accuracy
       FROM round_results
      WHERE game_id = $1
      GROUP BY player_id`,
    [gameId],
  );
  const map = new Map<string, { totalScore: number; avgAccuracy: number }>();
  for (const row of res.rows) {
    map.set(row.player_id, {
      totalScore: Number(row.total_score),
      avgAccuracy: Math.round(Number(row.avg_accuracy)),
    });
  }
  return map;
}

async function expandLeaderboard(whereWhen: Locator): Promise<void> {
  const header = whereWhen.locator('[class*="expandHeader"]').first();
  const rows = whereWhen.locator('[class*="lbRow"]');
  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await rows.count()) > 0) return;
    await header.click({ force: true });
    await whereWhen.page().waitForTimeout(500);
  }
}

async function switchBreakdownTab(
  whereWhen: Locator,
  index: 0 | 1,
  sentinelClass: string,
): Promise<void> {
  const sentinel = whereWhen.locator(`[class*="${sentinelClass}"]`).first();
  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await sentinel.count()) > 0) return;
    await whereWhen.locator('button[class*="whereWhenTab"]').nth(index).click({ force: true });
    await whereWhen.page().waitForTimeout(500);
  }
  await sentinel.waitFor({ state: 'attached', timeout: STATE_TIMEOUT });
}

function computeTotalsFromSnapshot(
  snapshot: RelaxSnapshot,
): Map<string, { totalScore: number; avgAccuracy: number }> {
  const map = new Map<string, { totalScore: number; avgAccuracy: number }>();
  for (const player of snapshot.players) {
    let totalScore = 0;
    let accSum = 0;
    let rounds = 0;
    for (let i = 0; i < snapshot.rounds.length; i++) {
      const prr = snapshot.rounds[i].playerRoundResults?.[player.playerId];
      if (prr?.didSubmit) {
        totalScore += prr.score;
        accSum += ((prr.locationScore ?? 0) + (prr.timeScore ?? 0)) / 2;
        rounds++;
      }
    }
    map.set(player.playerId, {
      totalScore,
      avgAccuracy: rounds > 0 ? Math.round(accSum / rounds) : 0,
    });
  }
  return map;
}

test.describe('Relax Compete Golden Path', () => {
  // A0 — Preflight
  test.beforeAll(async () => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!supabaseUrl) {
      throw new Error('Supabase unreachable — NEXT_PUBLIC_SUPABASE_URL not set');
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
        signal: controller.signal,
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
      });
      clearTimeout(timeout);
      if (!res.ok && res.status !== 401 && res.status !== 403) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Supabase unreachable — auth health check timed out after 5s');
      }
      throw new Error(`Supabase unreachable — ${err.message}`);
    }

    const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

    const server = read('partykit/server.ts');
    expect(server, 'KC-002: room.broadcast() found in partykit/server.ts').not.toMatch(/room\.broadcast\s*\(/);

    const sessionCore = read('src/server/sessionCore.ts');
    expect(sessionCore, 'Pressure-clamp mode gate missing').toMatch(/mode === ['"]sync['"]/);
    expect(sessionCore, 'Region reveal gating missing').toMatch(
      /revealAnswer \? ev\?\.region \?\? null : null/,
    );
  });

  test('A1-A6, A8, A9 — 2-player async 5-round golden path', async () => {
    test.setTimeout(420000);
    const db = getDbClient();
    await db.connect();

    const errors: string[] = [];
    const timerClamped: string[] = [];
    const violations: string[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
      const [hostCtx, guestCtx] = await Promise.all([
        browser.newContext(DESKTOP_PRESET),
        browser.newContext(DESKTOP_PRESET),
      ]);
      const [hostPage, guestPage] = await Promise.all([hostCtx.newPage(), guestCtx.newPage()]);

      hostPage.on('console', (msg) => console.log(`[BROWSER:host] ${msg.type()}: ${msg.text()}`));
      hostPage.on('pageerror', (err) => console.error(`[BROWSER:host] PAGEERROR: ${err.message}`));
      guestPage.on('console', (msg) => console.log(`[BROWSER:guest] ${msg.type()}: ${msg.text()}`));
      guestPage.on('pageerror', (err) => console.error(`[BROWSER:guest] PAGEERROR: ${err.message}`));

      await Promise.all([
        hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);
      await Promise.all([ensureLoggedIn(hostPage, TEST_USERS[0]), ensureLoggedIn(guestPage, TEST_USERS[1])]);
      await Promise.all([
        hostPage.waitForLoadState('domcontentloaded').catch(() => undefined),
        guestPage.waitForLoadState('domcontentloaded').catch(() => undefined),
      ]);

      // ── A1: Setup + create ──
      const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
        data: {
          displayName: TEST_USERS[0].displayName,
          playerId: TEST_USERS[0].id,
          mode: 'async',
          totalRounds: 5,
          roundTimerSec: 0,
        },
        timeout: NAV_TIMEOUT,
      });
      expect(createRes.ok(), `Create async game failed: ${createRes.status()}`).toBeTruthy();
      const sessionData = await createRes.json();
      const gameId: string = sessionData.gameId || sessionData.id;
      expect(gameId, 'Create game returned no gameId').toBeTruthy();

      const modeRow = await db.query<{ mode: string }>('SELECT mode FROM sessions WHERE game_id=$1', [gameId]);
      expect(modeRow.rows[0]?.mode, 'Session must be async (Relax)').toBe('async');

      await Promise.all([
        hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);
      await Promise.all([
        hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);

      const hostWS = await createReadonlyWS(gameId, TEST_USERS[0], errors, timerClamped, violations);
      const guestWS = await createReadonlyWS(gameId, TEST_USERS[1], errors, timerClamped, violations);
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      const lobbySnap = hostWS.getLastSnapshot()!;
      expect(lobbySnap.players.length, 'Lobby should have 2 players').toBe(2);
      expect(lobbySnap.config.mode, 'Config mode should be async').toBe('async');

      const hostRoster = await hostPage.locator('[data-testid^="lobby-player-"]').count();
      const guestRoster = await guestPage.locator('[data-testid^="lobby-player-"]').count();
      expect(hostRoster, 'Host roster should show 2 players').toBe(2);
      expect(guestRoster, 'Guest roster should show 2 players').toBe(2);

      // ── A2: Start ──
      await Promise.all([
        hostPage.getByTestId('lobby-ready-btn').first().click(),
        guestPage.getByTestId('lobby-ready-btn').first().click(),
      ]);
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      ]);

      expect(hostWS.getLastSnapshot()!.viewerPlayerId, 'Host WS viewerPlayerId must be host id').toBe(
        TEST_USERS[0].id,
      );
      expect(guestWS.getLastSnapshot()!.viewerPlayerId, 'Guest WS viewerPlayerId must be guest id').toBe(
        TEST_USERS[1].id,
      );

      const hostObs0 = await assertViewerSees(hostPage, hostWS.getLastSnapshot()!, 'host');
      const guestObs0 = await assertViewerSees(guestPage, guestWS.getLastSnapshot()!, 'guest');
      expect([...hostObs0, ...guestObs0], 'DOM↔WS mismatch at ROUND_ACTIVE round 0').toEqual([]);

      await expect(hostPage.getByTestId('round-image-container').first()).toBeVisible({ timeout: 10000 });
      await expect(guestPage.getByTestId('round-image-container').first()).toBeVisible({ timeout: 10000 });

      const totalRounds = lobbySnap.config.totalRounds;
      expect(totalRounds, 'Relax should run 5 rounds').toBe(5);

      // Ground truth for divergence
      const correctByRound: { year: number; lat: number; lng: number }[] = [];
      for (let r = 0; r < totalRounds; r++) {
        correctByRound[r] = await readCorrectAnswerForRound(db, gameId, r);
      }

      const hostYear = (roundIndex: number) =>
        chooseYear(
          correctByRound[roundIndex].year,
          hostWS.getLastSnapshot()!.config.yearMin,
          hostWS.getLastSnapshot()!.config.yearMax,
          'far',
        );
      const guestYear = (roundIndex: number) =>
        chooseYear(
          correctByRound[roundIndex].year,
          guestWS.getLastSnapshot()!.config.yearMin,
          guestWS.getLastSnapshot()!.config.yearMax,
          'close',
        );

      // ── A3: Staggered submission + independent advance ──
      await submitRelaxGuess(hostPage, { year: hostYear(0), mapFractionX: 0.5, mapFractionY: 0.5 });
      await hostWS.waitForState(
        (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0,
        STATE_TIMEOUT,
      );

      expect(guestWS.getLastSnapshot()!.status, 'Guest should still be ROUND_ACTIVE round 0 after host submits').toBe(
        'ROUND_ACTIVE',
      );
      expect(
        guestWS.getLastSnapshot()!.currentRoundIndex,
        'Guest should still be on round 0 after host submits',
      ).toBe(0);

      // Host's Next button must be enabled while waiting for the other player
      const hostNext = hostPage.getByTestId('round-next-btn').first();
      await expect(hostNext, 'Host Next button should be enabled while waiting for guest').toBeEnabled({
        timeout: 10000,
      });
      await hostNext.click();

      await hostWS.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1,
        STATE_TIMEOUT,
      );
      expect(guestWS.getLastSnapshot()!.status, 'Guest should remain ROUND_ACTIVE after host advances').toBe(
        'ROUND_ACTIVE',
      );
      expect(guestWS.getLastSnapshot()!.currentRoundIndex, 'Guest should remain on round 0').toBe(0);

      // ── A6: No pressure clamp in async (piggyback on A3) ──
      expect(timerClamped, 'TIMER_CLAMPED should not fire in async').toEqual([]);
      expect(hostWS.getLastSnapshot()!.roundEndsAt, 'Host roundEndsAt should be null (timer off)').toBeNull();
      expect(guestWS.getLastSnapshot()!.roundEndsAt, 'Guest roundEndsAt should be null (timer off)').toBeNull();

      // ── A4: Where/When live staleness ──
      await submitRelaxGuess(guestPage, { year: guestYear(0), mapFractionX: 0.5, mapFractionY: 0.5 });
      await guestWS.waitForState(
        (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0,
        STATE_TIMEOUT,
      );

      const hostName = await readDisplayName(db, gameId, TEST_USERS[0].id);
      const guestName = await readDisplayName(db, gameId, TEST_USERS[1].id);
      const hostCommit0 = await readCommitForRound(db, gameId, TEST_USERS[0].id, 0);
      const guestCommit0 = await readCommitForRound(db, gameId, TEST_USERS[1].id, 0);

      const whereWhen0 = guestPage.locator('[class*="whereWhenCard"]').first();
      await whereWhen0.waitFor({ state: 'visible', timeout: STATE_TIMEOUT });

      await switchBreakdownTab(whereWhen0, 0, 'mapContainer');
      await expandLeaderboard(whereWhen0);
      await expect(
        whereWhen0.locator('[class*="lbRow"]').filter({ hasText: hostName }).first(),
        'Guest WhereCard must show host row',
      ).toBeVisible({ timeout: STATE_TIMEOUT });
      await expect(
        whereWhen0.locator('[class*="lbRow"]').filter({ hasText: guestName }).first(),
        'Guest WhereCard must show guest row',
      ).toBeVisible({ timeout: STATE_TIMEOUT });

      await switchBreakdownTab(whereWhen0, 1, 'timelineBar');
      await expect
        .poll(
          async () =>
            (await whereWhen0.locator('[class*="playerYearLabel"]').allInnerTexts()).map((s) => s.trim()),
          { timeout: STATE_TIMEOUT },
        )
        .toContain(String(hostCommit0.year));
      await expect
        .poll(
          async () =>
            (await whereWhen0.locator('[class*="playerYearLabel"]').allInnerTexts()).map((s) => s.trim()),
          { timeout: STATE_TIMEOUT },
        )
        .toContain(String(guestCommit0.year));

      // Guest advances to round 1
      await guestPage.getByTestId('round-next-btn').first().click();
      await guestWS.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1,
        STATE_TIMEOUT,
      );

      // ── A5: Region-reveal gating (per-viewer) ──
      await submitRelaxGuess(hostPage, { year: hostYear(1), mapFractionX: 0.5, mapFractionY: 0.5 });
      await hostWS.waitForState(
        (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 1,
        STATE_TIMEOUT,
      );
      await hostPage.getByTestId('round-next-btn').first().click();
      await hostWS.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 2,
        STATE_TIMEOUT,
      );

      expect(
        guestWS.getLastSnapshot()!.status,
        'Guest should still be ROUND_ACTIVE round 1 after host advances',
      ).toBe('ROUND_ACTIVE');
      expect(guestWS.getLastSnapshot()!.currentRoundIndex, 'Guest should be on round 1').toBe(1);

      const hostSnapA5 = hostWS.getLastSnapshot()! as unknown as RelaxSnapshot;
      const guestSnapA5 = guestWS.getLastSnapshot()! as unknown as RelaxSnapshot;
      const round1Host = hostSnapA5.rounds[1];
      const round1Guest = guestSnapA5.rounds[1];

      expect(round1Host.region, 'Host round-1 region should be revealed').toBeTruthy();
      expect(round1Host.year, 'Host round-1 year should be revealed').not.toBeNull();
      expect(round1Guest.region, 'Guest round-1 region should be hidden pre-reveal').toBeNull();
      expect(round1Guest.year, 'Guest round-1 year should be hidden pre-reveal').toBeNull();

      const hostPr = round1Host.playerRoundResults?.[TEST_USERS[0].id];
      const guestPr = round1Guest.playerRoundResults?.[TEST_USERS[1].id];
      expect(hostPr, 'Host should have own round-1 result').toBeTruthy();
      expect(hostPr!.region, 'Host own round-1 result region should be revealed').toBeTruthy();
      expect(guestPr?.region, 'Guest own round-1 result region should be null pre-reveal').toBeNull();
      expect(guestPr?.guessYear, 'Guest own round-1 guessYear should be null pre-reveal').toBeNull();

      // ── Host finishes rounds 2..4 first (bad guesses each round) ──
      for (let r = 2; r < totalRounds; r++) {
        await submitRelaxGuess(hostPage, { year: hostYear(r), mapFractionX: 0.5, mapFractionY: 0.5 });
        if (r === totalRounds - 1) {
          await hostWS.waitForState((s) => s.status === 'SESSION_COMPLETE', STATE_TIMEOUT);
        } else {
          await hostWS.waitForState(
            (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === r,
            STATE_TIMEOUT,
          );
          await hostPage.getByTestId('round-next-btn').first().click();
          await hostWS.waitForState(
            (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === r + 1,
            STATE_TIMEOUT,
          );
        }
      }

      // ── A8: Guest finishes all rounds (good guesses) and leaderboard converges ──
      for (let r = 1; r < totalRounds; r++) {
        await submitRelaxGuess(guestPage, { year: guestYear(r), mapFractionX: 0.5, mapFractionY: 0.5 });
        if (r === totalRounds - 1) {
          await guestWS.waitForState((s) => s.status === 'SESSION_COMPLETE', STATE_TIMEOUT);
        } else {
          await guestWS.waitForState(
            (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === r,
            STATE_TIMEOUT,
          );
          await guestPage.getByTestId('round-next-btn').first().click();
          await guestWS.waitForState(
            (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === r + 1,
            STATE_TIMEOUT,
          );
        }
      }

      // Host's SESSION_COMPLETE leaderboard should update to two rows without a reload
      await expect(hostPage.locator('[data-testid^="session-rank-"]')).toHaveCount(2, {
        timeout: STATE_TIMEOUT,
      });

      const hostSnapFinal = hostWS.getLastSnapshot()! as unknown as RelaxSnapshot;
      const totals = computeTotalsFromSnapshot(hostSnapFinal);
      const dbTotals = await readTotalScores(db, gameId);

      for (const [pid, total] of totals.entries()) {
        const dbTotal = dbTotals.get(pid);
        expect(dbTotal, `DB total missing for ${pid}`).toBeTruthy();
        expect(total.totalScore, `Snapshot totalScore for ${pid} should match DB`).toBe(dbTotal!.totalScore);
        expect(total.avgAccuracy, `Snapshot avgAccuracy for ${pid} should match DB`).toBe(dbTotal!.avgAccuracy);
      }

      const sortedIds = Array.from(totals.entries())
        .sort((a, b) => b[1].totalScore - a[1].totalScore || b[1].avgAccuracy - a[1].avgAccuracy)
        .map(([pid]) => pid);
      const rankIds = await hostPage.locator('[data-testid^="session-rank-"]').all();
      const parsedDomIds = await Promise.all(rankIds.map((el) => el.getAttribute('data-testid')));
      const domPlayerIds = parsedDomIds.map((id) => id!.replace('session-rank-', ''));
      expect(domPlayerIds, 'Leaderboard order should match totals descending').toEqual(sortedIds);
      expect(sortedIds[0], 'Guest should have the higher total').toBe(TEST_USERS[1].id);

      // ── A9: Play Again in async ──
      await hostPage.getByTestId('session-play-again-btn').first().click();
      await Promise.all([
        hostPage.waitForURL(
          (url) => {
            const m = url.pathname.match(/\/compete\/([a-f0-9-]+)/);
            return m !== null && m[1] !== gameId;
          },
          { timeout: STATE_TIMEOUT },
        ),
        guestPage.waitForURL(
          (url) => {
            const m = url.pathname.match(/\/compete\/([a-f0-9-]+)/);
            return m !== null && m[1] !== gameId;
          },
          { timeout: STATE_TIMEOUT },
        ),
      ]);

      const newGameIdMatch = hostPage.url().match(/\/compete\/([a-f0-9-]+)/);
      expect(newGameIdMatch, 'Host URL should contain new gameId').not.toBeNull();
      const newGameId = newGameIdMatch![1];
      const guestUrlMatch = guestPage.url().match(/\/compete\/([a-f0-9-]+)/);
      expect(guestUrlMatch?.[1], 'Both should navigate to the same new game').toBe(newGameId);

      hostWS.close();
      guestWS.close();

      await Promise.all([
        hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);

      const newHostWS = await createReadonlyWS(newGameId, TEST_USERS[0], errors, timerClamped, violations);
      const newGuestWS = await createReadonlyWS(newGameId, TEST_USERS[1], errors, timerClamped, violations);
      await Promise.all([
        newHostWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
        newGuestWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      const newHostSnap = newHostWS.getLastSnapshot()!;
      expect(newHostSnap.gameId, 'New gameId should differ from old').not.toBe(gameId);
      expect(newHostSnap.gameId, 'New gameId should match URL').toBe(newGameId);
      expect(newHostSnap.config.mode, 'New session should stay async').toBe('async');
      expect(newHostSnap.players.length, 'New lobby should have 2 players').toBe(2);
      expect(newHostSnap.players.every((p) => !p.ready), 'New lobby players should be not-ready').toBe(true);

      const newHostRoster = await hostPage.locator('[data-testid^="lobby-player-"]').count();
      const newGuestRoster = await guestPage.locator('[data-testid^="lobby-player-"]').count();
      expect(newHostRoster, 'New host roster should show 2 players').toBe(2);
      expect(newGuestRoster, 'New guest roster should show 2 players').toBe(2);

      newHostWS.close();
      newGuestWS.close();

      expect(errors, `WS ERROR frames:\n${errors.join('\n')}`).toEqual([]);
      expect(timerClamped, 'No TIMER_CLAMPED in async').toEqual([]);
      expect(violations, `Viewer/regression violations:\n${violations.join('\n')}`).toEqual([]);

      console.log('[RELAX-GOLDEN] A1-A6, A8, A9 passed');
    } finally {
      await browser.close();
      await db.end();
    }
  });

  test('A7 — mid-session disconnect/reconnect (guest then host)', async () => {
    test.setTimeout(420000);
    const db = getDbClient();
    await db.connect();

    const errors: string[] = [];
    const timerClamped: string[] = [];
    const violations: string[] = [];

    const browser = await chromium.launch({ headless: true });
    let hostCtx: BrowserContext;
    let guestCtx: BrowserContext;
    let hostPage: Page;
    let guestPage: Page;

    try {
      [hostCtx, guestCtx] = await Promise.all([
        browser.newContext(DESKTOP_PRESET),
        browser.newContext(DESKTOP_PRESET),
      ]);
      [hostPage, guestPage] = await Promise.all([hostCtx.newPage(), guestCtx.newPage()]);

      await Promise.all([
        hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);
      await Promise.all([ensureLoggedIn(hostPage, TEST_USERS[0]), ensureLoggedIn(guestPage, TEST_USERS[1])]);

      const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
        data: {
          displayName: TEST_USERS[0].displayName,
          playerId: TEST_USERS[0].id,
          mode: 'async',
          totalRounds: 5,
          roundTimerSec: 0,
        },
        timeout: NAV_TIMEOUT,
      });
      expect(createRes.ok(), `Create async game failed: ${createRes.status()}`).toBeTruthy();
      const sessionData = await createRes.json();
      const gameId: string = sessionData.gameId || sessionData.id;
      expect(gameId, 'Create game returned no gameId').toBeTruthy();

      await Promise.all([
        hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);
      await Promise.all([
        hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);

      const hostWS = await createReadonlyWS(gameId, TEST_USERS[0], errors, timerClamped, violations);
      const guestWS = await createReadonlyWS(gameId, TEST_USERS[1], errors, timerClamped, violations);
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT),
      ]);

      await Promise.all([
        hostPage.getByTestId('lobby-ready-btn').first().click(),
        guestPage.getByTestId('lobby-ready-btn').first().click(),
      ]);
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      ]);

      // Advance both to round 1 to set up the mid-round-1 disconnect scenario
      const correct0 = await readCorrectAnswerForRound(db, gameId, 0);
      const hostYear0 = chooseYear(correct0.year, hostWS.getLastSnapshot()!.config.yearMin, hostWS.getLastSnapshot()!.config.yearMax, 'far');
      const guestYear0 = chooseYear(correct0.year, guestWS.getLastSnapshot()!.config.yearMin, guestWS.getLastSnapshot()!.config.yearMax, 'close');
      await Promise.all([
        submitRelaxGuess(hostPage, { year: hostYear0, mapFractionX: 0.5, mapFractionY: 0.5 }),
        submitRelaxGuess(guestPage, { year: guestYear0, mapFractionX: 0.5, mapFractionY: 0.5 }),
      ]);
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 0, STATE_TIMEOUT),
      ]);
      await Promise.all([
        hostPage.getByTestId('round-next-btn').first().click(),
        guestPage.getByTestId('round-next-btn').first().click(),
      ]);
      await Promise.all([
        hostWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1, STATE_TIMEOUT),
        guestWS.waitForState((s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1, STATE_TIMEOUT),
      ]);

      await hostPage.locator('[data-testid="round-active-section"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
      await guestPage.locator('[data-testid="round-active-section"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT });

      // ── Guest disconnect/reconnect ──
      const guestPlayerBefore = guestWS.getLastSnapshot()!.players.find(
        (p) => p.playerId === TEST_USERS[1].id,
      )!;
      const guestBefore = await captureResumeToken(guestPage);
      expect(guestBefore.status, 'Guest should be ROUND_ACTIVE before disconnect').toBe('ROUND_ACTIVE');
      expect(guestBefore.roundIndex, 'Guest should be on round 1 before disconnect').toBe('1');

      guestWS.close();
      await guestCtx.close();

      guestCtx = await browser.newContext(DESKTOP_PRESET);
      guestPage = await guestCtx.newPage();
      await guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await ensureLoggedIn(guestPage, TEST_USERS[1]);
      await guestPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await guestPage.locator('[data-testid="round-active-section"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT });

      const guestAfter = await captureResumeToken(guestPage);
      const guestDiffs = diffResumeTokens(guestBefore, guestAfter, 'guest');
      expect(guestDiffs, `Guest resume state changed after reconnect: ${guestDiffs.join(', ')}`).toEqual([]);

      const guestWS2 = await createReadonlyWS(gameId, TEST_USERS[1], errors, timerClamped, violations);
      await guestWS2.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1 && s.viewerPlayerId === TEST_USERS[1].id,
        STATE_TIMEOUT,
      );
      const guestSnap2 = guestWS2.getLastSnapshot()!;
      expect(guestSnap2.viewerPlayerId, 'Guest viewerPlayerId should be guest id after reconnect').toBe(
        TEST_USERS[1].id,
      );
      const guestPlayer2 = guestSnap2.players.find((p) => p.playerId === TEST_USERS[1].id);
      expect(guestPlayer2, 'Guest player should be present after reconnect').toBeTruthy();
      expect(guestPlayer2!.displayName, 'Guest displayName should be correct after reconnect').toBe(
        guestPlayerBefore.displayName,
      );
      expect(guestPlayer2!.avatarUrl, 'Guest avatarUrl should be correct after reconnect').toBe(
        guestPlayerBefore.avatarUrl,
      );

      expect(hostWS.getLastSnapshot()!.status, 'Host should still be ROUND_ACTIVE after guest reconnect').toBe(
        'ROUND_ACTIVE',
      );
      expect(hostWS.getLastSnapshot()!.currentRoundIndex, 'Host should still be on round 1 after guest reconnect').toBe(
        1,
      );

      // ── Host disconnect/reconnect ──
      const hostPlayerBefore = hostWS.getLastSnapshot()!.players.find((p) => p.playerId === TEST_USERS[0].id)!;
      const hostBefore = await captureResumeToken(hostPage);
      expect(hostBefore.status, 'Host should be ROUND_ACTIVE before disconnect').toBe('ROUND_ACTIVE');
      expect(hostBefore.roundIndex, 'Host should be on round 1 before disconnect').toBe('1');

      hostWS.close();
      await hostCtx.close();

      hostCtx = await browser.newContext(DESKTOP_PRESET);
      hostPage = await hostCtx.newPage();
      await hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await ensureLoggedIn(hostPage, TEST_USERS[0]);
      await hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await hostPage.locator('[data-testid="round-active-section"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT });

      const hostAfter = await captureResumeToken(hostPage);
      const hostDiffs = diffResumeTokens(hostBefore, hostAfter, 'host');
      expect(hostDiffs, `Host resume state changed after reconnect: ${hostDiffs.join(', ')}`).toEqual([]);

      const hostWS2 = await createReadonlyWS(gameId, TEST_USERS[0], errors, timerClamped, violations);
      await hostWS2.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 1 && s.viewerPlayerId === TEST_USERS[0].id,
        STATE_TIMEOUT,
      );
      const hostSnap2 = hostWS2.getLastSnapshot()!;
      expect(hostSnap2.viewerPlayerId, 'Host viewerPlayerId should be host id after reconnect').toBe(TEST_USERS[0].id);
      const hostPlayer2 = hostSnap2.players.find((p) => p.playerId === TEST_USERS[0].id);
      expect(hostPlayer2, 'Host player should be present after reconnect').toBeTruthy();
      expect(hostPlayer2!.displayName, 'Host displayName should be correct after reconnect').toBe(
        hostPlayerBefore.displayName,
      );
      expect(hostPlayer2!.avatarUrl, 'Host avatarUrl should be correct after reconnect').toBe(
        hostPlayerBefore.avatarUrl,
      );

      expect(guestWS2.getLastSnapshot()!.status, 'Guest should still be ROUND_ACTIVE after host reconnect').toBe(
        'ROUND_ACTIVE',
      );
      expect(
        guestWS2.getLastSnapshot()!.currentRoundIndex,
        'Guest should still be on round 1 after host reconnect',
      ).toBe(1);

      hostWS2.close();
      guestWS2.close();

      expect(errors, `WS ERROR frames:\n${errors.join('\n')}`).toEqual([]);
      expect(timerClamped, 'No TIMER_CLAMPED in async').toEqual([]);
      expect(violations, `Viewer/regression violations:\n${violations.join('\n')}`).toEqual([]);

      console.log('[RELAX-GOLDEN] A7 passed');
    } finally {
      await browser.close();
      await db.end();
    }
  });

  test('A10 — solo host async game', async () => {
    test.setTimeout(420000);
    const db = getDbClient();
    await db.connect();

    const errors: string[] = [];
    const timerClamped: string[] = [];
    const violations: string[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
      const hostCtx = await browser.newContext(DESKTOP_PRESET);
      const hostPage = await hostCtx.newPage();
      await hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await ensureLoggedIn(hostPage, TEST_USERS[0]);

      const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
        data: {
          displayName: TEST_USERS[0].displayName,
          playerId: TEST_USERS[0].id,
          mode: 'async',
          totalRounds: 5,
          roundTimerSec: 0,
        },
        timeout: NAV_TIMEOUT,
      });
      expect(createRes.ok(), `Create async game failed: ${createRes.status()}`).toBeTruthy();
      const sessionData = await createRes.json();
      const gameId: string = sessionData.gameId || sessionData.id;
      expect(gameId, 'Create game returned no gameId').toBeTruthy();

      await hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT });

      const hostWS = await createReadonlyWS(gameId, TEST_USERS[0], errors, timerClamped, violations);
      await hostWS.waitForState((s) => s.status === 'LOBBY', STATE_TIMEOUT);

      const lobbySnap = hostWS.getLastSnapshot()!;
      expect(lobbySnap.players.length, 'Solo lobby should have 1 player').toBe(1);
      expect(lobbySnap.players[0].isHost, 'Solo player should be host').toBe(true);

      await hostPage.getByTestId('lobby-ready-btn').first().click();
      await hostWS.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0,
        STATE_TIMEOUT,
      );

      const totalRounds = hostWS.getLastSnapshot()!.config.totalRounds;
      expect(totalRounds, 'Solo Relax should run 5 rounds').toBe(5);

      for (let r = 0; r < totalRounds; r++) {
        const correct = await readCorrectAnswerForRound(db, gameId, r);
        const hostYr = chooseYear(
          correct.year,
          hostWS.getLastSnapshot()!.config.yearMin,
          hostWS.getLastSnapshot()!.config.yearMax,
          'close',
        );
        await submitRelaxGuess(hostPage, { year: hostYr, mapFractionX: 0.5, mapFractionY: 0.5 });
        if (r === totalRounds - 1) {
          await hostWS.waitForState((s) => s.status === 'SESSION_COMPLETE', STATE_TIMEOUT);
        } else {
          await hostWS.waitForState(
            (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === r,
            STATE_TIMEOUT,
          );
          await hostPage.getByTestId('round-next-btn').first().click();
          await hostWS.waitForState(
            (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === r + 1,
            STATE_TIMEOUT,
          );
        }
      }

      const rankLocator = hostPage.locator('[data-testid^="session-rank-"]');
      await expect(rankLocator.first()).toBeVisible({ timeout: STATE_TIMEOUT });
      await expect(rankLocator).toHaveCount(1);
      const firstId = await rankLocator.first().getAttribute('data-testid');
      expect(firstId, 'Solo rank row should be host').toBe(`session-rank-${TEST_USERS[0].id}`);

      hostWS.close();
      expect(errors, `WS ERROR frames:\n${errors.join('\n')}`).toEqual([]);
      expect(timerClamped, 'No TIMER_CLAMPED in async').toEqual([]);
      expect(violations, `Viewer/regression violations:\n${violations.join('\n')}`).toEqual([]);

      console.log('[RELAX-GOLDEN] A10 passed');
    } finally {
      await browser.close();
      await db.end();
    }
  });
});
