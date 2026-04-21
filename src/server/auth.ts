import { createClient } from "@supabase/supabase-js";

type AuthResult =
  | { ok: true; playerId: string }
  | { ok: false; status: number; error: string };

let cachedClient: ReturnType<typeof createClient> | null = null;

function getServerSupabaseClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase auth env is not configured");
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return cachedClient;
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

export async function requireAuthenticatedPlayer(request: Request): Promise<AuthResult> {
  try {
    const token = readBearerToken(request);
    if (!token) {
      return { ok: false, status: 401, error: "Authorization bearer token is required" };
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user?.id) {
      return { ok: false, status: 401, error: "Invalid or expired authorization token" };
    }

    return { ok: true, playerId: data.user.id };
  } catch {
    return { ok: false, status: 500, error: "Unable to verify authenticated player" };
  }
}
