import { test, expect, Browser } from '@playwright/test';
import { create6PlayerRelaxRoom } from '../../../../tests/helpers/relaxRoom';
import { closeGroundTruthPool, getRoundResults, getRoundCommits, getSessionPlayers } from '../../../../tests/helpers/dbGroundTruth';
import { playThroughSession, exactGuess } from '../../../../tests/helpers/relaxTestUtils';

test.describe('Relax 6P Auth & Integrity', () => {
  test.afterEach(async () => {
    await closeGroundTruthPool();
  });

  test('AU01-AU03: viewerPlayerId matches the receiving player after the first per-player view', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 });
    try {
      for (let i = 0; i < room.clients.length; i++) {
        const c = room.clients[i];
        const snap = c.getLastSnapshot();
        expect(snap?.viewerPlayerId).toBe(c.user.id);
      }
      expect(room.violations).toEqual([]);
    } finally {
      await room.close();
    }
  });

  test('AU04: invalid-phase actions are rejected and do not mutate state', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 });
    try {
      const c = room.clients[0];

      // Submit before the session has started. The server must reject this
      // because the phase is still LOBBY, and no player state may change.
      c.submitGuess(0, 1492, 0, 0);
      await new Promise((r) => setTimeout(r, 1500));

      const snap = c.getLastSnapshot();
      expect(snap?.status).toBe('LOBBY');
      const me = snap?.players.find((p) => p.playerId === c.user.id);
      expect(me?.hasSubmitted).toBe(false);
      expect(room.violations).toEqual([]);
    } finally {
      await room.close();
    }
  });

  test('DI01-DI03: DB round_commits and round_results are append-only and consistent', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 });
    try {
      const answers = await getRoundEventAnswers(room.gameId);
      await playThroughSession(room, answers, exactGuess);

      for (let roundIndex = 0; roundIndex < answers.length; roundIndex++) {
        const commits = await getRoundCommits(room.gameId, roundIndex);
        const results = await getRoundResults(room.gameId, roundIndex);

        expect(commits.length).toBe(6);
        expect(results.length).toBe(6);

        for (const c of room.clients) {
          const commit = commits.find((row) => row.player_id === c.user.id);
          const result = results.find((row) => row.player_id === c.user.id);
          expect(commit).toBeTruthy();
          expect(result).toBeTruthy();

          // Raw guess in commits matches what the client sent.
          expect(commit!.year_guess).toBe(answers[roundIndex].year);
          expect(commit!.location_lat).toBe(answers[roundIndex].latitude);
          expect(commit!.location_lng).toBe(answers[roundIndex].longitude);

          // Computed result score matches commit score.
          expect(commit!.score).toBe(result!.score);
          expect(result!.location_score).toBe(100);
          expect(result!.time_score).toBe(100);
          expect(result!.rank).not.toBeNull();
        }
      }

      const players = await getSessionPlayers(room.gameId);
      for (const c of room.clients) {
        const row = players.find((p) => p.player_id === c.user.id);
        expect(row).toBeTruthy();
        expect(row!.kicked).toBe(false);
        expect(row!.left_at).toBeNull();
      }

      expect(room.violations).toEqual([]);
    } finally {
      await room.close();
    }
  });
});
