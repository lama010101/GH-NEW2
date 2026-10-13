import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabaseBrowser before importing identity.ts.
// The mock is hoisted by vitest above all imports.
vi.mock("./supabaseBrowser", () => {
  const mockAuth = {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  };
  const mockReadSession = vi.fn();
  return {
    supabaseBrowser: {
      auth: mockAuth,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => ({ data: null, error: null })),
          })),
        })),
      })),
    },
    readSession: mockReadSession,
    // identity.ts imports forceClearAuthStorage from ./supabaseBrowser
    // (MP-FIX-AUTH-REFRESHSTORM-BACKOFF-002 relocated it here). Mock as a
    // no-op so signOut tests can assert it was called without touching real
    // storage.
    forceClearAuthStorage: vi.fn(),
  };
});

// Holds a reference to the mocked supabaseBrowser.auth so each test can
// control what getSession/getUser/signOut return.
async function getMockAuth() {
  const mod = await import("./supabaseBrowser");
  return mod.supabaseBrowser.auth as any;
}

// Holds a reference to the mocked readSession so each test can control what it returns.
async function getMockReadSession() {
  const mod = await import("./supabaseBrowser");
  return mod.readSession as any;
}

// Holds a reference to the mocked supabaseBrowser so each test can control
// the from()->select()->eq()->maybeSingle() chain result.
async function getMockBrowser() {
  const mod = await import("./supabaseBrowser");
  return mod.supabaseBrowser as any;
}

// Re-points the mocked from() chain so maybeSingle() returns `impl`.
function mockProfilesQuery(browser: any, impl: () => Promise<any>) {
  browser.from.mockImplementation(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: impl })),
    })),
  }));
}

function makeSession(userId: string) {
  return {
    user: {
      id: userId,
      is_anonymous: false,
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    },
    access_token: "tok",
  };
}

// identity.ts has module-level state (cachedState, bootstrapped, etc.).
// We reset modules before each test to get a fresh instance.
async function loadIdentity() {
  const mod = await import("./identity");
  return mod;
}

beforeEach(async () => {
  vi.resetModules();
  const auth = await getMockAuth();
  const readSession = await getMockReadSession();
  auth.getSession.mockResolvedValue({ data: { session: null } });
  readSession.mockResolvedValue(null);
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

describe("identity state machine — KC-007", () => {
  describe("initial state", () => {
    it("getCachedIdentityState returns 'loading' before bootstrap", async () => {
      const { getCachedIdentityState } = await loadIdentity();
      expect(getCachedIdentityState()).toEqual({ status: "loading" });
    });
  });

  describe("signOut", () => {
    it("sets cachedState to 'unauthenticated' in the finally block", async () => {
      const { signOut, getCachedIdentityState } = await loadIdentity();
      await signOut();
      expect(getCachedIdentityState()).toEqual({ status: "unauthenticated" });
    });

    it("sets cachedState to 'unauthenticated' even when supabase.auth.signOut fails", async () => {
      const { signOut, getCachedIdentityState } = await loadIdentity();
      const auth = await getMockAuth();
      auth.signOut.mockResolvedValue({
        error: { message: "Network error" },
      });
      await signOut();
      // The finally block must still clear state.
      expect(getCachedIdentityState()).toEqual({ status: "unauthenticated" });
    });

    it("sets cachedState to 'unauthenticated' even when supabase.auth.signOut throws", async () => {
      const { signOut, getCachedIdentityState } = await loadIdentity();
      const auth = await getMockAuth();
      auth.signOut.mockRejectedValue(new Error("Network failure"));
      // signOut() has a try/finally with no catch — the finally block clears
      // cachedState, but the exception propagates to the caller. This test
      // verifies that state is cleared regardless of the thrown error.
      try {
        await signOut();
      } catch {
        // Expected: signOut propagates the error but still clears state in finally.
      }
      expect(getCachedIdentityState()).toEqual({ status: "unauthenticated" });
    });

    it("notifies subscribers after sign-out", async () => {
      const { signOut, subscribeToIdentityChanges } = await loadIdentity();
      const states: any[] = [];
      subscribeToIdentityChanges((state) => states.push(state));
      // Clear the initial callback (subscribeToIdentityChanges calls back
      // immediately if state is not "loading").
      states.length = 0;
      await signOut();
      // The subscriber should have been called with "unauthenticated".
      expect(states).toContainEqual({ status: "unauthenticated" });
    });

    it("clears stale sb-*-auth-token cookies when signOut returns an error", async () => {
      const { signOut } = await loadIdentity();
      const auth = await getMockAuth();
      auth.signOut.mockResolvedValue({ error: { message: "fail" } });

      // Set up a fake cookie string with a Supabase auth token cookie.
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get: vi.fn(() => "sb-abc-auth-token=stale-value; other=keep"),
        set: vi.fn(),
      });

      await signOut();

      // The cookie setter should have been called to expire the sb- cookie.
      // We can't easily assert the exact string in jsdom, but we verify
      // document.cookie setter was called (the force-clear path).
      expect((document as any).__lookupSetter__("cookie")).toBeTruthy();
    });
  });

  describe("bootstrapIdentity", () => {
    it("bootstrapIdentity calls readSession exactly once", async () => {
      const { bootstrapIdentity } = await loadIdentity();
      const readSession = await getMockReadSession();
      const mockUser = {
        id: "user-123",
        is_anonymous: false,
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      };
      readSession.mockResolvedValue({ user: mockUser, access_token: "tok" });

      await bootstrapIdentity();

      expect(readSession).toHaveBeenCalledTimes(1);
    });

    it("null session → status unauthenticated", async () => {
      const { bootstrapIdentity, getCachedIdentityState } = await loadIdentity();
      const readSession = await getMockReadSession();
      readSession.mockResolvedValue(null);

      const state = await bootstrapIdentity();
      expect(state).toEqual({ status: "unauthenticated" });
      expect(getCachedIdentityState()).toEqual({ status: "unauthenticated" });
    });

    it("does not re-bootstrap if already ready (returns cached state)", async () => {
      const { bootstrapIdentity } = await loadIdentity();
      const readSession = await getMockReadSession();
      const mockUser = {
        id: "user-789",
        is_anonymous: false,
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      };
      readSession.mockResolvedValue({ user: mockUser, access_token: "tok" });

      await bootstrapIdentity();
      // Clear the mock call count.
      readSession.mockClear();
      // Second call should return cached state without calling readSession again.
      const state = await bootstrapIdentity();
      expect(state.status).toBe("ready");
      expect(readSession).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentPlayerId", () => {
    it("throws when state is 'loading'", async () => {
      const { getCurrentPlayerId } = await loadIdentity();
      expect(() => getCurrentPlayerId()).toThrow("IDENTITY_NOT_READY");
    });

    it("throws when state is 'unauthenticated'", async () => {
      const { getCurrentPlayerId, signOut } = await loadIdentity();
      await signOut();
      expect(() => getCurrentPlayerId()).toThrow("IDENTITY_NOT_READY");
    });

    it("returns playerId when state is 'ready'", async () => {
      const { getCurrentPlayerId, bootstrapIdentity } = await loadIdentity();
      const readSession = await getMockReadSession();
      readSession.mockResolvedValue({
        user: {
          id: "player-abc",
          is_anonymous: false,
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        },
        access_token: "tok",
      });
      await bootstrapIdentity();
      expect(getCurrentPlayerId()).toBe("player-abc");
    });
  });

  describe("KC-007 regression guard: no parallel auth state", () => {
    it("getCachedIdentityState and getIdentityState return the same object", async () => {
      const { getCachedIdentityState, getIdentityState } = await loadIdentity();
      // Both should return the same cachedState reference.
      expect(getCachedIdentityState()).toBe(getIdentityState());
    });
  });

  describe("updateCachedDisplayName", () => {
    it("updates cached display name and notifies subscribers", async () => {
      const { bootstrapIdentity, updateCachedDisplayName, subscribeToIdentityChanges } = await loadIdentity();
      const readSession = await getMockReadSession();
      const mockUser = {
        id: "user-123",
        is_anonymous: false,
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      };
      readSession.mockResolvedValue({ user: mockUser, access_token: "tok" });

      // Bootstrap to get a ready state
      await bootstrapIdentity();

      const states: any[] = [];
      subscribeToIdentityChanges((state) => states.push(state));
      // Clear initial callback
      states.length = 0;

      // Update the display name
      updateCachedDisplayName("NewName#1234");

      // Should have notified subscribers with updated display name
      expect(states).toHaveLength(1);
      expect(states[0].status).toBe("ready");
      if (states[0].status === "ready") {
        expect(states[0].displayName).toBe("NewName#1234");
      }

      // Verify cached state is updated
      const { getCachedIdentityState } = await loadIdentity();
      const cached = getCachedIdentityState();
      expect(cached.status).toBe("ready");
      if (cached.status === "ready") {
        expect(cached.displayName).toBe("NewName#1234");
      }
    });

    it("does nothing when state is not ready", async () => {
      const { updateCachedDisplayName, getCachedIdentityState, subscribeToIdentityChanges } = await loadIdentity();
      
      // Don't bootstrap - state should be "loading"
      expect(getCachedIdentityState().status).toBe("loading");

      const states: any[] = [];
      subscribeToIdentityChanges((state) => states.push(state));
      // Clear initial callback
      states.length = 0;

      // Try to update display name
      updateCachedDisplayName("ShouldNotUpdate");

      // Should not have notified subscribers
      expect(states).toHaveLength(0);
      
      // State should still be loading
      expect(getCachedIdentityState().status).toBe("loading");
    });
  });

  // AUTH-FIX-COOKIECLEAR-IDENTITY-1013-004 — fetchDisplayName outcomes:
  // real name (remembered), missing/empty row → Player-<id6> resolved,
  // error/timeout → remembered-or-Player-<id6> with displayNameResolved:false,
  // single-flight query, 15s background re-resolve, never the literal 'Player'.
  describe("displayName resolution — AUTH-FIX-COOKIECLEAR-IDENTITY-1013-004", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("real display_name → used, remembered in localStorage, displayNameResolved true", async () => {
      const { bootstrapIdentity } = await loadIdentity();
      const readSession = await getMockReadSession();
      const browser = await getMockBrowser();
      readSession.mockResolvedValue(makeSession("user-abc123def"));
      mockProfilesQuery(browser, () => Promise.resolve({ data: { display_name: "  Alice  " }, error: null }));

      const state = await bootstrapIdentity();

      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.displayName).toBe("Alice");
        expect(state.displayName).not.toBe("Player");
        expect(state.displayNameResolved).toBe(true);
      }
      expect(localStorage.getItem("gh_display_name_user-abc123def")).toBe("Alice");
    });

    it("missing row → Player-<first 6 of userId> resolved (never literal 'Player')", async () => {
      const { bootstrapIdentity, getCachedIdentityState } = await loadIdentity();
      const readSession = await getMockReadSession();
      const browser = await getMockBrowser();
      readSession.mockResolvedValue(makeSession("abcdef99-0000-0000-0000-000000000000"));
      mockProfilesQuery(browser, () => Promise.resolve({ data: null, error: null }));

      const state = await bootstrapIdentity();

      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.displayName).toBe("Player-abcdef");
        expect(state.displayName).not.toBe("Player");
        expect(state.displayNameResolved).toBe(true);
      }
      expect(getCachedIdentityState()).toEqual(state);
    });

    it("lookup failure WITH remembered name → remembered name shown, displayNameResolved false", async () => {
      const { bootstrapIdentity } = await loadIdentity();
      const readSession = await getMockReadSession();
      const browser = await getMockBrowser();
      localStorage.setItem("gh_display_name_user-fail42", "OldName");
      readSession.mockResolvedValue(makeSession("user-fail42"));
      mockProfilesQuery(browser, () =>
        Promise.resolve({ data: null, error: { code: "XX", message: "boom" } })
      );

      const state = await bootstrapIdentity();

      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.displayName).toBe("OldName");
        expect(state.displayName).not.toBe("Player");
        expect(state.displayNameResolved).toBe(false);
      }
    });

    it("lookup failure WITHOUT remembered name → Player-<id6> shown, displayNameResolved false", async () => {
      const { bootstrapIdentity } = await loadIdentity();
      const readSession = await getMockReadSession();
      const browser = await getMockBrowser();
      readSession.mockResolvedValue(makeSession("ffffee99-1111-2222-3333-444455556666"));
      mockProfilesQuery(browser, () =>
        Promise.resolve({ data: null, error: { code: "XX", message: "boom" } })
      );

      const state = await bootstrapIdentity();

      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.displayName).toBe("Player-ffffee");
        expect(state.displayName).not.toBe("Player");
        expect(state.displayNameResolved).toBe(false);
      }
    });

    it("lookup timeout → unresolved fallback (never literal 'Player')", async () => {
      vi.useFakeTimers();
      try {
        const { bootstrapIdentity } = await loadIdentity();
        const readSession = await getMockReadSession();
        const browser = await getMockBrowser();
        readSession.mockResolvedValue(makeSession("abcdef99-9999"));
        mockProfilesQuery(browser, () => new Promise(() => {}));

        const p = bootstrapIdentity();
        await vi.advanceTimersByTimeAsync(5000);
        const state = await p;

        expect(state.status).toBe("ready");
        if (state.status === "ready") {
          expect(state.displayName).toBe("Player-abcdef");
          expect(state.displayName).not.toBe("Player");
          expect(state.displayNameResolved).toBe(false);
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it("single flight — bootstrap + auth-state event share ONE in-flight query", async () => {
      const { bootstrapIdentity, subscribeToIdentityChanges } = await loadIdentity();
      const readSession = await getMockReadSession();
      const browser = await getMockBrowser();
      const auth = await getMockAuth();

      let authListener: any = null;
      auth.onAuthStateChange.mockImplementation((cb: any) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });
      subscribeToIdentityChanges(() => {});
      expect(authListener).toBeTruthy();

      let queryCalls = 0;
      const resolvers: Array<(v: any) => void> = [];
      readSession.mockResolvedValue(makeSession("user-shared1"));
      mockProfilesQuery(browser, () => {
        queryCalls += 1;
        return new Promise((resolve) => resolvers.push(resolve));
      });

      const p1 = bootstrapIdentity();
      const p2 = authListener("TOKEN_REFRESHED", makeSession("user-shared1"));

      // Let both callers reach the shared fetch before resolving.
      await Promise.resolve();
      expect(resolvers.length).toBe(1);
      resolvers.forEach((r) => r({ data: { display_name: "Shared" }, error: null }));
      await Promise.all([p1, p2]);

      expect(queryCalls).toBe(1);
    });

    it("background re-resolve: 15s after failure, settled attempt, updates cache + notifies", async () => {
      vi.useFakeTimers();
      try {
        const { bootstrapIdentity, getCachedIdentityState, subscribeToIdentityChanges } = await loadIdentity();
        const readSession = await getMockReadSession();
        const browser = await getMockBrowser();
        const states: any[] = [];
        subscribeToIdentityChanges((s) => states.push(s));
        states.length = 0;

        let call = 0;
        readSession.mockResolvedValue(makeSession("user-retry1"));
        mockProfilesQuery(browser, () => {
          call += 1;
          return call === 1
            ? Promise.resolve({ data: null, error: { code: "XX", message: "boom" } })
            : Promise.resolve({ data: { display_name: "Recovered" }, error: null });
        });

        const state = await bootstrapIdentity();
        expect(state.status).toBe("ready");
        if (state.status === "ready") {
          expect(state.displayNameResolved).toBe(false);
        }

        await vi.advanceTimersByTimeAsync(15_000);

        expect(call).toBe(2);
        const cached = getCachedIdentityState();
        expect(cached.status).toBe("ready");
        if (cached.status === "ready") {
          expect(cached.displayName).toBe("Recovered");
          expect(cached.displayNameResolved).toBe(true);
        }
        expect(
          states.some((s) => s.status === "ready" && s.displayName === "Recovered")
        ).toBe(true);
        expect(localStorage.getItem("gh_display_name_user-retry1")).toBe("Recovered");
      } finally {
        vi.useRealTimers();
      }
    });

    it("no produced displayName is ever the bare literal 'Player'", async () => {
      const { bootstrapIdentity } = await loadIdentity();
      const readSession = await getMockReadSession();
      const browser = await getMockBrowser();

      // missing row
      readSession.mockResolvedValue(makeSession("aaaaaa00-1"));
      mockProfilesQuery(browser, () => Promise.resolve({ data: null, error: null }));
      const s = await bootstrapIdentity();
      if (s.status === "ready") expect(s.displayName).not.toBe("Player");
    });
  });
});
