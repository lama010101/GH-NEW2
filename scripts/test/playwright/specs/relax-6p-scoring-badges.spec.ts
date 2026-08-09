import { test, expect, Browser } from '@playwright/test';
import { create6PlayerRelaxRoom, RelaxRoom } from '../../../../tests/helpers/relaxRoom';
import { assertNoBannedText } from '../../../../tests/helpers/relaxAssertions';
import {
  closeGroundTruthPool,
  getRoundEventAnswers,
  getRoundResults,
  getRoundCommits,
  getSession,
  getCumulativeScores,
} from '../../../../tests/helpers/dbGroundTruth';
import { playThroughSession, GuessFactory, exactGuess } from '../../../../tests/helpers/relaxTestUtils';
import { calculateYearAccuracy } from '../../../../src/core/rules';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function assertNoLeakedText(room: RelaxRoom, label: string) {
  for (let i = 0; i < room.pages.length; i++) {
    await assertNoBannedText(room.pages[i], `${label}[P${i + 1}]`);
  }
}

async function waitForRoundResults(gameId: string, roundIndex: number, expectedCount: number, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await getRoundResults(gameId, roundIndex);
    if (rows.length >= expectedCount) return rows;
    await sleep(200);
  }
  throw new Error(`round_results for ${gameId} round ${roundIndex} did not reach ${expectedCount} rows`);
}

function findYearGuessForAccuracyRange(
  eventYear: number,
  referenceYear: number,
  minTarget: number,
  maxTarget: number,
): number | null {
  for (let delta = 0; delta < 5000; delta++) {
    const acc = calculateYearAccuracy(delta, eventYear, referenceYear);
    if (acc >= minTarget && acc <= maxTarget) {
      return eventYear + delta;
    }
    if (acc < minTarget) break;
  }
  return null;
}

test.describe('Relax 6P Scoring & Badges', () => {
  test.afterEach(async () => {
    await closeGroundTruthPool();
  });

  test('SC01-SC04: exact guesses produce 100% server-side scores and gold badges', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 });
    try {
      const answers = await getRoundEventAnswers(room.gameId);
      expect(answers.length).toBeGreaterThanOrEqual(3);
      await playThroughSession(room, answers, exactGuess);

      for (const c of room.clients) {
        expect(c.getLastSnapshot()?.status).toBe('SESSION_COMPLETE');
        expect(c.getLastSnapshot()?.viewerPlayerId).toBe(c.user.id);
      }

      for (let roundIndex = 0; roundIndex < answers.length; roundIndex++) {
        const dbResults = await waitForRoundResults(room.gameId, roundIndex, room.clients.length);
        for (const c of room.clients) {
          const snap = c.getLastSnapshot();
          if (!snap) throw new Error('missing snapshot');
          const prr = snap.rounds[roundIndex].playerRoundResults[c.user.id];
          const dbRow = dbResults.find((r) => r.player_id === c.user.id);
          expect(dbRow, `round ${roundIndex} player ${c.user.id}`).toBeTruthy();

          // Server-side scoring: snapshot values must equal DB ground truth
          expect(prr.score).toBe(dbRow!.score);
          expect(prr.locationScore).toBe(dbRow!.location_score);
          expect(prr.timeScore).toBe(dbRow!.time_score);
          expect(prr.distanceKm).toBeCloseTo(dbRow!.distance_km ?? 0, 1);
          expect(prr.yearDiff).toBe(dbRow!.year_diff ?? 0);

          // Exact guess => 100% location/time and 200 XP
          expect(prr.locationScore).toBe(100);
          expect(prr.timeScore).toBe(100);
          expect(prr.score).toBe(200);
          expect(prr.accuracy).toBe(100);

          // Badges: gold for year, location, combo
          expect(prr.badges).toEqual(
            expect.arrayContaining([
              { dimension: 'year', tier: 'gold', accuracy: 100 },
              { dimension: 'location', tier: 'gold', accuracy: 100 },
              { dimension: 'combo', tier: 'gold', accuracy: 100 },
            ]),
          );
          expect(prr.nearMisses).toEqual([]);
        }

        // Rank should be finalized (not null) and tied for exact guesses
        for (const dbRow of dbResults) {
          expect(dbRow.rank).not.toBeNull();
        }
        const ranks = dbResults.map((r) => r.rank ?? 0);
        expect(new Set(ranks).size).toBe(1);
      }

      const cumulative = await getCumulativeScores(room.gameId);
      for (const c of room.clients) {
        const row = cumulative.find((r) => r.player_id === c.user.id);
        expect(row?.total_score).toBe(answers.length * 200);
      }

      await assertNoLeakedText(room, 'SC01-SC04');
      expect(room.violations).toEqual([]);
    } finally {
      await room.close();
    }
  });

  test('SC05-SC07: round results ranks and snapshots match DB ordering', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 });
    try {
      const answers = await getRoundEventAnswers(room.gameId);
      expect(answers.length).toBeGreaterThanOrEqual(3);

      const session = await getSession(room.gameId);
      if (!session) throw new Error('session not found');

      // Player i gets a progressively worse year guess, same perfect location.
      // Each player targets a disjoint accuracy range so ranks are deterministic.
      const ranges = [
        [96, 100],
        [88, 92],
        [80, 84],
        [72, 76],
        [64, 68],
        [56, 60],
      ];
      const spreadGuess: GuessFactory = (playerIndex, answer) => {
        const [minTarget, maxTarget] = ranges[playerIndex % ranges.length];
        const year =
          findYearGuessForAccuracyRange(answer.year, session.scoring_reference_year, minTarget, maxTarget) ??
          answer.year + playerIndex * 500;
        return { year, lat: answer.latitude, lng: answer.longitude };
      };

      await playThroughSession(room, answers, spreadGuess);

      for (let roundIndex = 0; roundIndex < answers.length; roundIndex++) {
        const dbResults = await waitForRoundResults(room.gameId, roundIndex, room.clients.length);
        const dbSorted = [...dbResults].sort((a, b) => {
          if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
          return (a.player_id ?? '').localeCompare(b.player_id ?? '');
        });
        const snap = room.clients[0].getLastSnapshot();
        if (!snap) throw new Error('missing snapshot');
        for (const c of room.clients) {
          const prr = snap.rounds[roundIndex].playerRoundResults[c.user.id];
          const dbRow = dbResults.find((r) => r.player_id === c.user.id);
          expect(prr.score).toBe(dbRow?.score ?? -1);
        }
        // Ranks should be monotonic and match score order
        for (let i = 0; i < dbSorted.length; i++) {
          expect(dbSorted[i].rank).toBe(i + 1);
        }
      }

      await assertNoLeakedText(room, 'SC05-SC07');
      expect(room.violations).toEqual([]);
    } finally {
      await room.close();
    }
  });

  test('SC08-SC10: badges and near-miss indicators match DB accuracy thresholds', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 });
    try {
      const answers = await getRoundEventAnswers(room.gameId);
      expect(answers.length).toBeGreaterThanOrEqual(3);
      const session = await getSession(room.gameId);
      if (!session) throw new Error('session not found');

      const firstAnswer = answers[0];
      const nearMissYear = findYearGuessForAccuracyRange(firstAnswer.year, session.scoring_reference_year, 88, 89);
      if (nearMissYear === null) {
        test.skip(true, 'No near-miss year offset achievable for the first event');
        return;
      }

      const nearMissGuess: GuessFactory = (playerIndex, answer) => {
        if (playerIndex === 0 && answer.roundIndex === 0) {
          return { year: nearMissYear, lat: answer.latitude, lng: answer.longitude };
        }
        return { year: answer.year, lat: answer.latitude, lng: answer.longitude };
      };

      await playThroughSession(room, answers, nearMissGuess);

      const dbResults = await waitForRoundResults(room.gameId, 0, room.clients.length);
      const p0 = room.clients[0];
      const snap = p0.getLastSnapshot();
      expect(snap).toBeTruthy();
      const prr = snap!.rounds[0].playerRoundResults[p0.user.id];
      const dbRow = dbResults.find((r) => r.player_id === p0.user.id);

      expect(prr.locationScore).toBe(100);
      expect(prr.timeScore).toBe(dbRow?.time_score);
      expect(prr.timeScore).toBeGreaterThanOrEqual(88);
      expect(prr.timeScore).toBeLessThanOrEqual(89);

      const yearBadge = prr.badges.find((b) => b.dimension === 'year');
      expect(yearBadge).toBeUndefined();
      const yearNearMiss = prr.nearMisses.find((n) => n.dimension === 'year');
      expect(yearNearMiss).toBeTruthy();
      expect(yearNearMiss!.accuracy).toBe(prr.timeScore);

      await assertNoLeakedText(room, 'SC08-SC10');
      expect(room.violations).toEqual([]);
    } finally {
      await room.close();
    }
  });
});
