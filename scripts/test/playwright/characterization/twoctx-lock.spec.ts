// AUTH-TEST-TWOCTXLOCK-CHARACTERIZE-1013-003
//
// Characterizes the field bug "installed PWA + Chrome tab on one origin =>
// identity stays loading >10s, 'Clear session & restart' loop" against a
// LOCAL MOCK Supabase (scripts/test/playwright/characterization/mock-supabase.mjs).
// Evidence only — no product code is exercised or changed.
//
// Hypotheses under test:
//   H1  a hung/frozen context holds lock:sb-<ref>-auth-token; every getSession
//       in the other context queues behind it. Measured (C/C2): NO 5s steal —
//       supabase-js 2.106.1 _initSupabaseAuthClient() forwards
//       `lockAcquireTimeout: undefined` (own key), Object.assign over
//       GoTrueClient DEFAULT_OPTIONS keeps undefined, navigatorLock() arms no
//       timer (`undefined > 0` is false) -> the request waits forever.
//   H2  both contexts refresh the same single-use refresh token concurrently
//       and the loser wipes the shared cookie (refresh_token_already_used,
//       SIGNED_OUT broadcast).
//
// Identity-ready proxy: the terminal step of bootstrapIdentity() is
// fetchDisplayName() -> GET /rest/v1/profiles. The mock's request log
// timestamps the response; identity-ready ~= profiles response end.

import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
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

const C_RUNS = 3;
const C_WINDOW_MS = 21_000;

interface ConsoleEntry {
  t: number;
  type: string;
  text: string;
}

function captureConsole(page: Page): ConsoleEntry[] {
  const out: ConsoleEntry[] = [];
  page.on("console", (m) =>
    out.push({ t: Date.now(), type: m.type(), text: m.text().slice(0, 400) })
  );
  page.on("pageerror", (e) =>
    out.push({ t: Date.now(), type: "pageerror", text: String(e).slice(0, 400) })
  );
  return out;
}

// Holds a uniquely named lock forever so navigator.locks.query() reveals
// which clientId belongs to which page.
async function tagLockClient(page: Page, label: string): Promise<void> {
  await page.addInitScript((name: string) => {
    navigator.locks
      .request(name, () => new Promise(() => {}))
      .catch(() => {});
  }, `diag-client:${label}`);
}

// Pass-through wrapper on navigator.locks.request for the auth lock only:
// logs the options each caller passes (signal / ifAvailable / steal) and
// whether that signal is ever aborted — navigatorLock() aborts it when its
// acquire timer fires, so "never aborted" means no timer was armed.
async function traceAuthLockRequests(page: Page): Promise<void> {
  await page.addInitScript((lockName: string) => {
    const locks = navigator.locks;
    const orig = locks.request.bind(locks);
    const t0 = performance.timeOrigin;
    (locks as any).request = (name: string, a: any, b?: any) => {
      if (name === lockName && typeof a === "object" && a !== null) {
        const sig: AbortSignal | undefined = a.signal;
        console.log(
          `[diag-lock] request ${name} mode=${a.mode} signal=${!!sig} ifAvailable=${!!a.ifAvailable} steal=${!!a.steal} at=${Math.round(t0 + performance.now())}`
        );
        sig?.addEventListener("abort", () =>
          console.log(`[diag-lock] signal aborted ${name} at=${Math.round(t0 + performance.now())}`)
        );
      }
      return b === undefined ? orig(name, a) : orig(name, a, b);
    };
  }, AUTH_LOCK);
}

interface LockSnap {
  ms: number;
  held: string[];
  pending: string[];
  reactMounted: boolean;
  err?: string;
}

async function pollLocks(page: Page, navStart: number, durationMs: number): Promise<LockSnap[]> {
  const snaps: LockSnap[] = [];
  while (Date.now() - navStart < durationMs) {
    const tick = Date.now();
    try {
      const s = await page.evaluate(async () => {
        const q = await navigator.locks.query();
        const fmt = (l: { name?: string; clientId?: string }) => `${l.name}@${l.clientId}`;
        const reactMounted = [document as object, document.body as object].some(
          (n) => !!n && Object.keys(n).some((k) => k.startsWith("__react"))
        );
        return {
          held: (q.held ?? []).map(fmt),
          pending: (q.pending ?? []).map(fmt),
          reactMounted,
        };
      });
      snaps.push({ ms: tick - navStart, ...s });
    } catch (e) {
      snaps.push({
        ms: tick - navStart,
        held: [],
        pending: [],
        reactMounted: false,
        err: String(e).slice(0, 80),
      });
    }
    await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - tick))));
  }
  return snaps;
}

// Collapses the 500ms snapshots into change events, with clientIds replaced
// by page labels (from the diag-client:* tag locks) and tag locks dropped.
function lockTimeline(snaps: LockSnap[]): string[] {
  const ids = new Map<string, string>();
  for (const s of snaps) {
    for (const h of s.held) {
      const m = /^diag-client:(\w+)@(.+)$/.exec(h);
      if (m) ids.set(m[2], m[1]);
    }
  }
  const label = (e: string) => {
    const at = e.lastIndexOf("@");
    const id = e.slice(at + 1);
    return `${e.slice(0, at)}@${ids.get(id) ?? id.slice(0, 8)}`;
  };
  const out: string[] = [];
  let prev = "";
  for (const s of snaps) {
    const cur = s.err
      ? `ERR ${s.err}`
      : `held=[${s.held.filter((h) => !h.startsWith("diag-client:")).map(label).join(",")}] pending=[${s.pending.map(label).join(",")}]`;
    if (cur !== prev) out.push(`${s.ms}ms ${cur}`);
    prev = cur;
  }
  return out;
}

async function runLockHolderScenario(
  browser: Browser,
  variant: "C" | "C2",
  i: number
): Promise<Record<string, unknown>> {
  await mockConfig({ reuseWindowMs: 10_000, profilesDelayMs: 0 });
  await mockReset();
  const context = await browser.newContext();
  const pageA = await context.newPage();
  assertNoExternalSupabase(pageA);
  const consoleA = captureConsole(pageA);
  await tagLockClient(pageA, "A");
  await traceAuthLockRequests(pageA);
  // Take the lock BEFORE any page script runs.
  await pageA.addInitScript((lockName: string) => {
    (window as any).__holdLock = true;
    navigator.locks
      .request(lockName, () => new Promise(() => {}))
      .catch(() => {});
  }, AUTH_LOCK);
  if (variant === "C") {
    await pageA.goto(`${APP_BASE}/login`, { waitUntil: "commit" });
  } else {
    // Same origin (same lock partition), but no app document or JS at all.
    await pageA.route(`${APP_BASE}/__diag-blank`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body>diag blank lock holder</body></html>",
      })
    );
    await pageA.goto(`${APP_BASE}/__diag-blank`, { waitUntil: "commit" });
  }
  await new Promise((r) => setTimeout(r, 800)); // ensure A owns the lock
  const pageB = await context.newPage();
  assertNoExternalSupabase(pageB);
  await attachBroadcastSpy(pageB);
  const consoleB = captureConsole(pageB);
  await tagLockClient(pageB, "B");
  await traceAuthLockRequests(pageB);
  const domEvents: Record<string, number> = {};
  let lastChunkT = 0;
  pageB.on("domcontentloaded", () => (domEvents.dcl ??= Date.now()));
  pageB.on("load", () => (domEvents.load ??= Date.now()));
  pageB.on("requestfinished", (req) => {
    if (req.url().includes("/_next/static/")) lastChunkT = Date.now();
  });
  await seedSessionCookie(context, { expired: false });
  const navStart = Date.now();
  console.log(`[DIAG] ${variant} run ${i} navStart=${navStart}`);
  await pageB.goto(`${APP_BASE}/practice`, { waitUntil: "commit" });
  const commitMs = Date.now() - navStart;
  const [outcome, snaps] = await Promise.all([
    waitForOutcome(navStart, [pageB], C_WINDOW_MS),
    pollLocks(pageB, navStart, C_WINDOW_MS),
  ]);
  const stateB = await pageAuthState(pageB);
  const rel = (t: number | undefined) => (t ? t - navStart : null);
  const forceful = (c: ConsoleEntry[]) =>
    rel(c.find((e) => /Forcefully acquiring/.test(e.text))?.t);
  const firstMount = snaps.find((s) => s.reactMounted);
  const log = outcome.log.filter((r) => !r.internal);
  const run = {
    run: i,
    variant,
    identityReadyMs: outcome.identityReadyMs,
    forcefulBMs: forceful(consoleB),
    forcefulAMs: forceful(consoleA),
    commitMs,
    dclMs: rel(domEvents.dcl),
    loadMs: rel(domEvents.load),
    lastChunkMs: rel(lastChunkT),
    reactMountedMs: firstMount ? firstMount.ms : null,
    firstConsoleBMs: rel(consoleB[0]?.t),
    authLockRequestsB: consoleB
      .filter((e) => e.text.startsWith("[diag-lock] request"))
      .map((e) => `${e.t - navStart}ms ${e.text.replace(/ at=\d+$/, "")}`),
    authLockAbortsB: consoleB.filter((e) => e.text.startsWith("[diag-lock] signal aborted")).length,
    tokenRequests: log.filter((r) => r.url.startsWith("/auth/v1/token")).length,
    profilesRequests: log.filter((r) => r.url.startsWith("/rest/v1/profiles")).length,
    mockRequests: log.map((r) => `${r.t - navStart}ms ${r.method} ${r.url.split("?")[0]} ${r.status}`),
    hatchSeenMs: outcome.hatchSeenMs,
    hatchVisible: stateB.hatchVisible,
    urlB: pageB.url(),
  };
  printRun(variant, run);
  console.log(`[DIAG] ${variant}${i} locks(B view):\n  ${lockTimeline(snaps).join("\n  ")}`);
  const dump = (tag: string, c: ConsoleEntry[]) =>
    console.log(
      `[DIAG] ${variant}${i} console ${tag} (${c.length}):\n  ${c
        .map((e) => `${e.t - navStart}ms [${e.type}] ${e.text.replace(/\s+/g, " ").slice(0, 220)}`)
        .join("\n  ")}`
    );
  dump("A", consoleA);
  dump("B", consoleB);
  await context.close();
  return run;
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
  //   C   page A loads the app (/login) with the lock pre-taken by an init
  //       script, so A's own supabase client is a second lock contender.
  //   C2  page A is a blank same-origin document (routed, no app JS) — the
  //       ONLY contender for B is the dead holder.
  // AUTH-DIAG-SCENARIOC-NOSTEAL-1013-006 instrumentation: every console
  // message of A and B (no filter), navigator.locks.query() from B every
  // 500ms for 21s, React-mount and dev-server timing for /practice.
  for (const variant of ["C", "C2"] as const) {
    const title =
      variant === "C"
        ? `C: page A holds lock forever, page B loads x${C_RUNS}`
        : `C2: blank page A (no app) holds lock forever, page B loads x${C_RUNS}`;
    test(title, async ({ browser }) => {
      test.setTimeout(60_000 + C_RUNS * 45_000);
      const runs: Record<string, unknown>[] = [];
      for (let i = 0; i < C_RUNS; i++) {
        runs.push(await runLockHolderScenario(browser, variant, i));
      }
      const ready = runs.map((r) => (r.identityReadyMs as number) ?? C_WINDOW_MS);
      const summary = {
        identityReady: stats(ready),
        neverReady: runs.filter((r) => r.identityReadyMs === null).length,
        hatchFired: runs.filter((r) => r.hatchSeenMs !== null || r.hatchVisible).length,
        forcefulB: runs.filter((r) => r.forcefulBMs !== null).length,
        forcefulA: runs.filter((r) => r.forcefulAMs !== null).length,
      };
      // Field-bug signature: identity stays loading past the 10s escape-hatch
      // threshold in a context that merely coexists with a lock holder.
      const defect = summary.hatchFired > 0 || summary.neverReady > 0;
      test.fail(
        defect,
        `H1 reproduced (${variant}): held lock stalls identity forever — no steal, ` +
          "lockAcquireTimeout resolves to undefined via supabase-js, so no acquire timer"
      );
      printRun(`${variant}-summary`, { ...summary, defect });
      expect(
        defect,
        "H1 defect signature observed — see [RESULT] lines"
      ).toBe(false);
    });
  }

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
