"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}
if (!SUPABASE_ANON_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
}

export const supabaseBrowser: SupabaseClient = createBrowserClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
    },
  }
);

/**
 * Returns the current access token from the local auth session.
 *
 * Reads `auth.getSession()` only — never the network-bound getUser() call. The auth cookie
 * is kept fresh by middleware on every navigation, so `getSession()` returns
 * a valid token without holding the GoTrueClient shared lock behind a network
 * call. (getSession() MAY issue an awaited token-refresh network call when the
 * stored token is expired; that acquisition drains normally and is safe.)
 *
 * Single-flight: concurrent callers share one in-flight `getSession()` call
 * instead of each triggering their own, so the 15s invitations poll, the
 * realtime INSERT channel, and the mount effect do not pile up waiters.
 *
 * On no session / failure: returns `null` immediately and makes NO further
 * GoTrueClient call in this path. The signed-out UI state is driven by
 * `onAuthStateChange` in `identity.ts`, not by this function.
 */
let getValidAccessTokenInFlight: Promise<string | null> | null = null;

export async function getValidAccessToken(): Promise<string | null> {
  if (getValidAccessTokenInFlight) {
    return getValidAccessTokenInFlight;
  }
  getValidAccessTokenInFlight = (async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      return session?.access_token ?? null;
    } finally {
      getValidAccessTokenInFlight = null;
    }
  })();
  return getValidAccessTokenInFlight;
}
