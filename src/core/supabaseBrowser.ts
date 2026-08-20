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
    },
  }
);

/**
 * Reads the current session from the auth cookie.
 *
 * Single-flight: concurrent callers share one in-flight `getSession()` call
 * instead of each triggering their own.
 *
 * Returns session or null on any error (never throws).
 * NO Promise.race, NO timeout, NO retry.
 */
let readSessionInFlight: Promise<Session | null> | null = null;

export async function readSession(): Promise<Session | null> {
  if (readSessionInFlight) {
    return readSessionInFlight;
  }
  readSessionInFlight = (async (): Promise<Session | null> => {
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
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
 * Returns the current access token from the local auth session.
 *
 * Thin wrapper around readSession().
 */
export async function getValidAccessToken(): Promise<string | null> {
  const s = await readSession();
  return s?.access_token ?? null;
}
