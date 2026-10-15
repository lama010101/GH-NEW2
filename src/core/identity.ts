import { supabaseBrowser, readSession, forceClearAuthStorage } from "./supabaseBrowser";

// Re-export so existing `import { forceClearAuthStorage } from "@/core/identity"`
// call sites keep working. Implementation now lives in supabaseBrowser.ts
// (MP-FIX-AUTH-REFRESHSTORM-BACKOFF-002) to break the import cycle that would
// otherwise form when readSession()'s circuit-breaker needs to call it.
export { forceClearAuthStorage };

const NEW_USER_WINDOW_MS = 300_000;

export type IdentityState =
  | { status: "loading" }
  | { status: "ready"; playerId: string; isAnonymous: boolean; displayName: string; avatarUrl: string | null; isNewUser: boolean; displayNameResolved?: boolean }
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

// AUTH-FIX-COOKIECLEAR-IDENTITY-1013-004 — a failed display-name lookup must
// never surface or be cached as the literal 'Player'. Outcomes:
//   "resolved"   — real name (also remembered in localStorage for later
//                  failure fallbacks), or the deterministic Player-<id6>
//                  fallback for a missing/empty profile row (same format
//                  sessionCore uses).
//   "unresolved" — lookup error/timeout: remembered name for that user if
//                  present, otherwise Player-<id6>; cached with
//                  displayNameResolved:false and retried in the background.
type DisplayNameOutcome =
  | { kind: "resolved"; name: string }
  | { kind: "unresolved"; name: string };

const DISPLAY_NAME_STORAGE_PREFIX = "gh_display_name_";

function rememberDisplayName(userId: string, name: string): void {
  try {
    localStorage.setItem(DISPLAY_NAME_STORAGE_PREFIX + userId, name);
  } catch {
    // Storage unavailable (SSR/private mode) — remembering is best-effort.
  }
}

function rememberedDisplayName(userId: string): string | null {
  try {
    const v = localStorage.getItem(DISPLAY_NAME_STORAGE_PREFIX + userId);
    return v && v.trim().length > 0 ? v : null;
  } catch {
    return null;
  }
}

function fallbackDisplayName(userId: string): string {
  // Same format sessionCore uses for players without a display_name.
  return `Player-${userId.slice(0, 6)}`;
}

async function fetchDisplayName(userId: string): Promise<DisplayNameOutcome> {
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

    const trimmed = data?.display_name?.trim();
    if (trimmed) {
      rememberDisplayName(userId, trimmed);
      return { kind: "resolved", name: trimmed };
    }

    if (!(error && error.code !== 'PGRST116')) {
      // Missing row or empty name — deterministic final fallback.
      return { kind: "resolved", name: fallbackDisplayName(userId) };
    }
    // Non-PGRST116 error falls through to the unresolved fallback below.
  } catch {
    // Timeout or other error — unresolved fallback below.
  }

  return {
    kind: "unresolved",
    name: rememberedDisplayName(userId) ?? fallbackDisplayName(userId),
  };
}

// Module-level single flight: at most ONE fetchDisplayName query in flight.
// Same-user callers share the in-flight promise; a different userId chains
// behind it (one signed-in user per browser makes that a rare safety net).
let displayNameFetchInFlight: Promise<DisplayNameOutcome> | null = null;
let displayNameFetchInFlightUserId: string | null = null;

function fetchDisplayNameShared(userId: string): Promise<DisplayNameOutcome> {
  if (displayNameFetchInFlight) {
    if (displayNameFetchInFlightUserId === userId) {
      return displayNameFetchInFlight;
    }
    return displayNameFetchInFlight.then(() => fetchDisplayNameShared(userId));
  }
  const p = fetchDisplayName(userId).finally(() => {
    displayNameFetchInFlight = null;
    displayNameFetchInFlightUserId = null;
  });
  displayNameFetchInFlight = p;
  displayNameFetchInFlightUserId = userId;
  return p;
}

// Background re-resolve for unresolved lookups. One retry is armed per
// failure: (a) the next onAuthStateChange TOKEN_REFRESHED/SIGNED_IN event for
// the same user — the subscriber's own lookup on that event IS that retry;
// (b) once, 15s after the failure, via this timer — the previous attempt is
// re-checked as settled inside the timer callback before firing.
let unresolvedDisplayNameUserId: string | null = null;
let displayNameReResolveInFlight: Promise<void> | null = null;
let displayNameReResolveTimer: ReturnType<typeof setTimeout> | null = null;

function armDisplayNameRetryTimer(userId: string): void {
  if (displayNameReResolveTimer) return;
  displayNameReResolveTimer = setTimeout(() => {
    displayNameReResolveTimer = null;
    if (!displayNameReResolveInFlight) {
      void reResolveDisplayName(userId);
    } else {
      // Previous attempt still running — re-arm rather than overlap.
      armDisplayNameRetryTimer(userId);
    }
  }, 15_000);
}

function scheduleDisplayNameReResolve(userId: string): void {
  unresolvedDisplayNameUserId = userId;
  armDisplayNameRetryTimer(userId);
}

async function reResolveDisplayName(userId: string): Promise<void> {
  if (displayNameReResolveInFlight) return displayNameReResolveInFlight;
  if (unresolvedDisplayNameUserId !== userId) return;
  displayNameReResolveInFlight = (async () => {
    try {
      const outcome = await fetchDisplayNameShared(userId);
      if (outcome.kind === "resolved") {
        if (unresolvedDisplayNameUserId === userId) {
          unresolvedDisplayNameUserId = null;
        }
        if (cachedState.status === "ready" && cachedState.playerId === userId) {
          cachedState = { ...cachedState, displayNameResolved: true };
          updateCachedDisplayName(outcome.name);
        }
      } else {
        // Attempt settled still-unresolved — arm the single (b) retry.
        armDisplayNameRetryTimer(userId);
      }
    } finally {
      displayNameReResolveInFlight = null;
    }
  })();
  return displayNameReResolveInFlight;
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
      const outcome = await fetchDisplayNameShared(user.id);
      const createdAt = new Date(user.created_at).getTime();
      const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : createdAt;
      const isNewUser = Math.abs(createdAt - lastSignIn) < NEW_USER_WINDOW_MS;
      cachedState = {
        status: "ready",
        playerId: user.id,
        isAnonymous,
        displayName: outcome.name,
        avatarUrl: null,
        isNewUser,
        displayNameResolved: outcome.kind === "resolved"
      };
      if (outcome.kind !== "resolved") {
        scheduleDisplayNameReResolve(user.id);
      }
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
    // Fire-and-forget (MP-FIX-SIGNOUT-LOADINGSTATE-SPEED-001): best-effort
    // cleanup must not block sign-out for up to its 2s timeout. The DELETE
    // fetch dispatches with the auth cookie before auth.signOut() clears it.
    void unsubscribePushBeforeSignOut();
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
        const outcome = await fetchDisplayNameShared(session.user.id);
        const createdAt = new Date(session.user.created_at).getTime();
        const lastSignIn = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : createdAt;
        const isNewUser = event === 'SIGNED_IN' && Math.abs(createdAt - lastSignIn) < NEW_USER_WINDOW_MS;
        cachedState = {
          status: "ready",
          playerId: session.user.id,
          isAnonymous,
          displayName: outcome.name,
          avatarUrl: null,
          isNewUser,
          displayNameResolved: outcome.kind === "resolved"
        };
        if (outcome.kind !== "resolved") {
          scheduleDisplayNameReResolve(session.user.id);
        } else if (unresolvedDisplayNameUserId === session.user.id) {
          unresolvedDisplayNameUserId = null;
        }
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
        unresolvedDisplayNameUserId = null;
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
