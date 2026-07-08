import { supabaseBrowser } from "./supabaseBrowser";

const NEW_USER_WINDOW_MS = 300_000;

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
    // ── Phase 1 + Phase 2: getSession() only — NEVER getUser().
    //
    // With @supabase/ssr cookie-based auth, the middleware refreshes the token
    // server-side on every navigation and writes a fresh cookie. The client
    // therefore only needs to READ the session from the cookie via
    // getSession(). Calling getUser() is redundant AND dangerous: it makes a
    // network call that acquires the SAME GoTrue navigator lock as
    // getSession(). If getSession() timed out because the lock was held by an
    // in-flight token-refresh network call, getUser() will block on that same
    // lock and time out too — guaranteeing an error state and a blank-screen
    // redirect. (This is the exact deadlock MP-FIX-AUTH-GOTRUE-DEADLOCK-003
    // removed from getValidAccessToken; the same fix applies here.)
    //
    // Strategy: try getSession() up to 5 times with backoff. Each attempt is
    // wrapped in a 10s Promise.race timeout so a hung lock-holding refresh
    // network call cannot block us forever; the backoff gives the in-flight
    // refresh time to complete and release the lock so the next attempt
    // succeeds. A null session (cookie genuinely absent) → unauthenticated.
    // A throw/timeout on every attempt → error (transient lock/network issue).
    // An "invalid refresh token" error is not transient — the refresh token
    // is genuinely invalid (e.g. user was deleted/recreated server-side), so
    // we go to "unauthenticated" immediately instead of wasting retries.
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { data: { session } } = await Promise.race([
          supabaseBrowser.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("getSession() timed out")), 10000)
          ),
        ]);
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
        // No session in the cookie — user is not authenticated.
        cachedState = { status: "unauthenticated" };
        return cachedState;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // "Refresh token is not valid" is a permanent auth failure, not a
        // transient lock/timeout. Retrying won't help — the refresh token is
        // genuinely invalid. Go to "unauthenticated" so the UI shows the auth
        // modal instead of a permanent "Something went wrong" error screen.
        if (errMsg.includes("Refresh token") || errMsg.includes("not valid")) {
          cachedState = { status: "unauthenticated" };
          return cachedState;
        }
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        cachedState = {
          status: "error",
          error: errMsg,
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

/**
 * Updates the cached display name and notifies all subscribers.
 * Use this after a profile display_name change (e.g. avatar swap that
 * regenerated the name) so that every consumer of identity (NavModal,
 * TopBar initials, etc.) reflects the new value without a page refresh.
 */
export function updateCachedDisplayName(name: string): void {
  if (cachedState.status !== 'ready') return;
  cachedState = { ...cachedState, displayName: name };
  notifySubscribers(cachedState);
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
        // If bootstrapIdentity() is still in-flight, a null-session event here
        // is likely a transient lock/refresh failure (the INITIAL_SESSION or a
        // failed TOKEN_REFRESHED firing before the cookie was read), NOT a real
        // sign-out. The middleware already validated the cookie server-side, so
        // let bootstrap finish and be the authority. Flipping to "unauthenticated"
        // now would trigger a spurious redirect to /login (the blank-black-on-
        // refresh bug). Only act on null-session when no bootstrap is pending.
        if (bootstrapPromise) {
          return;
        }
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
