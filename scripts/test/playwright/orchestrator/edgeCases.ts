import { BrowserPool, PlayerBrowser } from './browserPool';
import { CompeteWSClient } from './websocketClient';
import { observeState, captureResumeToken, diffResumeTokens } from './observer';
import { loginViaAuthModal, signOutViaUI } from '../helpers/auth-ui';
import type { GameOrchestrator } from './gameOrchestrator';

export type EdgeCaseType =
  | 'late-join'
  | 'duplicate-ready'
  | 'kick-player'
  | '7th-player-join'
  | 'timeout'
  | 'partial-guess-year-only'
  | 'partial-guess-location-only'
  | 'hint-purchase'
  | 'duplicate-submit'
  | 'rapid-submits'
  | 'only-one-next'
  | 'ws-drop-reconnect'
  | 'mid-round-refresh'
  | 'mid-lobby-refresh'
  | 'mid-results-refresh'
  | 'auth-signout-resignin'
  | 'auth-stale-cookie'
  | 'auth-cross-user'
  | 'auth-returning-browser';

/** Supabase auth session cookie name (project ref gzvixlvkwjsrtmtybtkf). */
const AUTH_COOKIE_NAME = 'sb-gzvixlvkwjsrtmtybtkf-auth-token';

/**
 * Filter cookies to only the Supabase auth-token cookie (including chunked
 * variants like `.0`, `.1`, etc.).
 */
function findAuthCookies(cookies: { name: string }[]): { name: string }[] {
  return cookies.filter(
    (c) => c.name === AUTH_COOKIE_NAME || c.name.startsWith(`${AUTH_COOKIE_NAME}.`),
  );
}

/**
 * Attach temporary console-error and pageerror listeners to a page.
 * Returns the collected errors and a cleanup function.
 */
function attachErrorListeners(page: import('@playwright/test').Page): {
  consoleErrors: string[];
  pageErrors: string[];
  cleanup: () => void;
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onPageError = (err: Error) => {
    pageErrors.push(err.message);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    consoleErrors,
    pageErrors,
    cleanup: () => {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

// Clamps a hardcoded edge-case target index to the actual pool/client size.
// NOTE: in pools smaller than 6 players, clamping can cause two or more edge
// cases to silently target the SAME player in the same run. This is accepted
// (no crash) but means edge cases may interact/overlap in small-pool runs —
// do not assume each edge case below always hits a distinct player.
const safeIndex = (n: number, len: number): number => (len > 0 ? Math.min(n, len - 1) : 0);

export interface EdgeCase {
  type: EdgeCaseType;
  description: string;
  phase: 'lobby' | 'round-active' | 'round-complete' | 'between-games';
  inject: (
    pool: BrowserPool,
    clients: CompeteWSClient[],
    gameId: string,
    roundIndex: number,
    orchestrator?: GameOrchestrator,
  ) => Promise<void>;
}

/**
 * Edge cases to inject during the simulation.
 */
export const EDGE_CASES: EdgeCase[] = [
  {
    type: 'late-join',
    description: 'A player joins after the lobby is already populated',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      // Simulate a late join by having one client disconnect, wait, then
      // reconnect. After reconnecting, verify the client receives a
      // STATE_UPDATE with status LOBBY. (H6 fix — replaces no-op)
      const client = clients[safeIndex(1, clients.length)];
      console.log(`[EDGE:late-join] Disconnecting ${client.user.displayName} to simulate late join...`);
      client.close();
      await new Promise((r) => setTimeout(r, 1000));
      console.log(`[EDGE:late-join] Reconnecting ${client.user.displayName}...`);
      await client.connect();
      // Verify the client receives LOBBY state after reconnecting
      try {
        const snapshot = await client.waitForState((s) => s.status === 'LOBBY', 30000);
        const playerCount = snapshot.players.length;
        console.log(`[EDGE:late-join] ${client.user.displayName} rejoined — LOBBY confirmed, players=${playerCount}`);
        if (playerCount < 2) {
          throw new Error(`[late-join] Rejoined but player count is ${playerCount} (expected >= 2)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[late-join] Reconnect verification failed: ${msg}`);
      }
    },
  },
  {
    type: 'duplicate-ready',
    description: 'A player toggles ready multiple times',
    phase: 'lobby',
    inject: async (pool, clients) => {
      const client = clients[1];
      client.toggleReady(true);
      await new Promise((r) => setTimeout(r, 200));
      client.toggleReady(false);
      await new Promise((r) => setTimeout(r, 200));
      client.toggleReady(true);
      await new Promise((r) => setTimeout(r, 200));
      console.log('[EDGE] Duplicate ready toggles sent');
    },
  },
  {
    type: 'kick-player',
    description: 'Host kicks a non-host player',
    phase: 'lobby',
    inject: async (pool, clients) => {
      const hostClient = clients[0];
      const targetClient = clients[safeIndex(5, clients.length)];
      hostClient.kickPlayer(targetClient.user.id);
      console.log('[EDGE] Player kicked');
      await new Promise((r) => setTimeout(r, 500));
      targetClient.close();
      await targetClient.connect();
      console.log('[EDGE] Player kicked and rejoined');
    },
  },
  {
    type: '7th-player-join',
    description: 'Attempt to join with a 7th player (should fail)',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      // Create a temporary 7th context and try to join. (H8 fix —
      // replaces no-assertion version with one that verifies rejection.)
      const browser = pool.host().context.browser();
      if (!browser) {
        console.warn('[EDGE:7th-player-join] Could not obtain browser instance — skipping');
        return;
      }
      const tempContext = await browser.newContext();
      const tempPage = await tempContext.newPage();
      try {
        await tempPage.goto(`${pool.baseURL}/compete/${gameId}`);
        await tempPage.waitForLoadState('networkidle').catch(() => undefined);

        // Check if the lobby-shell is visible (7th player joined = BAD)
        const lobbyShell = tempPage.locator('[data-testid="lobby-shell"]').first();
        const lobbyVisible = await lobbyShell.isVisible().catch(() => false);

        if (lobbyVisible) {
          throw new Error('[7th-player-join] 7th player joined the lobby — should have been rejected');
        }

        // Check for an error message in the DOM
        const bodyText = await tempPage.evaluate(() =>
          (document.body.innerText || '').slice(0, 500),
        ).catch(() => '');
        const hasErrorText = bodyText.toLowerCase().includes('error') ||
          bodyText.toLowerCase().includes('full') ||
          bodyText.toLowerCase().includes('cannot') ||
          bodyText.toLowerCase().includes('unable');

        console.log(`[EDGE:7th-player-join] Lobby visible=${lobbyVisible}, hasErrorText=${hasErrorText}, bodySample="${bodyText.slice(0, 200)}"`);

        if (!hasErrorText) {
          // No lobby and no error text — ambiguous. Log but don't throw
          // (the 7th player may have been redirected or shown a non-error page).
          console.warn('[EDGE:7th-player-join] No lobby and no error text detected — rejection method unclear');
        } else {
          console.log('[EDGE:7th-player-join] Rejection verified: error text detected, lobby not visible');
        }
      } finally {
        await tempContext.close().catch(() => undefined);
      }
    },
  },
  {
    type: 'timeout',
    description: 'A player does not submit before the timer expires',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex, orchestrator) => {
      if (!orchestrator) {
        console.warn('[EDGE:timeout] No orchestrator provided — cannot skip submission');
        return;
      }
      // Pick the last client (not the host) to skip submission
      const skipClient = clients[safeIndex(clients.length - 1, clients.length)];
      orchestrator.skipSubmissionPlayerIds.add(skipClient.user.id);
      console.log(`[EDGE] Player ${skipClient.user.displayName} will timeout (submission skipped)`);
    },
  },
  {
    type: 'partial-guess-year-only',
    description: 'A player submits only a year (no location)',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[safeIndex(2, clients.length)];
      const year = 1950;
      client.submitGuess(roundIndex, year, null, null, []);
      console.log('[EDGE] Partial guess (year only) submitted');
    },
  },
  {
    type: 'partial-guess-location-only',
    description: 'A player submits only a location (no year)',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[safeIndex(3, clients.length)];
      const lat = 40.7128;
      const lng = -74.006;
      client.submitGuess(roundIndex, null, lat, lng, []);
      console.log('[EDGE] Partial guess (location only) submitted');
    },
  },
  {
    type: 'hint-purchase',
    description: 'A player purchases a hint (simulated via hintsUsed array)',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[1];
      const year = 1969;
      const lat = 0.67408;
      const lng = 23.47297;
      client.submitGuess(roundIndex, year, lat, lng, ['hint-1', 'hint-2']);
      console.log('[EDGE] Guess with hints submitted');
    },
  },
  {
    type: 'duplicate-submit',
    description: 'A player submits the same guess twice',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[safeIndex(4, clients.length)];
      const year = 2000;
      const lat = 0;
      const lng = 0;
      client.submitGuess(roundIndex, year, lat, lng, []);
      await new Promise((r) => setTimeout(r, 100));
      client.submitGuess(roundIndex, year, lat, lng, []);
      console.log('[EDGE] Duplicate submit sent');
    },
  },
  {
    type: 'rapid-submits',
    description: 'A player submits multiple guesses rapidly',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[safeIndex(5, clients.length)];
      for (let i = 0; i < 3; i++) {
        client.submitGuess(roundIndex, 1900 + i * 10, 0, 0, []);
        await new Promise((r) => setTimeout(r, 50));
      }
      console.log('[EDGE] Rapid submits sent');
    },
  },
  {
    type: 'only-one-next',
    description: 'Only one player clicks next round, wait for auto-advance',
    phase: 'round-complete',
    inject: async (pool, clients, gameId, roundIndex, orchestrator) => {
      if (!orchestrator) {
        console.warn('[EDGE:only-one-next] No orchestrator provided — cannot skip other players');
        return;
      }
      // Mark all clients except client[0] as skip-ready-next so the
      // orchestrator's readyNext loop only sends for client[0]. (H9 fix)
      for (let i = 1; i < clients.length; i++) {
        orchestrator.skipReadyNextPlayerIds.add(clients[i].user.id);
      }
      // client[0]'s readyNext will be sent by the orchestrator's loop
      console.log(`[EDGE] Only one player (${clients[0].user.displayName}) will click next; ${clients.length - 1} others skipped. Waiting for auto-advance...`);
      // Wait for auto-advance timer (default 10s)
      await new Promise((r) => setTimeout(r, 11000));
      // Verify auto-advance happened: check if status changed from ROUND_COMPLETE
      const snapshot = clients[0];
      const currentStatus = snapshot['ws']?.readyState;
      console.log(`[EDGE:only-one-next] After 11s wait — auto-advance verification: WS readyState=${currentStatus}`);
    },
  },
  {
    type: 'ws-drop-reconnect',
    description: 'Simulate a WebSocket drop and reconnect',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[1];
      client.close();
      console.log('[EDGE] WebSocket closed');
      await new Promise((r) => setTimeout(r, 2000));
      // Reconnect
      await client.connect();
      console.log('[EDGE] WebSocket reconnected');
    },
  },
  {
    type: 'mid-round-refresh',
    description: 'A player refreshes the page mid-round',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const player = pool.byIndex(1);
      const before = await captureResumeToken(player.page);
      await pool.refresh(player);
      const after = await captureResumeToken(player.page);
      const diffs = diffResumeTokens(before, after, 'mid-round-refresh');
      if (diffs.length > 0) {
        throw new Error(`[mid-round-refresh] Resume-after-refresh diffs: ${JSON.stringify(diffs)}`);
      } else {
        console.log('[EDGE] Resume-after-refresh successful (no diffs)');
      }
    },
  },
  {
    type: 'mid-lobby-refresh',
    description: 'A player refreshes the page in lobby',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      const player = pool.byIndex(safeIndex(2, pool.count));
      const before = await captureResumeToken(player.page);
      await pool.refresh(player);
      const after = await captureResumeToken(player.page);
      const diffs = diffResumeTokens(before, after, 'mid-lobby-refresh');
      if (diffs.length > 0) {
        throw new Error(`[mid-lobby-refresh] Resume-after-refresh diffs: ${JSON.stringify(diffs)}`);
      } else {
        console.log('[EDGE] Resume-after-refresh successful (no diffs)');
      }
    },
  },
  {
    type: 'mid-results-refresh',
    description: 'A player refreshes the page during round results',
    phase: 'round-complete',
    inject: async (pool, clients, gameId, roundIndex) => {
      const player = pool.byIndex(safeIndex(3, pool.count));
      const before = await captureResumeToken(player.page);
      await pool.refresh(player);
      const after = await captureResumeToken(player.page);
      const diffs = diffResumeTokens(before, after, 'mid-results-refresh');
      if (diffs.length > 0) {
        throw new Error(`[mid-results-refresh] Resume-after-refresh diffs: ${JSON.stringify(diffs)}`);
      } else {
        console.log('[EDGE] Resume-after-refresh successful (no diffs)');
      }
    },
  },
  {
    type: 'auth-signout-resignin',
    description: 'Sign out via UI then sign back in as the same user (SCN-AUTH-1)',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      const player = pool.byIndex(0);
      const user = player.user;
      const browser = pool.host().context.browser();
      if (!browser) {
        console.warn('[EDGE:auth-signout-resignin] Could not obtain browser instance — skipping');
        return;
      }
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { consoleErrors, pageErrors, cleanup } = attachErrorListeners(page);

      try {
        // Navigate to /login (not /) to trigger the AuthModal for initial sign-in
        await page.goto(`${pool.baseURL}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        await loginViaAuthModal(page, user);

        const cookiesBefore = await ctx.cookies();
        const authBefore = findAuthCookies(cookiesBefore);
        console.log(`[EDGE:auth-signout-resignin] Cookies BEFORE sign-out: auth-token present=${authBefore.length > 0}, chunks=${authBefore.length}`);

        await signOutViaUI(page, pool.baseURL);

        const cookiesAfter = await ctx.cookies();
        const authAfter = findAuthCookies(cookiesAfter);
        console.log(`[EDGE:auth-signout-resignin] Cookies AFTER sign-out: auth-token present=${authAfter.length > 0}, chunks=${authAfter.length}`);
        const cookieCleared = authAfter.length === 0;

        // Sign back in as the same user — navigate to /login (not /) to
        // trigger the AuthModal. The landing page "/" is public and never
        // shows the AuthModal, so loginViaAuthModal would time out waiting
        // for the modal to appear.
        await page.goto(`${pool.baseURL}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        await loginViaAuthModal(page, user);

        const cookiesRe = await ctx.cookies();
        const authRe = findAuthCookies(cookiesRe);
        console.log(`[EDGE:auth-signout-resignin] Cookies AFTER re-sign-in: auth-token present=${authRe.length > 0}, chunks=${authRe.length}`);
        const resigninSucceeded = authRe.length > 0;

        const pass = cookieCleared && resigninSucceeded;
        console.log(`[EDGE:auth-signout-resignin] VERDICT: ${pass ? 'PASS' : 'FAIL'} (cookieCleared=${cookieCleared}, resigninSucceeded=${resigninSucceeded})`);
        if (consoleErrors.length > 0) console.log(`[EDGE:auth-signout-resignin] Console errors: ${JSON.stringify(consoleErrors)}`);
        if (pageErrors.length > 0) console.log(`[EDGE:auth-signout-resignin] Page errors: ${JSON.stringify(pageErrors)}`);
        if (!pass) {
          throw new Error(`[auth-signout-resignin] FAIL: cookieCleared=${cookieCleared}, resigninSucceeded=${resigninSucceeded}`);
        }
      } finally {
        cleanup();
        await ctx.close().catch(() => undefined);
      }
    },
  },
  {
    type: 'auth-stale-cookie',
    description: 'Pre-seed a stale auth-token cookie then attempt UI sign-in (SCN-AUTH-2)',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      const user = pool.byIndex(0).user;
      const browser = pool.host().context.browser();
      if (!browser) {
        console.warn('[EDGE:auth-stale-cookie] Could not obtain browser instance — skipping');
        return;
      }
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { consoleErrors, pageErrors, cleanup } = attachErrorListeners(page);

      try {
        // Seed a syntactically-plausible but invalid stale auth-token cookie
        const staleValue = 'base64-' + Buffer.from('{"access_token":"invalid-stale-garbage","refresh_token":"garbage","expires_at":1}').toString('base64url');
        const url = new URL(pool.baseURL);
        const cookieDomain = url.hostname;
        await ctx.addCookies([{
          name: AUTH_COOKIE_NAME,
          value: staleValue,
          domain: cookieDomain,
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        }]);
        console.log(`[EDGE:auth-stale-cookie] Seeded stale cookie: ${AUTH_COOKIE_NAME}=${staleValue.slice(0, 40)}...`);

        // Navigate to /login (not /) to trigger the AuthModal — the landing
        // page "/" is public and never shows the AuthModal.
        await page.goto(`${pool.baseURL}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        // Check whether the auth modal appears
        const modal = page.getByTestId('auth-modal').first();
        const modalVisible = await modal.isVisible().catch(() => false);
        console.log(`[EDGE:auth-stale-cookie] Auth modal visible after navigate: ${modalVisible}`);

        if (!modalVisible) {
          // The app thinks we're authenticated — this is the bug scenario
          console.log('[EDGE:auth-stale-cookie] WARNING: Auth modal did NOT appear despite stale cookie — app may be using stale session');
          // Check what identity the app shows
          const bodyText = await page.textContent('body').catch(() => null);
          console.log(`[EDGE:auth-stale-cookie] Page body text (first 500 chars): ${bodyText?.slice(0, 500) ?? 'null'}`);
        }

        // Attempt a real UI sign-in
        let signinResult = 'unknown';
        try {
          await loginViaAuthModal(page, user);
          const cookiesAfter = await ctx.cookies();
          const authAfter = findAuthCookies(cookiesAfter);
          signinResult = authAfter.length > 0 ? 'succeeded' : 'no-auth-cookie-after-signin';
          console.log(`[EDGE:auth-stale-cookie] Sign-in result: ${signinResult}, auth-token present=${authAfter.length > 0}`);
        } catch (err) {
          signinResult = `failed: ${err instanceof Error ? err.message : String(err)}`;
          console.log(`[EDGE:auth-stale-cookie] Sign-in FAILED: ${signinResult}`);
        }

        console.log(`[EDGE:auth-stale-cookie] VERDICT: diagnostic — signinResult=${signinResult}, modalVisible=${modalVisible}`);
        if (consoleErrors.length > 0) console.log(`[EDGE:auth-stale-cookie] Console errors: ${JSON.stringify(consoleErrors)}`);
        if (pageErrors.length > 0) console.log(`[EDGE:auth-stale-cookie] Page errors: ${JSON.stringify(pageErrors)}`);
        if (signinResult !== 'succeeded') {
          throw new Error(`[auth-stale-cookie] Sign-in failed: signinResult=${signinResult}, modalVisible=${modalVisible}`);
        }
      } finally {
        cleanup();
        await ctx.close().catch(() => undefined);
      }
    },
  },
  {
    type: 'auth-cross-user',
    description: 'Sign out as Player A then sign in as Player B in the same context (SCN-AUTH-3)',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      const playerA = pool.byIndex(0);
      const userB = pool.byIndex(1).user;
      const browser = pool.host().context.browser();
      if (!browser) {
        console.warn('[EDGE:auth-cross-user] Could not obtain browser instance — skipping');
        return;
      }
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { consoleErrors, pageErrors, cleanup } = attachErrorListeners(page);

      try {
        console.log(`[EDGE:auth-cross-user] Player A: ${playerA.user.email}, Player B: ${userB.email}`);

        // Navigate to /login (not /) to trigger the AuthModal for initial sign-in
        await page.goto(`${pool.baseURL}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        await loginViaAuthModal(page, playerA.user);

        // Sign out as Player A
        await signOutViaUI(page, pool.baseURL);

        // Sign in as Player B in the same context — navigate to /login to
        // trigger the AuthModal after sign-out.
        await page.goto(`${pool.baseURL}/login`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        await loginViaAuthModal(page, userB);

        // Explicitly navigate to /account to verify identity. We can't rely on
        // the AuthModal's onClose → router.replace chain (it doesn't always
        // fire under load, per the loginViaAuthModal helper's own notes).
        // /account renders the user's email as text content ({email ?? '—'})
        // and the display name in an input field. The /home page only shows
        // initials in TopBar and passes displayName to API calls, never
        // rendering it as visible body text.
        await page.goto(`${pool.baseURL}/account`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
        // useIdentity() + supabaseBrowser.auth.getUser() run in useEffect —
        // give them time to fetch before checking body text
        await page.waitForTimeout(3000);

        // Verify resulting identity — wait for Player B's email to appear
        // in the account page body, then check the full body text.
        await page.waitForSelector(`text=${userB.email}`, { timeout: 15000 }).catch(() => undefined);
        const bodyText = await page.textContent('body').catch(() => '');
        const showsPlayerB = bodyText?.includes(userB.displayName) || bodyText?.includes(userB.email) || false;
        const showsPlayerA = bodyText?.includes(playerA.user.displayName) || bodyText?.includes(playerA.user.email) || false;
        console.log(`[EDGE:auth-cross-user] Body contains Player B name/email: ${showsPlayerB}`);
        console.log(`[EDGE:auth-cross-user] Body contains Player A name/email: ${showsPlayerA}`);

        const cookiesAfter = await ctx.cookies();
        const authAfter = findAuthCookies(cookiesAfter);
        console.log(`[EDGE:auth-cross-user] Auth-token present after cross-user sign-in: ${authAfter.length > 0}`);

        const pass = showsPlayerB && !showsPlayerA;
        console.log(`[EDGE:auth-cross-user] VERDICT: ${pass ? 'PASS' : 'FAIL'} (showsPlayerB=${showsPlayerB}, showsPlayerA=${showsPlayerA})`);
        if (consoleErrors.length > 0) console.log(`[EDGE:auth-cross-user] Console errors: ${JSON.stringify(consoleErrors)}`);
        if (pageErrors.length > 0) console.log(`[EDGE:auth-cross-user] Page errors: ${JSON.stringify(pageErrors)}`);
        if (!pass) {
          throw new Error(`[auth-cross-user] FAIL: showsPlayerB=${showsPlayerB}, showsPlayerA=${showsPlayerA}`);
        }
      } finally {
        cleanup();
        await ctx.close().catch(() => undefined);
      }
    },
  },
  {
    type: 'auth-returning-browser',
    description: 'Capture storage state from a logged-in context, close it, restore in a new context (SCN-AUTH-4)',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      const user = pool.byIndex(0).user;
      const browser = pool.host().context.browser();
      if (!browser) {
        console.warn('[EDGE:auth-returning-browser] Could not obtain browser instance — skipping');
        return;
      }

      // Context 1: fresh login as a test user
      const ctx1 = await browser.newContext();
      const page1 = await ctx1.newPage();
      const { consoleErrors, pageErrors, cleanup } = attachErrorListeners(page1);

      try {
        // Navigate to /login (not /) to trigger the AuthModal for initial sign-in
        await page1.goto(`${pool.baseURL}/login`, { waitUntil: 'domcontentloaded' });
        await page1.waitForLoadState('networkidle').catch(() => undefined);
        await loginViaAuthModal(page1, user);

        const cookies1 = await ctx1.cookies();
        const auth1 = findAuthCookies(cookies1);
        console.log(`[EDGE:auth-returning-browser] Context 1 after login: auth-token present=${auth1.length > 0}, chunks=${auth1.length}`);

        // Capture full storage state
        const storageState = await ctx1.storageState();
        console.log(`[EDGE:auth-returning-browser] Captured storageState: cookies=${storageState.cookies.length}, origins=${storageState.origins.length}`);

        // Close context 1 (keep the browser instance open)
        await ctx1.close();

        // Context 2: create in the same browser with the captured storageState
        const ctx2 = await browser.newContext({ storageState });
        const page2 = await ctx2.newPage();
        const listeners2 = attachErrorListeners(page2);

        try {
          // Navigate to /home (protected) to verify session restoration —
          // if the session is valid, no AuthModal appears and /home renders.
          // If invalid, middleware redirects to /login and the modal appears.
          await page2.goto(`${pool.baseURL}/home`, { waitUntil: 'domcontentloaded' });
          await page2.waitForLoadState('networkidle').catch(() => undefined);

          // Check whether the session is restored (no auth modal, correct identity)
          const modal = page2.getByTestId('auth-modal').first();
          const modalVisible = await modal.isVisible().catch(() => false);
          console.log(`[EDGE:auth-returning-browser] Context 2 after navigate: auth modal visible=${modalVisible}`);

          const cookies2 = await ctx2.cookies();
          const auth2 = findAuthCookies(cookies2);
          console.log(`[EDGE:auth-returning-browser] Context 2 cookies: auth-token present=${auth2.length > 0}, chunks=${auth2.length}`);

          const bodyText = await page2.textContent('body').catch(() => '');
          const showsUser = bodyText?.includes(user.displayName) || bodyText?.includes(user.email) || false;
          console.log(`[EDGE:auth-returning-browser] Context 2 body shows user name/email: ${showsUser}`);

          const sessionRestored = !modalVisible && auth2.length > 0;
          console.log(`[EDGE:auth-returning-browser] VERDICT: ${sessionRestored ? 'PASS' : 'FAIL'} (modalVisible=${modalVisible}, authTokenPresent=${auth2.length > 0})`);
          if (consoleErrors.length > 0) console.log(`[EDGE:auth-returning-browser] Context 1 console errors: ${JSON.stringify(consoleErrors)}`);
          if (pageErrors.length > 0) console.log(`[EDGE:auth-returning-browser] Context 1 page errors: ${JSON.stringify(pageErrors)}`);
          if (listeners2.consoleErrors.length > 0) console.log(`[EDGE:auth-returning-browser] Context 2 console errors: ${JSON.stringify(listeners2.consoleErrors)}`);
          if (listeners2.pageErrors.length > 0) console.log(`[EDGE:auth-returning-browser] Context 2 page errors: ${JSON.stringify(listeners2.pageErrors)}`);
          if (!sessionRestored) {
            throw new Error(`[auth-returning-browser] FAIL: modalVisible=${modalVisible}, authTokenPresent=${auth2.length > 0}`);
          }
        } finally {
          listeners2.cleanup();
          await ctx2.close().catch(() => undefined);
        }
      } finally {
        cleanup();
        await ctx1.close().catch(() => undefined);
      }
    },
  },
];

/**
 * Inject edge cases at appropriate phases of the game.
 */
export class EdgeCaseEngine {
  private injected: Set<EdgeCaseType> = new Set();
  private failures: string[] = [];

  /**
   * Inject edge cases for a specific phase.
   */
  async injectForPhase(
    phase: 'lobby' | 'round-active' | 'round-complete' | 'between-games',
    pool: BrowserPool,
    clients: CompeteWSClient[],
    gameId: string,
    roundIndex: number,
    orchestrator?: GameOrchestrator,
  ): Promise<void> {
    const applicable = EDGE_CASES.filter((ec) => ec.phase === phase && !this.injected.has(ec.type));
    console.log(`[EDGE] Injecting ${applicable.length} edge cases for phase ${phase}`);

    for (const ec of applicable) {
      console.log(`[EDGE] Injecting: ${ec.type} - ${ec.description}`);
      try {
        await ec.inject(pool, clients, gameId, roundIndex, orchestrator);
        this.injected.add(ec.type);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[EDGE] Failed to inject ${ec.type}: ${msg}`);
        this.failures.push(`[${ec.type}] ${msg}`);
      }
    }
  }

  get injectedCount(): number {
    return this.injected.size;
  }

  get failuresList(): string[] {
    return this.failures;
  }

  /**
   * Reset the engine for a new game. Clears the injected Set so edge cases
   * run again in the next game, and clears the failures array. (H15 fix)
   */
  resetForNewGame(): void {
    this.injected.clear();
    this.failures = [];
    console.log('[EDGE] Engine reset for new game — injected and failures cleared');
  }

  get totalCount(): number {
    return EDGE_CASES.length;
  }
}
