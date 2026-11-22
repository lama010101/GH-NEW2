import { describe, it, expect } from "vitest";
import {
  isServableImageUrl,
  SERVABLE_IMAGE_URL_LIKE,
  FIREBASE_IMAGE_URL_PREFIX,
  SUPABASE_EVENT_IMAGES_URL_PREFIX,
} from "./servableImage";
import { EXPECTED_SUPABASE_PROJECT_REF } from "./projectRef";

// EDQ-BUILD-ADMINGEN-1122-815 — servable-URL contract.

describe("isServableImageUrl", () => {
  it("accepts Firebase Storage URLs (with or without query token)", () => {
    expect(
      isServableImageUrl(
        "https://firebasestorage.googleapis.com/v0/b/bucket/o/images%2Fx.jpg?alt=media&token=abc"
      )
    ).toBe(true);
    expect(
      isServableImageUrl("https://firebasestorage.googleapis.com/v0/b/b/o/x.jpg")
    ).toBe(true);
  });

  it("accepts Supabase event-images public URLs", () => {
    expect(
      isServableImageUrl(
        `${SUPABASE_EVENT_IMAGES_URL_PREFIX}events/abc/def.jpg`
      )
    ).toBe(true);
  });

  it("rejects other hosts, other buckets, empty and non-strings", () => {
    expect(isServableImageUrl("https://evil.example.com/x.jpg")).toBe(false);
    expect(
      isServableImageUrl(
        `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/other-bucket/x.jpg`
      )
    ).toBe(false);
    expect(isServableImageUrl("https://gzvixlvkwjsrtmtybtkf.supabase.co/storage/v1/object/public/event-images-evi1/x.jpg")).toBe(false);
    expect(isServableImageUrl("")).toBe(false);
    expect(isServableImageUrl(null)).toBe(false);
    expect(isServableImageUrl(undefined)).toBe(false);
    expect(isServableImageUrl("not a url")).toBe(false);
  });
});

describe("SERTABLE_IMAGE_URL_LIKE", () => {
  it("is a boolean SQL fragment covering both prefixes for alias i", () => {
    expect(SERVABLE_IMAGE_URL_LIKE).toContain("i.url LIKE");
    expect(SERVABLE_IMAGE_URL_LIKE).toContain(FIREBASE_IMAGE_URL_PREFIX);
    expect(SERVABLE_IMAGE_URL_LIKE).toContain(SUPABASE_EVENT_IMAGES_URL_PREFIX);
    expect(SERVABLE_IMAGE_URL_LIKE.startsWith("(")).toBe(true);
    expect(SERVABLE_IMAGE_URL_LIKE.trim().endsWith(")")).toBe(true);
    // supabase prefix embeds the canonical project ref
    expect(SUPABASE_EVENT_IMAGES_URL_PREFIX).toContain(
      EXPECTED_SUPABASE_PROJECT_REF
    );
    expect(SUPABASE_EVENT_IMAGES_URL_PREFIX).toContain("/event-images/");
  });
});
