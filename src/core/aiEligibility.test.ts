import { describe, it, expect } from "vitest";
import {
  classifyPlayer,
  toCatalogModel,
  CHEAP_TIER_MAX_USD_PER_TOKEN,
  type CatalogModel,
  type FleetPlayer,
  type BudgetGate,
} from "./aiEligibility";
import type { OpenRouterRawEntry } from "./openrouterCatalog";

// AIP-BUILD-FLEETFINAL-1103-060 — D1 eligibility proof.
// Roster fixtures mirror docs/AI_FLEET_DIAGNOSIS_1103-060.md §1B/§1C: real
// OpenRouter catalog fields for the current ai_players roster.

const OK: BudgetGate = { action: "ok" };

function player(over: Partial<FleetPlayer> = {}): FleetPlayer {
  return {
    id: "p-1",
    model_id: "m/x",
    is_active: true,
    is_active_daily: true,
    is_active_practice: false,
    deleted_at: null,
    ...over,
  };
}

function model(over: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: "m/x",
    isFree: false,
    isVision: true,
    contextLength: 128000,
    maxCompletion: 8192,
    promptPrice: 1e-7,
    completionPrice: 4e-7,
    ...over,
  };
}

/** Minimal OpenRouter /models entry (fields normalizeEntry reads). */
function rawEntry(over: Record<string, unknown> = {}): OpenRouterRawEntry {
  return {
    id: "m/x",
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    pricing: { prompt: "0.0000001", completion: "0.0000004" },
    context_length: 128000,
    top_provider: { max_completion_tokens: 8192 },
    ...over,
  } as OpenRouterRawEntry;
}

describe("toCatalogModel", () => {
  it("converts a real OpenRouter entry (fields, prices, vision)", () => {
    const m = toCatalogModel(rawEntry({ id: "google/gemini-2.5-flash-lite" }));
    expect(m).not.toBeNull();
    expect(m!.id).toBe("google/gemini-2.5-flash-lite");
    expect(m!.isVision).toBe(true);
    expect(m!.isFree).toBe(false);
    expect(m!.promptPrice).toBeCloseTo(1e-7, 12);
    expect(m!.completionPrice).toBeCloseTo(4e-7, 12);
    expect(m!.contextLength).toBe(128000);
    expect(m!.maxCompletion).toBe(8192);
  });

  it("free model: prompt==0 && completion==0 => isFree", () => {
    const m = toCatalogModel(
      rawEntry({ id: "google/gemma-4-26b-a4b-it:free", pricing: { prompt: "0", completion: "0" } })
    );
    expect(m!.isFree).toBe(true);
  });

  it("D1 formula only: ':free' slug with non-zero pricing is NOT free", () => {
    const m = toCatalogModel(
      rawEntry({ id: "vendor/x:free", pricing: { prompt: "0.000001", completion: "0.000002" } })
    );
    expect(m!.isFree).toBe(false);
  });

  it("text-only entry => isVision false", () => {
    const m = toCatalogModel(
      rawEntry({ architecture: { input_modalities: ["text"], output_modalities: ["text"] } })
    );
    expect(m!.isVision).toBe(false);
  });

  it("missing id => null", () => {
    expect(toCatalogModel(rawEntry({ id: undefined }))).toBeNull();
    expect(toCatalogModel({})).toBeNull();
  });
});

describe("classifyPlayer — D1 precedence", () => {
  it("deleted_at set => excluded 'deleted' (wins over everything)", () => {
    const v = classifyPlayer(
      player({ deleted_at: "2026-10-01T00:00:00Z" }),
      model({ isFree: true }),
      { action: "halt_fleet" }
    );
    expect(v).toEqual({ role: "excluded", modes: [], tier: null, reason: "deleted" });
  });

  it("deleted_at as Date object also excludes", () => {
    const v = classifyPlayer(player({ deleted_at: new Date() }), model(), OK);
    expect(v.role).toBe("excluded");
    expect(v.reason).toBe("deleted");
  });

  it("slug absent from catalog => excluded 'dead_slug'", () => {
    const v = classifyPlayer(player(), null, OK);
    expect(v).toEqual({ role: "excluded", modes: [], tier: null, reason: "dead_slug" });
  });

  it("catalog id mismatch => 'dead_slug' (input not trusted blindly)", () => {
    const v = classifyPlayer(player({ model_id: "m/x" }), model({ id: "other/y" }), OK);
    expect(v.reason).toBe("dead_slug");
  });

  it("budget skip_model => excluded 'budget'", () => {
    const v = classifyPlayer(player(), model(), { action: "skip_model" });
    expect(v).toEqual({ role: "excluded", modes: [], tier: null, reason: "budget" });
  });

  it("budget halt_fleet => excluded 'budget' (even for free models if passed)", () => {
    const v = classifyPlayer(player(), model({ isFree: true }), { action: "halt_fleet" });
    expect(v.reason).toBe("budget");
  });

  it("budget 'proceed' (literal evaluateBudget word) passes through like 'ok'", () => {
    const v = classifyPlayer(player(), model({ isFree: true }), { action: "proceed" });
    expect(v.role).toBe("player");
  });
});

describe("classifyPlayer — roster situations (diagnosis §1B/§1C)", () => {
  it("free+vision with ALL flags false => player, modes [daily,practice], 'free_vision' (Gemma 4 26B/31B)", () => {
    for (const slug of ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free"]) {
      const v = classifyPlayer(
        player({
          model_id: slug,
          is_active: false,
          is_active_daily: false,
          is_active_practice: false,
        }),
        model({ id: slug, isFree: true, isVision: true, promptPrice: 0, completionPrice: 0 }),
        OK
      );
      expect(v).toEqual({
        role: "player",
        modes: ["daily", "practice"],
        tier: "free",
        reason: "free_vision",
      });
    }
  });

  it("paid+vision with is_active=false => excluded 'admin_deactivated' (Gemma 3 4B, Qwen3.7 Flash)", () => {
    for (const slug of ["google/gemma-3-4b-it", "qwen/qwen3.7-flash"]) {
      const v = classifyPlayer(
        player({ model_id: slug, is_active: false }),
        model({ id: slug }),
        OK
      );
      expect(v).toEqual({ role: "excluded", modes: [], tier: null, reason: "admin_deactivated" });
    }
  });

  it("dead slugs on the roster => 'dead_slug' (Laguna, Ling, Nemotron 9B, Nex-N2)", () => {
    for (const slug of [
      "poolside/laguna-xs-2.1:free",
      "inclusionai/ling-3.0-tiny:free",
      "nvidia/nemotron-nano-9b-v2:free",
      "nex-agi/nex-n2-mini",
    ]) {
      const v = classifyPlayer(player({ model_id: slug }), null, OK);
      expect(v.reason).toBe("dead_slug");
    }
  });

  it("text-only+free => auditor regardless of flags (Nemotron 3 Ultra :free)", () => {
    const v = classifyPlayer(
      player({
        model_id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        is_active: false,
        is_active_daily: false,
        is_active_practice: false,
      }),
      model({ id: "nvidia/nemotron-3-ultra-550b-a55b:free", isFree: true, isVision: false, promptPrice: 0, completionPrice: 0 }),
      OK
    );
    expect(v).toEqual({ role: "auditor", modes: ["audit"], tier: "free", reason: "free_text_audit" });
  });

  it("text-only+paid+inactive => excluded 'text_only_inactive_paid' (tencent/hy-mt2-30b-a3b shape)", () => {
    const v = classifyPlayer(
      player({ model_id: "tencent/hy-mt2-30b-a3b", is_active: false }),
      model({ id: "tencent/hy-mt2-30b-a3b", isVision: false, promptPrice: 7.4e-8, completionPrice: 2.95e-7 }),
      OK
    );
    expect(v).toEqual({ role: "excluded", modes: [], tier: null, reason: "text_only_inactive_paid" });
  });

  it("text-only+paid+active => auditor 'paid_text_audit'", () => {
    const v = classifyPlayer(
      player({ model_id: "tencent/hy-mt2-30b-a3b", is_active: true }),
      model({ id: "tencent/hy-mt2-30b-a3b", isVision: false, promptPrice: 7.4e-8, completionPrice: 2.95e-7 }),
      OK
    );
    expect(v.role).toBe("auditor");
    expect(v.modes).toEqual(["audit"]);
    expect(v.tier).toBe("cheap");
    expect(v.reason).toBe("paid_text_audit");
  });

  it("paid+vision active with only daily flag => player modes [daily] 'paid_vision' (Gemini/Ministral/Qwen shape)", () => {
    const v = classifyPlayer(
      player({ model_id: "qwen/qwen3-vl-8b-instruct", is_active_daily: true, is_active_practice: false }),
      model({ id: "qwen/qwen3-vl-8b-instruct", promptPrice: 2.5e-7, completionPrice: 7.5e-7 }),
      OK
    );
    expect(v).toEqual({ role: "player", modes: ["daily"], tier: "cheap", reason: "paid_vision" });
  });

  it("paid+vision active with only practice flag => modes [practice]", () => {
    const v = classifyPlayer(
      player({ is_active_daily: false, is_active_practice: true }),
      model(),
      OK
    );
    expect(v.modes).toEqual(["practice"]);
    expect(v.reason).toBe("paid_vision");
  });

  it("paid+vision active with BOTH flags => modes [daily,practice]", () => {
    const v = classifyPlayer(
      player({ is_active_daily: true, is_active_practice: true }),
      model(),
      OK
    );
    expect(v.modes).toEqual(["daily", "practice"]);
  });

  it("paid+vision active with NO mode flags => excluded 'no_mode_flags'", () => {
    const v = classifyPlayer(
      player({ is_active_daily: false, is_active_practice: false }),
      model(),
      OK
    );
    expect(v).toEqual({ role: "excluded", modes: [], tier: null, reason: "no_mode_flags" });
  });
});

describe("classifyPlayer — tier boundaries", () => {
  it("paid sum exactly 1e-6 => 'cheap' (Qwen3 VL 8B: 2.5e-7 + 7.5e-7)", () => {
    const v = classifyPlayer(
      player({ model_id: "qwen/qwen3-vl-8b-instruct" }),
      model({ id: "qwen/qwen3-vl-8b-instruct", promptPrice: 2.5e-7, completionPrice: 7.5e-7 }),
      OK
    );
    expect(v.tier).toBe("cheap");
    expect(2.5e-7 + 7.5e-7).toBeLessThanOrEqual(CHEAP_TIER_MAX_USD_PER_TOKEN);
  });

  it("paid sum just over 1e-6 => 'premium'", () => {
    const v = classifyPlayer(
      player(),
      model({ promptPrice: 1e-6, completionPrice: 1e-7 }),
      OK
    );
    expect(v.tier).toBe("premium");
  });

  it("paid expensive (Claude Sonnet 4.6: 3e-6 + 1.5e-5) => 'premium'", () => {
    const v = classifyPlayer(
      player({ model_id: "anthropic/claude-sonnet-4.6" }),
      model({ id: "anthropic/claude-sonnet-4.6", promptPrice: 3e-6, completionPrice: 1.5e-5 }),
      OK
    );
    expect(v.tier).toBe("premium");
  });

  it("paid slug with unknown pricing => 'premium' (conservative)", () => {
    const v = classifyPlayer(
      player(),
      model({ promptPrice: null, completionPrice: null }),
      OK
    );
    expect(v.tier).toBe("premium");
  });
});
