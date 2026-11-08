import { describe, it, expect } from "vitest";
import {
  parseEventAudit,
  buildAuditMessages,
  type AuditEventInput,
} from "./aiEventAudit";

// AIP-BUILD-FLEETFINAL-1103-060 — D8 text-only audit prompt/parse proof.

const VALID = JSON.stringify({
  is_real_event: "likely_real",
  year_check: "off_by_n",
  proposed_year: 1963,
  location_check: "ok",
  proposed_location: null,
  proposed_lat: null,
  proposed_lng: null,
  description_issues: ["mentions wrong stadium"],
  hint_issues: [],
  difficulty_estimate_year: 3,
  difficulty_estimate_location: 4,
  improvement_suggestions: ["add the venue name to the description"],
  confidence: 0.72,
  reasoning: "The event is documented but dated one year early.",
});

describe("parseEventAudit", () => {
  it("parses a valid audit into the column shape", () => {
    const r = parseEventAudit(VALID);
    expect(r.error).toBeNull();
    expect(r).toEqual({
      is_real_event: "likely_real",
      year_check: "off_by_n",
      proposed_year: 1963,
      location_check: "ok",
      proposed_location: null,
      proposed_lat: null,
      proposed_lng: null,
      description_issues: ["mentions wrong stadium"],
      hint_issues: [],
      difficulty_estimate_year: 3,
      difficulty_estimate_location: 4,
      improvement_suggestions: ["add the venue name to the description"],
      confidence: 0.72,
      reasoning: "The event is documented but dated one year early.",
      error: null,
    });
  });

  it("tolerates ```json fences and prose around the object", () => {
    const r = parseEventAudit(`Audit result:\n\`\`\`json\n${VALID}\n\`\`\`\nDone.`);
    expect(r.error).toBeNull();
    expect(r.is_real_event).toBe("likely_real");
  });

  it("malformed input => {error}, never throws", () => {
    for (const bad of ["", "   ", "not json", "[1,2]", "42", null, undefined]) {
      const r = parseEventAudit(bad as string | null | undefined);
      expect(r.error).toBeTruthy();
      expect(r.is_real_event).toBe("unknown");
      expect(r.description_issues).toEqual([]);
    }
    const truncated = parseEventAudit('{"is_real_event": "real",');
    expect(truncated.error).toBeTruthy();
  });

  it("invalid enum values fall back to 'unknown' (insertable)", () => {
    const r = parseEventAudit(
      JSON.stringify({ is_real_event: "totally_real", year_check: "nope", location_check: 7 })
    );
    expect(r.is_real_event).toBe("unknown");
    expect(r.year_check).toBe("unknown");
    expect(r.location_check).toBe("unknown");
  });

  it("difficulty estimates clamp to 1..5; non-numeric => null", () => {
    const r = parseEventAudit(
      JSON.stringify({
        difficulty_estimate_year: 9,
        difficulty_estimate_location: -2,
        confidence: "high",
      })
    );
    expect(r.difficulty_estimate_year).toBe(5);
    expect(r.difficulty_estimate_location).toBe(1);
    expect(r.confidence).toBeNull();
  });

  it("confidence clamps to 0..1", () => {
    expect(parseEventAudit('{"confidence": 1.9}').confidence).toBe(1);
    expect(parseEventAudit('{"confidence": -3}').confidence).toBe(0);
  });

  it("proposed_lat/lng validated in range; out-of-range => null", () => {
    const r = parseEventAudit('{"proposed_lat": 91, "proposed_lng": -181}');
    expect(r.proposed_lat).toBeNull();
    expect(r.proposed_lng).toBeNull();
    const ok = parseEventAudit('{"proposed_lat": 48.85, "proposed_lng": 2.35}');
    expect(ok.proposed_lat).toBe(48.85);
    expect(ok.proposed_lng).toBe(2.35);
  });

  it("issue arrays keep strings only", () => {
    const r = parseEventAudit(
      '{"description_issues": ["a", 3, null, "b"], "hint_issues": "nope", "improvement_suggestions": []}'
    );
    expect(r.description_issues).toEqual(["a", "b"]);
    expect(r.hint_issues).toEqual([]);
    expect(r.improvement_suggestions).toEqual([]);
  });
});

describe("buildAuditMessages", () => {
  const EVENT: AuditEventInput = {
    title: "Moon landing",
    description: "Apollo 11 lands humans on the Moon.",
    year: 1969,
    locationName: "Mare Tranquillitatis",
    lat: 0.6875,
    lng: 23.4333,
    hints: [
      { tier: 1, type: "when", content: "Late 1960s space race." },
      { tier: 2, type: "where", content: "Not on Earth." },
    ],
    imageQualityScore: 9,
    imageQualityNotes: "iconic footage",
    difficultyScore: 2,
    difficultyNotes: "very famous",
  };

  it("returns system+user text-only messages", () => {
    const msgs = buildAuditMessages(EVENT);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(typeof msgs[0].content).toBe("string");
    expect(typeof msgs[1].content).toBe("string");
    // text-only: no structured/image content parts
    expect(msgs.every((m) => typeof m.content === "string")).toBe(true);
  });

  it("system prompt demands JSON-only with the exact ai_event_audits keys", () => {
    const sys = buildAuditMessages(EVENT)[0].content;
    for (const key of [
      "is_real_event",
      "year_check",
      "proposed_year",
      "location_check",
      "proposed_location",
      "proposed_lat",
      "proposed_lng",
      "description_issues",
      "hint_issues",
      "difficulty_estimate_year",
      "difficulty_estimate_location",
      "improvement_suggestions",
      "confidence",
      "reasoning",
    ]) {
      expect(sys).toContain(key);
    }
    expect(sys.toLowerCase()).toContain("json only");
  });

  it("user prompt carries title, description, year, location, coords, hints, prior notes", () => {
    const user = buildAuditMessages(EVENT)[1].content;
    expect(user).toContain("Moon landing");
    expect(user).toContain("Apollo 11 lands humans on the Moon.");
    expect(user).toContain("1969");
    expect(user).toContain("Mare Tranquillitatis");
    expect(user).toContain("0.6875");
    expect(user).toContain("23.4333");
    expect(user).toContain("Late 1960s space race.");
    expect(user).toContain("Not on Earth.");
    expect(user).toContain("iconic footage");
    expect(user).toContain("very famous");
  });

  it("missing fields degrade to placeholders, empty hints/notes listed as none", () => {
    const msgs = buildAuditMessages({
      title: null,
      description: null,
      year: null,
      locationName: null,
      lat: null,
      lng: null,
      hints: [],
    });
    const user = msgs[1].content;
    expect(user).toContain('"unknown"');
    expect(user).toContain("(none)");
    expect(user).not.toContain("undefined");
    expect(user).not.toContain("null");
  });
});
