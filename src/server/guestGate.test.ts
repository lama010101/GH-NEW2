import { describe, it, expect, vi } from "vitest";

// GUEST-GATE-SERVER-1029-004: rejectIfGuest is the single source for the
// anonymous-user rejection — it must return a 403 guest_conversion_required
// response only for is_anonymous === true, and null for every other input.

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

import { rejectIfGuest } from "./guestGate";

const guestUser = { id: "guest-1", is_anonymous: true };
const realUser = { id: "user-1", is_anonymous: false };
const claimlessUser: { id: string; is_anonymous?: boolean | null } = { id: "user-2" };
const nullAnonUser = { id: "user-3", is_anonymous: null };

describe("rejectIfGuest", () => {
  it("returns 403 guest_conversion_required for an anonymous user", async () => {
    const response = rejectIfGuest(guestUser);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
    const body = await response!.json();
    expect(body).toEqual({ error: "guest_conversion_required" });
  });

  it("returns null for a non-anonymous user", () => {
    expect(rejectIfGuest(realUser)).toBeNull();
  });

  it("returns null when is_anonymous is absent or not strictly true", () => {
    expect(rejectIfGuest(claimlessUser)).toBeNull();
    expect(rejectIfGuest(nullAnonUser)).toBeNull();
  });

  it("returns null for null and undefined user", () => {
    expect(rejectIfGuest(null)).toBeNull();
    expect(rejectIfGuest(undefined)).toBeNull();
  });
});
