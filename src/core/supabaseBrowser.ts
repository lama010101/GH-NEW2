import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error("IDENTITY_VIOLATION: NEXT_PUBLIC_SUPABASE_URL is not set. Identity bootstrap cannot proceed.");
}
if (!SUPABASE_ANON_KEY) {
  throw new Error("IDENTITY_VIOLATION: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Identity bootstrap cannot proceed.");
}

export const supabaseBrowser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
