import { describe, it, expect } from "vitest";
import { classifyFailure } from "./aiFailureCauses";

// AIP-BUILD-FLEETHALT-1102-043 — table-driven proof that the single TS
// classifier matches the admin_fleet_model_stats precedence and that 403/400
// never classify as auth. Real error strings as written by the v3 worker /
// observed on prod.

describe("classifyFailure (single source, mirrors SQL view precedence)", () => {
  const cases: Array<{
    name: string;
    error: string | null | undefined;
    expected: ReturnType<typeof classifyFailure>;
  }> = [
    {
      name: "null => null (OK play)",
      error: null,
      expected: null,
    },
    {
      name: "undefined => null",
      error: undefined,
      expected: null,
    },
    {
      name: "empty string => null",
      error: "",
      expected: null,
    },
    {
      name: "401 inside worker error => auth",
      error:
        'OpenRouter turn 1 failed: OpenRouter request failed: 401 Unauthorized {"error":{"message":"No cookie auth credentials found"}}',
      expected: "auth",
    },
    {
      name: "401 wins over a 4xx-looking suffix that is not 404/429",
      error: "OpenRouter request failed: 401 Unauthorized (upstream 400)",
      expected: "auth",
    },
    {
      name: "404 => gone",
      error:
        "OpenRouter turn 1 failed: OpenRouter request failed: 404 Not Found {\"error\":{\"message\":\"Model not found\"}}",
      expected: "gone",
    },
    {
      name: "429 => rate_limit",
      error:
        "OpenRouter turn 2 failed: OpenRouter request failed: 429 Too Many Requests {\"error\":{\"message\":\"Rate limit exceeded\"}}",
      expected: "rate_limit",
    },
    {
      name: "RATE_LIMIT_DEFERRED marker => rate_limit_deferred (AIP-BUILD-FLEETFINAL-1103-060)",
      error:
        "RATE_LIMIT_DEFERRED retry_after_ms=30000 Parasail/upstream_provider_shared_pool",
      expected: "rate_limit_deferred",
    },
    {
      name: "marker wins over an embedded 429 (checked BEFORE the generic 429 rule)",
      error:
        "RATE_LIMIT_DEFERRED retry_after_ms=0 after OpenRouter request failed: 429 Too Many Requests",
      expected: "rate_limit_deferred",
    },
    {
      name: "starts with 'Failed to parse' => bad_output",
      error:
        "Failed to parse AI turn 1 response: Unexpected end of JSON input",
      expected: "bad_output",
    },
    {
      name: "contains 'missing finalGuess' (case-insens) => bad_output",
      error: "Final guess response missing finalGuess",
      expected: "bad_output",
    },
    {
      name: "uppercase MISSING FINALGUESS => bad_output",
      error: "final guess response MISSING FINALGUESS",
      expected: "bad_output",
    },
    {
      name: "400 Bad Request => other",
      error:
        "OpenRouter turn 1 failed: OpenRouter request failed: 400 Bad Request {\"error\":{\"message\":\"messages: invalid role\"}}",
      expected: "other",
    },
    {
      name: "403 Forbidden => other (NOT auth — per-model moderation/region block must not halt the fleet)",
      error:
        "OpenRouter turn 1 failed: OpenRouter request failed: 403 Forbidden {\"error\":{\"message\":\"model requires moderation\"}}",
      expected: "other",
    },
    {
      name: "500 => other",
      error:
        "OpenRouter request failed: 500 Internal Server Error",
      expected: "other",
    },
    {
      name: "network failure => other",
      error: "fetch failed: connect ECONNREFUSED 1.2.3.4:443",
      expected: "other",
    },
    {
      name: "TRUNCATED_LENGTH => other",
      error:
        "OpenRouter turn 1 failed: TRUNCATED_LENGTH: finish_reason=length content_empty=false at max_tokens=8192 (retry exhausted)",
      expected: "other",
    },
    {
      name: "TIMEOUT_DEADLINE => other",
      error:
        "OpenRouter turn 1 failed: TIMEOUT_DEADLINE: fetch aborted after 90000ms (budget 90000ms)",
      expected: "other",
    },
    {
      name: "PROVIDER_ERROR without status digits => other",
      error:
        "OpenRouter turn 1 failed: PROVIDER_ERROR: {\"code\":502,\"message\":\"upstream error\"}",
      expected: "other",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(classifyFailure(c.error)).toBe(c.expected);
    });
  }
});
