// SEO-BUILD-REVIVE-DIGTHEPAST-1118-616
// Sitemap generation: static entries + one URL per eligible event, all
// canonicalized to SITE_ORIGIN (https://digthepast.org), capped at the
// 50,000-URL sitemap protocol limit, and degraded to static entries when the
// DB is unreachable.

import { describe, it, expect, vi, beforeEach } from "vitest";
import sitemap from "./sitemap";
import { fetchAllEligibleSlugs } from "@/server/seoEvents";
import { SITE_ORIGIN } from "@/core/brand";

vi.mock("@/server/seoEvents", () => ({
  fetchAllEligibleSlugs: vi.fn(),
}));

const mockFetch = vi.mocked(fetchAllEligibleSlugs);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("sitemap generation (SEO-BUILD-REVIVE-DIGTHEPAST-1118-616)", () => {
  it("emits static entries canonicalized to SITE_ORIGIN", async () => {
    mockFetch.mockResolvedValue([]);
    const entries = await sitemap();

    expect(entries[0].url).toBe(SITE_ORIGIN);
    expect(entries[1].url).toBe(`${SITE_ORIGIN}/events`);
    expect(SITE_ORIGIN).toBe("https://digthepast.org");
  });

  it("emits one digthepast.org URL per eligible event slug", async () => {
    mockFetch.mockResolvedValue([
      { slug: "moon-landing-1969", updatedAt: "2026-01-01T00:00:00Z" },
      { slug: "fall-of-rome", updatedAt: null },
    ]);
    const entries = await sitemap();

    expect(entries).toHaveLength(4);
    expect(entries[2].url).toBe(`${SITE_ORIGIN}/events/moon-landing-1969`);
    expect(entries[2].lastModified).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(entries[3].url).toBe(`${SITE_ORIGIN}/events/fall-of-rome`);
    expect(entries[3].lastModified).toBeUndefined();
    for (const entry of entries) {
      expect(entry.url.startsWith("https://digthepast.org")).toBe(true);
    }
  });

  it("caps event URLs at the 50,000 sitemap protocol limit", async () => {
    const slugs = Array.from({ length: 50_001 }, (_, i) => ({
      slug: `event-${i}`,
      updatedAt: null,
    }));
    mockFetch.mockResolvedValue(slugs);
    const entries = await sitemap();

    // 2 static + 50,000 event entries
    expect(entries).toHaveLength(50_002);
    expect(entries[50_001].url).toBe(`${SITE_ORIGIN}/events/event-49999`);
  });

  it("falls back to static entries only when the DB is unreachable", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entries = await sitemap();

    expect(entries).toHaveLength(2);
    expect(entries[0].url).toBe(SITE_ORIGIN);
    warn.mockRestore();
  });
});
