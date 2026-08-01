import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import {
  create6PlayerRelaxRoom,
  getRosterRowText,
  getPlayerStatus,
} from '../../../../tests/helpers/relaxRoom';
import type { RelaxRoom, RelaxSnapshot } from '../../../../tests/helpers/relaxRoom';
import {
  assertNoBannedText,
  assertNextRoundEnabled,
} from '../../../../tests/helpers/relaxAssertions';

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

test('Relax 6-player independent start & pacing — S01–S08', async () => {
  const host = room.host;
  const guestB = room.clients[1];
  const guestC = room.clients[2];
  const guestD = room.clients[3];

  // S01: host starts independently and enters ROUND_ACTIVE round 0
  await test.step('S01: host starts — enters ROUND_ACTIVE while others stay LOBBY', async () => {
    host.client.startGame();
    await host.client.waitForState(
      (s) =>
        (s as RelaxSnapshot).status === 'ROUND_ACTIVE' &&
        (s as RelaxSnapshot).currentRoundIndex === 0,
      30000,
    );

    // All other clients must remain in LOBBY and see the host as "playing".
    await Promise.all(
      room.clients.slice(1).map(async (client, i) => {
        const snapshot = await client.waitForState(
          (s) =>
            (s as RelaxSnapshot).status === 'LOBBY' &&
            getPlayerStatus(s as RelaxSnapshot, host.user.id) === 'playing',
          30000,
        );
        expect(snapshot.players.find((p) => p.playerId === host.user.id)?.roundStatus).toBe(
          'playing',
        );
      }),
    );

    await host.page.screenshot({
      fullPage: true,
      path: `${SCREENSHOT_DIR}/relax-6p-independent-start-host.png`,
    });
    await room.pages[1].screenshot({
      fullPage: true,
      path: `${SCREENSHOT_DIR}/relax-6p-independent-start-guest.png`,
    });
  });

  // S02/S03: a second player starts independently; no cross-player phase leak
  await test.step('S02/S03: second player starts independently — no phase leak', async () => {
    guestB.startGame();
    await guestB.waitForState(
      (s) =>
        (s as RelaxSnapshot).status === 'ROUND_ACTIVE' &&
        (s as RelaxSnapshot).currentRoundIndex === 0,
      30000,
    );

    // Host should still be ROUND_ACTIVE round 0 (not bumped back to lobby).
    const hostSnap = host.client.getLastSnapshot() as RelaxSnapshot;
    expect(hostSnap.status).toBe('ROUND_ACTIVE');
    expect(hostSnap.currentRoundIndex).toBe(0);

    // Guests C–F should still be LOBBY.
    for (let i = 2; i < room.clients.length; i++) {
      const s = room.clients[i].getLastSnapshot() as RelaxSnapshot;
      expect(s.status).toBe('LOBBY');
    }
  });

  // S04: banned text never appears
  await test.step('S04: no banned text during independent starts', async () => {
    for (let i = 0; i < room.pages.length; i++) {
      await assertNoBannedText(room.pages[i], `S04 P${i + 1}`);
    }
  });

  // S05/S06: host submits round 0, reaches ROUND_COMPLETE, Next Round enabled; guest unaffected
  await test.step('S05/S06: host submits and reaches ROUND_COMPLETE — Next Round enabled, guest still ROUND_ACTIVE', async () => {
    host.client.submitGuess(0, 1900, 0, 0);
    await host.client.waitForState(
      (s) =>
        (s as RelaxSnapshot).status === 'ROUND_COMPLETE' &&
        (s as RelaxSnapshot).currentRoundIndex === 0,
      30000,
    );

    await assertNextRoundEnabled(host.page, 'S05 host');

    const guestBSnap = guestB.getLastSnapshot() as RelaxSnapshot;
    expect(guestBSnap.status).toBe('ROUND_ACTIVE');
    expect(guestBSnap.currentRoundIndex).toBe(0);
  });

  // S07: host advances to round 1 without waiting for others
  await test.step('S07: host advances to round 1 — no gating', async () => {
    host.client.readyNext(0);
    await host.client.waitForState(
      (s) =>
        (s as RelaxSnapshot).status === 'ROUND_ACTIVE' &&
        (s as RelaxSnapshot).currentRoundIndex === 1,
      30000,
    );

    // Guest B should still be in round 0 (ROUND_ACTIVE).
    const guestBSnap = guestB.getLastSnapshot() as RelaxSnapshot;
    expect(guestBSnap.status).toBe('ROUND_ACTIVE');
    expect(guestBSnap.currentRoundIndex).toBe(0);

    // Guests C–F still LOBBY.
    for (let i = 2; i < room.clients.length; i++) {
      const s = room.clients[i].getLastSnapshot() as RelaxSnapshot;
      expect(s.status).toBe('LOBBY');
    }
  });

  // S08: multiple players finish independently and coexist at different rounds
  await test.step('S08: multiple players pace independently through different rounds', async () => {
    // Fast-forward host through rounds 1..4.
    for (let r = 1; r <= 4; r++) {
      host.client.submitGuess(r, 1900, 0, 0);
      const expectedRound = r;
      await host.client.waitForState(
        (s) =>
          (s as RelaxSnapshot).status === (expectedRound === 4 ? 'SESSION_COMPLETE' : 'ROUND_COMPLETE') &&
          (s as RelaxSnapshot).currentRoundIndex === expectedRound,
        30000,
      );

      if (r < 4) {
        await assertNextRoundEnabled(host.page, `S08 host round ${r}`);
        host.client.readyNext(r);
        await host.client.waitForState(
          (s) =>
            (s as RelaxSnapshot).status === 'ROUND_ACTIVE' &&
            (s as RelaxSnapshot).currentRoundIndex === r + 1,
          30000,
        );
      }
    }

    // Guest B now starts and submits round 0, then advances to round 1.
    guestB.submitGuess(0, 1800, 10, 10);
    await guestB.waitForState(
      (s) =>
        (s as RelaxSnapshot).status === 'ROUND_COMPLETE' &&
        (s as RelaxSnapshot).currentRoundIndex === 0,
      30000,
    );
    await assertNextRoundEnabled(room.pages[1], 'S08 guest B');
    guestB.readyNext(0);
    await guestB.waitForState(
      (s) =>
        (s as RelaxSnapshot).status === 'ROUND_ACTIVE' &&
        (s as RelaxSnapshot).currentRoundIndex === 1,
      30000,
    );

    // Guest D starts (still in LOBBY before this) and stays at ROUND_ACTIVE round 0.
    guestD.startGame();
    await guestD.waitForState(
      (s) =>
        (s as RelaxSnapshot).status === 'ROUND_ACTIVE' &&
        (s as RelaxSnapshot).currentRoundIndex === 0,
      30000,
    );

    // Roster should simultaneously show finished, playing, playing, joined states.
    const hostRow = await getRosterRowText(room.pages[2], host.user.id);
    expect(hostRow.toLowerCase()).toContain('finished');

    const guestBRow = await getRosterRowText(room.pages[2], room.users[1].id);
    expect(guestBRow.toLowerCase()).toContain('playing');

    const guestDRow = await getRosterRowText(room.pages[2], room.users[3].id);
    expect(guestDRow.toLowerCase()).toContain('playing');

    const guestCRow = await getRosterRowText(room.pages[2], room.users[2].id);
    expect(guestCRow.toLowerCase()).toContain('joined');

    await room.pages[2].screenshot({
      fullPage: true,
      path: `${SCREENSHOT_DIR}/relax-6p-roster-mixed-states.png`,
    });
  });

  // Final invariant sweep
  await test.step('Final: no banned text and no violations at any pace', async () => {
    for (let i = 0; i < room.pages.length; i++) {
      await assertNoBannedText(room.pages[i], `Final P${i + 1}`);
    }
  });

  expect(room.violations, 'Snapshot invariant violations').toEqual([]);
});
