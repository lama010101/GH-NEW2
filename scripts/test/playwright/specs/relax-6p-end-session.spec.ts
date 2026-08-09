import { test, expect, Browser } from '@playwright/test';
import { create6PlayerRelaxRoom, RelaxRoom } from '../../../../tests/helpers/relaxRoom';
import { assertNoBannedText } from '../../../../tests/helpers/relaxAssertions';
import {
  closeGroundTruthPool,
  getRoundEventAnswers,
  getRoundsWon,
  getPlayerGlobalStats,
  getSession,
} from '../../../../tests/helpers/dbGroundTruth';
import { playThroughSession, exactGuess } from '../../../../tests/helpers/relaxTestUtils';

async function assertNoLeakedText(room: RelaxRoom, label: string) {
  for (let i = 0; i < room.pages.length; i++) {
    await assertNoBannedText(room.pages[i], `${label}[P${i + 1}]`);
  }
}

test.describe('Relax 6P End of Session', () => {
  test.afterEach(async () => {
    await closeGroundTruthPool();
  });

  test('E01-E04: final round transitions to SESSION_COMPLETE and finalizes leaderboard', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 });
    try {
      const answers = await getRoundEventAnswers(room.gameId);
      expect(answers.length).toBeGreaterThanOrEqual(3);

      await playThroughSession(room, answers, exactGuess);

      const session = await getSession(room.gameId);
      expect(session?.mode).toBe('async');

      for (let i = 0; i < room.clients.length; i++) {
        const c = room.clients[i];
        const page = room.pages[i];
        const snap = c.getLastSnapshot();
        expect(snap?.status).toBe('SESSION_COMPLETE');
        expect(snap?.currentRoundIndex).toBe(answers.length - 1);
        expect(snap?.viewerPlayerId).toBe(c.user.id);
        expect(snap?.players.length).toBe(6);

        await expect(page.locator('[data-testid="session-complete-section"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Final Rankings')).toBeVisible({ timeout: 10000 });

        const rows = page.locator('[class*="rankRow"]');
        await expect(rows).toHaveCount(6, { timeout: 10000 });

        // MVP Awards section should be visible for multiplayer sessions.
        await expect(page.locator('text=MVP Awards')).toBeVisible({ timeout: 10000 });
      }

      await assertNoLeakedText(room, 'E01-E04');
      expect(room.violations).toEqual([]);
    } finally {
      await room.close();
    }
  });

  test('E05-E06: rounds_won and player_global_stats are finalized after all players complete', async ({ browser }) => {
    const room = await create6PlayerRelaxRoom(browser as Browser, { roundTimerSec: 0 });
    try {
      const answers = await getRoundEventAnswers(room.gameId);
      await playThroughSession(room, answers, exactGuess);

      // Global stats should be updated only after session completion.
      const beforeStats = await getPlayerGlobalStats(room.clients[0].user.id);
      const roundsWon = await getRoundsWon(room.gameId);
      expect(roundsWon.length).toBe(6);

      for (const c of room.clients) {
        const stats = await getPlayerGlobalStats(c.user.id);
        expect(stats).toBeTruthy();
        expect(stats!.rounds_played).toBeGreaterThanOrEqual(answers.length);
        expect(stats!.games_played).toBeGreaterThanOrEqual(beforeStats?.games_played ?? 0);
      }

      // With all exact guesses every player wins every round -> rounds_won = totalRounds
      for (const row of roundsWon) {
        expect(row.rounds_won).toBe(answers.length);
      }

      await assertNoLeakedText(room, 'E05-E06');
      expect(room.violations).toEqual([]);
    } finally {
      await room.close();
    }
  });
});
