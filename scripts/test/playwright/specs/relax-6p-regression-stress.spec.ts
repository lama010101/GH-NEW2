import { test, expect, Browser } from '@playwright/test';
import { create6PlayerRelaxRoom } from '../../../../tests/helpers/relaxRoom';
import { closeGroundTruthPool, getRoundEventAnswers, getRoundsWon } from '../../../../tests/helpers/dbGroundTruth';
import { playThroughSession, exactGuess } from '../../../../tests/helpers/relaxTestUtils';

test.describe('Relax 6P Regression & Stress', () => {
  test.afterEach(async () => {
    await closeGroundTruthPool();
  });

  test('P01-P02: stress test — two concurrent 6-player sessions do not cross-pollinate', async ({ browser }) => {
    const rooms = await Promise.all(
      Array.from({ length: 2 }).map(() => create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 })),
    );

    try {
      const gameIds = new Set(rooms.map((r) => r.gameId));
      expect(gameIds.size).toBe(2);

      await Promise.all(
        rooms.map(async (room) => {
          const answers = await getRoundEventAnswers(room.gameId);
          await playThroughSession(room, answers, exactGuess);
        }),
      );

      for (const room of rooms) {
        for (const c of room.clients) {
          expect(c.getLastSnapshot()?.status).toBe('SESSION_COMPLETE');
          expect(c.getLastSnapshot()?.gameId).toBe(room.gameId);
        }

        const roundsWon = await getRoundsWon(room.gameId);
        expect(roundsWon.length).toBe(6);
        expect(room.violations).toEqual([]);
      }
    } finally {
      await Promise.all(rooms.map((r) => r.close()));
    }
  });

  test('X01-X02: cross-mode regression smoke — async mode flag and 5-round default are intact', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0, totalRounds: 2 });
    try {
      const snap = room.clients[0].getLastSnapshot();
      expect(snap?.config.mode).toBe('async');
      expect(snap?.config.totalRounds).toBe(5); // async always uses MAX_ROUNDS

      const answers = await getRoundEventAnswers(room.gameId);
      expect(answers.length).toBe(5);

      await playThroughSession(room, answers, exactGuess);
      for (const c of room.clients) {
        expect(c.getLastSnapshot()?.status).toBe('SESSION_COMPLETE');
      }
    } finally {
      await room.close();
    }
  });
});
