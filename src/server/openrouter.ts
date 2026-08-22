// Shared OpenRouter API client for the admin dashboard.
// Task: DASH-ORCLIENT-004
//
// This module is dashboard-only. The ai-players scripts keep their own inline
// callOpenRouter implementation; this is a parallel shared client for the
// admin UI's "Add Model" catalog picker and "Test model" action.

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterModelCatalogEntry = {
  id: string;
  name: string;
  pricing: {
    prompt: string | null;
    completion: string | null;
  } | null;
};

export type OpenRouterChatUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
};

export type OpenRouterChatResult = {
  ok: boolean;
  content: string;
  usage: OpenRouterChatUsage;
  error: string | null;
  durationMs: number;
};

function toInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractUsage(raw: unknown): OpenRouterChatUsage {
  const empty: OpenRouterChatUsage = {
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    cost: null,
  };
  if (typeof raw !== "object" || raw === null) return empty;
  const maybe = raw as Record<string, unknown>;
  const usage = maybe.usage;
  if (!usage || typeof usage !== "object") return empty;
  const u = usage as Record<string, unknown>;
  return {
    prompt_tokens: toInt(u.prompt_tokens),
    completion_tokens: toInt(u.completion_tokens),
    total_tokens: toInt(u.total_tokens),
    cost: toNumber(u.cost),
  };
}

function extractAssistantContent(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) return "";
  const maybe = raw as Record<string, unknown>;
  const choices = maybe.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0] as Record<string, unknown>;
  const message = first.message;
  if (!message || typeof message !== "object") return "";
  const msg = message as Record<string, unknown>;
  if (typeof msg.content === "string") return msg.content;
  return "";
}

/**
 * Fetch the OpenRouter model catalog (GET /api/v1/models).
 * Returns a compact list of {id, name, pricing} for the Add-Model picker.
 */
export async function fetchOpenRouterModels(): Promise<
  OpenRouterModelCatalogEntry[]
> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      "HTTP-Referer": "https://guess-history.com",
      "X-Title": "Guess-History AI Dashboard",
    },
  });
  if (!response.ok) {
    throw new Error(
      `OpenRouter catalog fetch failed: ${response.status} ${response.statusText}`
    );
  }
  const body = (await response.json()) as { data?: unknown };
  const data = body.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((entry): OpenRouterModelCatalogEntry => {
      const e = entry as Record<string, unknown>;
      const pricing = e.pricing;
      return {
        id: typeof e.id === "string" ? e.id : "",
        name: typeof e.name === "string" ? e.name : "",
        pricing:
          pricing && typeof pricing === "object"
            ? {
                prompt:
                  typeof (pricing as Record<string, unknown>).prompt === "string"
                    ? ((pricing as Record<string, unknown>).prompt as string)
                    : null,
                completion:
                  typeof (pricing as Record<string, unknown>).completion ===
                  "string"
                    ? ((pricing as Record<string, unknown>).completion as string)
                    : null,
              }
            : null,
      };
    })
    .filter((m) => m.id.length > 0);
}

/**
 * Call the OpenRouter chat completions endpoint (POST /api/v1/chat/completions).
 * Generalized from scripts/ai-players/generate-answers-v3.ts callOpenRouter.
 * Used by the "Test model" admin action with a small canned prompt.
 */
export async function callOpenRouterChat(params: {
  apiKey: string;
  model: string;
  messages: unknown[];
  temperature?: number;
  maxTokens?: number;
}): Promise<OpenRouterChatResult> {
  const apiKey = params.apiKey;
  const requestBody = {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens ?? 1024,
  };

  const start = Date.now();
  let response: Response;
  try {
    response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://guess-history.com",
        "X-Title": "Guess-History AI Dashboard",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkErr) {
    const durationMs = Date.now() - start;
    const errorMsg = `fetch failed: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`;
    return {
      ok: false,
      content: "",
      usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null, cost: null },
      error: errorMsg,
      durationMs,
    };
  }

  let rawResponse: unknown;
  let responseText = "";
  try {
    rawResponse = await response.json();
    responseText = JSON.stringify(rawResponse);
  } catch {
    responseText = await response.text();
    rawResponse = { rawText: responseText };
  }
  const durationMs = Date.now() - start;

  if (!response.ok) {
    const errorMsg = `OpenRouter request failed: ${response.status} ${response.statusText} ${responseText}`;
    return {
      ok: false,
      content: "",
      usage: extractUsage(rawResponse),
      error: errorMsg,
      durationMs,
    };
  }

  return {
    ok: true,
    content: extractAssistantContent(rawResponse),
    usage: extractUsage(rawResponse),
    error: null,
    durationMs,
  };
}
