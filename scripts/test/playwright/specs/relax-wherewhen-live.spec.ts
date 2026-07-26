import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { TEST_USERS } from '../fixtures/auth';
import { ensureLoggedIn } from '../helpers/auth-ui';
import { haversineKm } from '../../../../src/core/competeUtils';

// ─────────────────────────────────────────────────────────────────────
// MP-VERIFY-WHEREWHEN-R10-REALSPEC-001
//
// Minimal, single-scenario browser verification of the fix shipped in
// commit 318ffec (MP-BUILD-RELAX-WHEREWHEN-STALENESS-001): in Relax
// (mode 'async'), the round-result WhereCard and WhenCard must be fed
// from the live per-player `round.playerRoundResults` bundle, so a
// player sitting on the result screen sees another player's guess
// appear as soon as that player submits — with NO page reload.
//
// Scenario:
//   1. Host creates an async 2-player session.
//   2. Both players ready up; the session auto-starts.
//   3. HOST submits round 0 at map point A with year A.
//   4. HOST lands on the round-result screen and STAYS there.
//   5. GUEST submits round 0 at a DIFFERENT map point B with a
//      DIFFERENT year B.
//   6. Assertions run against the HOST's live DOM only:
//        - WhereCard leaderboard shows the guest's row with the
//          distance implied by the guest's ACTUAL committed lat/lng
//          (ground truth read from round_commits).
//        - WhereCard map renders a third marker whose geographic
//          position (recovered from the Leaflet layer transform via
//          the two known markers) matches the guest's committed
//          lat/lng.
//        - WhenCard timeline shows a marker labelled with the guest's
//          ACTUAL committed year, and the WhenCard leaderboard shows
//          the guest's "N years off" for that year.
//
// This spec deliberately does NOT cover the rest of the Relax golden
// path (staggered joins, independent advance, deadline expiry, ...).
// ─────────────────────────────────────────────────────────────────────

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

type Committed = { year: number; lat: number; lng: number };
type CorrectAnswer = { year: number; lat: number; lng: number };

/**
 * Drive one player's guess through the real UI, clicking the WHERE map at a
 * caller-chosen fraction of the map viewport so two players commit DIFFERENT
 * coordinates, and picking the year button at a caller-chosen fraction of the
 * year list so they commit DIFFERENT years.
 *
 * Local to this spec: `helpers/compete-ui.ts#submitGuessViaUI` always clicks
 * the map centre and is therefore unusable for a two-player divergence test.
 * The backdrop/DOM-click workarounds below mirror that helper (KC-010).
 */
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

/** Poll round_commits until the given player's round-0 commit is durable. */
async function readCommit(db: Client, gameId: string, playerId: string): Promise<Committed> {
  const deadline = Date.now() + STATE_TIMEOUT;
  while (Date.now() < deadline) {
    const res = await db.query<{ year_guess: number | null; location_lat: number | null; location_lng: number | null }>(
      `SELECT year_guess, location_lat, location_lng
         FROM round_commits
        WHERE game_id = $1 AND player_id = $2 AND round_index = 0`,
      [gameId, playerId],
    );
    const row = res.rows[0];
    if (row && row.year_guess != null && row.location_lat != null && row.location_lng != null) {
      return { year: Number(row.year_guess), lat: Number(row.location_lat), lng: Number(row.location_lng) };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`readCommit: no round-0 commit for player ${playerId} within ${STATE_TIMEOUT}ms`);
}

/**
 * The roster display name the app generated for a player. Compete assigns a
 * random historical-figure handle per session, so the Supabase test-user
 * displayName is NOT what the leaderboard renders.
 */
async function readDisplayName(db: Client, gameId: string, playerId: string): Promise<string> {
  const res = await db.query<{ display_name: string }>(
    'SELECT display_name FROM session_players WHERE game_id = $1 AND player_id = $2',
    [gameId, playerId],
  );
  const name = res.rows[0]?.display_name;
  if (!name) throw new Error(`readDisplayName: no roster row for player ${playerId}`);
  return name;
}

/** Round 0's ground-truth answer, resolved from the SESSION_CREATED event id list. */
async function readCorrectAnswer(db: Client, gameId: string): Promise<CorrectAnswer> {
  const res = await db.query<{ event_year: number; latitude: number | null; longitude: number | null }>(
    `WITH sc AS (
       SELECT payload->'eventIds' AS ids
         FROM round_events
        WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
        ORDER BY id ASC
        LIMIT 1
     )
     SELECT e.event_year, l.latitude, l.longitude
       FROM sc
       JOIN events e ON e.id = (sc.ids->>0)::uuid
       LEFT JOIN locations l ON l.event_id = e.id`,
    [gameId],
  );
  const row = res.rows[0];
  if (!row || row.latitude == null || row.longitude == null) {
    throw new Error('readCorrectAnswer: round-0 event/location not resolvable');
  }
  return { year: Number(row.event_year), lat: Number(row.latitude), lng: Number(row.longitude) };
}

// Leaflet places markers by CSS transform inside a shared layer, so the DOM
// only exposes pixels. Web Mercator is affine in (lngNorm, latMercNorm) with a
// single shared scale, so two markers of known lat/lng (the correct-location
// marker and the viewer's own guess marker) fully determine the projection —
// which then converts the remaining marker's pixels back to lat/lng.
function mercNorm(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function invMercNorm(yNorm: number): number {
  const n = Math.PI * (1 - 2 * yNorm);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

type PWLocator = import('@playwright/test').Locator;

/** Open the Where/When card's leaderboard disclosure and keep it open. */
async function expandLeaderboard(whereWhen: PWLocator): Promise<void> {
  const header = whereWhen.locator('[class*="expandHeader"]').first();
  const rows = whereWhen.locator('[class*="lbRow"]');
  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await rows.count()) > 0) return;
    await header.click({ force: true });
    await whereWhen.page().waitForTimeout(500);
  }
}

/**
 * Click the WHERE (index 0) or WHEN (index 1) breakdown tab and wait for the
 * corresponding card to actually mount (RoundCompleteSection swaps WhereCard
 * and WhenCard on tab state, and a live re-render can drop the click).
 */
async function switchBreakdownTab(whereWhen: PWLocator, index: 0 | 1, sentinelClass: string): Promise<void> {
  const sentinel = whereWhen.locator(`[class*="${sentinelClass}"]`).first();
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await sentinel.count()) return;
    await whereWhen.locator('button[class*="whereWhenTab"]').nth(index).click({ force: true });
    await whereWhen.page().waitForTimeout(500);
  }
  await sentinel.waitFor({ state: 'attached', timeout: STATE_TIMEOUT });
}

test.describe('Relax (async) Where/When live data', () => {
  test('host result screen shows the guest\'s actual coordinates and year without reload', async () => {
    test.setTimeout(600000);

    expect(DB_URL, 'SUPABASE_DB_CONNECTION must be set to read ground truth').not.toBe('');
    const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();

    const browser = await chromium.launch({ headless: true });
    try {
      const [hostCtx, guestCtx] = await Promise.all([
        browser.newContext(DESKTOP_PRESET),
        browser.newContext(DESKTOP_PRESET),
      ]);
      const [hostPage, guestPage] = await Promise.all([hostCtx.newPage(), guestCtx.newPage()]);

      await Promise.all([
        hostPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);
      await Promise.all([
        ensureLoggedIn(hostPage, TEST_USERS[0]),
        ensureLoggedIn(guestPage, TEST_USERS[1]),
      ]);

      // ── Async session ──
      const createRes = await hostPage.request.post(`${BASE_URL}/api/compete/create`, {
        data: {
          displayName: TEST_USERS[0].displayName,
          playerId: TEST_USERS[0].id,
          mode: 'async',
          totalRounds: 5,
        },
        timeout: NAV_TIMEOUT,
      });
      expect(createRes.ok(), `Create async game failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
      const sessionData = await createRes.json();
      const gameId: string = sessionData.gameId || sessionData.id;
      expect(gameId, 'Create game returned no gameId').toBeTruthy();
      console.log(`[R10] async game: ${gameId}`);

      const modeRow = await db.query<{ mode: string }>('SELECT mode FROM sessions WHERE game_id = $1', [gameId]);
      expect(modeRow.rows[0]?.mode, 'Session must be async (Relax)').toBe('async');

      await Promise.all([
        hostPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
        guestPage.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }),
      ]);
      await Promise.all([
        hostPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="lobby-shell"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);
      await expect
        .poll(async () => hostPage.locator('[data-testid^="lobby-player-"]').count(), { timeout: STATE_TIMEOUT })
        .toBe(2);

      await Promise.all([
        hostPage.getByTestId('lobby-ready-btn').first().click(),
        guestPage.getByTestId('lobby-ready-btn').first().click(),
      ]);

      await Promise.all([
        hostPage.locator('[data-testid="round-active-section"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.locator('[data-testid="round-active-section"]').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);
      await Promise.all([
        hostPage.getByTestId('round-image-container').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
        guestPage.getByTestId('round-image-container').first().waitFor({ state: 'visible', timeout: STATE_TIMEOUT }),
      ]);

      // ── Host submits first, then stays on its result screen ──
      await submitDivergentGuess(hostPage, { yearFraction: 0.2, mapFractionX: 0.25, mapFractionY: 0.35 });
      await hostPage
        .locator('[data-testid="round-complete-section"]')
        .first()
        .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
      const hostCommit = await readCommit(db, gameId, TEST_USERS[0].id);
      console.log(`[R10] host commit: year=${hostCommit.year} lat=${hostCommit.lat} lng=${hostCommit.lng}`);

      // ── Guest submits second, with a different point and a different year ──
      await submitDivergentGuess(guestPage, { yearFraction: 0.85, mapFractionX: 0.75, mapFractionY: 0.7 });
      await guestPage
        .locator('[data-testid="round-complete-section"]')
        .first()
        .waitFor({ state: 'visible', timeout: STATE_TIMEOUT });
      const guestCommit = await readCommit(db, gameId, TEST_USERS[1].id);
      console.log(`[R10] guest commit: year=${guestCommit.year} lat=${guestCommit.lat} lng=${guestCommit.lng}`);

      expect(guestCommit.year, 'Players must commit DIFFERENT years').not.toBe(hostCommit.year);
      expect(
        guestCommit.lat !== hostCommit.lat || guestCommit.lng !== hostCommit.lng,
        'Players must commit DIFFERENT coordinates',
      ).toBe(true);

      const correct = await readCorrectAnswer(db, gameId);
      console.log(`[R10] correct: year=${correct.year} lat=${correct.lat} lng=${correct.lng}`);

      // ── All assertions below read the HOST's live DOM. No page.reload(). ──
      const guestName = await readDisplayName(db, gameId, TEST_USERS[1].id);
      console.log(`[R10] guest roster name: ${guestName}`);
      const whereWhen = hostPage.locator('[class*="whereWhenCard"]').first();
      await whereWhen.waitFor({ state: 'visible', timeout: STATE_TIMEOUT });

      // WHERE tab (first of the two breakdown tabs); wait for its map to mount.
      await switchBreakdownTab(whereWhen, 0, 'mapContainer');

      const expectedGuestKm = Math.round(haversineKm(guestCommit.lat, guestCommit.lng, correct.lat, correct.lng));
      const expectedHostKm = Math.round(haversineKm(hostCommit.lat, hostCommit.lng, correct.lat, correct.lng));

      // Expand the WhereCard leaderboard (first expandable section of the card).
      // A live STATE_UPDATE re-render can collapse it again, so keep toggling
      // until the list is actually on screen.
      await expandLeaderboard(whereWhen);
      const guestWhereRow = whereWhen.locator('[class*="lbRow"]').filter({ hasText: guestName }).first();
      await expect(guestWhereRow, 'Host WhereCard leaderboard must contain the guest row').toBeVisible({
        timeout: STATE_TIMEOUT,
      });
      await expect
        .poll(async () => (await guestWhereRow.locator('[class*="lbDistance"]').first().innerText()).trim(), {
          timeout: STATE_TIMEOUT,
        })
        .toBe(`${expectedGuestKm} km away`);

      // The guest's distance must be the guest's own, not a copy of the host's.
      expect(expectedGuestKm, 'Test setup: host/guest distances must differ').not.toBe(expectedHostKm);

      // Map: correct marker + host's own marker + guest marker, and the guest
      // marker must sit at the guest's committed coordinates.
      const markers = await hostPage.evaluate(() => {
        const container = document.querySelector('[class*="whereWhenCard"] .leaflet-container') as HTMLElement | null;
        if (!container) return [];
        const base = container.getBoundingClientRect();
        return (Array.from(container.querySelectorAll('.leaflet-marker-icon')) as HTMLElement[]).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            isCorrect: el.classList.contains('custom-marker'),
            x: r.left + r.width / 2 - base.left,
            y: r.top + r.height / 2 - base.top,
          };
        });
      });
      expect(markers.length, 'Host map must show correct + own + guest markers').toBe(3);

      const correctMarker = markers.find((m) => m.isCorrect);
      const avatarMarkers = markers.filter((m) => !m.isCorrect);
      expect(correctMarker, 'Correct-location marker missing').toBeTruthy();
      expect(avatarMarkers.length, 'Two avatar markers (own + guest) expected').toBe(2);

      const knownA = { x: correctMarker!.x, y: correctMarker!.y, xn: (correct.lng + 180) / 360, yn: mercNorm(correct.lat) };

      // Solve the projection with each avatar marker assumed to be the host's
      // own guess; the correct assignment is the one whose residual is ~0.
      const candidates = avatarMarkers.map((assumedOwn, idx) => {
        const other = avatarMarkers[1 - idx];
        const knownB = { x: assumedOwn.x, y: assumedOwn.y, xn: (hostCommit.lng + 180) / 360, yn: mercNorm(hostCommit.lat) };
        const dxn = knownB.xn - knownA.xn;
        const dyn = knownB.yn - knownA.yn;
        const scale = Math.abs(dxn) > Math.abs(dyn) ? (knownB.x - knownA.x) / dxn : (knownB.y - knownA.y) / dyn;
        if (!Number.isFinite(scale) || scale === 0) return null;
        const offX = knownA.x - scale * knownA.xn;
        const offY = knownA.y - scale * knownA.yn;
        const residual =
          Math.abs(scale * knownB.xn + offX - knownB.x) + Math.abs(scale * knownB.yn + offY - knownB.y);
        const lng = ((other.x - offX) / scale) * 360 - 180;
        const lat = invMercNorm((other.y - offY) / scale);
        return { residual, lat, lng };
      }).filter((c): c is { residual: number; lat: number; lng: number } => c !== null);

      expect(candidates.length, 'Could not solve the map projection from the known markers').toBeGreaterThan(0);
      const best = candidates.sort((a, b) => a.residual - b.residual)[0];
      console.log(
        `[R10] guest marker recovered: lat=${best.lat.toFixed(4)} lng=${best.lng.toFixed(4)} ` +
          `(committed lat=${guestCommit.lat} lng=${guestCommit.lng}, residual=${best.residual.toFixed(2)}px)`,
      );
      // Tolerance is a few degrees: the guest's committed lng (219.375) is
      // antimeridian-wrapped, where Mercator pixel-recovery carries ~1° noise.
      // This still trivially distinguishes the guest's point from the host's
      // own guess (which differs by >100°), which is the property under test.
      expect(Math.abs(best.lat - guestCommit.lat), 'Guest marker latitude mismatch').toBeLessThan(3);
      expect(Math.abs(best.lng - guestCommit.lng), 'Guest marker longitude mismatch').toBeLessThan(3);

      // WHEN tab — wait for the timeline to mount, then confirm the guest's
      // actual year appears as a timeline marker label.
      await switchBreakdownTab(whereWhen, 1, 'timelineBar');
      await expect
        .poll(
          async () =>
            (await whereWhen.locator('[class*="playerYearLabel"]').allInnerTexts()).map((s) => s.trim()),
          { timeout: STATE_TIMEOUT },
        )
        .toContain(String(guestCommit.year));

      await expandLeaderboard(whereWhen);
      const guestWhenRow = whereWhen.locator('[class*="lbRow"]').filter({ hasText: guestName }).first();
      await expect(guestWhenRow, 'Host WhenCard leaderboard must contain the guest row').toBeVisible({
        timeout: STATE_TIMEOUT,
      });
      await expect
        .poll(async () => (await guestWhenRow.locator('[class*="lbYearsOff"]').first().innerText()).trim(), {
          timeout: STATE_TIMEOUT,
        })
        .toBe(`${Math.abs(guestCommit.year - correct.year)} years off`);

      console.log('[R10] PASS — host saw the guest\'s live Where/When data with no reload.');
    } finally {
      await browser.close();
      await db.end();
    }
  });
});
