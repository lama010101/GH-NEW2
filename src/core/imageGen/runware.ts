// EDQ-BUILD-ADMINGEN-1122-815 — Runware image-inference adapter.
//
// Ported from D:\G-H-image\src\services\runwareService.ts (payload shape
// only): POST https://api.runware.ai/v1 with an array containing ONE
// imageInference task; synchronous result at data.data[0].imageURL plus
// cost. axios / proxy / browser deps stripped — plain fetch, Bearer auth.
//
// Abort contract: HTTP 401 / 402 / 403 throw RunwareHttpError with .status
// set — callers MUST treat these as fatal for the run (bad key / no
// balance / forbidden), never retry in a loop.
//
// Error hygiene (SECRET-SAFETY): only the HTTP status and a short provider
// message are ever surfaced — request headers, the API key, and raw
// response objects are never logged or returned.

export const RUNWARE_API_URL = "https://api.runware.ai/v1";
export const RUNWARE_TIMEOUT_MS = 45_000;

export class RunwareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunwareError";
  }
}

/** HTTP-level failure from the Runware API. .status is always set. */
export class RunwareHttpError extends RunwareError {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RunwareHttpError";
    this.status = status;
  }
}

/** Statuses that must abort the whole run immediately (no retry). */
export const RUNWARE_ABORT_STATUSES = new Set([401, 402, 403]);

export function isRunwareAbortStatus(status: number): boolean {
  return RUNWARE_ABORT_STATUSES.has(status);
}

export type RunwareGenerateInput = {
  /** Runware AIR identifier, e.g. "bfl:2@1" / "runware:100@1". */
  model: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps?: number;
  cfgScale?: number;
  apiKey: string;
};

export type RunwareGenerateResult = {
  imageUrl: string;
  cost: number | null;
  durationMs: number;
};

type BflModelConfig = {
  providerSettings: Record<string, unknown>;
  supportsSteps: boolean;
  supportsCfgScale: boolean;
};

// Ported verbatim from G-H-image BFL_MODEL_CONFIGS (providerSettings only —
// the seedImage/maskImage/outpaint/reference workflows are out of scope).
const BFL_MODEL_CONFIGS: Record<string, BflModelConfig> = {
  "bfl:2@1": {
    providerSettings: { promptUpsampling: false, safetyTolerance: 2 },
    supportsSteps: false,
    supportsCfgScale: false,
  },
  "bfl:2@2": {
    providerSettings: { promptUpsampling: true, safetyTolerance: 2, raw: true },
    supportsSteps: false,
    supportsCfgScale: false,
  },
  "bfl:3@1": {
    providerSettings: { promptUpsampling: false, safetyTolerance: 2 },
    supportsSteps: false,
    supportsCfgScale: false,
  },
  "bfl:4@1": {
    providerSettings: { safetyTolerance: 6 },
    supportsSteps: false,
    supportsCfgScale: false,
  },
};

function sanitizeDimension(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 64) {
    return Math.round(value);
  }
  return fallback;
}

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
}

function shortErrorMessage(body: unknown, status: number): string {
  const b = body as
    | { errors?: { message?: unknown }[]; message?: unknown }
    | null
    | undefined;
  const first = Array.isArray(b?.errors) ? b?.errors?.[0]?.message : undefined;
  const msg =
    typeof first === "string" && first.length > 0
      ? first
      : typeof b?.message === "string" && b.message.length > 0
        ? b.message
        : `HTTP ${status}`;
  return msg.slice(0, 200);
}

/**
 * Generate one image via Runware. Returns the provider-hosted imageURL —
 * callers MUST download + re-host to Supabase Storage before persisting.
 */
export async function generateImageRunware(
  input: RunwareGenerateInput
): Promise<RunwareGenerateResult> {
  if (!input.apiKey) {
    throw new RunwareError("RUNWARE_API_KEY is not configured");
  }
  if (!input.model) {
    throw new RunwareError("model (AIR id) is required");
  }
  if (!input.prompt || input.prompt.trim().length === 0) {
    throw new RunwareError("prompt is required");
  }

  const modelKey = input.model.toLowerCase();
  const isBflModel = modelKey.startsWith("bfl");
  const bflConfig = isBflModel ? BFL_MODEL_CONFIGS[modelKey] : undefined;

  if (isBflModel && !bflConfig) {
    throw new RunwareError(`Unsupported BFL model configuration: ${input.model}`);
  }

  const width = sanitizeDimension(input.width, 1024);
  const height = sanitizeDimension(input.height, 1024);
  const supportsSteps = !isBflModel || bflConfig?.supportsSteps === true;
  const supportsCfgScale = !isBflModel || bflConfig?.supportsCfgScale === true;

  const steps = supportsSteps
    ? sanitizePositiveNumber(input.steps, 20)
    : undefined;
  const cfgScale = supportsCfgScale
    ? sanitizePositiveNumber(input.cfgScale, 4)
    : undefined;
  const negativePrompt = input.negativePrompt?.trim();

  const task: Record<string, unknown> = {
    taskType: "imageInference",
    taskUUID: crypto.randomUUID(),
    positivePrompt: input.prompt,
    outputType: "URL",
    model: input.model,
    numberResults: 1,
    includeCost: true,
    width,
    height,
    outputFormat: "JPG",
  };

  if (steps !== undefined) task.steps = steps;
  if (negativePrompt) task.negative_prompt = negativePrompt;
  if (cfgScale !== undefined) task.CFGScale = cfgScale;
  if (isBflModel && bflConfig) {
    task.providerSettings = { bfl: bflConfig.providerSettings };
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(RUNWARE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify([task]),
      signal: AbortSignal.timeout(RUNWARE_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    throw new RunwareError(
      name === "TimeoutError" || name === "AbortError"
        ? "Runware request timed out"
        : "Runware request failed"
    );
  }

  const durationMs = Date.now() - started;

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON error body — status alone is enough
    }
    throw new RunwareHttpError(res.status, shortErrorMessage(body, res.status));
  }

  let payload: {
    data?: { imageURL?: unknown; cost?: unknown }[];
    cost?: unknown;
  };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    throw new RunwareError("Runware response was not JSON");
  }

  const imageURL = payload?.data?.[0]?.imageURL;
  if (typeof imageURL !== "string" || imageURL.length === 0) {
    throw new RunwareError("Runware API response missing imageURL");
  }

  const rawCost =
    typeof payload.cost === "number"
      ? payload.cost
      : typeof payload.data?.[0]?.cost === "number"
        ? (payload.data[0].cost as number)
        : null;

  return {
    imageUrl: imageURL,
    cost: rawCost,
    durationMs,
  };
}
