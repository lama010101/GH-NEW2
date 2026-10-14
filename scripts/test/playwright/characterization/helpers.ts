// AUTH-TEST-TWOCTXLOCK-CHARACTERIZE-1013-003 — shared helpers for the
// two-context auth-lock characterization harness.
import { BrowserContext, Page } from "@playwright/test";

export const MOCK_BASE = "http://localhost:3999";
export const APP_BASE = "http://localhost:3100";

// supabase-js derives the storage key from the URL hostname:
// http://localhost:3999 -> 'sb-localhost-auth-token'.
export const AUTH_COOKIE = "sb-localhost-auth-token";
export const AUTH_LOCK = `lock:${AUTH_COOKIE}`;

const USER_ID = "11111111-2222-3333-4444-555555555555";
const USER_EMAIL = "mock.user@localhost.test";

function b64url(buf: string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function makeJwt(userId: string, expiresAtUnix: number): string {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(
    JSON.stringify({
      sub: userId,
      aud: "authenticated",
      role: "authenticated",
      email: USER_EMAIL,
      iat: Math.floor(Date.now() / 1000),
      exp: expiresAtUnix,
    })
  );
  return `${h}.${p}.mock-sig`;
}

// A supabase-js Session object. `expired: true` forces the client into the
// refresh path on the very first getSession().
export function makeSession(opts: { expired: boolean; refreshToken: string }) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = opts.expired ? now - 300 : now + 3600;
  return {
    access_token: makeJwt(USER_ID, expiresAt),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: opts.refreshToken,
    user: {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: USER_EMAIL,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date(now - 3600).toISOString(),
      updated_at: new Date(now - 3600).toISOString(),
    },
  };
}

// @supabase/ssr writes the session as 'base64-' + base64url(JSON.stringify(session)).
export function sessionCookieValue(session: unknown): string {
  return `base64-${b64url(JSON.stringify(session))}`;
}

export interface MockRequest {
  seq: number;
  t: number;
  mono: number;
  method: string;
  url: string;
  status: number;
  grant_type?: string;
  outcome?: string;
  internal?: boolean;
}

export async function mockConfig(cfg: {
  reuseWindowMs?: number;
  profilesDelayMs?: number;
}): Promise<void> {
  await fetch(`${MOCK_BASE}/__config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
}

export async function mockReset(): Promise<void> {
  await fetch(`${MOCK_BASE}/__reset`, { method: "POST" });
}

export async function mockLog(): Promise<MockRequest[]> {
  const res = await fetch(`${MOCK_BASE}/__log`);
  const json = (await res.json()) as { requests: MockRequest[] };
  return json.requests;
}

// Registers a refresh token with the mock, then plants the matching session
// cookie on the browser context (host-only, like the real app writes).
export async function seedSessionCookie(
  context: BrowserContext,
  opts: { expired: boolean }
): Promise<void> {
  const refreshToken = `rt-seed-${Math.random().toString(36).slice(2, 10)}`;
  await fetch(`${MOCK_BASE}/__seed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const session = makeSession({ expired: opts.expired, refreshToken });
  await context.addCookies([
    {
      name: AUTH_COOKIE,
      value: sessionCookieValue(session),
      domain: "localhost",
      path: "/",
    },
  ]);
}

// Fails the test if the page ever requests a Supabase auth/REST host that is
// not localhost — the harness must never contact the real project.
export function assertNoExternalSupabase(page: Page): void {
  page.on("request", (req) => {
    const host = new URL(req.url()).host;
    const isSupabaseShape =
      /supabase/i.test(host) || /\/(auth|rest|realtime)\/v1\//.test(req.url());
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    if (isSupabaseShape && !isLocal) {
      throw new Error(`external Supabase request escaped localhost: ${req.url()}`);
    }
  });
}

// Collects console lines containing auth/lock keywords, tagged with a page label.
export function watchAuthConsole(page: Page, label: string): { lines: string[] } {
  const lines: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/gotrue|navigatorLock|Lock|supabase|SIGNED_OUT|stolen|steal/i.test(text)) {
      lines.push(`[${label}] ${text}`);
    }
  });
  return { lines };
}

// Subscribes to the supabase-js BroadcastChannel (same name the client uses)
// so SIGNED_OUT / TOKEN_REFRESHED notifications are directly observable.
export async function attachBroadcastSpy(page: Page): Promise<void> {
  await page.addInitScript((channel: string) => {
    (window as any).__bc = [];
    try {
      const bc = new BroadcastChannel(channel);
      bc.onmessage = (e) => {
        (window as any).__bc.push({ t: Date.now(), data: e.data });
      };
    } catch {
      /* BroadcastChannel unavailable — leave __bc empty */
    }
  }, AUTH_COOKIE);
}

export async function readBroadcastSpy(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as any).__bc ?? []);
}

// Median/min/max for the results table.
export function stats(nums: number[]): { min: number; med: number; max: number } {
  const s = [...nums].sort((a, b) => a - b);
  return {
    min: s[0],
    med: s[Math.floor(s.length / 2)],
    max: s[s.length - 1],
  };
}

// After load: which auth state did the page settle into, and what auth cookies survive.
export async function pageAuthState(page: Page): Promise<{
  hatchVisible: boolean;
  errorState: boolean;
  sbCookies: string[];
}> {
  const hatchVisible = await page
    .getByRole("button", { name: /clear session/i })
    .isVisible()
    .catch(() => false);
  const errorState = await page
    .getByRole("button", { name: /retry/i })
    .isVisible()
    .catch(() => false);
  const sbCookies = (await page.context().cookies())
    .map((c) => c.name)
    .filter((n) => n.startsWith("sb-"));
  return { hatchVisible, errorState, sbCookies };
}
