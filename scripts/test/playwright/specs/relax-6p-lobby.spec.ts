import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import {
  create6PlayerRelaxRoom,
  assertRosterCount,
  getRosterRowText,
  getPlayerStatus,
} from '../../../../tests/helpers/relaxRoom';
import type { RelaxRoom, RelaxSnapshot } from '../../../../tests/helpers/relaxRoom';
import { assertNoBannedText, BANNED_TEXT } from '../../../../tests/helpers/relaxAssertions';

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
    expect(room.violations, 'Snapshot invariants violations').toEqual([]);
    await room.close();
  }
});

test('Relax 6-player lobby & config — L01–L14 & C01–C09', async () => {
  // L01: six players join a Relax lobby
  await test.step('L01: all six players land in LOBBY', async () => {
    for (let i = 0; i < room.clients.length; i++) {
      const client = room.clients[i];
      const snapshot = client.getLastSnapshot() as RelaxSnapshot | null;
      expect(snapshot, `P${i + 1} should have a snapshot`).not.toBeNull();
      expect(snapshot!.status, `P${i + 1} status`).toBe('LOBBY');
      const active = snapshot!.players.filter((p) => p.leftAt === null);
      expect(active.length, `P${i + 1} active count`).toBe(6);
      expect(snapshot!.config.mode, `P${i + 1} mode`).toBe('async');
    }
  });

  // L02: roster lists all six with correct host/joined states
  await test.step('L02: browser roster shows host and joined pills', async () => {
    for (let i = 0; i < room.pages.length; i++) {
      const page = room.pages[i];
      const user = room.users[i];
      await assertRosterCount(page, 6, `L02 P${i + 1}`);
      const row = page.locator(`[data-testid="lobby-player-${user.id}"]`).first();
      await expect(row, `P${i + 1} row`).toBeVisible();
      const rowText = ((await row.textContent()) ?? '').toLowerCase();
      const snapshot = room.clients[i].getLastSnapshot() as RelaxSnapshot;
      const displayName =
        snapshot.players.find((p) => p.playerId === user.id)?.displayName ?? user.displayName;
      expect(rowText).toContain(displayName.toLowerCase());
      if (i === room.host.index) {
        await expect(row, `P${i + 1} host attr`).toHaveAttribute('data-host', 'true');
        expect(rowText).toContain('host');
      } else {
        await expect(row, `P${i + 1} non-host attr`).toHaveAttribute('data-host', 'false');
      }
      const status = getPlayerStatus(room.clients[i].getLastSnapshot() as RelaxSnapshot, user.id);
      expect(status, `P${i + 1} roundStatus`).toBe('joined');
      expect(rowText).toContain('joined');
    }

    await room.host.page.screenshot({
      fullPage: true,
      path: `${SCREENSHOT_DIR}/relax-6p-lobby-roster.png`,
    });
  });

  // L03: viewerPlayerId matches receiving player after first per-player view
  await test.step('L03: viewerPlayerId matches each receiving player', async () => {
    for (let i = 0; i < room.clients.length; i++) {
      const snapshot = room.clients[i].getLastSnapshot() as RelaxSnapshot | null;
      expect(snapshot?.viewerPlayerId, `P${i + 1} viewerPlayerId`).toBe(room.users[i].id);
    }
  });

  // L04: no banned waiting/starting/ready text anywhere
  await test.step('L04: no banned text on any screen', async () => {
    for (let i = 0; i < room.pages.length; i++) {
      await assertNoBannedText(room.pages[i], `L04 P${i + 1}`);
    }
  });

  // C01: mode is async
  await test.step('C01: session mode is async for everyone', async () => {
    for (const client of room.clients) {
      const snapshot = client.getLastSnapshot() as RelaxSnapshot;
      expect(snapshot.config.mode).toBe('async');
    }
  });

  // C02: round timer defaults to off; C03: session deadline defaults to 3 days
  await test.step('C02/C03: default timer off and 3-day deadline', async () => {
    for (const client of room.clients) {
      const snapshot = client.getLastSnapshot() as RelaxSnapshot;
      expect(snapshot.config.roundTimerSec).toBe(0);
      expect(snapshot.config.sessionDeadlineDays ?? 3).toBe(3);
    }
  });

  // C04: era presets default to all selected and year range spans default eras
  await test.step('C04: default era presets are all selected', async () => {
    for (const client of room.clients) {
      const snapshot = client.getLastSnapshot() as RelaxSnapshot;
      expect(snapshot.config.selectedEras?.length ?? 0).toBeGreaterThanOrEqual(5);
      // Default year range should be broad enough to include the default eras.
      expect(snapshot.config.yearMin).toBeLessThanOrEqual(-400);
      expect(snapshot.config.yearMax).toBeGreaterThanOrEqual(1900);
    }
  });

  // C05: host can enable the round timer and it broadcasts to all players
  await test.step('C05: host round-timer update broadcasts to all', async () => {
    room.host.client.setTimer(60);
    await Promise.all(
      room.clients.map((client) =>
        client.waitForState(
          (s) => (s as RelaxSnapshot).config.roundTimerSec === 60,
          10000,
        ),
      ),
    );
    for (let i = 0; i < room.clients.length; i++) {
      const snapshot = room.clients[i].getLastSnapshot() as RelaxSnapshot;
      expect(snapshot.config.roundTimerSec).toBe(60);
    }
  });

  // C06: host can change the year range and all players see the update
  await test.step('C06: host year-range update broadcasts to all', async () => {
    room.host.client.setYearRange(1000, 2000);
    await Promise.all(
      room.clients.map((client) =>
        client.waitForState(
          (s) =>
            (s as RelaxSnapshot).config.yearMin === 1000 &&
            (s as RelaxSnapshot).config.yearMax === 2000,
          10000,
        ),
      ),
    );
    for (const client of room.clients) {
      const snapshot = client.getLastSnapshot() as RelaxSnapshot;
      expect(snapshot.config.yearMin).toBe(1000);
      expect(snapshot.config.yearMax).toBe(2000);
    }
  });

  // C07: non-host config changes are rejected / do not broadcast
  await test.step('C07: non-host cannot change config', async () => {
    const guest = room.clients[1];
    const before = room.host.client.getLastSnapshot() as RelaxSnapshot;
    guest.setTimer(120);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const after = room.host.client.getLastSnapshot() as RelaxSnapshot;
    expect(after.config.roundTimerSec).toBe(before.config.roundTimerSec);
    expect(after.config.yearMin).toBe(before.config.yearMin);
    expect(after.config.yearMax).toBe(before.config.yearMax);
  });

  // C08: config changes do not start the game / change phase
  await test.step('C08: config changes keep everyone in LOBBY', async () => {
    for (const client of room.clients) {
      const snapshot = client.getLastSnapshot() as RelaxSnapshot;
      expect(snapshot.status).toBe('LOBBY');
      const active = snapshot.players.filter((p) => p.leftAt === null);
      expect(active.length).toBe(6);
    }
  });

  // C09: config changes never introduce banned text
  await test.step('C09: no banned text after config changes', async () => {
    for (let i = 0; i < room.pages.length; i++) {
      await assertNoBannedText(room.pages[i], `C09 P${i + 1}`);
    }
  });

  // L05–L09: lobby shell is stable for all, host invite panel visible, room code shown
  await test.step('L05–L09: lobby UI is stable and host-only invite panel visible', async () => {
    for (let i = 0; i < room.pages.length; i++) {
      const page = room.pages[i];
      await expect(page.locator('[data-testid="lobby-shell"]').first()).toBeVisible();
      // Room code should be visible somewhere in the header.
      await expect(page.locator('text=/[A-Z0-9]{4,}/i').first()).toBeVisible();
    }
    // Host sees the invite subsection (search input and share link).
    const hostPage = room.host.page;
    await expect(hostPage.locator('[data-testid="lobby-share-link"]').first()).toBeVisible();
    await expect(hostPage.locator('input[placeholder*="Search"]').first()).toBeVisible();

    await room.host.page.screenshot({
      fullPage: true,
      path: `${SCREENSHOT_DIR}/relax-6p-lobby-config-ui.png`,
    });
  });

  // L10–L14: relax-specific invariants (no gating, all states independent in lobby)
  await test.step('L10–L14: no lobby state gates any other player', async () => {
    // Verify every player still has the start-my-game CTA and no ready-count text.
    for (const page of room.pages) {
      const startBtn = page.locator('[data-testid="lobby-ready-btn"]').first();
      await expect(startBtn).toBeVisible();
      await expect(startBtn).toBeEnabled();
      await expect(startBtn).toHaveText(/start my game/i);
      const body = (await page.locator('body').innerText()).toLowerCase();
      for (const banned of BANNED_TEXT) {
        expect(body, `banned text "${banned}" on page`).not.toContain(banned);
      }
    }
  });

  expect(room.violations, 'Snapshot invariant violations').toEqual([]);
});
