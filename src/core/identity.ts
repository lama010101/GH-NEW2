import { supabaseBrowser } from "./supabaseBrowser";

export type IdentityState =
  | { status: "loading" }
  | { status: "ready"; playerId: string }
  | { status: "error"; error: string };

let cachedState: IdentityState = { status: "loading" };
let resolveReady: ((playerId: string) => void) | null = null;
const readyPromise = new Promise<string>((resolve) => {
  resolveReady = resolve;
});

let bootstrapped = false;

export async function bootstrapIdentity(): Promise<IdentityState> {
  if (bootstrapped && cachedState.status === "ready") {
    return cachedState;
  }

  bootstrapped = true;

  try {
    const { data: { session }, error: sessionError } = await supabaseBrowser.auth.getSession();

    if (sessionError) {
      cachedState = { status: "error", error: `Session check failed: ${sessionError.message}` };
      return cachedState;
    }

    if (session?.user?.id) {
      cachedState = { status: "ready", playerId: session.user.id };
      resolveReady?.(session.user.id);
      return cachedState;
    }

    const { data: anonData, error: anonError } = await supabaseBrowser.auth.signInAnonymously();

    if (anonError) {
      cachedState = { status: "error", error: `Anonymous sign-in failed: ${anonError.message}` };
      return cachedState;
    }

    if (!anonData?.user?.id) {
      cachedState = { status: "error", error: "Anonymous sign-in returned no user ID" };
      return cachedState;
    }

    cachedState = { status: "ready", playerId: anonData.user.id };
    resolveReady?.(anonData.user.id);
    return cachedState;
  } catch (err) {
    cachedState = {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown identity bootstrap error"
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

export function subscribeToIdentityChanges(
  callback: (state: IdentityState) => void
): () => void {
  const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(
    (_event, session) => {
      if (session?.user?.id) {
        cachedState = { status: "ready", playerId: session.user.id };
        resolveReady?.(session.user.id);
      } else {
        cachedState = { status: "loading" };
        bootstrapIdentity();
      }
      callback(cachedState);
    }
  );

  return () => subscription.unsubscribe();
}
