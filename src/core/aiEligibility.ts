// Pure roster eligibility classification — decision D1 of
// AIP-BUILD-FLEETFINAL-1103-060 (fleet-design-060.md).
//
// Single entry point classifyPlayer(player, catalogModel|null, budget):
// decides whether an ai_players row is a 'player' (vision model), an
// 'auditor' (text-only model, D8) or is 'excluded', with the play modes it
// may run and its cost tier. No I/O, no clock — every input is injected.
//
// D1 branch order (first match wins):
//   1. deleted_at set                                   -> excluded 'deleted'
//   2. slug absent from catalog (or id mismatch)        -> excluded 'dead_slug'
//   3. budget gate says skip_model / halt_fleet         -> excluded 'budget'
//   4. vision + free   -> player, modes [daily,practice] REGARDLESS of flags
//      (product owner: every free+vision model plays; costs $0; the
//      is_active* flags are not toggled for free models)
//   5. vision + paid   -> requires is_active===true else 'admin_deactivated';
//      modes = daily if is_active_daily, practice if is_active_practice;
//      no modes -> excluded 'no_mode_flags'
//   6. text + free     -> auditor regardless of flags ('free_text_audit')
//   7. text + paid     -> auditor only if is_active===true
//      ('paid_text_audit'), else excluded 'text_only_inactive_paid'
//
// Tier (price class, used for rpm/rpd budgets and the D7 benchmark subset):
//   free -> 'free'; paid with promptPrice+completionPrice <= 1e-6 per token
//   -> 'cheap'; anything else (incl. unknown price on a paid slug) -> 'premium'.
//   Excluded players get tier null: they consume no budget.
//
// Ambiguity resolutions (documented for review):
//   * Budget action accepts 'ok' and 'proceed' as pass-through: 'proceed' is
//     the literal action word evaluateBudget() returns — the supervisor may
//     pass its verdict unmapped. Anything not skip_model/halt_fleet proceeds.
//   * catalogModel is trusted only when catalogModel.id === player.model_id;
//     a mismatch is treated exactly like an absent entry ('dead_slug').
//   * Flag values other than literal true (null/undefined) count as OFF —
//     the columns are NOT NULL in the DB so this only affects synthetic rows.
//   * The budget gate is evaluated before the flag/modality branches so a
//     fleet halt short-circuits to 'budget' rather than a flag reason.

import { normalizeEntry, type OpenRouterRawEntry } from "./openrouterCatalog";

export type PlayMode = "daily" | "practice" | "audit";
export type FleetTier = "free" | "cheap" | "premium";
export type FleetRole = "player" | "auditor" | "excluded";

/** Normalized catalog model used by D1 (see design: {id, isFree, isVision, ...}). */
export type CatalogModel = {
  /** Catalog slug (OpenRouter `id`). */
  id: string;
  /** D1 definition: promptPrice === 0 && completionPrice === 0. */
  isFree: boolean;
  /** input_modalities includes "image". */
  isVision: boolean;
  contextLength: number | null;
  maxCompletion: number | null;
  /** USD per token (OpenRouter pricing.prompt parsed to a number). */
  promptPrice: number | null;
  /** USD per token (OpenRouter pricing.completion parsed to a number). */
  completionPrice: number | null;
};

/** The ai_players row fields D1 reads (snake_case, matching the table). */
export type FleetPlayer = {
  id: string;
  /** Catalog slug — ai_players.model_id. */
  model_id: string;
  is_active: boolean | null | undefined;
  is_active_daily: boolean | null | undefined;
  is_active_practice: boolean | null | undefined;
  deleted_at: string | Date | null | undefined;
};

/** Runtime budget gate verdict (D1/D3): produced by evaluateBudget upstream. */
export type BudgetGate = {
  action: "ok" | "proceed" | "skip_model" | "halt_fleet";
};

export type EligibilityVerdict = {
  role: FleetRole;
  modes: PlayMode[];
  tier: FleetTier | null;
  reason: string;
};

/** Paid tier boundary: prompt + completion USD/token at or below this is 'cheap'. */
export const CHEAP_TIER_MAX_USD_PER_TOKEN = 1e-6;

function excluded(reason: string): EligibilityVerdict {
  return { role: "excluded", modes: [], tier: null, reason };
}

function tierOf(model: CatalogModel): FleetTier {
  if (model.isFree) return "free";
  if (model.promptPrice === null || model.completionPrice === null) {
    // A paid slug with unknown pricing is budgeted like a premium model.
    return "premium";
  }
  return model.promptPrice + model.completionPrice <= CHEAP_TIER_MAX_USD_PER_TOKEN
    ? "cheap"
    : "premium";
}

/**
 * Converts one OpenRouter GET /models entry into a CatalogModel.
 * Reuses normalizeEntry (single parsing source) — returns null for entries
 * without a usable id, same as the catalog snapshot pipeline.
 *
 * Note: isFree follows the D1 formula (prompt==0 && completion==0), NOT the
 * snapshot's `:free`-suffix shortcut — a ":free" slug with non-null non-zero
 * pricing is paid here on purpose.
 */
export function toCatalogModel(raw: OpenRouterRawEntry): CatalogModel | null {
  const n = normalizeEntry(raw);
  if (n === null) return null;
  return {
    id: n.model_id,
    isFree: n.price_prompt_usd === 0 && n.price_completion_usd === 0,
    isVision: n.is_vision,
    contextLength: n.context_length,
    maxCompletion: n.max_completion_tokens,
    promptPrice: n.price_prompt_usd,
    completionPrice: n.price_completion_usd,
  };
}

/** The openrouter_models columns the fleet runners select (snake_case row). */
export type CatalogModelRow = {
  model_id: string;
  is_free: boolean | null;
  is_vision: boolean | null;
  availability_status: string | null;
  context_length: number | null;
  /** numeric columns come back as string|number from pg. */
  price_prompt_usd: number | string | null;
  price_completion_usd: number | string | null;
};

function asPriceNumber(value: number | string | null): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Maps a persisted openrouter_models snapshot row to the D1 CatalogModel —
 * the supervisor and audit runner read the catalog from the DB snapshot, they
 * never fetch openrouter.ai. A row whose availability_status is anything but
 * 'available' is dead (delisted/no-endpoints/expiring) → null, exactly like an
 * absent row ('dead_slug' downstream).
 */
export function catalogModelFromRow(row: CatalogModelRow | null | undefined): CatalogModel | null {
  if (!row || row.availability_status !== "available") return null;
  const prompt = asPriceNumber(row.price_prompt_usd);
  const completion = asPriceNumber(row.price_completion_usd);
  return {
    id: row.model_id,
    // D1 formula (prompt==0 && completion==0) when both prices are numeric;
    // only when a price column is missing do we fall back to the snapshot's
    // :free-suffix flag.
    isFree:
      prompt !== null && completion !== null
        ? prompt === 0 && completion === 0
        : row.is_free === true,
    isVision: row.is_vision === true,
    contextLength: typeof row.context_length === "number" ? row.context_length : null,
    maxCompletion: null, // not needed by the runners' SELECT
    promptPrice: prompt,
    completionPrice: completion,
  };
}

export function classifyPlayer(
  player: FleetPlayer,
  catalogModel: CatalogModel | null,
  budget: BudgetGate
): EligibilityVerdict {
  // 1. Soft-deleted rows never run anything.
  if (player.deleted_at !== null && player.deleted_at !== undefined) {
    return excluded("deleted");
  }

  // 2. Slug must resolve in the OpenRouter catalog.
  if (catalogModel === null || catalogModel.id !== player.model_id) {
    return excluded("dead_slug");
  }

  // 3. Runtime budget gate ('ok'/'proceed' pass through).
  if (budget.action === "skip_model" || budget.action === "halt_fleet") {
    return excluded("budget");
  }

  const tier = tierOf(catalogModel);

  // 4. Free + vision plays daily AND practice regardless of the admin flags.
  if (catalogModel.isVision && catalogModel.isFree) {
    return {
      role: "player",
      modes: ["daily", "practice"],
      tier,
      reason: "free_vision",
    };
  }

  // 5. Paid + vision needs is_active plus at least one mode flag.
  if (catalogModel.isVision) {
    if (player.is_active !== true) return excluded("admin_deactivated");
    const modes: PlayMode[] = [];
    if (player.is_active_daily === true) modes.push("daily");
    if (player.is_active_practice === true) modes.push("practice");
    if (modes.length === 0) return excluded("no_mode_flags");
    return { role: "player", modes, tier, reason: "paid_vision" };
  }

  // 6/7. Text-only models are auditors (D8): free audits regardless of flags,
  // paid audits only while the player is active.
  if (catalogModel.isFree) {
    return { role: "auditor", modes: ["audit"], tier, reason: "free_text_audit" };
  }
  if (player.is_active === true) {
    return { role: "auditor", modes: ["audit"], tier, reason: "paid_text_audit" };
  }
  return excluded("text_only_inactive_paid");
}
