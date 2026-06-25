// MP-VERIFY-FIX-BATCH-B6-B9-001 — Part 2: B9 live two-browser repro
// SCRATCH FILE — delete before final commit.
// Verifies: Rush (sync) your_turn indicator on Home Compete card after one player
// leaves an active round; + Relax (async) regression check.
//
// Runs against local Next.js dev (localhost:3000) + production PartyKit host
// (NEXT_PUBLIC_PARTY_KIT_HOST from .env.local) + production Supabase.
const fs = require('fs');
const { chromium } = require('/Users/lolo/GH-new/GH-NEW/node_modules/playwright');
const { createClient } = require('/Users/lolo/GH-new/GH-NEW/node_modules/@supabase/supabase-js');
const WebSocket = require('/Users/lolo/GH-new/GH-NEW/node_modules/ws');
require('dotenv').config({ path: '/Users/lolo/GH-new/GH-NEW/.env.local', override: true });

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IDS_FILE = '/Users/lolo/GH-new/GH-NEW/.test-user-ids.json';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket },
});

const USERS = [
  { email: 'gh-test-player-1@test.guess-history.com', password: 'TestPass123!', displayName: 'TestPlayer1' },
  { email: 'gh-test-player-2@test.guess-history.com', password: 'TestPass123!', displayName: 'TestPlayer2' },
];

function log(tag, msg) { console.log(`[${tag}] ${msg}`); }

async function ensureUser(u) {
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list?.users.find(x => x.email === u.email);
  if (existing) {
    await supabase.from('profiles').upsert({ id: existing.id, display_name: u.displayName, avatar_url: null });
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true, user_metadata: { display_name: u.displayName },
  });
  if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
  await supabase.from('profiles').upsert({ id: data.user.id, display_name: u.displayName, avatar_url: null });
  return data.user.id;
}

async function loginViaAuthModal(page, u) {
  log('AUTH', `logging in ${u.email}`);
  await page.goto(BASE_URL + '/compete', { waitUntil: 'domcontentloaded' });
  const modal = page.getByTestId('auth-modal').first();
  await modal.waitFor({ state: 'visible', timeout: 30000 });
  await modal.getByTestId('auth-email-input').first().fill(u.email);
  await modal.getByTestId('auth-password-input').first().fill(u.password);
  await modal.getByTestId('auth-submit-btn').first().click();
  await modal.waitFor({ state: 'detached', timeout: 30000 });
  log('AUTH', `${u.email} logged in`);
}

async function runScenario(mode, playerIds) {
  log('SCENARIO', `=== START mode=${mode} ===`);
  const browser = await chromium.launch({ headless: true });
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  const errors = [];
  for (const [name, pg] of [['P1', p1], ['P2', p2]]) {
    pg.on('pageerror', e => errors.push(`${name} PAGEERROR: ${e.message}`));
  }

  try {
    await loginViaAuthModal(p1, USERS[0]);
    await loginViaAuthModal(p2, USERS[1]);

    // P1 creates game via API (authenticated from p1 context)
    log('FLOW', `P1 creating ${mode} game via API`);
    const createRes = await p1.evaluate(async (args) => {
      const res = await fetch('/api/compete/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: args.playerId, displayName: 'TestPlayer1', mode: args.mode,
          roundTimerSec: 120, totalRounds: 5, yearMin: -400, yearMax: 2025,
        }),
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    }, { playerId: playerIds[0], mode });
    log('FLOW', `create API: ok=${createRes.ok} status=${createRes.status}`);
    if (!createRes.ok) throw new Error(`create failed: ${JSON.stringify(createRes.data)}`);
    const gameId = createRes.data.gameId;
    const roomCode = createRes.data.roomCode;
    log('FLOW', `gameId=${gameId} roomCode=${roomCode}`);
    if (!gameId) throw new Error('No gameId in create response');

    // P1 navigates to lobby
    log('FLOW', 'P1 goto lobby');
    await p1.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded' });
    await p1.getByTestId('lobby-shell').waitFor({ state: 'visible', timeout: 30000 });

    // P2 joins via API then navigates
    log('FLOW', 'P2 joining via API');
    const joinRes = await p2.evaluate(async (rc) => {
      const res = await fetch('/api/compete/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: rc }),
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    }, roomCode);
    log('FLOW', `join API: ok=${joinRes.ok} status=${joinRes.status}`);
    if (!joinRes.ok) throw new Error(`join failed: ${JSON.stringify(joinRes.data)}`);

    log('FLOW', 'P2 goto lobby');
    await p2.goto(`${BASE_URL}/compete/${gameId}`, { waitUntil: 'domcontentloaded' });
    await p2.getByTestId('lobby-shell').waitFor({ state: 'visible', timeout: 30000 });

    // Both ready
    log('FLOW', 'P1 I\'m Ready');
    await p1.getByTestId('lobby-ready-btn').click();
    log('FLOW', 'P2 I\'m Ready');
    await p2.getByTestId('lobby-ready-btn').click();

    // Wait for round active
    log('FLOW', 'waiting for round-active-section P1');
    const r1 = await p1.getByTestId('round-active-section').waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
    log('FLOW', 'waiting for round-active-section P2');
    const r2 = await p2.getByTestId('round-active-section').waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
    log('FLOW', `round active: P1=${r1} P2=${r2}`);
    if (!r1) throw new Error('Round did not become active for P1');

    const roundIdx = await p1.getByTestId('round-active-section').getAttribute('data-round-index').catch(() => 'unknown');
    const roundStatus = await p1.getByTestId('round-active-section').getAttribute('data-status').catch(() => 'unknown');
    log('FLOW', `P1 round-active data-round-index=${roundIdx} data-status=${roundStatus}`);

    // P1 leaves to Home WITHOUT submitting
    log('FLOW', 'P1 leaving to Home');
    await p1.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await p1.waitForLoadState('networkidle').catch(() => {});
    await p1.waitForTimeout(2000); // let fetchActiveGames run

    // Switch to Your Turn tab
    log('FLOW', 'P1 switching to YOUR TURN tab');
    const ytTab = p1.getByRole('button', { name: /YOUR TURN/i }).first();
    await ytTab.waitFor({ state: 'visible', timeout: 15000 });
    await ytTab.click();
    await p1.waitForTimeout(2000);

    // Raw API evidence
    const apiResult = await p1.evaluate(async () => {
      const res = await fetch('/api/compete/active-games');
      const data = await res.json();
      return data;
    });
    log('EVIDENCE', `P1 /api/compete/active-games: ${JSON.stringify(apiResult)}`);

    // DOM evidence: game rows + mode badges in your_turn tab
    const domRows = await p1.evaluate(() => {
      const panel = document.querySelector('[class*="cardSubPanel"], [class*="CardSubPanel"]');
      const rows = Array.from((panel || document).querySelectorAll('[class*="gameRow"], [class*="GameRow"]'));
      return rows.map(r => ({
        text: (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        modeBadge: r.querySelector('[class*="modeBadge"], [class*="ModeBadge"]')?.textContent?.trim() || null,
        playBadge: r.querySelector('[class*="playBadge"], [class*="PlayBadge"]')?.textContent?.trim() || null,
      }));
    });
    log('EVIDENCE', `P1 Home your_turn DOM rows: ${JSON.stringify(domRows)}`);

    const yourTurnGames = (apiResult.games || []).filter(g => g.status === 'your_turn');
    const matching = yourTurnGames.find(g => g.game_id === gameId);
    log('VERIFY', `your_turn count=${yourTurnGames.length} matchingGame=${matching ? 'FOUND' : 'NOT FOUND'}`);
    if (matching) log('VERIFY', `matching mode=${matching.mode} round=${matching.round_current}/${matching.round_total}`);

    // Tap the your_turn row to re-enter
    log('FLOW', 'P1 tapping your_turn row to re-enter');
    const renav = p1.waitForURL(new RegExp(`/compete/${gameId}`), { timeout: 15000 }).catch(() => null);
    const row = p1.locator('[class*="gameRow"], [class*="GameRow"]').filter({ hasText: 'TestPlayer2' }).first();
    const rowVisible = await row.isVisible().catch(() => false);
    log('FLOW', `your_turn row visible=${rowVisible}`);
    if (rowVisible) { await row.click(); } else { log('FLOW', 'row not visible — navigating directly'); await p1.goto(`${BASE_URL}/compete/${gameId}`); }
    await renav;
    log('FLOW', `P1 re-navigated to ${p1.url()}`);

    const backInRound = await p1.getByTestId('round-active-section').waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
    const backIdx = backInRound ? await p1.getByTestId('round-active-section').getAttribute('data-round-index').catch(() => 'unknown') : 'n/a';
    const backStatus = backInRound ? await p1.getByTestId('round-active-section').getAttribute('data-status').catch(() => 'unknown') : 'n/a';
    const inLobby = await p1.getByTestId('lobby-shell').isVisible().catch(() => false);
    log('VERIFY', `re-entry roundActive=${backInRound} round=${backIdx} status=${backStatus} inLobby=${inLobby}`);

    log('SCENARIO', `=== END mode=${mode} ===`);
    return {
      mode, gameId, roomCode, roundIdx, roundStatus,
      apiGames: apiResult.games,
      yourTurnCount: yourTurnGames.length,
      matchingGameFound: !!matching,
      matchingMode: matching?.mode,
      matchingRoundCurrent: matching?.round_current,
      domRows,
      reentryRoundActive: backInRound,
      reentryRoundIdx: backIdx,
      reentryStatus: backStatus,
      reentryInLobby: inLobby,
      clientErrors: errors,
    };
  } catch (e) {
    log('ERROR', `scenario ${mode} failed: ${e.message}`);
    try { log('DEBUG', `P1 url=${p1.url()} P2 url=${p2.url()}`); } catch {}
    return { mode, error: e.message, clientErrors: errors };
  } finally {
    await browser.close();
  }
}

(async () => {
  log('SETUP', 'ensuring test users');
  const ids = {};
  for (const u of USERS) { ids[u.email] = await ensureUser(u); log('SETUP', `${u.email} -> ${ids[u.email]}`); }
  fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
  const playerIds = [ids[USERS[0].email], ids[USERS[1].email]];

  const syncResult = await runScenario('sync', playerIds);
  console.log('\n===== SYNC (RUSH) RESULT =====');
  console.log(JSON.stringify(syncResult, null, 2));

  const asyncResult = await runScenario('async', playerIds);
  console.log('\n===== ASYNC (RELAX) RESULT =====');
  console.log(JSON.stringify(asyncResult, null, 2));

  console.log('\n===== FINAL SUMMARY =====');
  console.log(JSON.stringify({ sync: syncResult, async: asyncResult }, null, 2));
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
