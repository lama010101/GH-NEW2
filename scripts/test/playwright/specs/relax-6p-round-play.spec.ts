import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { create6PlayerRelaxRoom } from '../../../../tests/helpers/relaxRoom';
import type { RelaxRoom, RelaxSnapshot } from '../../../../tests/helpers/relaxRoom';
import { assertNoBannedText, assertNextRoundEnabled } from '../../../../tests/helpers/relaxAssertions';

// ─────────────────────────────────────────────────────────────────────
// Relax 6-player round-play QA — G01–G11
//
// Drives one full 6-player async session from first round through the
// fifth (final) round. Asserts per-viewer state, monotonic versions,
// no banned waiting text, and that the Next Round CTA is always enabled
// in ROUND_COMPLETE.
// ─────────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = 'reports/screenshots';

let room: RelaxRoom;

test.beforeAll(async ({ browser }) => {
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  room = await create6PlayerRelaxRoom(browser);
});

test.afterAll(async () => {
  if (room) {
    expect(room.violations, 'Snapshot invariant violations').toEqual([]);
    await room.close();
  }
});

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

async function waitForSessionComplete(client: RelaxRoom['clients'][number]): Promise<void> {
  await client.waitForState((s) => (s as RelaxSnapshot).status === 'SESSION_COMPLETE', 60000, true);
}

test('Relax 6-player round gameplay — G01 through G11', async () => {
  test.setTimeout(600000);

  // G01: all six players start independently into round 0.
  await test.step('G01: every player starts into ROUND_ACTIVE round 0', async () => {
    for (const client of room.clients) {
      client.startGame();
    }
    await Promise.all(room.clients.map((client, i) => waitForRoundActive(client, 0).then(() => console.log(`[ROUND-PLAY] P${i + 1} ROUND_ACTIVE round=0`))));

    for (const client of room.clients) {
      const snapshot = client.getLastSnapshot() as RelaxSnapshot;
      expect(snapshot.status).toBe('ROUND_ACTIVE');
      expect(snapshot.currentRoundIndex).toBe(0);
      expect(snapshot.viewerPlayerId).toBe(client.user.id);
    }
    await room.pages[0].screenshot({ fullPage: true, path: `${SCREENSHOT_DIR}/relax-6p-round-play-all-active-r1.png` });
  });

  // G02–G06: each of the five rounds is submitted and (when not final) advanced.
  for (let round = 0; round < 5; round++) {
    const label = `G0${round + 2}`;
    await test.step(`${label}: submit and complete round ${round + 1}`, async () => {
      // Submit sequentially to avoid hammering the DO, but each player must
      // independently reach ROUND_COMPLETE / SESSION_COMPLETE.
      for (let i = 0; i < room.clients.length; i++) {
        const client = room.clients[i];
        const page = room.pages[i];

        const before = client.getLastSnapshot() as RelaxSnapshot;
        expect(before.status, `P${i + 1} before submit round ${round + 1}`).toBe('ROUND_ACTIVE');
        expect(before.currentRoundIndex, `P${i + 1} before submit round ${round + 1}`).toBe(round);

        client.submitGuess(round, 1900 + i * 10, i * 5, i * 5);

        if (round < 4) {
          await waitForRoundComplete(client, round);
          await assertNextRoundEnabled(page, `P${i + 1} round ${round + 1}`);
          // No banned text should ever appear on a result screen.
          await assertNoBannedText(page, `P${i + 1} round ${round + 1}`);
        } else {
          await waitForSessionComplete(client);
          // Final round lands on SESSION_COMPLETE.
          await page.locator('[data-testid="session-complete-section"], [class*="SessionComplete"]').first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => undefined);
        }
      }

      const capPlayer = round < 4 ? room.clients[0] : room.clients[5];
      const capPage = round < 4 ? room.pages[0] : room.pages[5];
      const capIndex = round < 4 ? 1 : 6;
      const capStatus = capPlayer.getLastSnapshot() as RelaxSnapshot;
      if (round < 4) {
        expect(capStatus.status).toBe('ROUND_COMPLETE');
        expect(capStatus.currentRoundIndex).toBe(round);
      } else {
        expect(capStatus.status).toBe('SESSION_COMPLETE');
      }
      await capPage.screenshot({ fullPage: true, path: `${SCREENSHOT_DIR}/relax-6p-round-play-r${round + 1}-p${capIndex}.png` });

      // Advance everyone to the next round except after the final round.
      if (round < 4) {
        for (const client of room.clients) {
          client.readyNext(round);
        }
        await Promise.all(
          room.clients.map((client, i) =>
            waitForRoundActive(client, round + 1).then(() => console.log(`[ROUND-PLAY] P${i + 1} ROUND_ACTIVE round=${round + 1}`)),
          ),
        );
      }
    });
  }

  // G07–G11: final invariant sweep.
  await test.step('G07: all six players end in SESSION_COMPLETE', async () => {
    for (const client of room.clients) {
      const snapshot = client.getLastSnapshot() as RelaxSnapshot;
      expect(snapshot.status).toBe('SESSION_COMPLETE');
      expect(snapshot.currentRoundIndex).toBe(4);
      expect(snapshot.viewerPlayerId).toBe(client.user.id);
    }
  });

  await test.step('G08–G11: no banned text on any screen and observer invariants clean', async () => {
    for (let i = 0; i < room.pages.length; i++) {
      await assertNoBannedText(room.pages[i], `Final P${i + 1}`);
    }
    expect(room.violations, 'Snapshot invariant violations').toEqual([]);
  });
});
