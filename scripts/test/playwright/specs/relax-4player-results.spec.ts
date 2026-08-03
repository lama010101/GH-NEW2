import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_USERS, fetchAccessToken } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, type CompeteSnapshot } from '../orchestrator/websocketClient';
import { Client } from 'pg';

test.use({ video: 'on' });

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
const STATE_TIMEOUT = 180000;

const USERS = TEST_USERS.slice(0, 4);

type RoundResultRow = {
  game_id: string;
  round_index: number;
  player_id: string;
  score: number;
  rank: number | null;
  distance_km: number;
  year_diff: number;
  location_score: number;
  time_score: number;
};

// Divergent guesses so scores/awards are not all identical.
const GUESSES: Array<Array<{ year: number; lat: number; lng: number }>> = [
  [ // Player 0
    { year: 1500, lat: 10, lng: 20 },
    { year: 1600, lat: 30, lng: 70 },
    { year: 1400, lat: 5, lng: 15 },
    { year: 1550, lat: 12, lng: 18 },
    { year: 1480, lat: -10, lng: 25 },
  ],
  [ // Player 1
    { year: 1800, lat: -20, lng: 40 },
    { year: 1700, lat: -50, lng: 10 },
    { year: 1750, lat: -35, lng: 25 },
    { year: 1820, lat: -25, lng: 35 },
    { year: 1780, lat: 15, lng: -30 },
  ],
  [ // Player 2
    { year: 1900, lat: 50, lng: -10 },
    { year: 1850, lat: 0, lng: 0 },
    { year: 1920, lat: 45, lng: -45 },
    { year: 1880, lat: 33, lng: -33 },
    { year: 1910, lat: 60, lng: 5 },
  ],
  [ // Player 3
    { year: 2000, lat: -40, lng: -60 },
    { year: 1990, lat: 80, lng: -80 },
    { year: 2010, lat: -55, lng: -5 },
    { year: 1975, lat: -48, lng: -70 },
    { year: 2020, lat: -5, lng: -90 },
  ],
];

function guessFor(playerIndex: number, roundIndex: number) {
  return GUESSES[playerIndex][roundIndex];
}

function createWS(
  gameId: string,
  user: (typeof USERS)[0],
  accessToken: string,
  errors: string[],
  playerSubmittedEvents: { playerId: string; playerName: string }[],
): CompeteWSClient {
  return new CompeteWSClient({
    partyKitHost: PARTYKIT_HOST,
    gameId,
    user,
    displayName: user.displayName,
    accessToken,
    onStateUpdate: (snapshot: CompeteSnapshot) => {
      console.log(`[WS:${user.displayName}] State: ${snapshot.status} round=${snapshot.currentRoundIndex}`);
    },
    onError: (msg) => {
      console.error(`[WS:${user.displayName}] ERROR: ${msg}`);
      errors.push(`[${user.displayName}] ${msg}`);
    },
    onPlayerSubmitted: (playerId, playerName) => {
      console.log(`[WS:${user.displayName}] PLAYER_SUBMITTED: ${playerName}`);
      playerSubmittedEvents.push({ playerId, playerName });
    },
  });
}

async function waitForSection(
  page: Page,
  testid: string,
  opts?: { roundIndex?: number; status?: string; timeout?: number },
) {
  let selector = `[data-testid="${testid}"]`;
  if (opts?.roundIndex !== undefined) selector += `[data-round-index="${opts.roundIndex}"]`;
  if (opts?.status) selector += `[data-status="${opts.status}"]`;
  await page.locator(selector).first().waitFor({
    state: 'visible',
    timeout: opts?.timeout ?? STATE_TIMEOUT,
  });
}

async function sendStartPlayer(ws: CompeteWSClient) {
  (ws as any)['send']({ type: 'START_PLAYER', playerId: ws.user.id });
}

async function startPlayerIfNeeded(ws: CompeteWSClient) {
  const snap = ws.getLastSnapshot();
  if (!snap) throw new Error(`[WS:${ws.user.displayName}] no snapshot`);
  if (snap.status === 'LOBBY') {
    sendStartPlayer(ws);
    await ws.waitForState(
      (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0,
      STATE_TIMEOUT,
      true,
    );
  }
}

async function submitRound(ws: CompeteWSClient, roundIndex: number) {
  const playerIndex = USERS.findIndex((u) => u.id === ws.user.id);
  const g = guessFor(playerIndex, roundIndex);
  ws.submitGuess(roundIndex, g.year, g.lat, g.lng, []);
  await ws.waitForState(
    (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === roundIndex,
    STATE_TIMEOUT,
    true,
  );
}

async function submitFinalRound(ws: CompeteWSClient, roundIndex: number) {
  const playerIndex = USERS.findIndex((u) => u.id === ws.user.id);
  const g = guessFor(playerIndex, roundIndex);
  ws.submitGuess(roundIndex, g.year, g.lat, g.lng, []);
  await ws.waitForState(
    (s) => s.status === 'SESSION_COMPLETE',
    STATE_TIMEOUT,
    true,
  );
}

async function readyNextRound(ws: CompeteWSClient, roundIndex: number) {
  ws.readyNext(roundIndex);
  await ws.waitForState(
    (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === roundIndex + 1,
    STATE_TIMEOUT,
    true,
  );
}

async function ensureAtRoundComplete(ws: CompeteWSClient, targetRoundIndex: number) {
  while (true) {
    const snap = ws.getLastSnapshot();
    if (!snap) throw new Error(`[WS:${ws.user.displayName}] no snapshot`);
    if (snap.status === 'ROUND_COMPLETE' && snap.currentRoundIndex === targetRoundIndex) {
      return;
    }
    if (snap.status === 'SESSION_COMPLETE') {
      throw new Error(`[WS:${ws.user.displayName}] session completed before target ${targetRoundIndex}`);
    }
    if (snap.status === 'LOBBY') {
      await startPlayerIfNeeded(ws);
      continue;
    }
    if (snap.status === 'ROUND_ACTIVE') {
      const currentRound = snap.currentRoundIndex;
      if (currentRound > targetRoundIndex) {
        throw new Error(`[WS:${ws.user.displayName}] overshoot ${currentRound} > ${targetRoundIndex}`);
      }
      await submitRound(ws, currentRound);
      if (currentRound === targetRoundIndex) {
        return;
      }
      await readyNextRound(ws, currentRound);
      continue;
    }
    // Round complete but not target
    if (snap.status === 'ROUND_COMPLETE' && snap.currentRoundIndex < targetRoundIndex) {
      await readyNextRound(ws, snap.currentRoundIndex);
      continue;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function fetchRoundResults(db: Client, gameId: string): Promise<RoundResultRow[]> {
  const res = await db.query<RoundResultRow>(
    `SELECT game_id, round_index, player_id, score, rank, distance_km, year_diff, location_score, time_score
     FROM round_results
     WHERE game_id = $1
     ORDER BY round_index ASC, score DESC NULLS LAST, player_id ASC`,
    [gameId],
  );
  return res.rows;
}

async function fetchDisplayNames(db: Client, gameId: string): Promise<Map<string, string>> {
  const res = await db.query<{ player_id: string; display_name: string }>(
    `SELECT player_id, display_name
     FROM session_players
     WHERE game_id = $1
     ORDER BY joined_at ASC, player_id ASC`,
    [gameId],
  );
  const map = new Map<string, string>();
  for (const row of res.rows) {
    map.set(row.player_id, row.display_name);
  }
  return map;
}

function roundAccuracy(row: RoundResultRow) {
  return Math.round((row.location_score + row.time_score) / 2);
}

function rawAccuracy(row: RoundResultRow) {
  return (row.location_score + row.time_score) / 2;
}

function playerRows(rows: RoundResultRow[], playerId: string) {
  return rows.filter((r) => r.player_id === playerId);
}

function playerTotalScore(rows: RoundResultRow[], playerId: string) {
  return playerRows(rows, playerId).reduce((sum, r) => sum + r.score, 0);
}

function playerAvgAccuracy(rows: RoundResultRow[], playerId: string) {
  const pr = playerRows(rows, playerId);
  if (pr.length === 0) return 0;
  const sum = pr.reduce((s, r) => s + rawAccuracy(r), 0);
  return Math.round(sum / pr.length);
}

function cumulativeAccuracyToRound(rows: RoundResultRow[], playerId: string, roundIndex: number) {
  const pr = rows.filter((r) => r.player_id === playerId && r.round_index <= roundIndex);
  if (pr.length === 0) return 0;
  const sum = pr.reduce((s, r) => s + rawAccuracy(r), 0);
  return Math.round(sum / pr.length);
}

function expectedThisRoundOrder(rows: RoundResultRow[], roundIndex: number) {
  const roundRows = rows.filter((r) => r.round_index === roundIndex);
  const sorted = [...roundRows].sort((a, b) => {
    const aSub = a.score != null;
    const bSub = b.score != null;
    if (aSub !== bSub) return aSub ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.player_id.localeCompare(b.player_id);
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

function expectedAllRoundsOrder(rows: RoundResultRow[], roundIndex: number, playerIds: string[]) {
  const items = playerIds.map((pid) => ({
    playerId: pid,
    cumulativeAccuracy: cumulativeAccuracyToRound(rows, pid, roundIndex),
  }));
  items.sort((a, b) => {
    if (b.cumulativeAccuracy !== a.cumulativeAccuracy) {
      return b.cumulativeAccuracy - a.cumulativeAccuracy;
    }
    return a.playerId.localeCompare(b.playerId);
  });
  return items;
}

function expectedFinalRanking(rows: RoundResultRow[], playerIds: string[]) {
  const items = playerIds.map((pid) => ({
    playerId: pid,
    avgAccuracy: playerAvgAccuracy(rows, pid),
    totalScore: playerTotalScore(rows, pid),
  }));
  items.sort((a, b) => {
    if (b.avgAccuracy !== a.avgAccuracy) return b.avgAccuracy - a.avgAccuracy;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return playerIds.indexOf(a.playerId) - playerIds.indexOf(b.playerId);
  });
  return items;
}

function playerWonRounds(rows: RoundResultRow[], playerId: string, playerIds: string[]) {
  const rounds = [...new Set(rows.map((r) => r.round_index))].sort((a, b) => a - b);
  let won = 0;
  for (const round of rounds) {
    const roundRows = rows.filter((r) => r.round_index === round);
    const maxScore = Math.max(...roundRows.map((r) => r.score));
    if (roundRows.find((r) => r.player_id === playerId && r.score === maxScore)) {
      won += 1;
    }
  }
  return won;
}

function playerMvpStats(rows: RoundResultRow[], playerId: string) {
  const pr = playerRows(rows, playerId);
  const avgAccuracy = playerAvgAccuracy(rows, playerId);
  const avgYearAccuracy = pr.length === 0 ? 0 : Math.round(pr.reduce((s, r) => s + r.time_score, 0) / pr.length);
  const avgLocationAccuracy = pr.length === 0 ? 0 : Math.round(pr.reduce((s, r) => s + r.location_score, 0) / pr.length);
  const avgConsistency =
    pr.length === 0
      ? 0
      : Math.round(pr.reduce((s, r) => s + Math.min(r.location_score, r.time_score), 0) / pr.length);
  const totalScore = playerTotalScore(rows, playerId);
  const totalDistanceKm = pr.reduce((s, r) => s + (r.distance_km || 0), 0);
  const totalYearDiff = pr.reduce((s, r) => s + (r.year_diff || 0), 0);
  return { avgAccuracy, avgYearAccuracy, avgLocationAccuracy, avgConsistency, totalScore, totalDistanceKm, totalYearDiff };
}

type AwardResult = { categoryLabel: string; playerIds: string[] };

function expectedMvpAwards(rows: RoundResultRow[], playerIds: string[]): AwardResult[] {
  const categories = [
    { key: 'overall', label: 'Most Accurate', getter: (s: ReturnType<typeof playerMvpStats>) => s.avgAccuracy },
    { key: 'year', label: 'Best Year Guesser', getter: (s: ReturnType<typeof playerMvpStats>) => s.avgYearAccuracy },
    { key: 'location', label: 'Best Location Guesser', getter: (s: ReturnType<typeof playerMvpStats>) => s.avgLocationAccuracy },
    { key: 'consistency', label: 'Most Consistent', getter: (s: ReturnType<typeof playerMvpStats>) => s.avgConsistency },
  ];
  const stats = playerIds.map((pid) => ({ pid, ...playerMvpStats(rows, pid) }));
  return categories.map((cat) => {
    const sorted = [...stats].sort((a, b) => {
      const aVal = cat.getter(a as any);
      const bVal = cat.getter(b as any);
      if (bVal !== aVal) return bVal - aVal;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (a.totalDistanceKm !== b.totalDistanceKm) return a.totalDistanceKm - b.totalDistanceKm;
      if (a.totalYearDiff !== b.totalYearDiff) return a.totalYearDiff - b.totalYearDiff;
      return 0;
    });
    const first = sorted[0];
    const winners = sorted.filter(
      (p) =>
        cat.getter(p as any) === cat.getter(first as any) &&
        p.totalScore === first.totalScore &&
        p.totalDistanceKm === first.totalDistanceKm &&
        p.totalYearDiff === first.totalYearDiff,
    );
    return { categoryLabel: cat.label, playerIds: winners.map((w) => w.pid) };
  });
}

function expectedBestPlayerPerRound(rows: RoundResultRow[], playerIds: string[]) {
  const rounds = [...new Set(rows.map((r) => r.round_index))].sort((a, b) => a - b);
  const result: Record<number, string> = {};
  for (const round of rounds) {
    const roundRows = rows.filter((r) => r.round_index === round);
    // Snapshot playerRoundResults are built in joined_at order (activePlayerRows).
    // Use the same playerIds order for reduce tiebreak.
    const ordered = playerIds
      .map((pid) => roundRows.find((r) => r.player_id === pid))
      .filter((r): r is RoundResultRow => !!r);
    const best = ordered.reduce((bestSoFar, r) => (r.score > bestSoFar.score ? r : bestSoFar), ordered[0]);
    result[round] = best.player_id;
  }
  return result;
}

async function screenshot(page: Page, outputDir: string, name: string, testInfo: any) {
  fs.mkdirSync(outputDir, { recursive: true });
  const p = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  await testInfo.attach(name, { path: p });
  return p;
}

function textContentMatchesRankAndAccuracy(
  rowText: string,
  expectedName: string,
  expectedRank: string,
  expectedPill: string,
) {
  const hasName = rowText.includes(expectedName);
  const hasRank = rowText.includes(expectedRank);
  const hasPill = rowText.includes(expectedPill);
  return { hasName, hasRank, hasPill, ok: hasName && hasRank && hasPill };
}

function mvpLabelForCategory(key: string) {
  const map: Record<string, string> = {
    overall: 'Most Accurate',
    year: 'Best Year Guesser',
    location: 'Best Location Guesser',
    consistency: 'Most Consistent',
  };
  return map[key];
}

test('Relax 4-player results: avatars, ranking, MVP and best-player awards', async ({}, testInfo) => {
  test.setTimeout(600000);
  expect(DB_URL, 'SUPABASE_DB_CONNECTION must be set').not.toBe('');

  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const browser = await chromium.launch({ headless: true });
  const outputDir = path.join(testInfo.outputDir, 'screenshots');
  const videoDir = path.join(testInfo.outputDir, 'videos');
  fs.mkdirSync(videoDir, { recursive: true });

  try {
    const contexts = await Promise.all(
      [0, 1, 2, 3].map(() => browser.newContext({ ...DESKTOP_PRESET, recordVideo: { dir: videoDir } })),
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

    await Promise.all(
      pages.map((p) =>
        p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ),
    );
    await Promise.all(pages.map((p, i) => ensureLoggedIn(p, USERS[i])));

    const createRes = await pages[0].request.post(`${BASE_URL}/api/compete/create`, {
      data: {
        displayName: USERS[0].displayName,
        playerId: USERS[0].id,
        mode: 'async',
        totalRounds: 4,
        roundTimerSec: 0,
        resultsAutoAdvanceSec: 0,
      },
      timeout: NAV_TIMEOUT,
    });
    expect(createRes.ok(), `Create game failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
    const sessionData = await createRes.json();
    const gameId: string = sessionData.gameId || sessionData.id;
    expect(gameId, 'Create game returned no gameId').toBeTruthy();

    // Relax currently forces MAX_ROUNDS (5) in createCompeteSession. Use whatever the server returns.
    const totalRounds: number = sessionData.config?.totalRounds ?? 4;
    console.log(`[RELAX-4P] game=${gameId} totalRounds=${totalRounds}`);

    await Promise.all(
      pages.map((p) =>
        p.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ),
    );
    await Promise.all(pages.map((p) => waitForSection(p, 'lobby-shell')));

    const tokens = await Promise.all(USERS.map((u) => fetchAccessToken(u)));
    const errors: string[] = [];
    const submittedEvents: { playerId: string; playerName: string }[] = [];
    const wss = USERS.map((u, i) => createWS(gameId, u, tokens[i], errors, submittedEvents));
    await Promise.all(wss.map((ws) => ws.connect()));
    await Promise.all(
      wss.map((ws) =>
        ws.waitForState((s) => s.status === 'LOBBY' && s.players.length === 4, STATE_TIMEOUT),
      ),
    );

    // ── A1: staggered start; P0 gets ahead and sees the others waiting ──
    await pages[0].getByTestId('lobby-ready-btn').first().click();
    await wss[0].waitForState(
      (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0,
      STATE_TIMEOUT,
      true,
    );
    await waitForSection(pages[0], 'round-active-section', { roundIndex: 0 });

    await submitRound(wss[0], 0);
    await readyNextRound(wss[0], 0);
    await waitForSection(pages[0], 'round-active-section', { roundIndex: 1 });

    // All other players are still not on round 1, so P0 should see "Waiting for" for each.
    await expect(pages[0].locator('text=Waiting for')).toHaveCount(3, { timeout: 10000 });
    await screenshot(pages[0], outputDir, 'A1-p0-round1-waiting-for', testInfo);

    // ── A2: get all players to ROUND_COMPLETE at a common round (leaderboard check) ──
    const leaderboardRoundIndex = Math.max(0, totalRounds - 3); // round 2 when totalRounds=5, round 1 when totalRounds=4
    for (const ws of wss) {
      await ensureAtRoundComplete(ws, leaderboardRoundIndex);
    }
    await waitForSection(
      pages[0],
      'round-complete-section',
      { roundIndex: leaderboardRoundIndex },
    );

    // Wait a moment for the snapshot to hydrate the round-complete DOM.
    await pages[0].waitForTimeout(500);

    const midRows = await fetchRoundResults(db, gameId);
    const displayNames = await fetchDisplayNames(db, gameId);
    const playerIds = [...displayNames.keys()];

    // This Round tab (default)
    const thisRoundExpected = expectedThisRoundOrder(midRows, leaderboardRoundIndex);
    const thisRoundRows = pages[0].locator('[data-testid="round-complete-section"] [class*="leaderboardCard"] [class*="lbRow"]');
    await expect(thisRoundRows).toHaveCount(4, { timeout: 10000 });
    for (let i = 0; i < 4; i++) {
      const expected = thisRoundExpected[i];
      const expectedName = displayNames.get(expected.player_id)!;
      const expectedPill = `${roundAccuracy(expected)}%`;
      const text = await thisRoundRows.nth(i).textContent();
      const check = textContentMatchesRankAndAccuracy(text || '', expectedName, `${i + 1}`, expectedPill);
      expect(check.ok, `This Round row ${i + 1}: text="${text}" name=${expectedName} pill=${expectedPill}`).toBe(true);
    }
    await screenshot(pages[0], outputDir, 'A2-round-leaderboard-this-round', testInfo);

    // All Rounds tab
    const allRoundsTab = pages[0].locator('[data-testid="round-complete-section"] [class*="leaderboardTabs"] button').filter({ hasText: /All Rounds/i }).first();
    await allRoundsTab.click();
    await pages[0].waitForTimeout(500);
    const allRoundsExpected = expectedAllRoundsOrder(midRows, leaderboardRoundIndex, playerIds);
    const allRoundsRows = pages[0].locator('[data-testid="round-complete-section"] [class*="leaderboardCard"] [class*="lbRow"]');
    await expect(allRoundsRows).toHaveCount(4, { timeout: 10000 });
    for (let i = 0; i < 4; i++) {
      const expectedPid = allRoundsExpected[i].playerId;
      const expectedName = displayNames.get(expectedPid)!;
      const expectedPill = `${allRoundsExpected[i].cumulativeAccuracy}%`;
      const text = await allRoundsRows.nth(i).textContent();
      const check = textContentMatchesRankAndAccuracy(text || '', expectedName, `${i + 1}`, expectedPill);
      expect(check.ok, `All Rounds row ${i + 1}: text="${text}" name=${expectedName} pill=${expectedPill}`).toBe(true);
    }
    await screenshot(pages[0], outputDir, 'A2-round-leaderboard-all-rounds', testInfo);

    // ── A3: final-round avatar status with Guessed + Waiting for simultaneously ──
    const finalRoundIndex = totalRounds - 1;
    const preFinalRoundIndex = finalRoundIndex - 1;

    for (const ws of wss) {
      await ensureAtRoundComplete(ws, preFinalRoundIndex);
    }

    // Advance all four into the final round active state.
    for (const ws of wss) {
      ws.readyNext(preFinalRoundIndex);
      await ws.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === finalRoundIndex,
        STATE_TIMEOUT,
        true,
      );
    }

    // P0 and P1 submit their final guesses and finish.
    await submitFinalRound(wss[0], finalRoundIndex);
    await submitFinalRound(wss[1], finalRoundIndex);

    // P3 page is on the final round. It should see P0/P1 as "Guessed" and P2 as "Waiting for".
    const p3Page = pages[3];
    await waitForSection(p3Page, 'round-active-section', { roundIndex: finalRoundIndex });
    await expect
      .poll(() => p3Page.locator('text=Guessed').count(), { timeout: 30000 })
      .toBe(2);
    await expect(p3Page.locator('text=Waiting for').first()).toBeVisible();
    await screenshot(p3Page, outputDir, 'A3-final-round-guessed-and-waiting', testInfo);

    // P2 and P3 finish the session.
    await submitFinalRound(wss[2], finalRoundIndex);
    await submitFinalRound(wss[3], finalRoundIndex);

    // ── A4: SessionComplete final ranking, MVP awards, best player per round ──
    await pages[0].goto(`${BASE_URL}/compete/${gameId}`, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    });
    await waitForSection(pages[0], 'session-complete-section', { timeout: STATE_TIMEOUT });
    await pages[0].waitForTimeout(1000);

    const finalRows = await fetchRoundResults(db, gameId);

    // Final ranking
    const finalRanking = expectedFinalRanking(finalRows, playerIds);
    const rankRows = pages[0].locator('[data-testid="session-rank-row"]');
    await expect(rankRows).toHaveCount(4, { timeout: 10000 });
    for (let i = 0; i < 4; i++) {
      const expectedPid = finalRanking[i].playerId;
      const expectedName = displayNames.get(expectedPid)!;
      const expectedWins = playerWonRounds(finalRows, expectedPid, playerIds);
      const row = rankRows.nth(i);
      const text = await row.textContent();
      expect(text).toContain(expectedName);
      if (expectedPid === USERS[0].id) {
        expect(text).toContain('(you)');
      }
      // Medal number should be i+1
      const medalSpan = row.locator('span').first();
      await expect(medalSpan).toHaveText(`${i + 1}`);
      if (expectedWins > 0) {
        expect(text).toContain(`🏆 ${expectedWins}`);
      }
    }
    await screenshot(pages[0], outputDir, 'A4-session-complete-final-ranking', testInfo);

    // MVP awards
    const mvpAwards = expectedMvpAwards(finalRows, playerIds);
    for (const award of mvpAwards) {
      const mvpRow = pages[0].locator('[class*="mvpRow"]').filter({ hasText: new RegExp(award.categoryLabel, 'i') }).first();
      await expect(mvpRow).toBeVisible({ timeout: 10000 });
      const rowText = await mvpRow.textContent();
      for (const winnerId of award.playerIds) {
        const expectedText = winnerId === USERS[0].id ? 'You' : displayNames.get(winnerId)!;
        expect(rowText).toContain(expectedText);
      }
    }
    await screenshot(pages[0], outputDir, 'A4-session-complete-mvp-awards', testInfo);

    // Round breakdown - best player per round
    const bestPlayers = expectedBestPlayerPerRound(finalRows, playerIds);
    const roundItems = pages[0].locator('[class*="roundItem"]');
    await expect(roundItems).toHaveCount(totalRounds, { timeout: 10000 });

    for (let round = 0; round < totalRounds; round++) {
      const roundItem = roundItems.nth(round);
      // Expand the round if not already open (avoid toggling open rounds).
      const cls = await roundItem.getAttribute('class') || '';
      const isOpen = cls.includes('roundItemOpen');
      if (!isOpen) {
        await roundItem.locator('[class*="roundTop"]').click().catch(() => undefined);
        await pages[0].waitForTimeout(200);
      }
      const bestRow = roundItem.locator('[class*="bestRow"]').first();
      await expect(bestRow).toBeVisible({ timeout: 10000 });
      const bestText = await bestRow.textContent();
      const expectedWinnerId = bestPlayers[round];
      const expectedName = displayNames.get(expectedWinnerId)!;
      expect(bestText).toContain(expectedName);
      if (expectedWinnerId === USERS[0].id) {
        expect(bestText).toContain('(you)');
      }
    }
    await screenshot(pages[0], outputDir, 'A4-session-complete-round-breakdown', testInfo);

    if (errors.length > 0) {
      expect(errors, `WS errors during test: ${errors.join('; ')}`).toEqual([]);
    }
  } finally {
    await db.end();
    await browser.close();
    for (const file of fs.readdirSync(videoDir).filter((n) => n.endsWith('.webm'))) {
      await testInfo.attach(`video-${file}`, { path: path.join(videoDir, file) }).catch(() => undefined);
    }
  }
});
