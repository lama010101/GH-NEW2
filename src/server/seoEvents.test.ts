// SEO-BUILD-REVIVE-DIGTHEPAST-1118-616
// Verified-only filter: the public SEO surface may list/index an event only
// when it is proven content (status='validated', not retired, no upheld
// event_reports) and has a public image. These tests assert the eligibility
// predicate is present in every generated query and that rows map correctly.

import { describe, it, expect, vi } from "vitest";
import {
  fetchSeoEventBySlug,
  fetchAllEligibleSlugs,
  countEligibleEvents,
  fetchSeoEventsPage,
  fetchSeoEventsFilterMeta,
  fetchRelatedSeoEvents,
} from "./seoEvents";

vi.mock("./db", () => ({
  dbPool: {
    query: vi.fn(),
  },
}));

type QueryCall = { sql: string; params: unknown[] };

function makeExecutor(handler?: (sql: string, params: unknown[]) => { rows: unknown[] }) {
  const calls: QueryCall[] = [];
  const executor = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return handler ? handler(sql, params) : { rows: [] as never[] };
    }),
  };
  return { calls, executor };
}

const ELIGIBILITY_MARKERS = [
  "e.status = 'validated'",
  "e.retired_at IS NULL",
  "length(trim(e.description)) > 0",
  "l.latitude IS NOT NULL",
  "l.longitude IS NOT NULL",
  "firebasestorage.googleapis.com",
  "event_reports",
  "upheld",
];

function expectEligibleWhere(sql: string) {
  for (const marker of ELIGIBILITY_MARKERS) {
    expect(sql).toContain(marker);
  }
  expect(sql).toContain("NOT EXISTS");
}

const FULL_ROW = {
  id: "11111111-2222-3333-4444-555555555555",
  slug: "moon-landing-1969",
  title: "Moon Landing",
  description: "First humans on the Moon.",
  event_year: 1969,
  category: "Space",
  theme: " Exploration ",
  display_name: "Tranquility Base",
  country: "United States",
  continent: "North America",
  latitude: 0.674,
  longitude: 23.473,
  image_url: "https://firebasestorage.googleapis.com/v0/b/x/o/img.jpg",
};

describe("seoEvents verified-only eligibility (SEO-BUILD-REVIVE-DIGTHEPAST-1118-616)", () => {
  it("fetchSeoEventBySlug applies the full eligibility predicate", async () => {
    const { calls, executor } = makeExecutor(() => ({ rows: [FULL_ROW] }));
    const event = await fetchSeoEventBySlug("moon-landing-1969", executor as never);

    expect(calls).toHaveLength(1);
    expectEligibleWhere(calls[0].sql);
    expect(calls[0].params).toEqual(["moon-landing-1969"]);
    expect(event?.slug).toBe("moon-landing-1969");
    expect(event?.location.name).toBe("Tranquility Base");
    expect(event?.imageUrl).toContain("firebasestorage.googleapis.com");
  });

  it("fetchSeoEventBySlug returns null when the event is not eligible", async () => {
    const { executor } = makeExecutor(() => ({ rows: [] }));
    const event = await fetchSeoEventBySlug("draft-event", executor as never);
    expect(event).toBeNull();
  });

  it("fetchAllEligibleSlugs applies the eligibility predicate and orders by slug", async () => {
    const { calls, executor } = makeExecutor(() => ({
      rows: [{ slug: "a-event", updated_at: "2026-01-01" }],
    }));
    const slugs = await fetchAllEligibleSlugs(executor as never);

    expectEligibleWhere(calls[0].sql);
    expect(calls[0].sql).toContain("ORDER BY e.slug");
    expect(slugs).toEqual([{ slug: "a-event", updatedAt: "2026-01-01" }]);
  });

  it("countEligibleEvents applies the eligibility predicate", async () => {
    const { calls, executor } = makeExecutor(() => ({ rows: [{ count: "42" }] }));
    const count = await countEligibleEvents(executor as never);

    expectEligibleWhere(calls[0].sql);
    expect(count).toBe(42);
  });

  it("fetchSeoEventsPage applies the eligibility predicate to both rows and count queries", async () => {
    const { calls, executor } = makeExecutor((sql) =>
      sql.includes("COUNT(*)") ? { rows: [{ count: "1" }] } : { rows: [FULL_ROW] }
    );
    const page = await fetchSeoEventsPage({ page: 1, pageSize: 24 }, executor as never);

    expect(calls).toHaveLength(2);
    expectEligibleWhere(calls[0].sql);
    expectEligibleWhere(calls[1].sql);
    expect(page.total).toBe(1);
    expect(page.events[0].slug).toBe("moon-landing-1969");
    expect(page.events[0].lat).toBe(0.674);
  });

  it("fetchSeoEventsFilterMeta applies the eligibility predicate to all three queries", async () => {
    const { calls, executor } = makeExecutor(() => ({ rows: [] }));
    await fetchSeoEventsFilterMeta(executor as never);

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expectEligibleWhere(call.sql);
    }
  });

  it("fetchRelatedSeoEvents applies the eligibility predicate and same-category rule", async () => {
    const { calls, executor } = makeExecutor(() => ({ rows: [FULL_ROW] }));
    const related = await fetchRelatedSeoEvents(
      { id: FULL_ROW.id, category: "Space", year: 1969 },
      12,
      executor as never
    );

    expectEligibleWhere(calls[0].sql);
    expect(calls[0].sql).toContain("e.category = $2");
    expect(calls[0].sql).toContain("e.id != $1");
    expect(related).toHaveLength(1);
  });

  it("fetchRelatedSeoEvents returns [] without querying when category is null", async () => {
    const { calls, executor } = makeExecutor();
    const related = await fetchRelatedSeoEvents(
      { id: FULL_ROW.id, category: null, year: 1969 },
      12,
      executor as never
    );
    expect(related).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
