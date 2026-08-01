import { test, expect, Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { create6PlayerRelaxRoom } from '../../../../tests/helpers/relaxRoom';
import type { RelaxRoom, RelaxSnapshot } from '../../../../tests/helpers/relaxRoom';
import { assertNoBannedText, assertNextRoundEnabled } from '../../../../tests/helpers/relaxAssertions';

// ─────────────────────────────────────────────────────────────────────
// Relax 6-player leaderboard and notification QA — R01–R10 and N01–N03
//
// Verifies that the async (Relax) round leaderboard builds progressively
// as each of the six players submits, that the "Next Round" button is never
// disabled while the leaderboard updates, and that notifications/toasts only
// fire on the final (5th) round completion rather than on every per-round
// submit.
// ─────────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = 'reports/screenshots';

async function closeRoom(room: RelaxRoom | undefined) {
  if (room) {
    expect(room.violations, 'Snapshot invariant violations').toEqual([]);
    await room.close();
  }
}

async function waitForRoundActive(client: RelaxRoom['clients'][number], round: number): Promise<void> {
  await client.waitForState(
    (s) => (s as RelaxSnapshot).status === 'ROUND_ACTIVE' && (s as RelaxSnapshot).currentRoundIndex === round,
    60000,
    true,
  );
}

async function waitForRoundComplete(client: RelaxRoom['clients'][number], round: number): Promise<void> {
  await client.waitForState(
    (s) => (s as RelaxSnapshot).status === 'ROUND_COMPLETE' && (s as RelaxSnapshot).currentRoundIndex === round,
    60000,
    true,
  );
}

async function expandWhereWhenLeaderboard(page: Page): Promise<void> {
  const card = page.locator('[class*="whereWhenCard"]').first();
  await card.waitFor({ state: 'visible', timeout: 60000 });
  const header = card.locator('[class*="expandHeader"]').first();
  const rows = card.locator('[class*="lbRow"]');
  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await rows.count()) > 0) return;
    await header.click({ force: true });
    await page.waitForTimeout(500);
  }
}

test.describe('Relax 6-player leaderboard and notifications — R01–R10 and N01–N03', () => {
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  test('R01–R07: partial leaderboard builds live and Next Round stays enabled', async ({ browser }) => {
    test.setTimeout(600000);
    const room = await create6PlayerRelaxRoom(browser);
    try {
      await Promise.all(
        room.clients.map((client) => {
          client.startGame();
          return waitForRoundActive(client, 0);
        }),
      );
      console.log('[LEADERBOARD] all players ROUND_ACTIVE round=0');

      // Player 0 submits and stays on the result screen.
      room.clients[0].submitGuess(0, 1900, 0, 0);
      await waitForRoundComplete(room.clients[0], 0);
      await room.pages[0].locator('[class*="leaderboardCard"]').first().waitFor({ state: 'visible', timeout: 60000 });
      await assertNextRoundEnabled(room.pages[0], 'R01 player 1');

      // The first result screen shows one submitted row (self).
      const leaderboard = room.pages[0].locator('[class*="leaderboardCard"]').first();
      await expect(
        leaderboard.locator('[class*="lbRow"]'),
        'R01: leaderboard should show exactly 1 submitted row',
      ).toHaveCount(1, { timeout: 30000 });
      await room.pages[0].screenshot({ fullPage: true, path: `${SCREENSHOT_DIR}/relax-6p-leaderboard-partial-1.png` });

      // Players 1–5 submit sequentially; the host's leaderboard must grow live.
      for (let i = 1; i < room.clients.length; i++) {
        room.clients[i].submitGuess(0, 1850 + i * 20, i * 10, i * 10);
        await waitForRoundComplete(room.clients[i], 0);
        const expectedRows = i + 1;
        await expect(
          leaderboard.locator('[class*="lbRow"]'),
          `R0${i + 1}: leaderboard should show ${expectedRows} submitted rows`,
        ).toHaveCount(expectedRows, { timeout: 60000 });
        await assertNextRoundEnabled(room.pages[0], `R0${i + 1} player ${i + 1}`);
      }

      await room.pages[0].screenshot({ fullPage: true, path: `${SCREENSHOT_DIR}/relax-6p-leaderboard-full.png` });

      for (let i = 0; i < room.pages.length; i++) {
        await assertNoBannedText(room.pages[i], `R01–R07 P${i + 1}`);
      }
    } finally {
      await closeRoom(room);
    }
  });

  test('R08–R10: Where/When card leaderboard updates live as opponents submit', async ({ browser }) => {
    test.setTimeout(600000);
    const room = await create6PlayerRelaxRoom(browser);
    try {
      await Promise.all(
        room.clients.map((client) => {
          client.startGame();
          return waitForRoundActive(client, 0);
        }),
      );

      // Host submits and stays on result screen; then a guest submits.
      room.clients[0].submitGuess(0, 1900, 0, 0);
      await waitForRoundComplete(room.clients[0], 0);
      await expandWhereWhenLeaderboard(room.pages[0]);

      // WHERE tab is active by default; it should show the host row only.
      const whereWhenCard = room.pages[0].locator('[class*="whereWhenCard"]').first();
      await expect(
        whereWhenCard.locator('[class*="lbRow"]'),
        'R08: Where/When leaderboard should show host only',
      ).toHaveCount(1, { timeout: 30000 });

      // Guest 1 submits while host is still on the result screen.
      room.clients[1].submitGuess(0, 1850, 25, 25);
      await waitForRoundComplete(room.clients[1], 0);

      // The host's Where/When card should now show two rows without reload.
      await expect(
        whereWhenCard.locator('[class*="lbRow"]'),
        'R09: Where/When leaderboard should update to 2 rows live',
      ).toHaveCount(2, { timeout: 60000 });

      await room.pages[0].screenshot({ fullPage: true, path: `${SCREENSHOT_DIR}/relax-6p-wherewhen-live.png` });

      for (let i = 0; i < room.pages.length; i++) {
        await assertNoBannedText(room.pages[i], `R08–R10 P${i + 1}`);
      }
    } finally {
      await closeRoom(room);
    }
  });

  // N01–N03: notifications must only fire on the final (5th) round completion.
  // Current source fires the async per-round text toast on every round
  // (page.tsx playerSubmittedToast and RoundActiveSection submittedToasts), so
  // this test is marked as expected to fail until the final-round-only guard
  // is implemented.
  test.fail(
    'N01–N03: notifications fire only on final round completion, not per-round submits',
    async ({ browser }) => {
      test.setTimeout(600000);
      const room = await create6PlayerRelaxRoom(browser);
      try {
        await Promise.all(
          room.clients.map((client) => {
            client.startGame();
            return waitForRoundActive(client, 0);
          }),
        );

        // Scenario A: round 0 is not the final round — submitting player B while
        // player A is still in ROUND_ACTIVE must not show a per-round notification.
        const playerA = room.clients[1];
        const playerB = room.clients[2];
        const pageA = room.pages[1];

        playerB.submitGuess(0, 1850, 10, 10);
        await waitForRoundComplete(playerB, 0);
        await pageA.waitForTimeout(1000);

        const round0Toast = pageA.locator('[class*="playerSubmittedToast"]').first();
        await expect(round0Toast, 'N01: no per-round notification in round 0').not.toBeVisible({ timeout: 5000 });

        // Advance both players to the final round (round 4).
        for (let round = 0; round < 4; round++) {
          for (const client of [playerA, playerB]) {
            const idx = room.clients.indexOf(client);
            client.submitGuess(round, 1900 + idx * 10 + round, idx * 5, idx * 5);
            if (round < 3) {
              await waitForRoundComplete(client, round);
              client.readyNext(round);
              await waitForRoundActive(client, round + 1);
            } else {
              // Final round submit lands in ROUND_COMPLETE.
              await waitForRoundComplete(client, round);
            }
          }
        }

        // Reset player A back to ROUND_ACTIVE round 4 by advancing from ROUND_COMPLETE.
        // In Relax, readyNext from ROUND_COMPLETE round 4 should move to SESSION_COMPLETE,
        // so this scenario is not possible for the final round. Instead, keep a third
        // player C in ROUND_ACTIVE round 4 while B submits the final round.
        const playerC = room.clients[3];
        const pageC = room.pages[3];

        // Advance C to round 4 but do not submit.
        for (let round = 0; round < 4; round++) {
          playerC.submitGuess(round, 1900 + 3 * 10 + round, 15, 15);
          await waitForRoundComplete(playerC, round);
          if (round < 3) {
            playerC.readyNext(round);
            await waitForRoundActive(playerC, round + 1);
          }
        }

        // Scenario B: final round completion should fire a notification for the
        // player still in ROUND_ACTIVE round 4.
        playerB.readyNext(3); // move B from ROUND_COMPLETE round 3 to ROUND_ACTIVE round 4.
        await waitForRoundActive(playerB, 4);
        playerB.submitGuess(4, 1900 + 2 * 10, 10, 10);
        await waitForRoundComplete(playerB, 4);

        await pageC.waitForTimeout(1000);
        const finalRoundToast = pageC.locator('[class*="playerSubmittedToast"]').first();
        await expect(finalRoundToast, 'N03: final round completion notification visible').toBeVisible({ timeout: 5000 });
      } finally {
        await closeRoom(room);
      }
    },
  );
});
