import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PIPELINE_STEP_BY_ID } from "@/core/pipelineRegistry";
import { PIPELINE_DIAGRAM_NODE_IDS } from "./PipelineDiagram";

const PIPELINE_DIR = resolve(__dirname);
const PAGES = [
  "page.tsx",
  "stages/page.tsx",
  "kpis/page.tsx",
  "safeguards/page.tsx",
] as const;

function readPipeline(path: string): string {
  return readFileSync(resolve(PIPELINE_DIR, path), "utf-8");
}

function firstIndexAfterAdmin(src: string): number {
  const indexes = [src.indexOf("getDbPool()"), src.indexOf("pool.query")].filter(
    (index) => index >= 0
  );
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

describe("pipeline page authentication guard", () => {
  for (const page of PAGES) {
    it(`${page} is dynamic and any database access happens after requireAdmin`, () => {
      const src = readPipeline(page);
      expect(src).toContain('export const dynamic = "force-dynamic";');
      const adminIndex = src.indexOf("await requireAdmin()");
      const dbIndex = firstIndexAfterAdmin(src);
      expect(adminIndex).toBeGreaterThanOrEqual(0);
      if (dbIndex >= 0) {
        expect(dbIndex).toBeGreaterThan(adminIndex);
      }
    });
  }
});

describe("pipeline server-only and read-only source guard", () => {
  it("registry, pages, diagram, badge, and queries contain no client directive or network fetch", () => {
    const sources = [
      readFileSync(resolve(PIPELINE_DIR, "../../../../core/pipelineRegistry.ts"), "utf-8"),
      ...PAGES.map(readPipeline),
      readPipeline("PipelineDiagram.tsx"),
      readPipeline("StatusBadge.tsx"),
      readPipeline("pipelineQueries.ts"),
    ];
    for (const src of sources) {
      expect(src).not.toContain("use client");
      expect(src).not.toContain("fetch(");
    }
  });

  it("pipelineQueries contains no write or schema mutation keywords", () => {
    const src = readPipeline("pipelineQueries.ts");
    expect(src).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);
  });

  it("pages do not import client-only navigation or the shared client SortableTable", () => {
    for (const page of PAGES) {
      const src = readPipeline(page);
      expect(src).not.toContain("next/navigation");
      expect(src).not.toContain("SortableTable");
    }
  });
});

describe("pipeline navigation and diagram registry guard", () => {
  it("sidebar contains exactly one Pipeline nav entry", () => {
    const sidebar = readFileSync(resolve(PIPELINE_DIR, "../SidebarNav.tsx"), "utf-8");
    expect(sidebar.match(/label: "Pipeline"/g) ?? []).toHaveLength(1);
    expect(sidebar.match(/href: "\/admin\/dashboard\/pipeline"/g) ?? []).toHaveLength(1);
    expect(sidebar.match(/match: "\/admin\/dashboard\/pipeline"/g) ?? []).toHaveLength(1);
  });

  it("every diagram node id exists in the registry and statuses are registry-derived", () => {
    for (const id of PIPELINE_DIAGRAM_NODE_IDS) {
      expect(PIPELINE_STEP_BY_ID[id], id).toBeDefined();
    }
    const diagram = readPipeline("PipelineDiagram.tsx");
    expect(diagram).toContain("PIPELINE_STEP_BY_ID[id]");
    expect(diagram).not.toMatch(/status:\s*["']/);
  });
});
