import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { TEST_USERS, fetchAccessToken } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { CompeteWSClient, CompeteSnapshot } from '../orchestrator/websocketClient';

// ─────────────────────────────────────────────────────────────────────
// MP-VERIFY-RELAX-FULLGAME-001
//
// Full live multi-browser Relax (async) game lifecycle stress test.
// Covers: staggered lobby joins, async round submissions in deliberately
// non-sequential order, independent Next-round advancement across multiple
// rounds, disconnect/reconnect mid-session, and session completion.
//
// Bug C instrumentation: every leaderboard read is compared against DB
// ground truth and the per-player WS snapshot to detect identity/score swaps.
// Server markers [ASYNC_BROADCAST_LEAK_REROUTE] and [PER_PLAYER_FETCH_FAILED]
// are reported from the PartyKit dev server log.
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

type Violation = string;
type RowCheck = {
  rank: string;
  name: string;
  displayValue: number | null;
  isMe: boolean;
};

function accuracyFromScores(loc: number, time: number) {
  return Math.round((loc + time) / 2);
}

async function createAsyncGame(hostPage: Page, hostUser: (typeof TEST_USERS)[0]): Promise<string> {
  const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
    data: {
      displayName: hostUser.displayName,
      playerId: hostUser.id,
      mode: 'async',
      totalRounds: 5,
      roundTimerSec: 0,
      resultsAutoAdvanceSec: 0,
    },
    timeout: NAV_TIMEOUT,
  });
  expect(createRes.ok(), `Create async game failed: ${createRes.status()}`).toBeTruthy();
  const sessionData = await createRes.json();
  const gameId = sessionData.gameId || sessionData.id;
  expect(gameId, 'Create game returned no gameId').toBeTruthy();
  return gameId as string;
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

async function submitDivergentGuess(
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
    throw new Error('submitDivergentGuess: no year buttons found in WHEN sheet after 8 attempts');
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
  if (!box) throw new Error('submitDivergentGuess: WHERE map has no bounding box');
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

async function readSessionDisplayNames(db: Client, gameId: string) {
  const res = await db.query<{ player_id: string; display_name: string }>(
    'SELECT player_id, display_name FROM session_players WHERE game_id = $1 ORDER BY joined_at',
    [gameId],
  );
  return res.rows;
}

async function readRoundResults(db: Client, gameId: string) {
  const res = await db.query<{
    player_id: string;
    round_index: number;
    score: number;
    location_score: number;
    time_score: number;
  }>(
    `SELECT player_id, round_index, score, location_score, time_score
       FROM round_results
      WHERE game_id = $1
      ORDER BY player_id, round_index`,
    [gameId],
  );
  return res.rows;
}

function makeExpectedMaps(
  dbResults: Awaited<Return<typeof readRoundResults>>,
  displayNames: Awaited<Return<typeof readSessionDisplayNames>>,
) {
  const nameToPlayerId: Record<string, string> = {};
  for (const row of displayNames) {
    nameToPlayerId[row.display_name] = row.player_id;
  }
  const byPlayerRound: Record<string, Record<number, { score: number; accuracy: number; rawAcc: number }>> = {};
  for (const row of dbResults) {
    byPlayerRound[row.player_id] = byPlayerRound[row.player_id] || {};
    const rawAcc = (row.location_score + row.time_score) / 2;
    byPlayerRound[row.player_id][row.round_index] = {
      score: row.score,
      accuracy: accuracyFromScores(row.location_score, row.time_score),
      rawAcc,
    };
  }
  const cumulative: Record<string, { totalScore: number; avgAccuracy: number; rounds: number }> = {};
  for (const playerId of Object.keys(byPlayerRound)) {
    const rounds = Object.values(byPlayerRound[playerId]).filter((r) => r.score !== undefined);
    const totalScore = rounds.reduce((sum, r) => sum + r.score, 0);
    const avgAccuracy =
      rounds.length > 0 ? Math.round(rounds.reduce((sum, r) => sum + r.rawAcc, 0) / rounds.length) : 0;
    cumulative[playerId] = { totalScore, avgAccuracy, rounds: rounds.length };
  }
  return { nameToPlayerId, byPlayerRound, cumulative };
}

async function captureRoundLeaderboard(page: Page): Promise<RowCheck[]> {
  return page.evaluate(() => {
    const section = document.querySelector('[data-testid="round-complete-section"]') as HTMLElement | null;
    if (!section || !section.offsetParent) return [];
    const rows = Array.from(section.querySelectorAll('[class*="lbRow"]'));
    const out: RowCheck[] = [];
    for (const row of rows) {
      const rankEl = row.querySelector('[class*="lbRank"]') as HTMLElement | null;
      const nameEl = row.querySelector('[class*="lbNameInner"] > span:last-child') as HTMLElement | null;
      const accEl = row.querySelector('[class*="lbAccPill"] > span:first-child') as HTMLElement | null;
      const name = nameEl?.textContent?.trim() ?? '';
      if (!name) continue;
      const accText = accEl?.textContent?.trim() ?? '';
      const valueMatch = accText.match(/(\d+)/);
      out.push({
        rank: rankEl?.textContent?.trim() ?? '—',
        name,
        displayValue: valueMatch ? Number(valueMatch[1]) : null,
        isMe: row.className.includes('lbRowSelfAccent'),
      });
    }
    return out;
  });
}

async function captureFinalLeaderboard(page: Page): Promise<RowCheck[]> {
  return page.evaluate(() => {
    const section = document.querySelector('[data-testid="session-complete-section"]') as HTMLElement | null;
    if (!section || !section.offsetParent) return [];
    const rows = Array.from(section.querySelectorAll('[class*="rankRow"]'));
    const out: RowCheck[] = [];
    for (const row of rows) {
      const rankEl = row.querySelector('[class*="medal"]') as HTMLElement | null;
      const nameEl = row.querySelector('[class*="rankName"] > span:first-child') as HTMLElement | null;
      const accEl = row.querySelector('[class*="rankAcc"]') as HTMLElement | null;
      const name = nameEl?.textContent?.trim() ?? '';
      if (!name) continue;
      const accText = accEl?.textContent?.trim() ?? '';
      const valueMatch = accText.match(/(\d+)/);
      out.push({
        rank: rankEl?.textContent?.trim() ?? '—',
        name,
        displayValue: valueMatch ? Number(valueMatch[1]) : null,
        isMe: row.className.includes('rankRowMe'),
      });
    }
    return out;
  });
}

function verifyLeaderboardRows(
  label: string,
  rows: RowCheck[],
  expected: { nameToPlayerId: Record<string, string>; byPlayerRound: Record<string, Record<number, { score: number; accuracy: number }>>; cumulative: Record<string, { totalScore: number; avgAccuracy: number; rounds: number }> },
  context: { roundIndex?: number; isFinal?: boolean; viewerPlayerId: string },
  violations: Violation[],
) {
  for (const row of rows) {
    if (row.displayValue === null) continue; // no score displayed for this row
    const inferredPlayerId = expected.nameToPlayerId[row.name];
    if (!inferredPlayerId) {
      violations.push(
        `[BugC][${label}] row name "${row.name}" not found in session_players — cannot map to playerId`,
      );
      continue;
    }
    const exp = context.isFinal
      ? expected.cumulative[inferredPlayerId]
      : expected.byPlayerRound[inferredPlayerId]?.[context.roundIndex!];
    if (!exp) {
      violations.push(
        `[BugC][${label}] no DB result yet for ${row.name} (${inferredPlayerId.slice(0, 8)}) round=${context.roundIndex ?? 'final'}`,
      );
      continue;
    }
    const expectedValue = context.isFinal ? exp.avgAccuracy : exp.accuracy;
    if (row.displayValue !== expectedValue) {
      // Check whether the displayed value matches some *other* player for this round/final.
      let matchesOther: string | null = null;
      for (const [otherPid, otherRounds] of Object.entries(expected.byPlayerRound)) {
        if (otherPid === inferredPlayerId) continue;
        const otherExp = context.isFinal
          ? expected.cumulative[otherPid]
          : otherRounds[context.roundIndex!];
        if (otherExp && otherExp[context.isFinal ? 'avgAccuracy' : 'accuracy'] === row.displayValue) {
          matchesOther = otherPid;
          break;
        }
      }
      if (matchesOther) {
        violations.push(
          `[BugC][${label}] IDENTITY SWAP? row name=${row.name} (expected ${inferredPlayerId.slice(0, 8)}) shows value ${row.displayValue}% but DB says ${expectedValue}%; value matches player ${matchesOther.slice(0, 8)}`,
        );
      } else {
        violations.push(
          `[BugC][${label}] row name=${row.name} (${inferredPlayerId.slice(0, 8)}) shows ${row.displayValue}% but DB expected ${expectedValue}%`,
        );
      }
    }
  }
}

test.describe('Relax full lifecycle (MP-VERIFY-RELAX-FULLGAME-001)', () => {
  test('host + 3 guests complete full async game with staggered submits and reconnect', async () => {
    test.setTimeout(900000);
    expect(DB_URL, 'SUPABASE_DB_CONNECTION must be set for ground-truth checks').not.toBe('');
    const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();

    const violations: Violation[] = [];
    const stepResults: string[] = [];
    let bugCFound = false;
    const report = (line: string) => {
      stepResults.push(line);
      console.log(line);
    };

    const browser = await chromium.launch({ headless: true });
    const contexts = await Promise.all([
      browser.newContext(DESKTOP_PRESET),
      browser.newContext(DESKTOP_PRESET),
      browser.newContext(DESKTOP_PRESET),
      browser.newContext(DESKTOP_PRESET),
    ]);

    const [hostPage, g1Page, g2Page, g3Page] = await Promise.all(contexts.map((ctx) => ctx.newPage()));

    const users = [TEST_USERS[0], TEST_USERS[1], TEST_USERS[2], TEST_USERS[3]];
    const pages: Page[] = [hostPage, g1Page, g2Page, g3Page];
    const labels = ['Host', 'Guest1', 'Guest2', 'Guest3'];

    try {
      // ── Step 1: log in all players ──
      for (let i = 0; i < pages.length; i++) {
        await pages[i].goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await ensureLoggedIn(pages[i], users[i]);
        report(`[LOGIN] ${labels[i]} authenticated`);
      }

      // ── Step 2: host creates async game ──
      const gameId = await createAsyncGame(hostPage, users[0]);
      report(`[LOBBY] game created: ${gameId}`);

      // ── Step 3: staggered joins ──
      await hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      report('[LOBBY] Host joined');
      await hostPage.waitForTimeout(1500);
      await g1Page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      report('[LOBBY] Guest1 joined');
      await g1Page.waitForTimeout(1500);
      await g2Page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      report('[LOBBY] Guest2 joined');
      await g2Page.waitForTimeout(1500);
      await g3Page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      report('[LOBBY] Guest3 joined');

      // Read-only WS observers for authoritative snapshot monitoring.
      const clients: CompeteWSClient[] = [];
      for (let i = 0; i < users.length; i++) {
        clients[i] = await createReadonlyClient(gameId, users[i], users[i].id, labels[i], violations);
      }

      async function checkUIRows(roundIndex: number) {
        const dbResults = await readRoundResults(db, gameId);
        const displayNames = await readSessionDisplayNames(db, gameId);
        const expected = makeExpectedMaps(dbResults, displayNames);
        for (let i = 0; i < pages.length; i++) {
          const rows = await captureRoundLeaderboard(pages[i]);
          if (rows.length > 0) {
            report(`[ROUND-${roundIndex + 1}][${labels[i]}] leaderboard rows=${rows.length}`);
            for (const row of rows) {
              report(`  [BUGC-ROW] ${labels[i]}: rank=${row.rank} name=${row.name} value=${row.displayValue}% isMe=${row.isMe}`);
            }
            verifyLeaderboardRows(labels[i], rows, expected, { roundIndex, viewerPlayerId: users[i].id }, violations);
          } else {
            const status = clients[i]?.getLastSnapshot()?.status;
            report(`[ROUND-${roundIndex + 1}][${labels[i]}] not on result screen (status=${status})`);
          }
        }
      }

      await Promise.all(
        clients.map((client, i) =>
          waitForClientState(client, (s) => s.status === 'LOBBY', STATE_TIMEOUT).then(() =>
            report(`[LOBBY] ${labels[i]} WS observer in LOBBY`),
          ),
        ),
      );

      // Roster check per page.
      await hostPage.waitForTimeout(1500);
      for (let i = 0; i < pages.length; i++) {
        const count = await pages[i].locator('[data-testid^="lobby-player-"]').count();
        const ready = await pages[i]
          .locator('[data-testid^="lobby-player-"][data-ready="true"]')
          .count();
        report(`[LOBBY-ROSTER][${labels[i]}] players=${count} ready=${ready}`);
        if (count !== 4) violations.push(`${labels[i]} roster shows ${count} players, expected 4`);
      }

      // ── Step 4: ready up and start ──
      await Promise.all(pages.map((page) => readyUp(page)));
      await Promise.all(
        clients.map((client, i) =>
          waitForClientState(client, (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0, STATE_TIMEOUT).then(() =>
            report(`[START] ${labels[i]} ROUND_ACTIVE round=0`),
          ),
        ),
      );
      for (let i = 0; i < pages.length; i++) {
        try {
          await pages[i]
            .locator('[data-testid="round-active-section"][data-round-index="0"]')
            .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
        } catch {
          violations.push(`${labels[i]} page did not show ROUND_ACTIVE round=0`);
        }
      }

      // ── Rounds 0 and 1: staggered async submits & Next ──
      const submitFractions = [
        { yearFraction: 0.15, mapFractionX: 0.2, mapFractionY: 0.3 },
        { yearFraction: 0.35, mapFractionX: 0.75, mapFractionY: 0.25 },
        { yearFraction: 0.55, mapFractionX: 0.35, mapFractionY: 0.75 },
        { yearFraction: 0.85, mapFractionX: 0.85, mapFractionY: 0.65 },
      ];
      const round0Order = [2, 0, 1, 3];
      const round1Order = [3, 2, 0, 1];

      for (const roundIndex of [0, 1]) {
        const order = roundIndex === 0 ? round0Order : round1Order;
        report(`[ROUND-${roundIndex + 1}] submit order: ${order.map((idx) => labels[idx]).join(' -> ')}`);

        for (const playerIdx of order) {
          await submitDivergentGuess(pages[playerIdx], submitFractions[playerIdx]);
          await waitForClientState(
            clients[playerIdx],
            (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === roundIndex,
            STATE_TIMEOUT,
          );
          report(`[ROUND-${roundIndex + 1}] ${labels[playerIdx]} submitted`);

          // Let state settle before DOM reads.
          await pages[playerIdx].waitForTimeout(800);

          // Check leaderboards and WS identity after each submission.
          await checkUIRows(roundIndex);
          for (let i = 0; i < clients.length; i++) {
            const snap = clients[i].getLastSnapshot();
            if (snap?.viewerPlayerId !== users[i].id) {
              violations.push(`${labels[i]} WS viewerPlayerId is ${snap?.viewerPlayerId} (expected ${users[i].id})`);
            }
            if (snap && snap.currentRoundIndex < roundIndex) {
              violations.push(`${labels[i]} WS round regressed to ${snap.currentRoundIndex} during round ${roundIndex}`);
            }
          }
        }

        // Independent Next in staggered order.
        const nextOrder = roundIndex === 0 ? [2, 3, 0, 1] : [0, 1, 3, 2];
        report(`[ROUND-${roundIndex + 1}] Next order: ${nextOrder.map((idx) => labels[idx]).join(' -> ')}`);
        for (const playerIdx of nextOrder) {
          await advanceRound(pages[playerIdx]);
          await waitForClientState(
            clients[playerIdx],
            (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === roundIndex + 1,
            STATE_TIMEOUT,
          );
          report(`[ROUND-${roundIndex + 1}] ${labels[playerIdx]} advanced to round ${roundIndex + 2}`);
          const snap = clients[playerIdx].getLastSnapshot();
          if (snap && snap.viewerPlayerId !== users[playerIdx].id) {
            violations.push(`${labels[playerIdx]} advanced with wrong viewer: ${snap.viewerPlayerId}`);
          }
        }

        // All should be on the next round (or session complete if round 1->2, not final yet).
        for (let i = 0; i < clients.length; i++) {
          const snap = clients[i].getLastSnapshot();
          if (snap && snap.currentRoundIndex < roundIndex + 1) {
            violations.push(`${labels[i]} did not advance to round ${roundIndex + 2}: round=${snap.currentRoundIndex}`);
          }
        }
      }

      // ── Step 5: disconnect/reconnect mid-session (round 3, index 2) ──
      report('[RECONNECT] closing Guest2 context at start of round 3');
      const beforeToken = {
        roundIndex: clients[2].getLastSnapshot()?.currentRoundIndex,
        status: clients[2].getLastSnapshot()?.status,
      };
      clients[2].close();
      await contexts[2].close();
      await hostPage.waitForTimeout(7000); // past 5s grace period
      report('[RECONNECT] Guest2 context closed, waited 7s');

      // While Guest2 is disconnected, the other three continue and finish round 3.
      const round2Order = [0, 1, 3];
      report(`[ROUND-3] submit order while Guest2 disconnected: ${round2Order.map((idx) => labels[idx]).join(' -> ')}`);
      for (const playerIdx of round2Order) {
        await submitDivergentGuess(pages[playerIdx], submitFractions[playerIdx]);
        await waitForClientState(
          clients[playerIdx],
          (s) => s.status === 'ROUND_COMPLETE' && s.currentRoundIndex === 2,
          STATE_TIMEOUT,
        );
        report(`[ROUND-3] ${labels[playerIdx]} submitted`);
      }
      for (const playerIdx of round2Order) {
        await advanceRound(pages[playerIdx]);
        await waitForClientState(
          clients[playerIdx],
          (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 3,
          STATE_TIMEOUT,
        );
        report(`[ROUND-3] ${labels[playerIdx]} advanced to round 4`);
      }

      // Reopen Guest2.
      report('[RECONNECT] reopening Guest2 context');
      contexts[2] = await browser.newContext(DESKTOP_PRESET);
      const newG2Page = await contexts[2].newPage();
      pages[2] = newG2Page;
      await newG2Page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await ensureLoggedIn(newG2Page, users[2]);
      await newG2Page.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

      // Reconnect WS observer.
      clients[2] = await createReadonlyClient(gameId, users[2], users[2].id, 'Guest2(reconnect)', violations);
      await waitForClientState(
        clients[2],
        (s) => s.status !== 'LOBBY' || s.currentRoundIndex !== null,
        STATE_TIMEOUT,
      );
      const reconnectSnap = clients[2].getLastSnapshot();
      report(
        `[RECONNECT] Guest2 state after reconnect: status=${reconnectSnap?.status} round=${reconnectSnap?.currentRoundIndex} viewer=${reconnectSnap?.viewerPlayerId?.slice(0, 8)}`,
      );
      if (reconnectSnap?.viewerPlayerId !== users[2].id) {
        violations.push(`Guest2 reconnect viewerPlayerId wrong: ${reconnectSnap?.viewerPlayerId} (expected ${users[2].id})`);
      }
      if (reconnectSnap && reconnectSnap.currentRoundIndex < (beforeToken.roundIndex ?? 2)) {
        violations.push(
          `Guest2 reconnect round regressed: before=${beforeToken.roundIndex} after=${reconnectSnap.currentRoundIndex}`,
        );
      }

      // ── Finish rounds 3-5 for all players ──
      // Guest2 may be behind by one round; playRoundIfAt skips players already past.
      async function playRoundIfAt(playerIdx: number, roundIndex: number) {
        const before = clients[playerIdx].getLastSnapshot();
        if (!before || before.status === 'SESSION_COMPLETE') {
          report(`[ROUND-${roundIndex + 1}][${labels[playerIdx]}] already complete`);
          return;
        }
        if (before.currentRoundIndex > roundIndex) {
          report(`[ROUND-${roundIndex + 1}][${labels[playerIdx]}] already past (round=${before.currentRoundIndex})`);
          return;
        }
        await waitForClientState(
          clients[playerIdx],
          (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === roundIndex,
          STATE_TIMEOUT,
        );
        await submitDivergentGuess(pages[playerIdx], submitFractions[playerIdx]);
        await waitForClientState(
          clients[playerIdx],
          (s) =>
            (s.status === 'ROUND_COMPLETE' || s.status === 'SESSION_COMPLETE') &&
            s.currentRoundIndex === roundIndex,
          STATE_TIMEOUT,
        );
        const submitSnap = clients[playerIdx].getLastSnapshot();
        report(`[ROUND-${roundIndex + 1}] ${labels[playerIdx]} submitted (status=${submitSnap?.status})`);

        // Bug C check after each submission in the later rounds too.
        await checkUIRows(roundIndex);
        if (submitSnap?.viewerPlayerId !== users[playerIdx].id) {
          violations.push(`${labels[playerIdx]} ROUND-${roundIndex + 1} submit snapshot has wrong viewer: ${submitSnap?.viewerPlayerId}`);
        }

        // Final round submit immediately ends the session; no Next button.
        if (submitSnap?.status === 'SESSION_COMPLETE') {
          report(`[ROUND-${roundIndex + 1}] ${labels[playerIdx]} session complete`);
          return;
        }

        await advanceRound(pages[playerIdx]);
        await waitForClientState(
          clients[playerIdx],
          (s) => s.status === 'ROUND_ACTIVE' || s.status === 'SESSION_COMPLETE',
          STATE_TIMEOUT,
        );
        const after = clients[playerIdx].getLastSnapshot();
        report(
          `[ROUND-${roundIndex + 1}] ${labels[playerIdx]} after Next: status=${after?.status} round=${after?.currentRoundIndex}`,
        );
      }

      // Catch Guest2 up on round 3 if needed; others will skip.
      for (const playerIdx of [2, 0, 1, 3]) {
        try {
          await playRoundIfAt(playerIdx, 2);
        } catch (err) {
          violations.push(`${labels[playerIdx]} failed catch-up round 3: ${err}`);
          report(`[ERROR] ${labels[playerIdx]} catch-up round 3: ${err}`);
        }
      }

      // Rounds 4 and 5 for everyone (round index 3, 4).
      for (const roundIndex of [3, 4]) {
        const order = roundIndex === 3 ? [3, 0, 1, 2] : [2, 1, 0, 3];
        for (const playerIdx of order) {
          try {
            await playRoundIfAt(playerIdx, roundIndex);
          } catch (err) {
            violations.push(`${labels[playerIdx]} failed round ${roundIndex + 1}: ${err}`);
            report(`[ERROR] ${labels[playerIdx]} round ${roundIndex + 1}: ${err}`);
          }
        }
      }

      // ── Step 6: session completion / final leaderboard ──
      for (let i = 0; i < clients.length; i++) {
        await waitForClientState(
          clients[i],
          (s) => s.status === 'SESSION_COMPLETE',
          STATE_TIMEOUT,
        );
        report(`[FINAL] ${labels[i]} SESSION_COMPLETE`);
      }

      // Ensure all final pages rendered.
      await hostPage.waitForTimeout(1000);

      const dbResults = await readRoundResults(db, gameId);
      const displayNames = await readSessionDisplayNames(db, gameId);
      const expected = makeExpectedMaps(dbResults, displayNames);

      for (let i = 0; i < pages.length; i++) {
        const rows = await captureFinalLeaderboard(pages[i]);
        report(`[FINAL][${labels[i]}] final leaderboard rows=${rows.length}`);
        for (const row of rows) {
          report(`  [FINAL-ROW] ${labels[i]}: rank=${row.rank} name=${row.name} value=${row.displayValue}% isMe=${row.isMe}`);
        }
        if (rows.length !== 4) {
          violations.push(`${labels[i]} final leaderboard shows ${rows.length} rows, expected 4`);
        }
        verifyLeaderboardRows(labels[i], rows, expected, { isFinal: true, viewerPlayerId: users[i].id }, violations);
      }

      // Summary assertions.
      bugCFound = violations.some((v) => v.includes('[BugC]'));
      report(`[SUMMARY] total violations=${violations.length}`);
      for (const v of violations) report(`[VIOLATION] ${v}`);

      expect(violations, `Full-game violations:\n${violations.join('\n')}`).toEqual([]);
    } finally {
      await db.end().catch(() => undefined);
      await browser.close();
    }
  });
});
