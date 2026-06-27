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
    try {
      // Read the session from local storage/cookies (no network refresh) and
      // bound it with a timeout. The server-side middleware already validates
      // and refreshes the session cookie on every page load, so getSession()
      // is reliable here. We deliberately avoid getUser(), whose underlying
      // network call can hang indefinitely while holding the GoTrue lock —
      // which previously left identity stuck in "loading" after a refresh.
      const { data: { session }, error: sessionError } = await Promise.race([
        supabaseBrowser.auth.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Identity bootstrap timed out")), 8000)
        ),
      ]);

      if (sessionError) {
        cachedState = { status: "error", error: `Session check failed: ${sessionError.message}` };
        return cachedState;
      }

      const user = session?.user;

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
      cachedState = {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown identity bootstrap error",
      };
      return cachedState;
    } finally {
      bootstrapPromise = null;
    }
  })();

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
    await supabaseBrowser.auth.signOut();
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
