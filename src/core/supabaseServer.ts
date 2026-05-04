import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client for use in Server Components, API routes, and
 * middleware. Uses the service-role key so it bypasses RLS — only call this
 * from trusted server-side code, never expose to the client.
 */
export function createSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
