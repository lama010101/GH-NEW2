// I18N-BUILD-OVERLAYCORE-1123-852
// Unit tests for src/server/contentTranslations.ts — mocked executor, no DB.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchContentTranslations,
  overlayNullableText,
  overlayText,
  resolveOverlayLocale,
} from "./contentTranslations";

vi.mock("./db", () => ({
  dbPool: { query: vi.fn() },
}));

const ID1 = "11111111-1111-1111-1111-111111111111";
const ID2 = "22222222-2222-2222-2222-222222222222";

type QueryCall = { sql: string; params: unknown[] };

function makeExecutor(
  handler?: (sql: string, params: unknown[]) => { rows: unknown[] }
) {
  const calls: QueryCall[] = [];
  const executor = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return handler ? handler(sql, params) : { rows: [] as never[] };
    }),
  };
  return { calls, executor };
}

function translationHandler(sql: string) {
  if (sql.includes("event_translations")) {
    return {
      rows: [
        {
          event_id: ID1,
          title: "Titre FR",
          description: "Description FR",
          category: "Cat FR",
          theme: "Theme FR",
        },
      ],
    };
  }
  if (sql.includes("hint_translations")) {
    return { rows: [{ hint_id: "hint-1", content: "Indice FR" }] };
  }
  if (sql.includes("location_translations")) {
    return {
      rows: [{ event_id: ID1, display_name: "Lieu FR", country: "Pays FR" }],
    };
  }
  return { rows: [] };
}

describe("resolveOverlayLocale", () => {
  it("returns null for empty, 'en' and unknown values", () => {
    expect(resolveOverlayLocale(null)).toBeNull();
    expect(resolveOverlayLocale(undefined)).toBeNull();
    expect(resolveOverlayLocale("")).toBeNull();
    expect(resolveOverlayLocale("   ")).toBeNull();
    expect(resolveOverlayLocale("en")).toBeNull();
    expect(resolveOverlayLocale("xx")).toBeNull();
    expect(resolveOverlayLocale("fr-FR")).toBeNull();
  });

  it("returns the locale code for supported non-English locales", () => {
    expect(resolveOverlayLocale("fr")).toBe("fr");
    expect(resolveOverlayLocale("ja")).toBe("ja");
    expect(resolveOverlayLocale("ar")).toBe("ar");
  });
});

describe("fetchContentTranslations", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs zero queries and returns empty maps for null/'en'/unknown lang", async () => {
    for (const lang of [null, "en", "xx"] as const) {
      const { calls, executor } = makeExecutor();
      const res = await fetchContentTranslations([ID1], lang, executor as never);
      expect(calls).toHaveLength(0);
      expect(res.events.size).toBe(0);
      expect(res.hints.size).toBe(0);
      expect(res.locations.size).toBe(0);
    }
  });

  it("runs zero queries for an empty id list", async () => {
    const { calls, executor } = makeExecutor();
    const res = await fetchContentTranslations([], "fr", executor as never);
    expect(calls).toHaveLength(0);
    expect(res.events.size).toBe(0);
  });

  it("serves hash-matching rows into the three maps", async () => {
    const { calls, executor } = makeExecutor(translationHandler);
    const res = await fetchContentTranslations([ID1, ID2], "fr", executor as never);

    expect(calls).toHaveLength(3);
    expect(res.events.get(ID1)).toEqual({
      title: "Titre FR",
      description: "Description FR",
      category: "Cat FR",
      theme: "Theme FR",
    });
    expect(res.hints.get("hint-1")).toEqual({ content: "Indice FR" });
    expect(res.locations.get(ID1)).toEqual({
      displayName: "Lieu FR",
      country: "Pays FR",
    });
    expect(res.events.has(ID2)).toBe(false);
    expect(res.locations.has(ID2)).toBe(false);
  });

  it("compares source_hash inside SQL for each of the three tables", async () => {
    const { calls, executor } = makeExecutor(() => ({ rows: [] }));
    await fetchContentTranslations([ID1], "fr", executor as never);
    expect(calls).toHaveLength(3);

    const [eventSql, hintSql, locationSql] = calls.map((c) => c.sql);

    expect(eventSql).toContain("FROM event_translations et");
    expect(eventSql).toContain("JOIN events e ON e.id = et.event_id");
    expect(eventSql).toContain("et.language_code = $2");
    expect(eventSql).toContain("et.source_hash = encode(sha256(convert_to(");
    expect(eventSql).toContain("concat_ws(chr(9247)");
    expect(eventSql).toContain("coalesce(e.title,'')");
    expect(eventSql).toContain("coalesce(e.description,'')");
    expect(eventSql).toContain("coalesce(e.category,'')");
    expect(eventSql).toContain("coalesce(e.theme,'')");
    expect(eventSql).toContain("'UTF8')),'hex'");

    expect(hintSql).toContain("FROM hint_translations ht");
    expect(hintSql).toContain("JOIN hints h ON h.id = ht.hint_id");
    expect(hintSql).toContain("ht.language_code = $2");
    expect(hintSql).toContain("ht.source_hash = encode(sha256(convert_to(");
    expect(hintSql).toContain("coalesce(h.content,'')");
    expect(hintSql).not.toContain("concat_ws");

    expect(locationSql).toContain("FROM location_translations lt");
    expect(locationSql).toContain("JOIN locations l ON l.id = lt.location_id");
    expect(locationSql).toContain("lt.language_code = $2");
    expect(locationSql).toContain("lt.source_hash = encode(sha256(convert_to(");
    expect(locationSql).toContain("concat_ws(chr(9247)");
    expect(locationSql).toContain("coalesce(l.display_name,'')");
    expect(locationSql).toContain("coalesce(l.country,'')");
    expect(locationSql).toContain("l.event_id = ANY($1::uuid[])");

    for (const call of calls) {
      expect(call.params[1]).toBe("fr");
      expect(call.params[0]).toEqual([ID1]);
    }
  });

  it("does not serve rows the DB filtered out (stale/NULL/missing hash)", async () => {
    // The executor simulates PostgreSQL: mismatched or NULL source_hash rows
    // never leave the database, so an empty result means English fallback.
    const { calls, executor } = makeExecutor(() => ({ rows: [] }));
    const res = await fetchContentTranslations([ID1], "fr", executor as never);
    expect(calls).toHaveLength(3);
    expect(res.events.size).toBe(0);
    expect(res.hints.size).toBe(0);
    expect(res.locations.size).toBe(0);
  });

  it("keeps null translated fields so per-field fallback applies", async () => {
    const { executor } = makeExecutor((sql) => {
      if (sql.includes("event_translations")) {
        return {
          rows: [
            {
              event_id: ID1,
              title: "Titre FR",
              description: null,
              category: null,
              theme: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const res = await fetchContentTranslations([ID1], "fr", executor as never);
    expect(res.events.get(ID1)).toEqual({
      title: "Titre FR",
      description: null,
      category: null,
      theme: null,
    });
  });

  it("returns empty maps and does not throw on DB error", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const executor = {
      query: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    };
    const res = await fetchContentTranslations([ID1], "fr", executor as never);
    expect(res.events.size).toBe(0);
    expect(res.hints.size).toBe(0);
    expect(res.locations.size).toBe(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("lang=fr");
    expect(String(errorSpy.mock.calls[0][0])).toContain("requested=1");
  });

  it("dedupes ids and caps the id list at 2000", async () => {
    const { calls, executor } = makeExecutor(() => ({ rows: [] }));
    await fetchContentTranslations([ID2, ID1, ID2, ID1], "fr", executor as never);
    expect((calls[0].params as [string[], string])[0]).toEqual([ID2, ID1]);

    const many = Array.from({ length: 2005 }, (_, i) => `id-${i}`);
    await fetchContentTranslations(many, "fr", executor as never);
    const capped = (calls[3].params as [string[], string])[0];
    expect(capped).toHaveLength(2000);
    expect(capped[0]).toBe("id-0");
    expect(capped[1999]).toBe("id-1999");
  });
});

describe("overlayText / overlayNullableText", () => {
  it("overlayText serves non-empty translation, else English", () => {
    expect(overlayText("Hello", "Bonjour")).toBe("Bonjour");
    expect(overlayText("Hello", null)).toBe("Hello");
    expect(overlayText("Hello", undefined)).toBe("Hello");
    expect(overlayText("Hello", "")).toBe("Hello");
    expect(overlayText("Hello", "   ")).toBe("Hello");
  });

  it("overlayNullableText never adds content English did not expose", () => {
    expect(overlayNullableText(null, "Bonjour")).toBeNull();
    expect(overlayNullableText("", "Bonjour")).toBe("");
    expect(overlayNullableText("  ", "Bonjour")).toBe("  ");
    expect(overlayNullableText("Hello", "Bonjour")).toBe("Bonjour");
    expect(overlayNullableText("Hello", null)).toBe("Hello");
    expect(overlayNullableText("Hello", "  ")).toBe("Hello");
  });
});
