import { supabaseBrowser } from "./supabaseBrowser";

export type IdentityState =
  | { status: "loading" }
  | { status: "ready"; playerId: string; isAnonymous: boolean; displayName: string; isNewUser: boolean }
  | { status: "unauthenticated" }
  | { status: "error"; error: string };

let cachedState: IdentityState = { status: "loading" };

export function getCachedIdentityState(): IdentityState {
  return cachedState;
}

let resolveReady: ((playerId: string) => void) | null = null;
const readyPromise = new Promise<string>((resolve) => {
  resolveReady = resolve;
});

let bootstrapped = false;

async function fetchDisplayName(userId: string): Promise<string> {
  try {
    const { data } = await supabaseBrowser
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();
    return data?.display_name?.trim() || 'Player';
  } catch (e) {
    return 'Player';
  }
}

export async function bootstrapIdentity(): Promise<IdentityState> {
  if (bootstrapped && cachedState.status === "ready") {
    return cachedState;
  }

  bootstrapped = true;

  try {
    const { data: { user }, error: sessionError } =
      await supabaseBrowser.auth.getUser();

    if (sessionError) {
      if (sessionError.message?.includes("Auth session missing") || sessionError.name === "AuthSessionMissingError") {
        cachedState = { status: "unauthenticated" };
        return cachedState;
      }
      cachedState = { status: "error", error: `Session check failed: ${sessionError.message}` };
      return cachedState;
    }

    if (user?.id) {
      const isAnonymous = user.is_anonymous ?? false;
      const displayName = await fetchDisplayName(user.id);
      const createdAt = new Date(user.created_at).getTime();
      const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : createdAt;
      const isNewUser = Math.abs(createdAt - lastSignIn) < 10_000;
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
  }
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
  bootstrapped = false;
  await supabaseBrowser.auth.signOut();
}

export function subscribeToIdentityChanges(
  callback: (state: IdentityState) => void
): () => void {
  const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(
    async (event, session) => {
      if (session?.user?.id) {
        const isAnonymous = session.user.is_anonymous ?? false;
        const displayName = await fetchDisplayName(session.user.id);
        const createdAt = new Date(session.user.created_at).getTime();
        const lastSignIn = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : createdAt;
        const isNewUser = event === 'SIGNED_IN' && Math.abs(createdAt - lastSignIn) < 10_000;
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

  return () => subscription.unsubscribe();
}
