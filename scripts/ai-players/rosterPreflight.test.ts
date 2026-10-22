import { describe, expect, it } from "vitest";
import { preflightRoster, type PreflightPlayer } from "./rosterPreflight";

const MODELS_URL = "https://openrouter.ai/api/v1/models";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function catalog(entries: Array<[string, string[]]>) {
  return {
    data: entries.map(([id, input_modalities]) => ({
      id,
      architecture: { input_modalities },
    })),
  };
}

function endpointsResponse(endpoints: unknown[]) {
  return { data: { endpoints } };
}

function player(model_id: string, provider = "openrouter"): PreflightPlayer {
  return { id: `id-${model_id}`, name: `P-${model_id}`, provider, model_id };
}

// Dispatch by URL: catalog call vs per-model endpoints call.
function mockFetch(handlers: {
  catalog?: () => Promise<Response> | Response;
  endpoints?: (modelId: string) => Promise<Response> | Response;
}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === MODELS_URL) {
      if (!handlers.catalog) throw new Error("unexpected catalog call");
      return handlers.catalog();
    }
    const m = url.match(/^https:\/\/openrouter\.ai\/api\/v1\/models\/(.+)\/endpoints$/);
    if (m && handlers.endpoints) return handlers.endpoints(decodeURIComponent(m[1]));
    throw new Error(`unexpected url: ${url}`);
  }) as typeof fetch;
}

describe("preflightRoster", () => {
  it("(a) skips a model whose endpoints array is empty", async () => {
    const result = await preflightRoster([player("dead/model")], {
      fetchImpl: mockFetch({
        catalog: () => jsonResponse(catalog([["dead/model", ["image", "text"]]])),
        endpoints: () => jsonResponse(endpointsResponse([])),
      }),
    });
    expect(result.keep).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("no endpoints");
  });

  it("(b) skips a text-only model present in the catalog", async () => {
    const result = await preflightRoster([player("text/only")], {
      fetchImpl: mockFetch({
        catalog: () => jsonResponse(catalog([["text/only", ["text"]]])),
        endpoints: () => jsonResponse(endpointsResponse([{ name: "ep" }])),
      }),
    });
    expect(result.keep).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("no image input");
  });

  it("(c) skips a model whose endpoints probe 404s", async () => {
    const result = await preflightRoster([player("gone/model")], {
      fetchImpl: mockFetch({
        catalog: () => jsonResponse(catalog([["gone/model", ["image"]]])),
        endpoints: () => jsonResponse({ error: "not found" }, 404),
      }),
    });
    expect(result.keep).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("model not found");
  });

  it("(d) keeps a model when the endpoints probe fails (HTTP 500 or thrown)", async () => {
    const r500 = await preflightRoster([player("flaky/model")], {
      fetchImpl: mockFetch({
        catalog: () => jsonResponse(catalog([["flaky/model", ["image"]]])),
        endpoints: () => jsonResponse({ error: "server" }, 500),
      }),
    });
    expect(r500.keep).toHaveLength(1);
    expect(r500.skipped).toEqual([]);
    expect(r500.warnings.length).toBeGreaterThan(0);

    const rThrow = await preflightRoster([player("flaky/model")], {
      fetchImpl: mockFetch({
        catalog: () => jsonResponse(catalog([["flaky/model", ["image"]]])),
        endpoints: () => Promise.reject(new Error("socket hang up")),
      }),
    });
    expect(rThrow.keep).toHaveLength(1);
    expect(rThrow.skipped).toEqual([]);
    expect(rThrow.warnings.length).toBeGreaterThan(0);
  });

  it("(e) keeps models when the catalog call fails; endpoint skips still apply", async () => {
    const result = await preflightRoster([player("ok/model"), player("dead/model")], {
      fetchImpl: mockFetch({
        catalog: () => Promise.reject(new Error("catalog down")),
        endpoints: (id) =>
          id === "dead/model" ? jsonResponse(endpointsResponse([])) : jsonResponse(endpointsResponse([{}])),
      }),
    });
    expect(result.keep.map((p) => p.model_id)).toEqual(["ok/model"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("no endpoints");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("(f) keeps a model absent from the catalog when endpoints are non-empty, with warning", async () => {
    const result = await preflightRoster([player("ghost/model")], {
      fetchImpl: mockFetch({
        catalog: () => jsonResponse(catalog([["other/model", ["image"]]])),
        endpoints: () => jsonResponse(endpointsResponse([{ name: "ep" }])),
      }),
    });
    expect(result.keep).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(result.warnings.some((w) => w.includes("absent from models catalog"))).toBe(true);
  });

  it("(g) keeps non-openrouter providers untouched, with warning", async () => {
    const result = await preflightRoster([player("some/model", "anthropic")], {
      fetchImpl: mockFetch({
        catalog: () => jsonResponse(catalog([])),
      }),
    });
    expect(result.keep).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(result.warnings.some((w) => w.includes("not probed"))).toBe(true);
  });

  it("(h) keeps models whose catalog entry lacks input_modalities (unknown capability)", async () => {
    const result = await preflightRoster([player("x/nomod"), player("x/emptyarch")], {
      fetchImpl: mockFetch({
        catalog: () =>
          jsonResponse({
            data: [{ id: "x/nomod" }, { id: "x/emptyarch", architecture: {} }],
          }),
        endpoints: () => jsonResponse(endpointsResponse([{}])),
      }),
    });
    expect(result.keep).toHaveLength(2);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toHaveLength(2);
  });
});
