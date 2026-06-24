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
  SUPABASE_ANON_KEY
);

/**
 * Returns the current access token after refreshing a stale session.
 * Prefer this over `auth.getSession().access_token` because `getSession()`
 * does not refresh the token, while `getUser()` does.
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    await Promise.race([
      supabaseBrowser.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("getValidAccessToken: auth.getUser() timed out after 8s")),
          8000
        )
      ),
    ]);
  } catch (err) {
    console.warn(err instanceof Error ? err.message : String(err));
    // auth.getUser() timed out (or rejected). Do NOT call getSession() here —
    // Supabase GoTrueClient serializes getUser()/getSession() through a shared
    // internal lock; if getUser()'s underlying network call is still pending,
    // getSession() will block on that same lock forever. Return null immediately.
    return null;
  }
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}
