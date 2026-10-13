// AUTH-TEST-TWOCTXLOCK-CHARACTERIZE-1013-003
//
// Characterizes the field bug "installed PWA + Chrome tab on one origin =>
// identity stays loading >10s, 'Clear session & restart' loop" against a
// LOCAL MOCK Supabase (scripts/test/playwright/characterization/mock-supabase.mjs).
// Evidence only — no product code is exercised or changed.
//
// Hypotheses under test:
//   H1  a hung/frozen context holds lock:sb-<ref>-auth-token; every getSession
//       in the other context waits the 5s lockAcquireTimeout and then steals.
//   H2  both contexts refresh the same single-use refresh token concurrently
//       and the loser wipes the shared cookie (refresh_token_already_used,
//       SIGNED_OUT broadcast).
//
// Identity-ready proxy: the terminal step of bootstrapIdentity() is
// fetchDisplayName() -> GET /rest/v1/profiles. The mock's request log
// timestamps the response; identity-ready ~= profiles response end.

import { test, expect, BrowserContext, Page } from "@playwright/test";
import {
  APP_BASE,
  MOCK_BASE,
  AUTH_LOCK,
  assertNoExternalSupabase,
  attachBroadcastSpy,
  makeSession,
  mockConfig,
  mockLog,
  mockReset,
  pageAuthState,
  readBroadcastSpy,
  seedSessionCookie,
  sessionCookieValue,
  stats,
  watchAuthConsole,
} from "./helpers";

const RUNS = 5;
const DEADLINE_MS = 35_000;

// Poll the mock log until the profiles response lands (identity-ready proxy),
// OR every watched page has been bounced to /login (session destroyed —
// identity can never resolve), OR the deadline passes. `identityReadyMs: null`
// is a legitimate outcome, not a harness hang.
async function waitForOutcome(
  navStart: number,
  pages: Page[] = [],
  deadlineMs: number = DEADLINE_MS
): Promise<{
  identityReadyMs: number | null;
  tokenCalls: number;
  alreadyUsed: number;
  replays: number;
  gapTokenEndToProfilesMs: number | null;
  hatchSeenMs: number | null;
  log: Awaited<ReturnType<typeof mockLog>>;
}> {
  const deadline = Date.now() + deadlineMs;
  let log = await mockLog();
  let hatchSeenMs: number | null = null;
  while (Date.now() < deadline) {
    log = await mockLog();
    if (hatchSeenMs === null) {
      for (const p of pages) {
        const hatch = await p
          .getByRole("button", { name: /clear session/i })
          .isVisible()
          .catch(() => false);
        if (hatch) {
          hatchSeenMs = Date.now() - navStart;
          break;
        }
      }
    }
    if (log.some((r) => r.url.startsWith("/rest/v1/profiles"))) break;
    if (pages.length > 0 && pages.every((p) => p.url().includes("/login"))) {
      await new Promise((r) => setTimeout(r, 800)); // settle
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  log = await mockLog();
  const tokenCalls = log.filter((r) => r.grant_type === "refresh_token");
  const profiles = log.find((r) => r.url.startsWith("/rest/v1/profiles"));
  const lastToken = tokenCalls[tokenCalls.length - 1];
  return {
    identityReadyMs: profiles ? profiles.t - navStart : null,
    tokenCalls: tokenCalls.length,
    alreadyUsed: log.filter((r) => r.outcome === "already_used").length,
    replays: log.filter((r) => r.outcome === "replay_within_window").length,
    gapTokenEndToProfilesMs:
      profiles && lastToken ? profiles.t - lastToken.t : null,
    hatchSeenMs,
    log,
  };
}

async function newWatchedPage(context: BrowserContext, label: string) {
  const page = await context.newPage();
  assertNoExternalSupabase(page);
  await attachBroadcastSpy(page);
  const console_ = watchAuthConsole(page, label);
  return { page, console: console_.lines };
}

function printRun(tag: string, run: Record<string, unknown>) {
  console.log(`[RESULT] ${tag} ${JSON.stringify(run)}`);
}

// workers:1 in the config serializes scenarios already; no serial-mode skip
// semantics wanted — an expected-failure must not suppress later scenarios.
test.describe("AUTH-TEST-TWOCTXLOCK-1013-003 auth-lock characterization", () => {
  test.beforeEach(async () => {
    await mockReset();
  });

  test("A: single context, expired access token, cold load x5", async ({ browser }) => {
    const runs: Record<string, unknown>[] = [];
    for (let i = 0; i < RUNS; i++) {
      await mockConfig({ reuseWindowMs: 10_000, profilesDelayMs: 0 });
      await mockReset();
      const context = await browser.newContext();
      await seedSessionCookie(context, { expired: true });
      const { page } = await newWatchedPage(context, `A${i}`);
      const navStart = Date.now();
      await page.goto(`${APP_BASE}/practice`, { waitUntil: "commit" });
      const outcome = await waitForOutcome(navStart, [page]);
      const state = await pageAuthState(page);
      const run = {
        run: i,
        identityReadyMs: outcome.identityReadyMs,
        tokenCalls: outcome.tokenCalls,
        alreadyUsed: outcome.alreadyUsed,
        hatchVisible: state.hatchVisible,
        url: page.url(),
        sbCookies: state.sbCookies,
      };
      printRun("A", run);
      runs.push(run);
      await context.close();
    }
    const ready = runs.map((r) => r.identityReadyMs as number);
    const calls = runs.map((r) => r.tokenCalls as number);
    printRun("A-summary", {
      identityReady: stats(ready),
      tokenCalls: stats(calls),
      hatchFired: runs.filter((r) => r.hatchVisible).length,
    });
    expect(ready.every((v) => v !== null && v > 0)).toBe(true);
  });

  // H2 in ONE context: shared storage + shared Web Locks + BroadcastChannel —
  // the spec's tab+PWA proxy. Reuse windows 10s and 0s.
  for (const windowMs of [10_000, 0] as const) {
    test(`B: two pages one context, expired token, reuseWindow=${windowMs}ms x5`, async ({
      browser,
    }) => {
      const runs: Record<string, unknown>[] = [];
      for (let i = 0; i < RUNS; i++) {
        await mockConfig({ reuseWindowMs: windowMs, profilesDelayMs: 0 });
        await mockReset();
        const context = await browser.newContext();
        await seedSessionCookie(context, { expired: true });
        const a = await newWatchedPage(context, `B${i}-p1`);
        const b = await newWatchedPage(context, `B${i}-p2`);
        const navStart = Date.now();
        await Promise.all([
          a.page.goto(`${APP_BASE}/practice`, { waitUntil: "commit" }),
          b.page.goto(`${APP_BASE}/practice`, { waitUntil: "commit" }),
        ]);
        const outcome = await waitForOutcome(navStart, [a.page, b.page]);
        const [sa, sb] = await Promise.all([
          pageAuthState(a.page),
          pageAuthState(b.page),
        ]);
        const bcA = await readBroadcastSpy(a.page);
        const bcB = await readBroadcastSpy(b.page);
        const run = {
          run: i,
          identityReadyMs: outcome.identityReadyMs,
          tokenCalls: outcome.tokenCalls,
          alreadyUsed: outcome.alreadyUsed,
          replays: outcome.replays,
          urls: { p1: a.page.url(), p2: b.page.url() },
          hatch: { p1: sa.hatchVisible, p2: sb.hatchVisible },
          error: { p1: sa.errorState, p2: sb.errorState },
          cookies: { p1: sa.sbCookies.length, p2: sb.sbCookies.length },
          bcSignedOut: {
            p1: JSON.stringify(bcA).includes("SIGNED_OUT"),
            p2: JSON.stringify(bcB).includes("SIGNED_OUT"),
          },
          bcEvents: { p1: (bcA as unknown[]).length, p2: (bcB as unknown[]).length },
        };
        printRun(`B(w=${windowMs})`, run);
        runs.push(run);
        await context.close();
      }
      const ready = runs.map((r) => r.identityReadyMs as number);
      const calls = runs.map((r) => r.tokenCalls as number);
      const summary = {
        identityReady: stats(ready),
        tokenCalls: stats(calls),
        alreadyUsedTotal: runs.reduce((n, r) => n + (r.alreadyUsed as number), 0),
        hatchFired: runs.filter(
          (r) => (r.hatch as { p1: boolean; p2: boolean }).p1 || (r.hatch as { p1: boolean; p2: boolean }).p2
        ).length,
        signedOutSeen: runs.filter(
          (r) => (r.bcSignedOut as { p1: boolean; p2: boolean }).p1 || (r.bcSignedOut as { p1: boolean; p2: boolean }).p2
        ).length,
      };
      // Field-bug signature: a context that had a valid session loses it with
      // no user action — refresh_token_already_used and/or a wiped cookie jar
      // and/or a forced /login bounce.
      const defect =
        summary.alreadyUsedTotal > 0 ||
        runs.some(
          (r) =>
            (r.cookies as { p1: number; p2: number }).p1 === 0 ||
            (r.cookies as { p1: number; p2: number }).p2 === 0 ||
            (r.urls as { p1: string; p2: string }).p1.includes("/login") ||
            (r.urls as { p1: string; p2: string }).p2.includes("/login")
        );
      test.fail(
        defect,
        "H2 reproduced: refresh_token_already_used -> session wipe -> /login"
      );
      printRun(`B(w=${windowMs})-summary`, { ...summary, defect });
      expect(
        defect,
        "H2 defect signature observed — see [RESULT] lines"
      ).toBe(false);
    });
  }

  // H2 in ISOLATED contexts: two separate storage partitions (separate locks,
  // cookies, BroadcastChannels) — the faithful model if a real installed PWA
  // has its own partition. Exploratory variant added because one-context B
  // shares the navigator lock and serializes refreshes by construction.
  for (const windowMs of [10_000, 0] as const) {
    test(`B': two isolated contexts, same refresh token, reuseWindow=${windowMs}ms x3`, async ({
      browser,
    }) => {
      const runs: Record<string, unknown>[] = [];
      for (let i = 0; i < 3; i++) {
        await mockConfig({ reuseWindowMs: windowMs, profilesDelayMs: 0 });
        await mockReset();
        const sharedRt = `rt-shared-${i}-${Math.random().toString(36).slice(2, 8)}`;
        await fetch(`${MOCK_BASE}/__seed`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: sharedRt }),
        });
        const session = makeSession({ expired: true, refreshToken: sharedRt });
        const cookieValue = sessionCookieValue(session);
        const ctxA = await browser.newContext();
        const ctxB = await browser.newContext();
        for (const c of [ctxA, ctxB]) {
          await c.addCookies([
            {
              name: "sb-localhost-auth-token",
              value: cookieValue,
              domain: "localhost",
              path: "/",
            },
          ]);
        }
        // NOTE: each context's middleware getSession() refreshes server-side —
        // two middleware calls are themselves concurrent refreshers of rt-shared.
        const a = await newWatchedPage(ctxA, `B'${i}-c1`);
        const b = await newWatchedPage(ctxB, `B'${i}-c2`);
        const navStart = Date.now();
        await Promise.all([
          a.page.goto(`${APP_BASE}/practice`, { waitUntil: "commit" }),
          b.page.goto(`${APP_BASE}/practice`, { waitUntil: "commit" }),
        ]);
        const outcome = await waitForOutcome(navStart, [a.page, b.page]);
        await new Promise((r) => setTimeout(r, 1_500));
        const [sa, sb] = await Promise.all([
          pageAuthState(a.page),
          pageAuthState(b.page),
        ]);
        const run = {
          run: i,
          identityReadyMs: outcome.identityReadyMs,
          tokenCalls: outcome.tokenCalls,
          alreadyUsed: outcome.alreadyUsed,
          replays: outcome.replays,
          urls: { c1: a.page.url(), c2: b.page.url() },
          hatch: { c1: sa.hatchVisible, c2: sb.hatchVisible },
          error: { c1: sa.errorState, c2: sb.errorState },
          cookies: { c1: sa.sbCookies.length, c2: sb.sbCookies.length },
        };
        printRun(`B'(w=${windowMs})`, run);
        runs.push(run);
        await ctxA.close();
        await ctxB.close();
      }
      const summary = {
        tokenCalls: stats(runs.map((r) => r.tokenCalls as number)),
        alreadyUsedTotal: runs.reduce((n, r) => n + (r.alreadyUsed as number), 0),
        replaysTotal: runs.reduce((n, r) => n + (r.replays as number), 0),
        signedOutCookiesWiped: runs.filter(
          (r) =>
            (r.cookies as { c1: number; c2: number }).c1 === 0 ||
            (r.cookies as { c1: number; c2: number }).c2 === 0
        ).length,
      };
      const defect =
        summary.alreadyUsedTotal > 0 || summary.signedOutCookiesWiped > 0;
      test.fail(
        defect,
        "H2 reproduced in isolated contexts: refresh_token_already_used -> SIGNED_OUT + cookie wipe"
      );
      printRun(`B'(w=${windowMs})-summary`, { ...summary, defect });
      expect(
        defect,
        "H2 defect signature observed — see [RESULT] lines"
      ).toBe(false);
    });
  }

  // H1: page A (same context+origin — locks are shared per storage
  // partition, so both must live in ONE context) takes the supabase
  // navigator lock forever (frozen-context proxy). Page B then loads.
  // Session is seeded VALID (non-expired): middleware's server-side
  // getSession() would otherwise consume the refresh itself, and the point
  // here is the CLIENT-side getSession mutex — every getSession acquires
  // the navigator lock, valid session or not.
  test("C: page A holds lock forever, page B loads x5", async ({ browser }) => {
    const runs: Record<string, unknown>[] = [];
    for (let i = 0; i < RUNS; i++) {
      await mockConfig({ reuseWindowMs: 10_000, profilesDelayMs: 0 });
      await mockReset();
      const context = await browser.newContext();
      const pageA = await context.newPage();
      assertNoExternalSupabase(pageA);
      const consoleA = watchAuthConsole(pageA, `C${i}-A`);
      // Take the lock BEFORE any page script runs.
      await pageA.addInitScript((lockName: string) => {
        (window as any).__holdLock = true;
        navigator.locks
          .request(lockName, () => new Promise(() => {}))
          .catch(() => {});
      }, AUTH_LOCK);
      await pageA.goto(`${APP_BASE}/login`, { waitUntil: "commit" });
      await new Promise((r) => setTimeout(r, 800)); // ensure A owns the lock
      const { page: pageB, console: consoleB } = await newWatchedPage(
        context,
        `C${i}-B`
      );
      await seedSessionCookie(context, { expired: false });
      const navStart = Date.now();
      await pageB.goto(`${APP_BASE}/practice`, { waitUntil: "commit" });
      // 21s deadline: comfortably past the 10s escape-hatch threshold (dev-server
      // compile contention can delay React mount past 10s), and short enough for
      // 5 runs inside the 150s test timeout. `identityReadyMs: null` is data.
      const outcome = await waitForOutcome(navStart, [pageB], 21_000);
      const stateB = await pageAuthState(pageB);
      const run = {
        run: i,
        identityReadyMs: outcome.identityReadyMs,
        tokenCalls: outcome.tokenCalls,
        gapTokenEndToProfilesMs: outcome.gapTokenEndToProfilesMs,
        hatchSeenMs: outcome.hatchSeenMs,
        hatchVisible: stateB.hatchVisible,
        stealLines: consoleB.filter((l) =>
          /stolen|steal|Forcefully|timed out|not released/i.test(l)
        ),
        consoleA: consoleA.lines.slice(0, 5),
      };
      printRun("C", run);
      runs.push(run);
      await context.close();
    }
    const ready = runs.map((r) => (r.identityReadyMs as number) ?? 21_000);
    const gaps = runs
      .map((r) => r.gapTokenEndToProfilesMs as number | null)
      .filter((v): v is number => v !== null);
    const summary = {
      identityReady: stats(ready),
      secondGetSessionGapMs: gaps.length ? stats(gaps) : "no profiles call",
      hatchFired:
        runs.filter((r) => r.hatchVisible).length ||
        runs.filter((r) => r.hatchSeenMs !== null).length,
      hatchSeenMs: stats(
        runs
          .map((r) => r.hatchSeenMs as number | null)
          .filter((v): v is number => v !== null)
      ),
      stealPrinted: runs.filter((r) => (r.stealLines as string[]).length > 0)
        .length,
    };
    // Field-bug signature: identity stays loading past the 10s escape-hatch
    // threshold in a context that merely coexists with a lock holder.
    const defect =
      summary.hatchFired > 0 ||
      runs.some((r) => r.identityReadyMs === null);
    test.fail(
      defect,
      "H1 reproduced: held lock stalls identity past the 10s escape hatch"
    );
    printRun("C-summary", { ...summary, defect });
    expect(
      defect,
      "H1 defect signature observed — see [RESULT] lines"
    ).toBe(false);
  });

  // H1 variant: page A re-takes the lock for 6s every ~1s — a context that is
  // not dead but pathologically lock-greedy.
  test("D: page A re-takes lock 6s/~1s, page B loads x5", async ({ browser }) => {
    const runs: Record<string, unknown>[] = [];
    for (let i = 0; i < RUNS; i++) {
      await mockConfig({ reuseWindowMs: 10_000, profilesDelayMs: 0 });
      await mockReset();
      const context = await browser.newContext();
      const pageA = await context.newPage();
      assertNoExternalSupabase(pageA);
      watchAuthConsole(pageA, `D${i}-A`);
      await pageA.addInitScript((lockName: string) => {
        (window as any).__stop = false;
        const retake = () => {
          if ((window as any).__stop) return;
          navigator.locks
            .request(
              lockName,
              () =>
                new Promise((resolve) => setTimeout(resolve, 6_000))
            )
            .catch(() => {})
            .finally(() => {
              setTimeout(retake, 1_000);
            });
        };
        retake();
      }, AUTH_LOCK);
      await pageA.goto(`${APP_BASE}/login`, { waitUntil: "commit" });
      await new Promise((r) => setTimeout(r, 800));
      const { page: pageB, console: consoleB } = await newWatchedPage(
        context,
        `D${i}-B`
      );
      await seedSessionCookie(context, { expired: false });
      const navStart = Date.now();
      await pageB.goto(`${APP_BASE}/practice`, { waitUntil: "commit" });
      const outcome = await waitForOutcome(navStart, [pageB]);
      const stateB = await pageAuthState(pageB);
      const run = {
        run: i,
        identityReadyMs: outcome.identityReadyMs,
        tokenCalls: outcome.tokenCalls,
        gapTokenEndToProfilesMs: outcome.gapTokenEndToProfilesMs,
        hatchSeenMs: outcome.hatchSeenMs,
        hatchVisible: stateB.hatchVisible,
        stealLines: consoleB.filter((l) =>
          /stolen|steal|Forcefully|timed out|not released/i.test(l)
        ).length,
      };
      printRun("D", run);
      runs.push(run);
      await pageA.evaluate(() => {
        (window as any).__stop = true;
      });
      await context.close();
    }
    const ready = runs.map((r) => (r.identityReadyMs as number) ?? DEADLINE_MS);
    const gaps = runs
      .map((r) => r.gapTokenEndToProfilesMs as number | null)
      .filter((v): v is number => v !== null);
    const summary = {
      identityReady: stats(ready),
      secondGetSessionGapMs: gaps.length ? stats(gaps) : "no profiles call",
      hatchFired:
        runs.filter((r) => r.hatchVisible).length ||
        runs.filter((r) => r.hatchSeenMs !== null).length,
      hatchSeenMs: stats(
        runs
          .map((r) => r.hatchSeenMs as number | null)
          .filter((v): v is number => v !== null)
      ),
      stealsTotal: runs.reduce((n, r) => n + (r.stealLines as number), 0),
      neverReady: runs.filter((r) => r.identityReadyMs === null).length,
    };
    const defect =
      summary.hatchFired > 0 ||
      summary.neverReady > 0 ||
      runs.some(
        (r) =>
          r.identityReadyMs !== null && (r.identityReadyMs as number) > 10_000
      );
    test.fail(
      defect,
      "H1 reproduced: lock re-taking stalls identity past the 10s escape-hatch threshold"
    );
    printRun("D-summary", { ...summary, defect });
    expect(
      defect,
      "H1 defect signature observed — see [RESULT] lines"
    ).toBe(false);
  });
});
