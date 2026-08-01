import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { create6PlayerRelaxRoom } from '../../../../tests/helpers/relaxRoom';
import type { RelaxRoom, RelaxSnapshot } from '../../../../tests/helpers/relaxRoom';
import { assertNoBannedText, assertNextRoundEnabled } from '../../../../tests/helpers/relaxAssertions';

// ─────────────────────────────────────────────────────────────────────
// Relax 6-player concurrent submit/advance QA — CS01–CS06
//
// Exercises true-concurrent submissions and interleaved advances in async
// (Relax) mode. Verifies that one player's submit/advance has zero effect on
// another player's screen or currentRoundIndex and that ROUND_COMPLETE /
// ROUND_ACTIVE states can coexist across the six observers.
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

function dumpState(client: RelaxRoom['clients'][number], label: string): string {
  const s = client.getLastSnapshot() as RelaxSnapshot | null;
  const me = s?.players.find((p) => p.playerId === client.user.id);
  return `${label}: status=${s?.status} round=${s?.currentRoundIndex} viewer=${s?.viewerPlayerId?.slice(0, 8)} hasSubmitted=${me?.hasSubmitted}`;
}

test.describe('Relax 6-player concurrent submit/advance — CS01–CS06', () => {
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  test('CS01–CS03: true-concurrent submit of round 0 by all six players', async ({ browser }) => {
    test.setTimeout(600000);
    const room = await create6PlayerRelaxRoom(browser);
    try {
      await Promise.all(
        room.clients.map((client) => {
          client.startGame();
          return waitForRoundActive(client, 0);
        }),
      );
      console.log('[CONCURRENT-1] all players ROUND_ACTIVE round=0');

      // Fire every submit without awaiting between them, then wait for the
      // per-player acknowledgements.
      for (let i = 0; i < room.clients.length; i++) {
        room.clients[i].submitGuess(0, 1900 + i * 10, i * 5, i * 5);
      }
      await Promise.all(
        room.clients.map((client, i) =>
          waitForRoundComplete(client, 0).then(() => console.log(`[CONCURRENT-1] P${i + 1} ROUND_COMPLETE round=0`)),
        ),
      );

      // Screenshot each observer's concurrent ROUND_COMPLETE view.
      await Promise.all(
        room.pages.map((page, i) =>
          page.screenshot({ fullPage: true, path: `${SCREENSHOT_DIR}/relax-6p-concurrent-submit-p${i + 1}.png` }),
        ),
      );

      // Every result screen must offer Next Round immediately.
      for (let i = 0; i < room.pages.length; i++) {
        await assertNextRoundEnabled(room.pages[i], `CS01 P${i + 1}`);
        await assertNoBannedText(room.pages[i], `CS01 P${i + 1}`);
      }

      // All observers should see round 0 in ROUND_COMPLETE.
      for (const client of room.clients) {
        const snapshot = client.getLastSnapshot() as RelaxSnapshot;
        expect(snapshot.status).toBe('ROUND_COMPLETE');
        expect(snapshot.currentRoundIndex).toBe(0);
        expect(snapshot.viewerPlayerId).toBe(client.user.id);
      }
    } finally {
      await closeRoom(room);
    }
  });

  test('CS04–CS06: interleaved advance produces simultaneous ROUND_COMPLETE and ROUND_ACTIVE states', async ({ browser }) => {
    test.setTimeout(600000);
    const room = await create6PlayerRelaxRoom(browser);
    try {
      await Promise.all(
        room.clients.map((client) => {
          client.startGame();
          return waitForRoundActive(client, 0);
        }),
      );
      console.log('[CONCURRENT-2] all players ROUND_ACTIVE round=0');

      // Players 0, 1, 2 submit concurrently and reach ROUND_COMPLETE.
      for (let i = 0; i < 3; i++) {
        room.clients[i].submitGuess(0, 1900 + i * 10, i * 5, i * 5);
      }
      await Promise.all(
        room.clients.slice(0, 3).map((client, i) =>
          waitForRoundComplete(client, 0).then(() => console.log(`[CONCURRENT-2] P${i + 1} ROUND_COMPLETE round=0`)),
        ),
      );

      // Players 3, 4, 5 must remain ROUND_ACTIVE round 0 (no cross-player leak).
      for (let i = 3; i < 6; i++) {
        const snapshot = room.clients[i].getLastSnapshot() as RelaxSnapshot;
        expect(snapshot.status, `P${i + 1} should still be ROUND_ACTIVE`).toBe('ROUND_ACTIVE');
        expect(snapshot.currentRoundIndex, `P${i + 1} should still be round 0`).toBe(0);
      }

      // Player 0 and 1 advance to round 1 while everyone else stays behind.
      room.clients[0].readyNext(0);
      room.clients[1].readyNext(0);
      await Promise.all([waitForRoundActive(room.clients[0], 1), waitForRoundActive(room.clients[1], 1)]);

      const states = room.clients.map((c, i) => dumpState(c, `P${i + 1}`));
      console.log('[CONCURRENT-2] mixed phase states:\n' + states.join('\n'));

      expect((room.clients[0].getLastSnapshot() as RelaxSnapshot).status).toBe('ROUND_ACTIVE');
      expect((room.clients[0].getLastSnapshot() as RelaxSnapshot).currentRoundIndex).toBe(1);
      expect((room.clients[1].getLastSnapshot() as RelaxSnapshot).status).toBe('ROUND_ACTIVE');
      expect((room.clients[1].getLastSnapshot() as RelaxSnapshot).currentRoundIndex).toBe(1);

      expect((room.clients[2].getLastSnapshot() as RelaxSnapshot).status).toBe('ROUND_COMPLETE');
      expect((room.clients[2].getLastSnapshot() as RelaxSnapshot).currentRoundIndex).toBe(0);

      for (let i = 3; i < 6; i++) {
        expect((room.clients[i].getLastSnapshot() as RelaxSnapshot).status).toBe('ROUND_ACTIVE');
        expect((room.clients[i].getLastSnapshot() as RelaxSnapshot).currentRoundIndex).toBe(0);
      }

      // Full visual proof: all six observers in a mix of phases on the same round.
      await Promise.all(
        room.pages.map((page, i) =>
          page.screenshot({ fullPage: true, path: `${SCREENSHOT_DIR}/relax-6p-concurrent-mixed-phases-p${i + 1}.png` }),
        ),
      );

      for (const client of room.clients) {
        const snapshot = client.getLastSnapshot() as RelaxSnapshot;
        expect(snapshot.viewerPlayerId).toBe(client.user.id);
      }
    } finally {
      await closeRoom(room);
    }
  });
});
