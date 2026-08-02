// =============================================================================
// MP-FIX-DAILY-F — Daily mode regression Playwright spec
//
// Covers the fixed Daily flow end-to-end:
//   1. fresh start auto-starts round 0 (no LOBBY stall)
//   2. resume mid-session keeps the correct round/phase
//   3. full completion writes leaderboard + streak rows
//   4. lazy finalization of a single stale in_progress attempt
//   5. multi-stale chronological finalization (streak not inflated)
//   6. one-attempt-per-day idempotency
//
// Uses real API routes with a Supabase session cookie for a test player and
// direct DB queries for assertions that cannot be faked by the API response.
// The UI login path is intentionally avoided because the AuthModal flow is
// flaky under repeated headless runs; the cookie-based auth uses the same
// access token that the AuthModal would set, so the API sees an identical
// authenticated browser session.
// =============================================================================
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID, randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import pg from 'pg';
import { TEST_USERS, type TestUser } from '../fixtures/auth';

const { Pool } = pg;

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_DB_CONNECTION = process.env.SUPABASE_DB_CONNECTION || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_DB_CONNECTION) {
  throw new Error('Missing required SUPABASE_DB_CONNECTION for daily golden-path spec');
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing required Supabase URL/anon key for daily golden-path spec');
}

const pool = new Pool({ connectionString: SUPABASE_DB_CONNECTION });

const VALID_CONTINENTS = [
  'Africa',
  'Antarctica',
  'Asia',
  'Europe',
  'North America',
  'Oceania',
  'South America',
];

const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
const AUTH_COOKIE_NAME = `sb-${projectRef}-auth-token`;

interface SessionBundle {
  cookieName: string;
  cookieValue: string;
  cookie: string;
  userId: string;
}

const sessionCache = new Map<string, SessionBundle>();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getSession(user: TestUser): Promise<SessionBundle> {
  const cached = sessionCache.get(user.email);
  if (cached) return cached;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Auth token fetch failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    token_type: string;
    user: { id: string };
  };

  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: data.expires_at,
    token_type: data.token_type,
    user: data.user,
  };
  const cookieValue = JSON.stringify(session);
  const bundle: SessionBundle = {
    cookieName: AUTH_COOKIE_NAME,
    cookieValue,
    cookie: `${AUTH_COOKIE_NAME}=${cookieValue}`,
    userId: data.user.id,
  };
  sessionCache.set(user.email, bundle);
  return bundle;
}

async function authenticatePage(page: Page, user: TestUser): Promise<SessionBundle> {
  const bundle = await getSession(user);
  await page.context().addCookies([
    {
      name: bundle.cookieName,
      value: bundle.cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
  return bundle;
}

async function ensureDailyChallenge(dateIso: string): Promise<void> {
  const existing = await pool.query<{ date: string }>(
    `SELECT date FROM daily_challenges WHERE date = $1`,
    [dateIso]
  );
  if (existing.rows.length === 0) {
    const events = await pool.query<{ id: string }>(
      `SELECT e.id
       FROM events e
       JOIN locations l ON l.event_id = e.id
       WHERE e.status = 'validated'
         AND l.latitude IS NOT NULL
         AND l.longitude IS NOT NULL
         AND l.continent = ANY($1::text[])
       ORDER BY e.id
       LIMIT 5`,
      [VALID_CONTINENTS]
    );
    if (events.rows.length < 5) {
      throw new Error(`Not enough eligible events for daily challenge: got ${events.rows.length}`);
    }
    await pool.query(
      `INSERT INTO daily_challenges (date, seed, event_ids) VALUES ($1, $2, $3)
       ON CONFLICT (date) DO NOTHING`,
      [dateIso, 0, events.rows.map((r) => r.id)]
    );
  }
}

async function createStaleAttempt(
  playerId: string,
  displayName: string,
  dateIso: string
): Promise<string> {
  await ensureDailyChallenge(dateIso);

  const gameId = randomUUID();
  const roomCode = randomBytes(4).toString('hex');
  const yearMax = new Date().getUTCFullYear();

  await pool.query(
    `INSERT INTO sessions (
       game_id, mode, round_timer_sec, total_rounds, year_min, year_max,
       seed, room_code, results_auto_advance_sec, selected_eras,
       scoring_reference_year, session_deadline_days, selected_regions
     ) VALUES ($1, 'daily', 90, 5, -100, $2, 0, $3, 0, $4, 2025, NULL, $5)`,
    [
      gameId,
      yearMax,
      roomCode,
      ['prehistoric', 'ancient', 'medieval', 'earlymodern', 'modern', 'contemporary'],
      [],
    ]
  );

  await pool.query(
    `INSERT INTO session_players (game_id, player_id, display_name, ready, is_host, avatar_url)
     VALUES ($1, $2, $3, true, true, NULL)`,
    [gameId, playerId, displayName]
  );

  await pool.query(
    `INSERT INTO daily_attempts (date, player_id, game_id, status, started_at)
     VALUES ($1, $2, $3, 'in_progress', now())`,
    [dateIso, playerId, gameId]
  );

  return gameId;
}

async function cleanupPlayerDaily(playerId: string): Promise<void> {
  const attempts = await pool.query<{ game_id: string; date: string }>(
    `SELECT game_id, date::text FROM daily_attempts WHERE player_id = $1`,
    [playerId]
  );

  for (const row of attempts.rows) {
    await pool.query(`DELETE FROM round_commits WHERE game_id = $1`, [row.game_id]);
    await pool.query(`DELETE FROM round_results WHERE game_id = $1`, [row.game_id]);
    await pool.query(`DELETE FROM round_events WHERE game_id = $1`, [row.game_id]);
    await pool.query(`DELETE FROM session_players WHERE game_id = $1`, [row.game_id]);
    await pool.query(`DELETE FROM sessions WHERE game_id = $1`, [row.game_id]);
    await pool.query(`DELETE FROM leaderboard_daily WHERE date = $1 AND player_id = $2`, [
      row.date,
      playerId,
    ]);
  }

  await pool.query(`DELETE FROM daily_attempts WHERE player_id = $1`, [playerId]);
  await pool.query(`DELETE FROM player_daily_streak WHERE player_id = $1`, [playerId]);
  await pool.query(`DELETE FROM leaderboard_daily_alltime WHERE player_id = $1`, [playerId]);
  await pool.query(`DELETE FROM player_global_stats WHERE player_id = $1`, [playerId]);
  await pool.query(`DELETE FROM profiles WHERE id = $1`, [playerId]);

  // Remove daily_challenges rows for dates that no longer have any attempts.
  const uniqueDates = [...new Set(attempts.rows.map((r) => r.date))];
  for (const date of uniqueDates) {
    const remaining = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM daily_attempts WHERE date = $1`,
      [date]
    );
    if (remaining.rows[0].cnt === 0) {
      await pool.query(`DELETE FROM daily_challenges WHERE date = $1`, [date]);
    }
  }
}

test.afterAll(async () => {
  await pool.end();
});

// =============================================================================
// Scenario group 1: fresh start, resume, full completion, one-attempt-per-day
// =============================================================================
test.describe.serial('Daily fresh start, resume, completion and idempotency', () => {
  const userIndex = 5;
  let userId = '';
  let gameId = '';

  test.beforeAll(async () => {
    const user = TEST_USERS[userIndex];
    userId = user.id;
    await cleanupPlayerDaily(userId);
    await getSession(user);
  });

  test.afterAll(async () => {
    await cleanupPlayerDaily(userId);
  });

  test('S1: fresh start auto-starts round 0', async ({ page }) => {
    const user = TEST_USERS[userIndex];
    await authenticatePage(page, user);

    const startRes = await page.request.post('/api/daily/start');
    expect(startRes.status()).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.status).toBe('new');
    expect(startJson.gameId).toBeTruthy();
    gameId = startJson.gameId;

    const statusRes = await page.request.get('/api/daily/status');
    expect(statusRes.status()).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.status).toBe('in_progress');
    expect(statusJson.gameId).toBe(gameId);
    expect(statusJson.currentRoundIndex).toBe(0);
    expect(statusJson.phase).toBe('ROUND_ACTIVE');
  });

  test('S2: resume mid-session keeps round active and round index', async ({ page }) => {
    const user = TEST_USERS[userIndex];
    await authenticatePage(page, user);

    // Resume via the start route should be idempotent and keep the same game.
    const startRes = await page.request.post('/api/daily/start');
    expect(startRes.status()).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.status).toBe('resume');
    expect(startJson.gameId).toBe(gameId);

    // Complete round 0 and advance to round 1.
    const guessRes = await page.request.post(`/api/daily/${gameId}/guess`, {
      data: { roundIndex: 0, year: 1950, lat: 48.85, lng: 2.35, hintsUsed: [] },
    });
    expect(guessRes.status()).toBe(200);
    const guessJson = await guessRes.json();
    expect(guessJson.status).toBe('ROUND_COMPLETE');

    const advanceRes = await page.request.post(`/api/daily/${gameId}/advance`, {
      data: { roundIndex: 0 },
    });
    expect(advanceRes.status()).toBe(200);
    const advanceJson = await advanceRes.json();
    expect(advanceJson.status).toBe('ROUND_ACTIVE');

    // Fresh status call must still be ROUND_ACTIVE (not LOBBY) and on round 1.
    const statusRes = await page.request.get('/api/daily/status');
    expect(statusRes.status()).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.status).toBe('in_progress');
    expect(statusJson.gameId).toBe(gameId);
    expect(statusJson.currentRoundIndex).toBe(1);
    expect(statusJson.phase).toBe('ROUND_ACTIVE');
  });

  test('S3: full completion writes leaderboard and streak rows', async ({ page }) => {
    const user = TEST_USERS[userIndex];
    await authenticatePage(page, user);

    // Complete rounds 1-4.
    for (let round = 1; round < 5; round++) {
      const guessRes = await page.request.post(`/api/daily/${gameId}/guess`, {
        data: { roundIndex: round, year: 1950, lat: 48.85, lng: 2.35, hintsUsed: [] },
      });
      expect(guessRes.status()).toBe(200);
      const guessJson = await guessRes.json();
      expect(guessJson.status).toBe('ROUND_COMPLETE');

      const advanceRes = await page.request.post(`/api/daily/${gameId}/advance`, {
        data: { roundIndex: round },
      });
      expect(advanceRes.status()).toBe(200);
      const advanceJson = await advanceRes.json();

      if (round < 4) {
        expect(advanceJson.status).toBe('ROUND_ACTIVE');
      } else {
        expect(advanceJson.status).toBe('SESSION_COMPLETE');
      }
    }

    const statusRes = await page.request.get('/api/daily/status');
    expect(statusRes.status()).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.status).toBe('completed');
    expect(statusJson.gameId).toBe(gameId);
    expect(statusJson.results).toBeTruthy();
    expect(typeof statusJson.results.totalXp).toBe('number');
    expect(statusJson.results.avgAccuracy).toBeDefined();

    // Direct DB assertions: leaderboard, alltime, and streak rows must exist.
    const today = todayIso();
    const lbDaily = await pool.query(
      `SELECT * FROM leaderboard_daily WHERE date = $1 AND player_id = $2`,
      [today, userId]
    );
    expect(lbDaily.rowCount).toBe(1);

    const lbAlltime = await pool.query(
      `SELECT * FROM leaderboard_daily_alltime WHERE player_id = $1`,
      [userId]
    );
    expect(lbAlltime.rowCount).toBe(1);
    expect(lbAlltime.rows[0].games_played).toBe(1);

    const streak = await pool.query(
      `SELECT daily_streak_current, daily_streak_best, last_attempt_date::text AS last_attempt_date
       FROM player_daily_streak WHERE player_id = $1`,
      [userId]
    );
    expect(streak.rowCount).toBe(1);
    expect(streak.rows[0].daily_streak_current).toBe(1);
    expect(streak.rows[0].daily_streak_best).toBe(1);
    expect(streak.rows[0].last_attempt_date).toBe(today);

    // Open the results page and assert the session-complete section is visible
    // with real accuracy/score, not blank.
    await page.goto(`/daily/game/${gameId}/results`, { waitUntil: 'domcontentloaded' });
    const sessionComplete = page.getByTestId('session-complete-section').first();
    await expect(sessionComplete).toBeVisible({ timeout: 10000 });
    await expect(sessionComplete).toContainText('XP');
    await expect(sessionComplete).toContainText('%');
  });

  test('S6: one-attempt-per-day is idempotent', async ({ page }) => {
    const user = TEST_USERS[userIndex];
    await authenticatePage(page, user);

    const startRes = await page.request.post('/api/daily/start');
    expect(startRes.status()).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.status).toBe('completed');
    expect(startJson.gameId).toBe(gameId);

    const count = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM daily_attempts WHERE player_id = $1 AND date = $2`,
      [userId, todayIso()]
    );
    expect(count.rows[0].cnt).toBe(1);
  });
});

// =============================================================================
// Scenario 4: lazy finalization of a single stale attempt
// =============================================================================
test.describe.serial('Daily stale lazy finalization', () => {
  const userIndex = 6;
  const staleDate = '2025-01-15';
  let userId = '';
  let staleGameId = '';

  test.beforeAll(async () => {
    const user = TEST_USERS[userIndex];
    userId = user.id;
    await cleanupPlayerDaily(userId);
    staleGameId = await createStaleAttempt(userId, user.displayName, staleDate);
    await getSession(user);
  });

  test.afterAll(async () => {
    await cleanupPlayerDaily(userId);
  });

  test('S4: stale in_progress attempt is zero-filled and finalized', async ({ page }) => {
    const user = TEST_USERS[userIndex];
    await authenticatePage(page, user);

    const startRes = await page.request.post('/api/daily/start');
    expect(startRes.status()).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.status).toBe('new');
    const todayGameId = startJson.gameId;
    expect(todayGameId).not.toBe(staleGameId);

    // Stale attempt must now be terminal (dailyGameEndTransaction sets completed).
    const staleAttempt = await pool.query(
      `SELECT status, completed_at FROM daily_attempts WHERE game_id = $1`,
      [staleGameId]
    );
    expect(staleAttempt.rowCount).toBe(1);
    expect(staleAttempt.rows[0].status).toBe('completed');
    expect(staleAttempt.rows[0].completed_at).toBeTruthy();

    // Zero-filled round_results for the stale game.
    const rr = await pool.query(
      `SELECT * FROM round_results WHERE game_id = $1 ORDER BY round_index`,
      [staleGameId]
    );
    expect(rr.rowCount).toBe(5);
    for (const row of rr.rows) {
      expect(row.score).toBe(0);
      expect(row.location_score).toBe(0);
      expect(row.time_score).toBe(0);
    }

    // Leaderboard and streak rows must be written for the STALE date, not today.
    const lbDaily = await pool.query(
      `SELECT * FROM leaderboard_daily WHERE date = $1 AND player_id = $2`,
      [staleDate, userId]
    );
    expect(lbDaily.rowCount).toBe(1);

    const streak = await pool.query(
      `SELECT last_attempt_date::text AS last_attempt_date
       FROM player_daily_streak WHERE player_id = $1`,
      [userId]
    );
    expect(streak.rowCount).toBe(1);
    expect(streak.rows[0].last_attempt_date).toBe(staleDate);

    // All-time row must exist (one completed stale game).
    const lbAlltime = await pool.query(
      `SELECT * FROM leaderboard_daily_alltime WHERE player_id = $1`,
      [userId]
    );
    expect(lbAlltime.rowCount).toBe(1);
  });
});

// =============================================================================
// Scenario 5: multi-stale chronological order (streak guard)
// =============================================================================
test.describe.serial('Daily multi-stale chronological finalization', () => {
  const userIndex = 7;
  const staleDates = ['2025-01-10', '2025-01-12', '2025-01-15'];
  let userId = '';
  const staleGameIds: string[] = [];

  test.beforeAll(async () => {
    const user = TEST_USERS[userIndex];
    userId = user.id;
    await cleanupPlayerDaily(userId);
    for (const date of staleDates) {
      const gameId = await createStaleAttempt(userId, user.displayName, date);
      staleGameIds.push(gameId);
    }
    await getSession(user);
  });

  test.afterAll(async () => {
    await cleanupPlayerDaily(userId);
  });

  test('S5: three non-consecutive stale attempts finalize without inflating streak', async ({ page }) => {
    const user = TEST_USERS[userIndex];
    await authenticatePage(page, user);

    const startRes = await page.request.post('/api/daily/start');
    expect(startRes.status()).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.status).toBe('new');

    // All three stale attempts must be completed.
    for (const date of staleDates) {
      const attempt = await pool.query(
        `SELECT status, completed_at FROM daily_attempts WHERE player_id = $1 AND date = $2`,
        [userId, date]
      );
      expect(attempt.rowCount).toBe(1);
      expect(attempt.rows[0].status).toBe('completed');
      expect(attempt.rows[0].completed_at).toBeTruthy();
    }

    for (const gameId of staleGameIds) {
      const rr = await pool.query(
        `SELECT * FROM round_results WHERE game_id = $1`,
        [gameId]
      );
      expect(rr.rowCount).toBe(5);
    }

    // Each stale date must have a leaderboard_daily row.
    for (const date of staleDates) {
      const lb = await pool.query(
        `SELECT * FROM leaderboard_daily WHERE date = $1 AND player_id = $2`,
        [date, userId]
      );
      expect(lb.rowCount).toBe(1);
    }

    // Streak must NOT be 3: non-consecutive dates reset the streak each time.
    const streak = await pool.query(
      `SELECT daily_streak_current, daily_streak_best, last_attempt_date::text AS last_attempt_date
       FROM player_daily_streak WHERE player_id = $1`,
      [userId]
    );
    expect(streak.rowCount).toBe(1);
    expect(streak.rows[0].daily_streak_current).toBe(1);
    expect(streak.rows[0].daily_streak_best).toBe(1);
    expect(streak.rows[0].last_attempt_date).toBe(staleDates[staleDates.length - 1]);

    // All-time row must reflect three completed stale games.
    const lbAlltime = await pool.query(
      `SELECT * FROM leaderboard_daily_alltime WHERE player_id = $1`,
      [userId]
    );
    expect(lbAlltime.rowCount).toBe(1);
    expect(lbAlltime.rows[0].games_played).toBe(3);
  });
});
