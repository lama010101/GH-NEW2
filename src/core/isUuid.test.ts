import { describe, it, expect } from "vitest";
import { isUuid } from "./isUuid";

// AIP-FIX-FLEETHALT-MERGE-1102-051 — unit proof for the UUID guard used by
// resolveFleetAlert (src/app/admin/dashboard/actions.ts).

describe("isUuid", () => {
  it("accepts a lowercase uuid", () => {
    expect(isUuid("3f8a2b1c-9d4e-4a5b-8c6d-7e8f9a0b1c2d")).toBe(true);
  });

  it("accepts an uppercase uuid", () => {
    expect(isUuid("3F8A2B1C-9D4E-4A5B-8C6D-7E8F9A0B1C2D")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isUuid("")).toBe(false);
  });

  it("rejects a too-short string", () => {
    expect(isUuid("3f8a2b1c-9d4e-4a5b-8c6d")).toBe(false);
  });

  it("rejects an injection string", () => {
    expect(isUuid("x'; DROP TABLE a;--")).toBe(false);
    expect(isUuid("3f8a2b1c-9d4e-4a5b-8c6d-7e8f9a0b1c2d'; DROP TABLE a;--")).toBe(false);
  });

  it("rejects wrong dash placement", () => {
    expect(isUuid("3f8a2b1c9d4e-4a5b-8c6d-7e8f-9a0b1c2d")).toBe(false);
    expect(isUuid("3f8a2b1c9d4e4a5b8c6d7e8f9a0b1c2d")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isUuid("3f8a2b1c-9d4e-4a5b-8c6d-7e8f9a0b1c2g")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isUuid(123)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid({})).toBe(false);
  });
});
