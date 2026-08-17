import { supabaseBrowser, readSession } from "./supabaseBrowser";

const NEW_USER_WINDOW_MS = 300_000;

export type IdentityState =
  | { status: "loading" }
  | { status: "ready"; playerId: string; isAnonymous: boolean; displayName: string; avatarUrl: string | null; isNewUser: boolean }
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
  try {
    const { data, error } = await Promise.race([
      supabaseBrowser
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("fetchDisplayName timeout")), 5000)
      ),
    ]);

    if (data?.display_name) {
      return data.display_name.trim();
    }

    if (error && error.code !== 'PGRST116') {
      return 'Player';
    }
  } catch {
    // Timeout or other error
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
    const session = await readSession();
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
        avatarUrl: null,
        isNewUser
      };
      resolveReady?.(user.id);
      return cachedState;
    }
    // No session in the cookie — user is not authenticated.
    cachedState = { status: "unauthenticated" };
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

async function unsubscribePushBeforeSignOut(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }
  try {
    const unsubscribePromise = (async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (endpoint) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
    })();
    await Promise.race([
      unsubscribePromise,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('push unsubscribe timeout')), 2000)),
    ]);
  } catch {
    // Best-effort cleanup; never block sign-out.
  }
}

export async function signOut(): Promise<void> {
  signingOut = true;
  try {
    await unsubscribePushBeforeSignOut();
    await supabaseBrowser.auth.signOut({ scope: 'local' });
  } finally {
    forceClearAuthStorage();
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

/**
 * Updates the cached avatar URL and notifies all subscribers.
 * Use this after a profile avatar_url fetch/change so that every consumer
 * of identity (NavModal, TopBar, etc.) reflects the new value without a
 * page refresh.
 */
export function updateCachedAvatarUrl(url: string | null): void {
  if (cachedState.status !== 'ready') return;
  cachedState = { ...cachedState, avatarUrl: url };
  notifySubscribers(cachedState);
}

/**
 * Force-clears all Supabase auth storage (cookies and localStorage) without calling GoTrue.
 * This is a lock-free escape hatch for recovery scenarios where auth methods might deadlock.
 */
export function forceClearAuthStorage(): void {
  // Clear all Supabase cookies
  if (typeof document !== 'undefined') {
    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.split('=')[0].trim();
      if (name.startsWith('sb-')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  }

  // Clear all Supabase localStorage keys
  if (typeof localStorage !== 'undefined') {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) {
        localStorage.removeItem(key);
      }
    });
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
          avatarUrl: null,
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
