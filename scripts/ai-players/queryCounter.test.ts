import { afterEach, describe, expect, it, vi } from "vitest";

// AIP-BUILD-FLEETFINAL-1103-060 (D9) — wrapPool/reportQueryCounts:
// inert unless AI_QUERY_COUNT=1, counts per label (3rd arg) or SQL caller tag,
// forwards (text, values) untouched to the real pool.

let savedFlag: string | undefined;

async function freshModule(flag?: string) {
  vi.resetModules();
  if (flag === undefined) delete process.env.AI_QUERY_COUNT;
  else process.env.AI_QUERY_COUNT = flag;
  return await import("./queryCounter");
}

describe("queryCounter (D9)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (savedFlag === undefined) delete process.env.AI_QUERY_COUNT;
    else process.env.AI_QUERY_COUNT = savedFlag;
  });

  it("is a passthrough when AI_QUERY_COUNT is not '1'", async () => {
    savedFlag = process.env.AI_QUERY_COUNT;
    const mod = await freshModule("0");
    const pool = { query: vi.fn(async () => ({ rows: [] })) };
    expect(mod.wrapPool(pool)).toBe(pool);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.reportQueryCounts();
    expect(log).not.toHaveBeenCalled();
  });

  it("counts queries by explicit label or SQL caller tag and reports totals", async () => {
    savedFlag = process.env.AI_QUERY_COUNT;
    const mod = await freshModule("1");
    const inner = { query: vi.fn(async () => ({ rows: [] })), end: vi.fn() };
    const pool = mod.wrapPool(inner);

    await pool.query("SELECT 1 FROM ai_players", ["a"], "roster");
    await pool.query("SELECT 1 FROM ai_players", ["b"], "roster");
    await pool.query("INSERT INTO ai_play_deferrals ...");

    // args forwarded without the label arg; end() inherited from the real pool.
    expect(inner.query).toHaveBeenNthCalledWith(1, "SELECT 1 FROM ai_players", ["a"]);
    expect(inner.query).toHaveBeenNthCalledWith(3, "INSERT INTO ai_play_deferrals ...");
    expect(pool.end).toBe(inner.end);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mod.reportQueryCounts();
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("[QUERY-COUNT] total=3");
    expect(out).toContain("2  roster");
    expect(out).toContain("1  INSERT INTO ai_play_deferrals ...");
  });
});
