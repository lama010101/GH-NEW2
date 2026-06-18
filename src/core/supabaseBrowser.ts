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
  await supabaseBrowser.auth.getUser();
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}
