import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateImageRunware,
  RunwareError,
  RunwareHttpError,
  isRunwareAbortStatus,
  RUNWARE_API_URL,
} from "./runware";

// EDQ-BUILD-ADMINGEN-1122-815 — adapter contract tests with mocked fetch.
// No network, no real key: apiKey is a dummy string.

const KEY = "test-key-not-real";

function okResponse(imageURL = "https://cdn.example.com/img.jpg", cost = 0.04) {
  return new Response(
    JSON.stringify({ data: [{ imageURL, cost }], cost }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function errResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BASE = {
  model: "bfl:2@1",
  prompt: "Documentary photograph of X, 1969, Y.",
  negativePrompt: "text, watermark",
  width: 1024,
  height: 1024,
  apiKey: KEY,
};

describe("generateImageRunware", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs an array-of-one imageInference task with Bearer auth", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const r = await generateImageRunware(BASE);
    expect(r.imageUrl).toBe("https://cdn.example.com/img.jpg");
    expect(r.cost).toBe(0.04);
    expect(typeof r.durationMs).toBe("number");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RUNWARE_API_URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string) as Record<string, unknown>[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    const task = body[0];
    expect(task.taskType).toBe("imageInference");
    expect(task.model).toBe("bfl:2@1");
    expect(task.positivePrompt).toBe(BASE.prompt);
    expect(task.negative_prompt).toBe("text, watermark");
    expect(task.outputType).toBe("URL");
    expect(task.numberResults).toBe(1);
    expect(task.includeCost).toBe(true);
    expect(task.outputFormat).toBe("JPG");
    expect(task.width).toBe(1024);
    expect(task.height).toBe(1024);
    // bfl:2@1 supports neither steps nor CFGScale
    expect(task.steps).toBeUndefined();
    expect(task.CFGScale).toBeUndefined();
    expect(task.providerSettings).toEqual({
      bfl: { promptUpsampling: false, safetyTolerance: 2 },
    });
  });

  it("sends steps + CFGScale + negative_prompt for non-bfl models (schnell)", async () => {
    fetchMock.mockResolvedValue(okResponse("https://x/img.jpg", 0.0006));
    await generateImageRunware({ ...BASE, model: "runware:100@1" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const task = JSON.parse(init.body as string)[0] as Record<string, unknown>;
    expect(task.steps).toBe(20);
    expect(task.CFGScale).toBe(4);
    expect(task.negative_prompt).toBe("text, watermark");
    expect(task.providerSettings).toBeUndefined();
  });

  it("bfl:4@1 uses safetyTolerance 6 provider settings", async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateImageRunware({ ...BASE, model: "bfl:4@1" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const task = JSON.parse(init.body as string)[0] as Record<string, unknown>;
    expect(task.providerSettings).toEqual({ bfl: { safetyTolerance: 6 } });
  });

  it("omits negative_prompt when empty and honors caller steps/cfg overrides", async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateImageRunware({
      ...BASE,
      model: "runware:100@1",
      negativePrompt: "   ",
      steps: 6,
      cfgScale: 3.5,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const task = JSON.parse(init.body as string)[0] as Record<string, unknown>;
    expect(task.negative_prompt).toBeUndefined();
    expect(task.steps).toBe(6);
    expect(task.CFGScale).toBe(3.5);
  });

  it("throws RunwareHttpError with status on 401 and marks it abortable", async () => {
    fetchMock.mockResolvedValue(errResponse(401, { errors: [{ message: "bad key" }] }));
    const err = await generateImageRunware(BASE).catch((e) => e);
    expect(err).toBeInstanceOf(RunwareHttpError);
    expect((err as RunwareHttpError).status).toBe(401);
    expect(isRunwareAbortStatus(401)).toBe(true);
    expect((err as Error).message).toBe("bad key");
  });

  it("aborts on 402 and 403", async () => {
    for (const status of [402, 403]) {
      fetchMock.mockResolvedValue(errResponse(status, { message: "no" }));
      const err = await generateImageRunware(BASE).catch((e) => e);
      expect(err).toBeInstanceOf(RunwareHttpError);
      expect((err as RunwareHttpError).status).toBe(status);
      expect(isRunwareAbortStatus(status)).toBe(true);
    }
  });

  it("non-abort HTTP errors surface status + short message only", async () => {
    fetchMock.mockResolvedValue(
      errResponse(500, { errors: [{ message: "internal boom" }] })
    );
    const err = await generateImageRunware(BASE).catch((e) => e);
    expect(err).toBeInstanceOf(RunwareHttpError);
    expect((err as RunwareHttpError).status).toBe(500);
    expect(isRunwareAbortStatus(500)).toBe(false);
    expect((err as Error).message).toBe("internal boom");
  });

  it("missing imageURL throws RunwareError", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    await expect(generateImageRunware(BASE)).rejects.toBeInstanceOf(RunwareError);
  });

  it("rejects empty apiKey / model / prompt before any fetch", async () => {
    await expect(
      generateImageRunware({ ...BASE, apiKey: "" })
    ).rejects.toThrow(/RUNWARE_API_KEY/);
    await expect(
      generateImageRunware({ ...BASE, model: "" })
    ).rejects.toThrow(/model/);
    await expect(
      generateImageRunware({ ...BASE, prompt: "  " })
    ).rejects.toThrow(/prompt/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("network failure maps to a short RunwareError (no request dump)", async () => {
    fetchMock.mockRejectedValue(new Error("socket hangup"));
    const err = await generateImageRunware(BASE).catch((e) => e);
    expect(err).toBeInstanceOf(RunwareError);
    expect((err as Error).message).toBe("Runware request failed");
    expect((err as Error).message).not.toContain(KEY);
  });
});
