import { describe, expect, it } from "vitest";
import {
  allocateStrata,
  eraBucket,
  groundTruthContentAndHash,
  md5Hex,
  parseArgs,
  sha256Hex,
  stableStringify,
  type EligibleEventRow,
} from "./freeze-set";

function row(id: string, year: number, era?: string, region = "Europe"): EligibleEventRow {
  return {
    event_id: id,
    event_year: year,
    title: `t-${id}`,
    latitude: 48.2,
    longitude: 16.3,
    location_name: "Vienna",
    country: "AT",
    continent: "Europe",
    difficulty: 5,
    era: era ?? eraBucket(year),
    region,
    h: md5Hex(`${id}|bench-v2`),
  };
}

describe("eraBucket", () => {
  it("matches seed bucket boundaries", () => {
    expect(eraBucket(-500)).toBe("pre_1500");
    expect(eraBucket(1499)).toBe("pre_1500");
    expect(eraBucket(1500)).toBe("1500_1799");
    expect(eraBucket(1799)).toBe("1500_1799");
    expect(eraBucket(1800)).toBe("1800_1899");
    expect(eraBucket(1899)).toBe("1800_1899");
    expect(eraBucket(1900)).toBe("1900_1949");
    expect(eraBucket(1949)).toBe("1900_1949");
    expect(eraBucket(1950)).toBe("1950_1989");
    expect(eraBucket(1989)).toBe("1950_1989");
    expect(eraBucket(1990)).toBe("1990_plus");
    expect(eraBucket(2020)).toBe("1990_plus");
  });
});

describe("allocateStrata", () => {
  it("is deterministic for identical input", () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      row(`evt-${String(i).padStart(4, "0")}`, 1000 + (i % 1000))
    );
    const a = allocateStrata(rows, 150, "bench-v2");
    const b = allocateStrata(rows, 150, "bench-v2");
    expect(a.map((x) => x.event.event_id)).toEqual(b.map((x) => x.event.event_id));
    expect(a).toHaveLength(150);
    // seq is 1..N contiguous
    expect(a.map((x) => x.seq)).toEqual(Array.from({ length: 150 }, (_, i) => i + 1));
  });

  it("never exceeds stratum size and respects tiny strata", () => {
    const rows: EligibleEventRow[] = [];
    // one tiny stratum (2 events) + one big stratum
    rows.push(row("tiny-1", 1066, "pre_1500", "Europe"));
    rows.push(row("tiny-2", 1200, "pre_1500", "Europe"));
    for (let i = 0; i < 130; i++) {
      rows.push(row(`big-${i}`, 1900 + (i % 80), "1900_1949", "Europe"));
    }
    const out = allocateStrata(rows, 120, "s");
    const tinyCount = out.filter((x) => x.stratum === "pre_1500|Europe").length;
    expect(tinyCount).toBe(2);
    expect(out).toHaveLength(120);
    const ids = out.map((x) => x.event.event_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("groundTruthContentAndHash", () => {
  it("produces the resolveGroundTruthVersion content shape + sha256", () => {
    const e = row("abc", 1969);
    const { content, contentHash } = groundTruthContentAndHash(e);
    expect(content).toEqual({
      event_year: 1969,
      latitude: 48.2,
      longitude: 16.3,
      location_name: "Vienna",
      title: "t-abc",
      country: "AT",
      continent: "Europe",
    });
    // stableStringify sorts keys; hash must equal sha256 of that string.
    expect(contentHash).toBe(
      sha256Hex(
        stableStringify({
          event_year: 1969,
          latitude: 48.2,
          longitude: 16.3,
          location_name: "Vienna",
          title: "t-abc",
          country: "AT",
          continent: "Europe",
        })
      )
    );
    expect(contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseArgs", () => {
  it("defaults to dry-run size 150", () => {
    const a = parseArgs([]);
    expect(a.live).toBe(false);
    expect(a.size).toBe(150);
    expect(a.name).toBe("bench-v2-150");
    expect(a.promptVersion).toBe("bench-v1");
  });
});
