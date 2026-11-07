import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  parseHintReviews,
  aggregateHintTrust,
  HINT_FLAG_INCORRECT_THRESHOLD,
  type HintReviewRow,
  type KnownHint,
} from "./aiHintReview";

// AIP-BUILD-FLEETFINAL-1103-060 — D5 hint-review parsing + trust proof.

const HINTS: KnownHint[] = [
  { id: "h-1", type: "when", content: "The event happened during a World Cup year." },
  { id: "h-2", type: "where", content: "This took place in the Southern Hemisphere." },
  { id: "h-3", type: "what", content: "A crowd of over 100,000 attended." },
];

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const VALID_JSON = JSON.stringify({
  imageQualityScore: 8,
  imageQualityNotes: "clear",
  difficultyScore: 5,
  difficultyNotes: "moderate",
  authenticityScore: 9,
  authenticityNotes: "genuine",
  hintReviews: [
    { hintId: "h-1", verdict: "correct", confidence: 0.9, explanation: "right year", suggestedCorrection: null },
    { hintId: "h-2", verdict: "incorrect", confidence: 0.8, explanation: "it was Northern", suggestedCorrection: "Northern Hemisphere" },
    { hintId: "h-3", verdict: "unverifiable", confidence: 0.3, explanation: "cannot tell" },
  ],
});

describe("parseHintReviews", () => {
  it("parses a well-formed review response into validated rows", () => {
    const rows = parseHintReviews(VALID_JSON, HINTS);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      hintId: "h-1",
      hint_kind: "when",
      hint_text_hash: sha(HINTS[0].content),
      verdict: "correct",
      confidence: 0.9,
      explanation: "right year",
      suggestedCorrection: null,
    });
    expect(rows[1].hint_kind).toBe("where");
    expect(rows[1].verdict).toBe("incorrect");
    expect(rows[1].suggestedCorrection).toBe("Northern Hemisphere");
    expect(rows[2].verdict).toBe("unverifiable");
    expect(rows[2].suggestedCorrection).toBeNull();
  });

  it("tolerates ```json fences and surrounding prose", () => {
    const text = `Here is my review:\n\`\`\`json\n${VALID_JSON}\n\`\`\`\nHope that helps.`;
    const rows = parseHintReviews(text, HINTS);
    expect(rows).toHaveLength(3);
  });

  it("extracts the hintReviews array out of a prose-wrapped object", () => {
    const inner = JSON.stringify({ hintReviews: VALID_JSON ? JSON.parse(VALID_JSON).hintReviews : [] });
    const text = `Preamble {not json} ${inner} trailing words`;
    const rows = parseHintReviews(text, HINTS);
    expect(rows).toHaveLength(3);
  });

  it("accepts a bare array as last-resort input", () => {
    const rows = parseHintReviews(
      `[{"hintId":"h-1","verdict":"correct","confidence":1,"explanation":"ok","suggestedCorrection":null}]`,
      HINTS
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("correct");
  });

  it("drops unknown hintIds and invalid verdicts", () => {
    const text = JSON.stringify({
      hintReviews: [
        { hintId: "h-999", verdict: "correct", confidence: 1 },
        { hintId: "h-1", verdict: "definitely-wrong", confidence: 1 },
        { hintId: "h-2", verdict: "partially_correct", confidence: 0.6 },
        { verdict: "correct", confidence: 1 }, // no hintId at all
        "not-an-object",
        null,
      ],
    });
    const rows = parseHintReviews(text, HINTS);
    expect(rows).toHaveLength(1);
    expect(rows[0].hintId).toBe("h-2");
    expect(rows[0].verdict).toBe("partially_correct");
  });

  it("clamps confidence to [0,1]; non-numeric collapses to 0", () => {
    const text = JSON.stringify({
      hintReviews: [
        { hintId: "h-1", verdict: "correct", confidence: 1.7 },
        { hintId: "h-2", verdict: "correct", confidence: -0.4 },
        { hintId: "h-3", verdict: "correct", confidence: "high" },
      ],
    });
    const rows = parseHintReviews(text, HINTS);
    expect(rows.map((r) => r.confidence)).toEqual([1, 0, 0]);
  });

  it("malformed text => empty rows, never throws", () => {
    expect(parseHintReviews("", HINTS)).toEqual([]);
    expect(parseHintReviews("not json at all", HINTS)).toEqual([]);
    expect(parseHintReviews('{"hintReviews": "nope"}', HINTS)).toEqual([]);
    expect(parseHintReviews(VALID_JSON, [])).toEqual([]);
  });
});

describe("aggregateHintTrust", () => {
  const row = (verdict: HintReviewRow["verdict"]): HintReviewRow => ({
    hintId: "h",
    hint_kind: "when",
    hint_text_hash: sha("x"),
    verdict,
    confidence: 0.5,
    explanation: null,
    suggestedCorrection: null,
  });

  it("hint_trust counts 'correct' ONLY (partially_correct excluded)", () => {
    const t = aggregateHintTrust([row("correct"), row("partially_correct"), row("unverifiable")]);
    expect(t.reviews).toBe(3);
    expect(t.correct).toBe(1);
    expect(t.hint_trust).toBeCloseTo(1 / 3, 9);
    expect(t.flagged).toBe(false);
  });

  it("flagged at >= 2 incorrect", () => {
    const t = aggregateHintTrust([row("incorrect"), row("incorrect"), row("correct")]);
    expect(t.incorrect).toBe(2);
    expect(t.flagged).toBe(true);
    expect(t.hint_trust).toBeCloseTo(1 / 3, 9);
    expect(HINT_FLAG_INCORRECT_THRESHOLD).toBe(2);
  });

  it("empty => 0 trust, not flagged", () => {
    expect(aggregateHintTrust([])).toEqual({
      reviews: 0,
      correct: 0,
      incorrect: 0,
      hint_trust: 0,
      flagged: false,
    });
  });

  it("all correct => trust 1", () => {
    const t = aggregateHintTrust([row("correct"), row("correct")]);
    expect(t.hint_trust).toBe(1);
  });
});
