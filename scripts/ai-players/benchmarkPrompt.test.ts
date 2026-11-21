import { describe, expect, it } from "vitest";
import {
  BENCH_MAX_CLUES,
  BENCH_PROMPT_VERSION,
  MIN_REASONING_CHARS,
  buildBenchCritiqueMessages,
  buildBenchTurn1Messages,
  extractBenchReasoning,
  gateBenchTurn1Response,
  parseBenchPostReveal,
  parseBenchTurn1Response,
} from "./benchmarkPrompt";

// AIP-BUILD-REASONINGGATE-1115-306 — pure-function proof for bench-v1.
// No network, no DB, no LLM: every case feeds literal text/raw payloads.

const LONG_REASONING =
  "The image shows a crowd scene with period dress and a banner; the architecture and vehicles place it in the 1960s, and the location clues point to Washington DC.";

function validTurn1(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    finalGuess: { latitude: 38.9, longitude: -77.0, year: 1969, confidence: 0.7 },
    reasoning: LONG_REASONING,
    preReveal: {
      image_description: "A parade crowd in period dress",
      detected_clues: ["banner", "architecture", "vehicles"],
      year_reasoning: "vehicles and dress suggest 1960s",
      location_reasoning: "neoclassical buildings suggest DC",
    },
    ...overrides,
  };
}

function turn1Text(payload: unknown): string {
  return JSON.stringify(payload);
}

describe("bench-v1 turn-1 prompt builder", () => {
  it("emits the structured schema and never offers hints", () => {
    const messages = buildBenchTurn1Messages("https://img/x.jpg", "auto") as Array<{
      role: string;
      content: unknown;
    }>;
    expect(messages).toHaveLength(2);
    const system = String(messages[0].content);
    expect(system).toContain('"finalGuess"');
    expect(system).toContain('"preReveal"');
    expect(system).toContain('"detected_clues"');
    expect(system).toContain('"reasoning"');
    expect(system).toContain(`at least ${MIN_REASONING_CHARS} characters`);
    expect(system).not.toContain("hintRequests");
    expect(system).not.toContain("Available hints");
    const user = messages[1].content as Array<{ type: string; text?: string }>;
    expect(user[0]).toEqual({
      type: "image_url",
      image_url: { url: "https://img/x.jpg", detail: "auto" },
    });
    expect(user[1].text).toBe("What is your guess?");
  });
});

describe("parseBenchTurn1Response", () => {
  it("parses a valid bench-v1 turn-1 reply", () => {
    const r = parseBenchTurn1Response(turn1Text(validTurn1()));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.finalGuess).toEqual({ latitude: 38.9, longitude: -77.0, year: 1969, confidence: 0.7 });
    expect(r.reasoning).toBe(LONG_REASONING);
    expect(r.preReveal.detected_clues).toEqual(["banner", "architecture", "vehicles"]);
  });

  it("accepts markdown-fenced JSON", () => {
    const r = parseBenchTurn1Response("```json\n" + turn1Text(validTurn1()) + "\n```");
    expect(r.kind).toBe("ok");
  });

  it("maps each missing/invalid field to missing_fields", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ finalGuess: { latitude: 95, longitude: -77, year: 1969, confidence: 0.7 } }, "finalGuess.latitude"],
      [{ finalGuess: { latitude: 38.9, longitude: -200, year: 1969, confidence: 0.7 } }, "finalGuess.longitude"],
      [{ finalGuess: { latitude: 38.9, longitude: -77, year: 1969.5, confidence: 0.7 } }, "finalGuess.year"],
      [{ finalGuess: { latitude: 38.9, longitude: -77, year: 1969, confidence: 1.4 } }, "finalGuess.confidence"],
      [{ finalGuess: { latitude: 38.9, longitude: -77, year: 1969 } }, "finalGuess.confidence"],
      [{ preReveal: { image_description: "", detected_clues: ["a"], year_reasoning: "y", location_reasoning: "l" } }, "preReveal.image_description"],
      [{ preReveal: { image_description: "d", detected_clues: [], year_reasoning: "y", location_reasoning: "l" } }, "preReveal.detected_clues"],
      [{ preReveal: { image_description: "d", detected_clues: ["a", 5], year_reasoning: "y", location_reasoning: "l" } }, "preReveal.detected_clues"],
      [{ preReveal: { image_description: "d", detected_clues: ["a"], year_reasoning: "", location_reasoning: "l" } }, "preReveal.year_reasoning"],
      [{ preReveal: { image_description: "d", detected_clues: ["a"], year_reasoning: "y" } }, "preReveal.location_reasoning"],
    ];
    for (const [override, field] of cases) {
      const r = parseBenchTurn1Response(turn1Text(validTurn1(override)));
      expect(r.kind).toBe("gate");
      if (r.kind !== "gate") continue;
      expect(r.errorClass).toBe("missing_fields");
      expect(r.error.startsWith("MISSING_FIELDS: ")).toBe(true);
      expect(r.error).toContain(field);
    }
  });

  it("missing finalGuess / preReveal objects report the parent field", () => {
    const r1 = parseBenchTurn1Response(turn1Text(validTurn1({ finalGuess: null })));
    expect(r1.kind === "gate" && r1.error).toContain("finalGuess");
    const r2 = parseBenchTurn1Response(turn1Text(validTurn1({ preReveal: "nope" })));
    expect(r2.kind === "gate" && r2.error).toContain("preReveal");
  });

  it("a hintRequests reply is a missing_fields failure", () => {
    const r = parseBenchTurn1Response(turn1Text({ hintRequests: [{ tier: 1, type: "when" }] }));
    expect(r.kind).toBe("gate");
    if (r.kind !== "gate") return;
    expect(r.errorClass).toBe("missing_fields");
    expect(r.error.startsWith("MISSING_FIELDS: ")).toBe(true);
  });

  it("unparseable / non-object replies are missing_fields", () => {
    for (const text of ["not json at all", "[1,2,3]", "42"]) {
      const r = parseBenchTurn1Response(text);
      expect(r.kind).toBe("gate");
      if (r.kind === "gate") {
        expect(r.errorClass).toBe("missing_fields");
        expect(r.error.startsWith("MISSING_FIELDS: ")).toBe(true);
      }
    }
  });

  it("short or missing reasoning is no_reasoning", () => {
    for (const reasoning of ["short", "x".repeat(MIN_REASONING_CHARS - 1), "", 42, undefined]) {
      const payload: Record<string, unknown> = validTurn1();
      if (reasoning === undefined) delete payload.reasoning;
      else payload.reasoning = reasoning;
      const r = parseBenchTurn1Response(turn1Text(payload));
      expect(r.kind).toBe("gate");
      if (r.kind !== "gate") continue;
      expect(r.errorClass).toBe("no_reasoning");
      expect(r.error.startsWith("NO_REASONING: ")).toBe(true);
    }
    // Exactly MIN_REASONING_CHARS trimmed chars passes.
    const ok = parseBenchTurn1Response(
      turn1Text(validTurn1({ reasoning: "  " + "y".repeat(MIN_REASONING_CHARS) + "  " }))
    );
    expect(ok.kind).toBe("ok");
  });

  it("structural missing_fields takes precedence over no_reasoning", () => {
    const r = parseBenchTurn1Response(
      turn1Text({ finalGuess: null, reasoning: "tiny", preReveal: null })
    );
    expect(r.kind).toBe("gate");
    if (r.kind === "gate") expect(r.errorClass).toBe("missing_fields");
  });

  it("detected_clues longer than 10 is truncated to 10, strings to 200 chars", () => {
    const clues = Array.from({ length: 14 }, (_, i) => `clue-${i}-` + "z".repeat(210));
    const r = parseBenchTurn1Response(
      turn1Text(
        validTurn1({
          preReveal: {
            image_description: "d",
            detected_clues: clues,
            year_reasoning: "y",
            location_reasoning: "l",
          },
        })
      )
    );
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.preReveal.detected_clues).toHaveLength(BENCH_MAX_CLUES);
    for (const c of r.preReveal.detected_clues) {
      expect(c.length).toBeLessThanOrEqual(200);
    }
    expect(r.preReveal.detected_clues[0].startsWith("clue-0-")).toBe(true);
  });
});

describe("extractBenchReasoning", () => {
  const wrap = (message: Record<string, unknown>) => ({ choices: [{ message }] });

  it("keeps message.reasoning when present", () => {
    const r = extractBenchReasoning(wrap({ reasoning: "chain of thought" }));
    expect(r).toEqual({ reasoning: "chain of thought", reasoningAvailable: true });
  });

  it("falls back to reasoning_details text+summary when reasoning is empty", () => {
    const r = extractBenchReasoning(
      wrap({
        reasoning: "",
        reasoning_details: [
          { type: "reasoning.text", text: "first thought", summary: "sum one" },
          { type: "reasoning.summary", summary: "sum two" },
          { type: "reasoning.encrypted", data: "opaque" },
        ],
      })
    );
    expect(r.reasoningAvailable).toBe(true);
    expect(r.reasoning).toContain("first thought");
    expect(r.reasoning).toContain("sum one");
    expect(r.reasoning).toContain("sum two");
    expect(r.reasoning).not.toContain("opaque");
  });

  it("returns null when no readable reasoning exists", () => {
    expect(extractBenchReasoning(wrap({}))).toEqual({ reasoning: null, reasoningAvailable: false });
    expect(extractBenchReasoning(wrap({ reasoning_details: [] }))).toEqual({
      reasoning: null,
      reasoningAvailable: false,
    });
    expect(extractBenchReasoning(null)).toEqual({ reasoning: null, reasoningAvailable: false });
  });
});

describe("gateBenchTurn1Response (hidden reasoning)", () => {
  it("reasoning_tokens>0 with no readable reasoning text -> no_reasoning hidden", () => {
    const r = gateBenchTurn1Response(turn1Text(validTurn1()), { text: null, tokens: 512 });
    expect(r.kind).toBe("gate");
    if (r.kind !== "gate") return;
    expect(r.errorClass).toBe("no_reasoning");
    expect(r.error).toBe("NO_REASONING: hidden reasoning (reasoning_tokens=512)");
  });

  it("reasoning_tokens>0 with readable text passes; tokens=0/null pass", () => {
    const content = turn1Text(validTurn1());
    expect(gateBenchTurn1Response(content, { text: "trace", tokens: 512 }).kind).toBe("ok");
    expect(gateBenchTurn1Response(content, { text: null, tokens: 0 }).kind).toBe("ok");
    expect(gateBenchTurn1Response(content, { text: null, tokens: null }).kind).toBe("ok");
  });
});

describe("gate error strings vs reliability view patterns", () => {
  // admin_fleet_model_stats / admin_fleet_truth_views classify parse failures
  // with: error LIKE 'Failed to parse%' OR error ILIKE '%missing finalguess%'.
  // Gate errors MUST NOT match either pattern.
  const samples = [
    parseBenchTurn1Response("garbage").kind === "gate"
      ? (parseBenchTurn1Response("garbage") as { error: string }).error
      : "",
    gateBenchTurn1Response(turn1Text(validTurn1({ reasoning: "tiny" })), {
      text: null,
      tokens: null,
    }).kind === "gate"
      ? (gateBenchTurn1Response(turn1Text(validTurn1({ reasoning: "tiny" })), {
          text: null,
          tokens: null,
        }) as { error: string }).error
      : "",
    gateBenchTurn1Response(turn1Text(validTurn1()), { text: null, tokens: 9 }).kind === "gate"
      ? (gateBenchTurn1Response(turn1Text(validTurn1()), { text: null, tokens: 9 }) as {
          error: string;
        }).error
      : "",
  ];

  it("produces NO_REASONING and MISSING_FIELDS texts that dodge both patterns", () => {
    expect(samples[0].startsWith("MISSING_FIELDS: ")).toBe(true);
    expect(samples[1].startsWith("NO_REASONING: ")).toBe(true);
    expect(samples[2]).toBe("NO_REASONING: hidden reasoning (reasoning_tokens=9)");
    for (const s of samples) {
      expect(s.startsWith("Failed to parse")).toBe(false);
      expect(s.toLowerCase().includes("missing finalguess")).toBe(false);
    }
  });
});

describe("bench-v1 review prompt builder", () => {
  const trueAnswer = { lat: 38.9, lng: -77.0, year: 1969, locationName: "Washington DC" };

  it("keeps all legacy keys and adds REQUIRED postReveal with the depiction disclaimer", () => {
    const messages = buildBenchCritiqueMessages(
      "https://img/x.jpg",
      trueAnswer,
      "Moon landing parade",
      "Washington DC",
      "A test description",
      [{ id: "hint-1", tier: 1, type: "when", content: "spring" }],
      "auto"
    ) as Array<{ role: string; content: unknown }>;
    const system = String(messages[0].content);
    for (const key of [
      "imageQualityScore",
      "imageQualityNotes",
      "difficultyScore",
      "difficultyNotes",
      "authenticityScore",
      "authenticityNotes",
      "hintReviews",
      "postReveal",
      "difficulty_year",
      "difficulty_location",
      "hard_factors",
      "event_plausibility",
      "ai_image_depiction_score",
      "fame_score",
      "difficulty_notes",
    ]) {
      expect(system).toContain(key);
    }
    expect(system).toContain("UNRELATED to the player-facing image rating");
    expect(system).toContain("how well the image depicts the event");
    const user = messages[1].content as Array<{ text?: string }>;
    const userText = user.map((c) => c.text ?? "").join("\n");
    expect(userText).toContain("postReveal");
    expect(userText).toContain('id="hint-1"');
  });
});

describe("parseBenchPostReveal", () => {
  const validPost = {
    difficulty_year: 7,
    difficulty_location: 6,
    hard_factors: ["generic crowd", "no landmark"],
    event_plausibility: 8,
    ai_image_depiction_score: 85,
    fame_score: 90,
    difficulty_notes: "crowd shots are ambiguous",
  };
  const wrap = (post: unknown) =>
    JSON.stringify({
      imageQualityScore: 8,
      imageQualityNotes: "n",
      difficultyScore: 5,
      difficultyNotes: "n",
      authenticityScore: 9,
      authenticityNotes: "n",
      postReveal: post,
    });

  it("parses a valid postReveal", () => {
    const r = parseBenchPostReveal(wrap(validPost));
    expect(r.error).toBeNull();
    expect(r.postReveal).toEqual(validPost);
  });

  it("enforces ranges: depiction/fame 0-100, difficulty/plausibility 1-10", () => {
    const bad: Array<[string, unknown]> = [
      ["ai_image_depiction_score", 101],
      ["ai_image_depiction_score", -1],
      ["ai_image_depiction_score", 50.5],
      ["fame_score", 101],
      ["fame_score", -1],
      ["difficulty_year", 0],
      ["difficulty_year", 11],
      ["difficulty_year", 3.5],
      ["difficulty_location", 0],
      ["difficulty_location", 11],
      ["event_plausibility", 0],
      ["event_plausibility", 11],
    ];
    for (const [key, value] of bad) {
      const r = parseBenchPostReveal(wrap({ ...validPost, [key]: value }));
      expect(r.postReveal).toBeNull();
      expect(r.error).not.toBeNull();
    }
    // Boundary values pass.
    for (const [key, value] of [
      ["ai_image_depiction_score", 0],
      ["ai_image_depiction_score", 100],
      ["fame_score", 0],
      ["fame_score", 100],
      ["difficulty_year", 1],
      ["difficulty_year", 10],
      ["difficulty_location", 1],
      ["difficulty_location", 10],
      ["event_plausibility", 1],
      ["event_plausibility", 10],
    ] as Array<[string, number]>) {
      const r = parseBenchPostReveal(wrap({ ...validPost, [key]: value }));
      expect(r.error).toBeNull();
    }
  });

  it("enforces hard_factors: max 8 items, each <=120 chars, strings only", () => {
    expect(parseBenchPostReveal(wrap({ ...validPost, hard_factors: Array(9).fill("x") })).postReveal).toBeNull();
    expect(
      parseBenchPostReveal(wrap({ ...validPost, hard_factors: ["y".repeat(121)] })).postReveal
    ).toBeNull();
    expect(parseBenchPostReveal(wrap({ ...validPost, hard_factors: ["ok", 3] })).postReveal).toBeNull();
    expect(parseBenchPostReveal(wrap({ ...validPost, hard_factors: "none" })).postReveal).toBeNull();
    const ok = parseBenchPostReveal(wrap({ ...validPost, hard_factors: [] }));
    expect(ok.error).toBeNull();
    expect(ok.postReveal?.hard_factors).toEqual([]);
  });

  it("missing postReveal / bad notes / non-object reply fail", () => {
    expect(parseBenchPostReveal(JSON.stringify({ imageQualityScore: 8 })).postReveal).toBeNull();
    expect(parseBenchPostReveal(wrap({ ...validPost, difficulty_notes: 5 })).postReveal).toBeNull();
    expect(parseBenchPostReveal("garbage").postReveal).toBeNull();
    expect(parseBenchPostReveal("[1]").postReveal).toBeNull();
  });
});

describe("bench constants", () => {
  it("exports the spec constants", () => {
    expect(BENCH_PROMPT_VERSION).toBe("bench-v1");
    expect(MIN_REASONING_CHARS).toBe(40);
  });
});
