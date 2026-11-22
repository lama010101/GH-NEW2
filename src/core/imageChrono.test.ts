import { describe, it, expect } from "vitest";
import {
  CHRONO_CATEGORIES,
  anachronismKey,
  buildChronoAuditMessages,
  decideHold,
  normalizeText,
  parseChronoAudit,
  type ChronoFlagRow,
} from "./imageChrono";

// EDQ-BUILD-IMGCHRONO-1122-810 — pure chrono-audit lib proof.

const VALID = JSON.stringify({
  findings: [
    {
      anachronism_text: "A wristwatch on the soldier's arm",
      element_category: "attire",
      confidence: 0.9,
    },
    {
      anachronism_text: "A smartphone glowing in the crowd",
      element_category: "technology",
      confidence: 0.75,
    },
  ],
  reasoning: "Both items postdate the event.",
});

describe("normalizeText", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeText("  Hello,   WORLD!! ")).toBe("hello world");
    expect(normalizeText("Wrist-Watch")).toBe("wrist watch");
    expect(normalizeText("smart   phone")).toBe("smart phone");
  });

  it("is insensitive to case, punctuation and whitespace runs", () => {
    expect(normalizeText("A  Modern CAR!")).toBe(normalizeText("a modern car"));
  });
});

describe("anachronismKey", () => {
  it("is stable for identical input and 16 hex chars", () => {
    const k1 = anachronismKey("attire", "A wristwatch on the arm");
    const k2 = anachronismKey("attire", "A wristwatch on the arm");
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("normalization differences produce the same key", () => {
    expect(anachronismKey("vehicles", "A  Ford   Model T!")).toBe(
      anachronismKey("vehicles", "a ford model t")
    );
  });

  it("different category or different wording produce different keys", () => {
    const base = anachronismKey("attire", "a wristwatch");
    expect(anachronismKey("technology", "a wristwatch")).not.toBe(base);
    expect(anachronismKey("attire", "a smartwatch")).not.toBe(base);
  });
});

describe("parseChronoAudit", () => {
  it("parses a valid reply into findings + reasoning", () => {
    const r = parseChronoAudit(VALID);
    expect(r.error).toBeNull();
    expect(r.reasoning).toBe("Both items postdate the event.");
    expect(r.findings).toEqual([
      {
        anachronism_text: "A wristwatch on the soldier's arm",
        element_category: "attire",
        confidence: 0.9,
      },
      {
        anachronism_text: "A smartphone glowing in the crowd",
        element_category: "technology",
        confidence: 0.75,
      },
    ]);
  });

  it("parses a clean audit {\"findings\":[]}", () => {
    const r = parseChronoAudit('{"findings":[],"reasoning":"nothing anachronistic"}');
    expect(r.error).toBeNull();
    expect(r.findings).toEqual([]);
  });

  it("tolerates ```json fences and prose around the object", () => {
    const r = parseChronoAudit(`Audit:\n\`\`\`json\n${VALID}\n\`\`\`\nDone.`);
    expect(r.error).toBeNull();
    expect(r.findings).toHaveLength(2);
  });

  it("malformed input => {error}, never throws", () => {
    for (const bad of ["", "   ", "not json", "[1,2]", "42", null, undefined]) {
      const r = parseChronoAudit(bad as string | null | undefined);
      expect(r.error).toBeTruthy();
      expect(r.findings).toEqual([]);
    }
  });

  it("unknown element_category degrades to 'other'", () => {
    const r = parseChronoAudit(
      JSON.stringify({
        findings: [
          { anachronism_text: "A flying saucer", element_category: "ufo", confidence: 0.5 },
        ],
      })
    );
    expect(r.error).toBeNull();
    expect(r.findings[0].element_category).toBe("other");
  });

  it("out-of-range confidence clamps to 0..1; non-numeric -> null", () => {
    const r = parseChronoAudit(
      JSON.stringify({
        findings: [
          { anachronism_text: "a", element_category: "attire", confidence: 1.7 },
          { anachronism_text: "b", element_category: "attire", confidence: -0.4 },
          { anachronism_text: "c", element_category: "attire", confidence: "high" },
        ],
      })
    );
    expect(r.findings[0].confidence).toBe(1);
    expect(r.findings[1].confidence).toBe(0);
    expect(r.findings[2].confidence).toBeNull();
  });

  it("findings without non-empty anachronism_text are dropped", () => {
    const r = parseChronoAudit(
      JSON.stringify({
        findings: [
          { anachronism_text: "", element_category: "attire" },
          { anachronism_text: "  ", element_category: "attire" },
          { element_category: "attire" },
          "junk",
          { anachronism_text: "kept", element_category: "vehicles" },
        ],
      })
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].anachronism_text).toBe("kept");
  });
});

function row(
  event_id: string,
  image_id: string,
  ai_player_id: string,
  element_category: string | null,
  flagged = true
): ChronoFlagRow {
  return { event_id, image_id, ai_player_id, flagged, element_category };
}

describe("decideHold", () => {
  const E = "evt-1";
  const I = "img-1";

  it("two different models + same category + different wording => hold", () => {
    const holds = decideHold([
      row(E, I, "p1", "attire"),
      row(E, I, "p2", "attire"),
    ]);
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({
      event_id: E,
      image_id: I,
      element_category: "attire",
      flagger_count: 2,
      held: true,
    });
  });

  it("one model flagging twice (different wordings) => no hold", () => {
    const holds = decideHold([
      row(E, I, "p1", "attire"),
      row(E, I, "p1", "attire"),
    ]);
    expect(holds).toHaveLength(1);
    expect(holds[0].flagger_count).toBe(1);
    expect(holds[0].held).toBe(false);
  });

  it("flagged=false rows never hold", () => {
    const holds = decideHold([
      row(E, I, "p1", null, false),
      row(E, I, "p2", null, false),
    ]);
    expect(holds).toEqual([]);
  });

  it("different categories never merge", () => {
    const holds = decideHold([
      row(E, I, "p1", "attire"),
      row(E, I, "p2", "technology"),
    ]);
    expect(holds).toHaveLength(2);
    expect(holds.every((h) => !h.held)).toBe(true);
    expect(holds.map((h) => h.element_category).sort()).toEqual([
      "attire",
      "technology",
    ]);
  });

  it("groups are per (event,image): same category on another image does not merge", () => {
    const holds = decideHold([
      row(E, I, "p1", "attire"),
      row(E, "img-2", "p2", "attire"),
    ]);
    expect(holds).toHaveLength(2);
    expect(holds.every((h) => !h.held)).toBe(true);
  });
});

describe("buildChronoAuditMessages", () => {
  it("returns system + user with image_url part and event context", () => {
    const msgs = buildChronoAuditMessages({
      imageUrl: "https://example.com/img.png",
      year: 1963,
      locationName: "Berlin",
      title: "Checkpoint Charlie standoff",
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(typeof msgs[0].content).toBe("string");
    const user = msgs[1].content as Array<Record<string, unknown>>;
    expect(user[0]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/img.png", detail: "auto" },
    });
    const text = user[1].text as string;
    expect(text).toContain("1963");
    expect(text).toContain("Berlin");
    expect(text).toContain("Checkpoint Charlie standoff");
  });
});

describe("CHRONO_CATEGORIES", () => {
  it("matches the migration CHECK list", () => {
    expect([...CHRONO_CATEGORIES].sort()).toEqual(
      [
        "architecture",
        "attire",
        "food_objects",
        "lighting_photo",
        "other",
        "signage_text",
        "technology",
        "vehicles",
        "weapons_military",
      ].sort()
    );
  });
});
