import { createAuthenticatedServerClient } from "@/core/supabaseServer";

/**
 * Throws if the current request's session is missing or the user's
 * profiles.role is not 'admin'. Returns the session for callers that
 * need user info. Used by admin server actions as a defense-in-depth
 * check independent of middleware.
 */
export async function requireAdmin() {
  const supabase = createAuthenticatedServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !data || data.role !== "admin") {
    throw new Error("Forbidden");
  }

  return session;
}
