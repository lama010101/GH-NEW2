import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PIPELINE_KPIS,
  PIPELINE_SAFEGUARDS,
  PIPELINE_STEPS,
  PIPELINE_STATUSES,
} from "./pipelineRegistry";

const STANDING_RULE =
  "Every pipeline task must update the rows it touches in this file (status, ownerTask, lastUpdated, note) in its own PR. A pipeline PR that changes behaviour without a registry edit is rejected by the CTO (ruling R8).";
const TASK_ID_RE = /^[A-Z]+-[A-Z]+-[A-Z0-9]+-\d{4}-\d{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

describe("pipelineRegistry", () => {
  it("keeps the standing rule in the header comment", () => {
    const src = readFileSync(resolve(__dirname, "pipelineRegistry.ts"), "utf-8");
    expect(src).toContain(STANDING_RULE);
  });

  it("uses unique step, KPI, and safeguard ids", () => {
    for (const rows of [PIPELINE_STEPS, PIPELINE_KPIS, PIPELINE_SAFEGUARDS]) {
      const ids = rows.map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("uses only declared statuses and never a completed status", () => {
    for (const row of [...PIPELINE_STEPS, ...PIPELINE_SAFEGUARDS]) {
      expect(PIPELINE_STATUSES).toContain(row.status);
      expect(row.status).not.toBe("completed");
    }
    expect(PIPELINE_STATUSES).not.toContain("completed");
  });

  it("uses valid YYYY-MM-DD lastUpdated dates", () => {
    for (const row of [...PIPELINE_STEPS, ...PIPELINE_SAFEGUARDS]) {
      expect(validDate(row.lastUpdated)).toBe(true);
    }
  });

  it("uses null or the declared task-id shape for ownerTask", () => {
    for (const row of [...PIPELINE_STEPS, ...PIPELINE_SAFEGUARDS]) {
      if (row.ownerTask !== null) expect(row.ownerTask).toMatch(TASK_ID_RE);
    }
  });

  it("references only declared KPI ids from steps", () => {
    const kpiIds = new Set(PIPELINE_KPIS.map((kpi) => kpi.id));
    for (const step of PIPELINE_STEPS) {
      for (const id of step.kpis) expect(kpiIds.has(id)).toBe(true);
    }
  });

  it("gives every KPI a non-empty liveKey", () => {
    for (const kpi of PIPELINE_KPIS) {
      expect(kpi.liveKey.trim().length).toBeGreaterThan(0);
    }
  });

  it("requires doneWhen for live steps", () => {
    for (const step of PIPELINE_STEPS) {
      if (step.status === "live") expect(step.doneWhen.trim().length).toBeGreaterThan(0);
    }
  });

  it("requires explanatory notes for blocked and superseded rows", () => {
    for (const row of [...PIPELINE_STEPS, ...PIPELINE_SAFEGUARDS]) {
      if (row.status === "blocked" || row.status === "superseded") {
        expect(row.note.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
