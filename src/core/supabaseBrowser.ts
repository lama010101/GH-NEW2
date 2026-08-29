"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, Session } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}
if (!SUPABASE_ANON_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
}

export const supabaseBrowser: SupabaseClient = createBrowserClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      // Share auth cookies across apex (guess-history.com) and www
      // (www.guess-history.com). vercel.json force-redirects apex→www on
      // full page loads, but Next.js soft-navigations issue same-origin RSC
      // fetches that follow that 308 and lose host-only cookies on the hop.
      // A leading-dot domain makes the session portable across both hosts.
      // Omitted in dev so localhost keeps working (browsers reject cookies
      // whose domain does not match the actual host).
      ...(process.env.NODE_ENV === "production"
        ? { domain: ".guess-history.com" }
        : {}),
    },
  }
);

/**
 * Reads the current session from the auth cookie.
 *
 * Single-flight: concurrent callers share one in-flight `getSession()` call
 * instead of each triggering their own.
 *
 * Backoff + circuit-breaker (MP-FIX-AUTH-REFRESHSTORM-BACKOFF-002):
 * - MIN_SESSION_INTERVAL_MS: application-wide cap of 1 getSession() attempt
 *   per 10s. Calls within the window return the cached lastSession without
 *   re-entering the SDK's refresh path. Stops 429 retry storms caused by
 *   multiple useEffects per mount each re-arming the SDK refresh on an
 *   expired/invalid token.
 * - MAX_NULL_RESULTS: after 2 consecutive null sessions, forceClearAuthStorage()
 *   fires once and the counter resets, so the app falls back to the login
 *   state instead of looping into the rate limit.
 *
 * Returns session or null on any error (never throws).
 * NO Promise.race, NO timeout, NO retry loop.
 */
let readSessionInFlight: Promise<Session | null> | null = null;
let lastSessionAttemptMs = 0;
let lastSession: Session | null = null;
let consecutiveNullResults = 0;
const MIN_SESSION_INTERVAL_MS = 10_000;
const MAX_NULL_RESULTS = 2;

export async function readSession(): Promise<Session | null> {
  if (readSessionInFlight) {
    return readSessionInFlight;
  }
  // Backoff guard: if we attempted a session read very recently, return the
  // cached session without re-entering the SDK refresh path. This caps
  // application-wide refresh entry to <=1 per MIN_SESSION_INTERVAL_MS even
  // when many effects/mounts call readSession() in quick succession.
  const now = Date.now();
  if (now - lastSessionAttemptMs < MIN_SESSION_INTERVAL_MS) {
    return lastSession;
  }
  lastSessionAttemptMs = now;
  readSessionInFlight = (async (): Promise<Session | null> => {
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (session) {
        consecutiveNullResults = 0;
        lastSession = session;
      } else {
        consecutiveNullResults += 1;
        if (consecutiveNullResults >= MAX_NULL_RESULTS) {
          forceClearAuthStorage();
          consecutiveNullResults = 0;
          lastSession = null;
        }
      }
      return session;
    } catch {
      return null;
    } finally {
      readSessionInFlight = null;
    }
  })();
  return readSessionInFlight;
}

/**
 * Force-clears all Supabase auth storage (cookies and localStorage) without
 * calling GoTrue. Lock-free escape hatch for recovery scenarios where auth
 * methods might deadlock, and circuit-breaker target for readSession().
 *
 * Relocated here (MP-FIX-AUTH-REFRESHSTORM-BACKOFF-002) so the backoff guard
 * can call it without an import cycle. Re-exported by identity.ts.
 */
export function forceClearAuthStorage(): void {
  // Clear all Supabase cookies
  if (typeof document !== 'undefined') {
    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.split('=')[0].trim();
      if (name.startsWith('sb-')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  }

  // Clear all Supabase localStorage keys
  if (typeof localStorage !== 'undefined') {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) {
        localStorage.removeItem(key);
      }
    });
  }
}

/**
 * Returns the current access token from the local auth session.
 *
 * Thin wrapper around readSession().
 */
export async function getValidAccessToken(): Promise<string | null> {
  const s = await readSession();
  return s?.access_token ?? null;
}
