import { supabaseBrowser } from "./supabaseBrowser";

const NEW_USER_WINDOW_MS = 60_000;

export type IdentityState =
  | { status: "loading" }
  | { status: "ready"; playerId: string; isAnonymous: boolean; displayName: string; isNewUser: boolean }
  | { status: "unauthenticated" }
  | { status: "error"; error: string };

let cachedState: IdentityState = { status: "loading" };

const subscribers = new Set<(state: IdentityState) => void>();

export function getCachedIdentityState(): IdentityState {
  return cachedState;
}

function notifySubscribers(state: IdentityState) {
  subscribers.forEach(cb => cb(state));
}

let resolveReady: ((playerId: string) => void) | null = null;
let readyPromise = new Promise<string>((resolve) => {
  resolveReady = resolve;
});

let bootstrapped = false;
let signingOut = false;
let bootstrapPromise: Promise<IdentityState> | null = null;

function resetReadyPromise() {
  readyPromise = new Promise<string>((resolve) => {
    resolveReady = resolve;
  });
}

async function fetchDisplayName(userId: string): Promise<string> {
  const attempts = 4;
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabaseBrowser
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    if (data?.display_name) {
      return data.display_name.trim();
    }

    if (error && error.code !== 'PGRST116') {
      return 'Player';
    }

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** i));
    }
  }

  return 'Player';
}

export async function bootstrapIdentity(): Promise<IdentityState> {
  if (bootstrapped && cachedState.status === "ready") {
    return cachedState;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapped = true;

  bootstrapPromise = (async (): Promise<IdentityState> => {
    // ── Phase 1: Fast path — getSession() reads from the auth cookie (kept
    // fresh by middleware on every navigation). This is instant and avoids the
    // GoTrue internal lock hang that getUser() can trigger on slow networks.
    // With @supabase/ssr cookie-based auth, getSession() reads the cookie
    // (not localStorage), and middleware already refreshed it server-side.
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (session?.user?.id) {
        const user = session.user;
        const isAnonymous = user.is_anonymous ?? false;
        const displayName = await fetchDisplayName(user.id);
        const createdAt = new Date(user.created_at).getTime();
        const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : createdAt;
        const isNewUser = Math.abs(createdAt - lastSignIn) < NEW_USER_WINDOW_MS;
        cachedState = {
          status: "ready",
          playerId: user.id,
          isAnonymous,
          displayName,
          isNewUser
        };
        resolveReady?.(user.id);
        return cachedState;
      }
    } catch {
      // getSession() threw — fall through to getUser() fallback.
    }

    // ── Phase 2: Fallback — getUser() makes a network call that refreshes
    // stale tokens. Only reached when getSession() found no session (cookie
    // missing, expired, or corrupted). Wrapped in an 8s timeout to avoid the
    // GoTrue lock hang; one retry with backoff for transient network issues.
    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { data: { user }, error: userError } = await Promise.race([
          supabaseBrowser.auth.getUser(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Identity bootstrap timed out")), 8000)
          ),
        ]);

        if (userError) {
          cachedState = { status: "unauthenticated" };
          return cachedState;
        }

        if (user?.id) {
          const isAnonymous = user.is_anonymous ?? false;
          const displayName = await fetchDisplayName(user.id);
          const createdAt = new Date(user.created_at).getTime();
          const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : createdAt;
          const isNewUser = Math.abs(createdAt - lastSignIn) < NEW_USER_WINDOW_MS;
          cachedState = {
            status: "ready",
            playerId: user.id,
            isAnonymous,
            displayName,
            isNewUser
          };
          resolveReady?.(user.id);
          return cachedState;
        }

        // No session — user must sign in via /login
        cachedState = { status: "unauthenticated" };
        return cachedState;
      } catch (err) {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        cachedState = {
          status: "error",
          error: err instanceof Error ? err.message : "Unknown identity bootstrap error",
        };
        return cachedState;
      }
    }
    return cachedState;
  })().finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}

export function getCurrentPlayerId(): string {
  if (cachedState.status === "ready") {
    return cachedState.playerId;
  }
  throw new Error(
    "IDENTITY_NOT_READY: Supabase session is not resolved. " +
    "Call bootstrapIdentity() and await its completion before accessing playerId."
  );
}

export function getIdentityState(): IdentityState {
  return cachedState;
}

export async function onIdentityReady(): Promise<string> {
  if (cachedState.status === "ready") {
    return cachedState.playerId;
  }
  return readyPromise;
}

export async function signOut(): Promise<void> {
  signingOut = true;
  try {
    const { error } = await supabaseBrowser.auth.signOut({ scope: 'local' });
    if (error) {
      // signOut() returns { error } rather than throwing. Force-clear the
      // Supabase auth cookies client-side so the next OAuth call does not
      // reuse a stale session.
      if (typeof document !== 'undefined') {
        document.cookie.split(';').forEach((cookie) => {
          const name = cookie.split('=')[0].trim();
          if (name.startsWith('sb-') && name.endsWith('-auth-token')) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          }
        });
      }
    }
  } finally {
    bootstrapped = false;
    cachedState = { status: "unauthenticated" };
    resetReadyPromise();
    notifySubscribers(cachedState);
    signingOut = false;
  }
}

export function subscribeToIdentityChanges(
  callback: (state: IdentityState) => void
): () => void {
  subscribers.add(callback);

  const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(
    async (event, session) => {
      if (signingOut) {
        return;
      }

      if (session?.user?.id) {
        const isAnonymous = session.user.is_anonymous ?? false;
        const displayName = await fetchDisplayName(session.user.id);
        const createdAt = new Date(session.user.created_at).getTime();
        const lastSignIn = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : createdAt;
        const isNewUser = event === 'SIGNED_IN' && Math.abs(createdAt - lastSignIn) < NEW_USER_WINDOW_MS;
        cachedState = {
          status: "ready",
          playerId: session.user.id,
          isAnonymous,
          displayName,
          isNewUser
        };
        resolveReady?.(session.user.id);
      } else {
        bootstrapped = false;
        cachedState = { status: "unauthenticated" };
      }
      callback(cachedState);
    }
  );

  if (cachedState.status !== "loading") {
    callback(cachedState);
  }

  return () => {
    subscribers.delete(callback);
    subscription.unsubscribe();
  };
}
