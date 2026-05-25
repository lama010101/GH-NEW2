import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _supabaseBrowserInstance: SupabaseClient | undefined;

function getSupabaseBrowserClient(): SupabaseClient {
  if (_supabaseBrowserInstance) return _supabaseBrowserInstance;

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL) {
    throw new Error("IDENTITY_VIOLATION: NEXT_PUBLIC_SUPABASE_URL is not set. Identity bootstrap cannot proceed.");
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error("IDENTITY_VIOLATION: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Identity bootstrap cannot proceed.");
  }

  _supabaseBrowserInstance = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _supabaseBrowserInstance;
}

export const supabaseBrowser = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseBrowserClient() as unknown as Record<string | symbol, unknown>)[prop];
  }
});
