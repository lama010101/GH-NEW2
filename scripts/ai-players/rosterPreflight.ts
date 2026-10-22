// OpenRouter roster preflight — read-only capability probe before the Daily
// autoplay run spawns workers. Public endpoints only: no Authorization header,
// no env vars, no DB access. Fail-open: a probe outage must never kill the run.
export type PreflightPlayer = {
  id: string;
  name: string;
  provider: string;
  model_id: string;
};

export type PreflightResult<T extends PreflightPlayer = PreflightPlayer> = {
  keep: T[];
  skipped: { player: T; reason: string }[];
  warnings: string[];
};

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_TIMEOUT_MS = 10000;

export async function preflightRoster<T extends PreflightPlayer>(
  players: T[],
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<PreflightResult<T>> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const warnings: string[] = [];

  // 1. Model catalog — map model id -> architecture.input_modalities.
  //    Failure here degrades to "no catalog" (fail-open), not a roster wipe.
  let catalog: Map<string, string[]> | null = null;
  try {
    const res = await fetchImpl(MODELS_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      warnings.push(`models catalog returned HTTP ${res.status}; continuing without catalog`);
    } else {
      const body: unknown = await res.json();
      const list =
        typeof body === "object" && body !== null
          ? (body as { data?: unknown }).data
          : undefined;
      if (Array.isArray(list)) {
        catalog = new Map();
        for (const entry of list) {
          if (typeof entry !== "object" || entry === null) continue;
          const id = (entry as { id?: unknown }).id;
          const modalities = (entry as { architecture?: { input_modalities?: unknown } })
            .architecture?.input_modalities;
          if (typeof id !== "string") continue;
          if (!Array.isArray(modalities)) continue;
          catalog.set(
            id,
            modalities.filter((m): m is string => typeof m === "string")
          );
        }
      } else {
        warnings.push("models catalog response was not a data array; continuing without catalog");
      }
    }
  } catch (err) {
    warnings.push(
      `models catalog fetch failed (${err instanceof Error ? err.message : String(err)}); continuing without catalog`
    );
  }

  // 2. Per-player endpoints probe (openrouter provider only).
  const keep: T[] = [];
  const skipped: { player: T; reason: string }[] = [];

  for (const player of players) {
    if (player.provider !== "openrouter") {
      warnings.push(`${player.name} (${player.model_id}): provider "${player.provider}" not probed`);
      keep.push(player);
      continue;
    }

    try {
      const res = await fetchImpl(`${MODELS_URL}/${player.model_id}/endpoints`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) {
        skipped.push({ player, reason: "model not found" });
        continue;
      }
      if (!res.ok) {
        warnings.push(
          `${player.name} (${player.model_id}): endpoints probe returned HTTP ${res.status}; kept (fail-open)`
        );
        keep.push(player);
        continue;
      }
      const body: unknown = await res.json();
      const endpoints =
        typeof body === "object" && body !== null
          ? (body as { data?: { endpoints?: unknown } }).data?.endpoints
          : undefined;
      if (!Array.isArray(endpoints)) {
        warnings.push(
          `${player.name} (${player.model_id}): endpoints response unparseable; kept (fail-open)`
        );
        keep.push(player);
        continue;
      }
      if (endpoints.length === 0) {
        skipped.push({ player, reason: "no endpoints" });
        continue;
      }
    } catch (err) {
      warnings.push(
        `${player.name} (${player.model_id}): endpoints probe failed (${err instanceof Error ? err.message : String(err)}); kept (fail-open)`
      );
      keep.push(player);
      continue;
    }

    // Endpoints non-empty. Apply catalog capability gate when available.
    if (catalog) {
      const modalities = catalog.get(player.model_id);
      if (modalities !== undefined) {
        if (!modalities.includes("image")) {
          skipped.push({ player, reason: "no image input" });
          continue;
        }
      } else {
        warnings.push(
          `${player.name} (${player.model_id}): input capability unknown (absent from models catalog or no input_modalities listed) but has live endpoints; kept`
        );
      }
    }
    keep.push(player);
  }

  return { keep, skipped, warnings };
}
