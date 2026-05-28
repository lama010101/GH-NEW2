import { supabaseBrowser } from "./supabaseBrowser";

export type IdentityState =
  | { status: "loading" }
  | { status: "ready"; playerId: string; isAnonymous: boolean; displayName: string }
  | { status: "unauthenticated" }
  | { status: "error"; error: string };

let cachedState: IdentityState = { status: "loading" };
let resolveReady: ((playerId: string) => void) | null = null;
const readyPromise = new Promise<string>((resolve) => {
  resolveReady = resolve;
});

let bootstrapped = false;

async function fetchDisplayName(userId: string): Promise<string> {
  const { data } = await supabaseBrowser
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  return data?.display_name ?? "";
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
      cachedState = { status: "error", error: `Session check failed: ${sessionError.message}` };
      return cachedState;
    }

    if (user?.id) {
      const isAnonymous = user.is_anonymous ?? false;
      const displayName = await fetchDisplayName(user.id);
      cachedState = {
        status: "ready",
        playerId: user.id,
        isAnonymous,
        displayName
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
  await supabaseBrowser.auth.signOut();
  bootstrapped = false;
  cachedState = { status: "unauthenticated" };
}

export function subscribeToIdentityChanges(
  callback: (state: IdentityState) => void
): () => void {
  const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(
    async (_event, session) => {
      if (session?.user?.id) {
        const isAnonymous = session.user.is_anonymous ?? false;
        const displayName = await fetchDisplayName(session.user.id);
        cachedState = {
          status: "ready",
          playerId: session.user.id,
          isAnonymous,
          displayName
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
