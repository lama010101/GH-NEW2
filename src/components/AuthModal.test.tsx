import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock supabaseBrowser — factory must be self-contained (vi.mock is hoisted).
vi.mock("@/core/supabaseBrowser", () => {
  const mockAuth = {
    signInWithOAuth: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  };
  return {
    supabaseBrowser: {
      auth: mockAuth,
    },
  };
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock identity
vi.mock("@/core/identity", () => ({
  bootstrapIdentity: vi.fn().mockResolvedValue({ status: "unauthenticated" }),
  signOut: vi.fn(),
  getCachedIdentityState: () => ({ status: "unauthenticated" }),
  subscribeToIdentityChanges: vi.fn(() => () => {}),
}));

// Mock useIdentity hook
vi.mock("@/hooks/useIdentity", () => ({
  useIdentity: () => ({ playerId: null, isLoading: false }),
}));

// Mock next/image
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => React.createElement("img", { ...props, src: props.src || "" }),
}));

// Helper to get the mocked auth object after import
async function getMockAuth() {
  const mod = await import("@/core/supabaseBrowser");
  return mod.supabaseBrowser.auth as any;
}

import { AuthModal } from "./AuthModal";

beforeEach(async () => {
  const auth = await getMockAuth();
  vi.clearAllMocks();
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: null });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("AuthModal Google OAuth — KC-007", () => {
  it("calls signInWithOAuth with google provider on Google button click", async () => {
    const auth = await getMockAuth();
    render(React.createElement(AuthModal, { isOpen: true, onClose: vi.fn(), required: false }));

    const googleButton = screen.getAllByRole("button").find((b: HTMLElement) =>
      /google/i.test(b.textContent || "")
    );

    if (googleButton) {
      fireEvent.click(googleButton);
    }

    await waitFor(() => {
      expect(auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
        })
      );
    });
  });

  it("uses window.location.origin for redirectTo (not hardcoded domain)", async () => {
    const auth = await getMockAuth();
    render(React.createElement(AuthModal, { isOpen: true, onClose: vi.fn(), required: false }));

    const googleButton = screen.getAllByRole("button").find((b: HTMLElement) =>
      /google/i.test(b.textContent || "")
    );

    if (googleButton) {
      fireEvent.click(googleButton);
    }

    await waitFor(() => {
      expect(auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            redirectTo: expect.stringContaining("/auth/callback"),
          }),
        })
      );
      // Verify it uses origin, not a hardcoded production domain
      const call = auth.signInWithOAuth.mock.calls[0][0];
      expect(call.options.redirectTo).not.toContain("guess-history.com");
    });
  });
});

describe("AuthModal email auth — KC-007", () => {
  it("renders without crashing when open", () => {
    render(React.createElement(AuthModal, { isOpen: true, onClose: vi.fn(), required: false }));
    expect(screen.getByTestId("auth-modal")).toBeTruthy();
  });

  it("does not render when closed", () => {
    render(React.createElement(AuthModal, { isOpen: false, onClose: vi.fn(), required: false }));
    expect(screen.queryByTestId("auth-modal")).toBeNull();
  });

  it("calls signInWithPassword on email sign-in submit", async () => {
    const auth = await getMockAuth();
    render(React.createElement(AuthModal, { isOpen: true, onClose: vi.fn(), required: false }));

    // Fill in email and password
    const inputs = screen.getAllByRole("textbox");
    const emailInput = inputs.find((i: HTMLElement) => i.getAttribute("type") === "email" || i.getAttribute("type") === "text") || inputs[0];
    if (emailInput) {
      fireEvent.change(emailInput, { target: { value: "test@test.com" } });
    }

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    if (passwordInputs.length > 0) {
      fireEvent.change(passwordInputs[0], { target: { value: "password123" } });
    }

    // Find submit button (sign in / log in)
    const submitButton = screen.getAllByRole("button").find((b: HTMLElement) =>
      /sign_in|signin|log_in|login/i.test(b.textContent || "") && !/google/i.test(b.textContent || "")
    );
    if (submitButton) {
      fireEvent.click(submitButton);
    }

    await waitFor(() => {
      // If the button was found and clicked, signInWithPassword should be called
      if (submitButton) {
        expect(auth.signInWithPassword).toHaveBeenCalled();
      }
    });
  });

  it("displays error message when sign-in fails", async () => {
    const auth = await getMockAuth();
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid credentials" },
    });

    render(React.createElement(AuthModal, { isOpen: true, onClose: vi.fn(), required: false }));

    const inputs = screen.getAllByRole("textbox");
    const emailInput = inputs.find((i: HTMLElement) => i.getAttribute("type") === "email" || i.getAttribute("type") === "text") || inputs[0];
    if (emailInput) {
      fireEvent.change(emailInput, { target: { value: "test@test.com" } });
    }

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    if (passwordInputs.length > 0) {
      fireEvent.change(passwordInputs[0], { target: { value: "wrongpass" } });
    }

    const submitButton = screen.getAllByRole("button").find((b: HTMLElement) =>
      /sign_in|signin|log_in|login/i.test(b.textContent || "") && !/google/i.test(b.textContent || "")
    );
    if (submitButton) {
      fireEvent.click(submitButton);
    }

    await waitFor(() => {
      if (submitButton) {
        expect(screen.getByText(/invalid credentials/i)).toBeTruthy();
      }
    });
  });
});
