import { describe, expect, it } from "vitest";
import {
  ABSENT_REASON,
  classifyAvailability,
  diffKinds,
  MIN_FEED_SIZE,
  normalizeEntry,
  OPENROUTER_MODELS_URL,
  planSync,
  rawHash,
  type CatalogRow,
  type NormalizedEntry,
  type OpenRouterRawEntry,
} from "./openrouterCatalog";

const NOW = new Date("2026-10-26T01:20:00Z");

const VISION: OpenRouterRawEntry = {
  id: "openai/gpt-vision",
  canonical_slug: "openai/gpt-vision-2026",
  name: "GPT Vision",
  created: 1_760_000_000,
  description: "A vision model",
  context_length: 128000,
  expiration_date: null,
  supported_parameters: ["tools", "temperature"],
  architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
  pricing: { prompt: "0.0000025", completion: "0.00001", image: "0.003" },
  top_provider: { max_completion_tokens: 16384 },
};

const FREE: OpenRouterRawEntry = {
  id: "meta/llama-free:free",
  name: "Llama Free",
  context_length: 8192,
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  pricing: { prompt: "0", completion: "0" },
};

const ROUTER: OpenRouterRawEntry = {
  id: "openrouter/auto",
  name: "Auto Router",
  context_length: 2000000,
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  pricing: { prompt: "-1", completion: "-1" },
};

const MINIMAL: OpenRouterRawEntry = { id: "acme/bare" };

const EXPIRING: OpenRouterRawEntry = {
  id: "acme/sunset",
  name: "Sunset",
  expiration_date: "2026-11-10",
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  pricing: { prompt: "0.000001", completion: "0.000002" },
};

function norm(raw: OpenRouterRawEntry): NormalizedEntry {
  const n = normalizeEntry(raw);
  if (!n) throw new Error("fixture failed to normalize");
  return n;
}

function asRow(
  n: NormalizedEntry,
  over: Partial<CatalogRow> = {}
): CatalogRow {
  const avail = classifyAvailability(n, NOW);
  return {
    ...n,
    availability_status: avail.status,
    availability_reason: avail.reason,
    first_seen_at: new Date("2026-10-01T00:00:00Z"),
    last_seen_at: new Date("2026-10-25T01:20:00Z"),
    missing_since: null,
    raw_hash: rawHash(n),
    ...over,
  };
}

/** Pads a feed past MIN_FEED_SIZE with filler models so the safety guard passes. */
function bigFeed(extra: NormalizedEntry[]): NormalizedEntry[] {
  const filler = Array.from({ length: MIN_FEED_SIZE }, (_, i) =>
    norm({ id: `filler/m${i}`, name: `Filler ${i}`, pricing: { prompt: "0.000001", completion: "0.000002" } })
  );
  return [...filler, ...extra];
}

describe("OPENROUTER_MODELS_URL", () => {
  it("is the models endpoint", () => {
    expect(OPENROUTER_MODELS_URL).toBe("https://openrouter.ai/api/v1/models");
  });
});

describe("normalizeEntry", () => {
  it("flags vision, parses prices, derives provider and timestamp", () => {
    const n = norm(VISION);
    expect(n.is_vision).toBe(true);
    expect(n.is_free).toBe(false);
    expect(n.provider_slug).toBe("openai");
    expect(n.price_prompt_usd).toBe(0.0000025);
    expect(n.price_image_usd).toBe(0.003);
    expect(n.max_completion_tokens).toBe(16384);
    expect(n.created_ts).toBe(new Date(1_760_000_000 * 1000).toISOString());
    expect(n.input_modalities).toEqual(["image", "text"]); // sorted
    expect(n.supported_parameters).toEqual(["temperature", "tools"]); // sorted
  });

  it("marks :free ids and zero/zero pricing as free", () => {
    expect(norm(FREE).is_free).toBe(true);
    expect(norm({ id: "x/zero", pricing: { prompt: "0", completion: "0" } }).is_free).toBe(true);
    expect(norm({ id: "x/zero-null", pricing: { prompt: "0" } }).is_free).toBe(false);
    expect(norm({ id: "x/paid:free2", pricing: { prompt: "1", completion: "1" } }).is_free).toBe(false);
  });

  it("turns negative prices into NULL and sets variable_pricing", () => {
    const n = norm(ROUTER);
    expect(n.price_prompt_usd).toBeNull();
    expect(n.price_completion_usd).toBeNull();
    expect(n.variable_pricing).toBe(true);
    expect(n.is_free).toBe(false);
  });

  it("turns non-numeric prices into NULL without flagging variable", () => {
    const n = norm({ id: "x/y", pricing: { prompt: "abc", completion: "" } });
    expect(n.price_prompt_usd).toBeNull();
    expect(n.price_completion_usd).toBeNull();
    expect(n.variable_pricing).toBe(false);
  });

  it("survives missing optional fields", () => {
    const n = norm(MINIMAL);
    expect(n.name).toBe("acme/bare");
    expect(n.provider_slug).toBe("acme");
    expect(n.description).toBeNull();
    expect(n.created_ts).toBeNull();
    expect(n.context_length).toBeNull();
    expect(n.input_modalities).toEqual([]);
    expect(n.is_vision).toBe(false);
    expect(n.expiration_date).toBeNull();
  });

  it("rejects entries without an id", () => {
    expect(normalizeEntry({ name: "no id" })).toBeNull();
  });
});

describe("rawHash", () => {
  it("is stable under key and array reordering", () => {
    const a = norm(VISION);
    const reordered: NormalizedEntry = {
      expiration_date: a.expiration_date,
      is_free: a.is_free,
      variable_pricing: a.variable_pricing,
      price_reasoning_usd: a.price_reasoning_usd,
      price_request_usd: a.price_request_usd,
      price_image_usd: a.price_image_usd,
      price_completion_usd: a.price_completion_usd,
      price_prompt_usd: a.price_prompt_usd,
      supported_parameters: [...a.supported_parameters].reverse(),
      is_vision: a.is_vision,
      output_modalities: [...a.output_modalities].reverse(),
      input_modalities: [...a.input_modalities].reverse(),
      max_completion_tokens: a.max_completion_tokens,
      context_length: a.context_length,
      created_ts: a.created_ts,
      description: a.description,
      name: a.name,
      provider_slug: a.provider_slug,
      alias_target: a.alias_target,
      canonical_slug: a.canonical_slug,
      model_id: a.model_id,
    };
    expect(rawHash(reordered)).toBe(rawHash(a));
  });

  it("ignores the description", () => {
    const a = norm(VISION);
    const other: NormalizedEntry = { ...a, description: "totally different" };
    expect(rawHash(other)).toBe(rawHash(a));
  });

  it("changes when a price changes", () => {
    const a = norm(VISION);
    expect(rawHash({ ...a, price_prompt_usd: 0.000003 })).not.toBe(rawHash(a));
  });

  it("is a 64-char hex digest", () => {
    expect(rawHash(norm(VISION))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("classifyAvailability", () => {
  const at = (d: string) => classifyAvailability({ expiration_date: d }, NOW);

  it("is available with no expiration", () => {
    expect(classifyAvailability({ expiration_date: null }, NOW)).toEqual({
      status: "available",
      reason: null,
    });
  });
  it("is available when expiry is more than 30 days away", () => {
    expect(at("2026-11-26").status).toBe("available"); // 31 days
  });
  it("is expiring within 30 days", () => {
    expect(at("2026-11-25").status).toBe("expiring"); // exactly 30 days
    expect(at("2026-10-27").status).toBe("expiring"); // tomorrow
  });
  it("is not_in_catalog/expired on or before today", () => {
    expect(at("2026-10-26")).toEqual({ status: "not_in_catalog", reason: "expired" });
    expect(at("2026-09-01")).toEqual({ status: "not_in_catalog", reason: "expired" });
  });
});

describe("diffKinds", () => {
  const base = norm(VISION);
  const prev = asRow(base);

  it("new for an unseen model", () => {
    expect(diffKinds(null, base, NOW)).toEqual(["new"]);
  });
  it("new + expiring for an unseen model already inside the window", () => {
    expect(diffKinds(null, norm(EXPIRING), NOW)).toEqual(["new", "expiring"]);
  });
  it("nothing when identical", () => {
    expect(diffKinds(prev, base, NOW)).toEqual([]);
  });
  it("price_changed", () => {
    expect(diffKinds(prev, { ...base, price_completion_usd: 0.00002 }, NOW)).toEqual(["price_changed"]);
  });
  it("price_changed when a price becomes variable", () => {
    expect(
      diffKinds(prev, { ...base, price_prompt_usd: null, variable_pricing: true }, NOW)
    ).toEqual(["price_changed"]);
  });
  it("modality_changed", () => {
    expect(
      diffKinds(prev, { ...base, input_modalities: ["text"], is_vision: false }, NOW)
    ).toEqual(["modality_changed"]);
  });
  it("context_changed", () => {
    expect(diffKinds(prev, { ...base, context_length: 256000 }, NOW)).toEqual(["context_changed"]);
  });
  it("relisted when previous.missing_since is set", () => {
    const gone = asRow(base, { missing_since: new Date("2026-10-24T01:20:00Z") });
    expect(diffKinds(gone, base, NOW)).toEqual(["relisted"]);
  });
  it("expiring when expiration_date is newly set within the window", () => {
    const ex = norm(EXPIRING);
    const before = asRow({ ...ex, expiration_date: null });
    expect(diffKinds(before, ex, NOW)).toEqual(["expiring"]);
  });
  it("expiring when expiration_date is newly set far in the future", () => {
    const far = { ...base, expiration_date: "2027-06-01" };
    expect(diffKinds(prev, far, NOW)).toEqual(["expiring"]);
  });
  it("does not re-log a steady expiring model", () => {
    const ex = norm(EXPIRING);
    expect(diffKinds(asRow(ex), ex, NOW)).toEqual([]);
  });
});

describe("planSync", () => {
  it("inserts a new model with a 'new' history row", () => {
    const plan = planSync([], bigFeed([norm(VISION)]), NOW);
    expect(plan.abort_reason).toBeNull();
    expect(plan.inserts.map((r) => r.model_id)).toContain("openai/gpt-vision");
    expect(plan.counts.new_count).toBe(MIN_FEED_SIZE + 1);
    const h = plan.history_rows.find((r) => r.model_id === "openai/gpt-vision");
    expect(h?.change_kinds).toEqual(["new"]);
    expect(h?.price_prompt_usd).toBe(0.0000025);
  });

  it("updates a changed price and logs price_changed", () => {
    const filler = bigFeed([]);
    const old = norm(VISION);
    const existing = [...filler.map((f) => asRow(f)), asRow(old)];
    const next = { ...old, price_prompt_usd: 0.000005 };
    const plan = planSync(existing, [...filler, next], NOW);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].raw_hash).toBe(rawHash(next));
    expect(plan.history_rows).toHaveLength(1);
    expect(plan.history_rows[0].change_kinds).toEqual(["price_changed"]);
    expect(plan.counts.changed_count).toBe(1);
    expect(plan.inserts).toHaveLength(0);
  });

  it("leaves unchanged models untouched with no history", () => {
    const feed = bigFeed([norm(VISION)]);
    const plan = planSync(feed.map((f) => asRow(f)), feed, NOW);
    expect(plan.unchanged_ids).toHaveLength(feed.length);
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.history_rows).toHaveLength(0);
    expect(plan.missing_updates).toHaveLength(0);
  });

  it("first absence sets missing_since only", () => {
    const feed = bigFeed([]);
    const gone = asRow(norm(FREE));
    const plan = planSync([...feed.map((f) => asRow(f)), gone], feed, NOW);
    expect(plan.missing_updates).toHaveLength(1);
    expect(plan.missing_updates[0]).toMatchObject({
      model_id: "meta/llama-free:free",
      missing_since: NOW,
      availability_status: "available",
    });
    expect(plan.history_rows).toHaveLength(0);
    expect(plan.counts.missing_marked_count).toBe(1);
    expect(plan.counts.delisted_count).toBe(0);
  });

  it("second consecutive absence delists with a 'delisted' history row", () => {
    const feed = bigFeed([]);
    const since = new Date("2026-10-25T01:20:00Z");
    const gone = asRow(norm(FREE), { missing_since: since });
    const plan = planSync([...feed.map((f) => asRow(f)), gone], feed, NOW);
    expect(plan.missing_updates).toEqual([
      {
        model_id: "meta/llama-free:free",
        missing_since: since,
        availability_status: "not_in_catalog",
        availability_reason: ABSENT_REASON,
      },
    ]);
    expect(plan.history_rows).toHaveLength(1);
    expect(plan.history_rows[0].change_kinds).toEqual(["delisted"]);
    expect(plan.counts.delisted_count).toBe(1);
  });

  it("does not re-delist an already delisted model", () => {
    const feed = bigFeed([]);
    const gone = asRow(norm(FREE), {
      missing_since: new Date("2026-10-20T00:00:00Z"),
      availability_status: "not_in_catalog",
      availability_reason: ABSENT_REASON,
    });
    const plan = planSync([...feed.map((f) => asRow(f)), gone], feed, NOW);
    expect(plan.missing_updates).toHaveLength(0);
    expect(plan.history_rows).toHaveLength(0);
  });

  it("reappearance after delisting gives 'relisted' and clears to available", () => {
    const feed = bigFeed([norm(FREE)]);
    const gone = asRow(norm(FREE), {
      missing_since: new Date("2026-10-20T00:00:00Z"),
      availability_status: "not_in_catalog",
      availability_reason: ABSENT_REASON,
    });
    const existing = [...bigFeed([]).map((f) => asRow(f)), gone];
    const plan = planSync(existing, feed, NOW);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].availability_status).toBe("available");
    expect(plan.updates[0].availability_reason).toBeNull();
    expect(plan.history_rows).toHaveLength(1);
    expect(plan.history_rows[0].change_kinds).toEqual(["relisted"]);
    expect(plan.counts.relisted_count).toBe(1);
    expect(plan.counts.changed_count).toBe(0);
  });

  it("safety guard: a tiny feed changes nothing", () => {
    const existing = bigFeed([norm(VISION)]).map((f) => asRow(f));
    const plan = planSync(existing, [norm(VISION), norm(FREE)], NOW);
    expect(plan.abort_reason).toMatch(/aborted/);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged_ids).toHaveLength(0);
    expect(plan.missing_updates).toHaveLength(0);
    expect(plan.history_rows).toHaveLength(0);
  });

  it("safety guard: a feed under 50% of the live snapshot changes nothing", () => {
    const existingFeed = Array.from({ length: 200 }, (_, i) =>
      norm({ id: `many/m${i}`, name: `M${i}` })
    );
    const half = existingFeed.slice(0, 99); // 99 >= 50 but < 50% of 200
    const plan = planSync(existingFeed.map((f) => asRow(f)), half, NOW);
    expect(plan.abort_reason).toMatch(/aborted/);
    expect(plan.missing_updates).toHaveLength(0);
    expect(plan.history_rows).toHaveLength(0);
  });
});
