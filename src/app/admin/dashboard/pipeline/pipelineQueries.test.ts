import { describe, expect, it } from "vitest";
import { PIPELINE_KPIS } from "@/core/pipelineRegistry";
import {
  collectPipelineKpis,
  formatPercent,
  formatRatio,
  PIPELINE_QUERY_RUNNERS,
  type PipelineQueryable,
} from "./pipelineQueries";

type Handler = (text: string, params?: readonly unknown[]) => { rows: unknown[] };

function fakePool(handler: Handler, trace?: string[]): PipelineQueryable & { released: number } {
  const state = { released: 0 };
  return {
    get released() {
      return state.released;
    },
    async connect() {
      return {
        async query(text: string, params?: readonly unknown[]) {
          trace?.push(text);
          if (
            text.startsWith("BEGIN") ||
            text.startsWith("SET LOCAL") ||
            text.startsWith("ROLLBACK")
          ) {
            return { rows: [] };
          }
          return handler(text, params) as { rows: never[] };
        },
        release() {
          state.released += 1;
        },
      };
    },
  } as PipelineQueryable & { released: number };
}

function tablePresence(present: boolean): Handler {
  return (text) => {
    if (text.includes("to_regclass")) return { rows: [{ present }] };
    return { rows: [] };
  };
}

describe("pipelineQueries fail-soft behavior", () => {
  it("returns not_built when the required table is absent", async () => {
    const trace: string[] = [];
    const pool = fakePool(tablePresence(false), trace);
    const out = await collectPipelineKpis(pool, ["chrono_flags"]);
    expect(out.chrono_flags.state).toBe("not_built");
    expect(out.chrono_flags.value).toBeNull();
    expect(out.chrono_flags.note).toContain("public.ai_image_chrono_flags");
    expect(trace.some((q) => q === "BEGIN READ ONLY")).toBe(true);
    expect(trace.some((q) => q.includes("statement_timeout = 8000"))).toBe(true);
    expect(pool.released).toBe(1);
  });

  it("returns error with a short message when the KPI query fails", async () => {
    const pool = fakePool((text) => {
      if (text.includes("to_regclass")) return { rows: [{ present: true }] };
      throw new Error("synthetic database failure with\nnewline detail");
    });
    const out = await collectPipelineKpis(pool, ["chrono_flags"]);
    expect(out.chrono_flags.state).toBe("error");
    expect(out.chrono_flags.value).toBeNull();
    expect(out.chrono_flags.note).toContain("synthetic database failure");
    expect(out.chrono_flags.note).not.toContain("\n");
    expect(pool.released).toBe(1);
  });

  it("returns the ok path for a simple live count", async () => {
    const pool = fakePool((text) => {
      if (text.includes("to_regclass")) return { rows: [{ present: true }] };
      if (text.includes("FROM public.events")) return { rows: [{ count: 7 }] };
      return { rows: [] };
    });
    const out = await collectPipelineKpis(pool, ["events_in_play"]);
    expect(out.events_in_play).toMatchObject({ state: "ok", note: "live database read" });
    expect(out.events_in_play.value).toEqual({ count: 7 });
    expect(pool.released).toBe(1);
  });
});

describe("pipeline query registry coverage", () => {
  it("every registry liveKey exists in the query map and vice versa", () => {
    const registryKeys = new Set(PIPELINE_KPIS.map((kpi) => kpi.liveKey));
    const queryKeys = new Set(Object.keys(PIPELINE_QUERY_RUNNERS));
    for (const key of registryKeys) expect(queryKeys.has(key)).toBe(true);
    for (const key of queryKeys) expect(registryKeys.has(key)).toBe(true);
  });
});

describe("explicit denominator formatters", () => {
  it("formatPercent states the denominator in text", () => {
    expect(formatPercent(34, 100, "checked events")).toBe("34% of 100 checked events");
    expect(formatPercent(1, 3, "checked events")).toBe("33.3% of 3 checked events");
    expect(formatPercent(0, 0, "checked events")).toBe("0% of 0 checked events");
  });

  it("formatRatio states numerator and denominator", () => {
    expect(formatRatio(95, 2108, "events in play")).toBe("95 of 2,108 events in play");
  });
});
