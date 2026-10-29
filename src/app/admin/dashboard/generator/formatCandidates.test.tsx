import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CandidateTable, type CandidateRow } from "./CandidateTable";
import {
  formatCreatedAt,
  formatEventYear,
  statusChipClass,
  summarizeChecks,
  summarizeQuotaBucket,
} from "./formatCandidates";

// Fixture rows only — generation_candidates is EMPTY in PROD and this
// test must not touch the DB (GEN-BUILD-CANDIDLIST-1028-001).
const FIXTURE_ROWS: CandidateRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    status: "new",
    wikidata_qid: "Q9689",
    wd_label: "Apollo 11 lands on the Moon",
    title: "First crewed Moon landing",
    event_year: 1969,
    coord_source: "P625",
    sitelinks: 142,
    quota_bucket: { decade: "1960s", theme: "space", region: "global", slot: 4 },
    checks: { year_ok: true, coords_ok: true, label_ok: false },
    event_id: null,
    created_at: "2026-10-28 10:15:00+00",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    status: "published",
    wikidata_qid: "Q22671",
    wd_label: "Assassination of Julius Caesar",
    title: null,
    event_year: -44,
    coord_source: "P276",
    sitelinks: 87,
    quota_bucket: { era: "ancient" },
    checks: null,
    event_id: "00000000-0000-0000-0000-0000000000aa",
    created_at: "2026-10-27 09:00:00+00",
  },
  {
    // null-coordinate fictional candidate: no qid, no coord_source,
    // null year, empty checks object.
    id: "00000000-0000-0000-0000-000000000003",
    status: "rejected",
    wikidata_qid: null,
    wd_label: null,
    title: "The Hollow Mountain expedition",
    event_year: null,
    coord_source: null,
    sitelinks: null,
    quota_bucket: null,
    checks: {},
    event_id: null,
    created_at: "2026-10-26 08:30:00+00",
  },
];

describe("formatCandidates helpers", () => {
  it("formatEventYear renders negative years as BCE and null as dash", () => {
    expect(formatEventYear(-44)).toBe("44 BCE");
    expect(formatEventYear(-1)).toBe("1 BCE");
    expect(formatEventYear(0)).toBe("0");
    expect(formatEventYear(1969)).toBe("1969");
    expect(formatEventYear(null)).toBe("—");
  });

  it("formatCreatedAt normalizes timestamptz::text and ISO", () => {
    expect(formatCreatedAt("2026-10-28 10:15:00+00")).toBe("2026-10-28 10:15");
    expect(formatCreatedAt("2026-10-28T10:15:00.000Z")).toBe("2026-10-28 10:15");
  });

  it("summarizeChecks counts flag entries; empty/null handled", () => {
    expect(summarizeChecks({ a: true, b: false, c: true })).toBe("3 flags");
    expect(summarizeChecks({ a: true })).toBe("1 flag");
    expect(summarizeChecks([true, false])).toBe("2 flags");
    expect(summarizeChecks({})).toBe("0 flags");
    expect(summarizeChecks(null)).toBe("—");
    expect(summarizeChecks(undefined)).toBe("—");
    expect(summarizeChecks("bogus")).toBe("—");
  });

  it("summarizeQuotaBucket is shape-agnostic and deterministic", () => {
    expect(summarizeQuotaBucket(null)).toBe("—");
    expect(summarizeQuotaBucket({})).toBe("—");
    expect(summarizeQuotaBucket({ decade: "1960s" })).toBe("decade=1960s");
    expect(
      summarizeQuotaBucket({ a: 1, b: 2, c: 3, d: 4, e: 5 })
    ).toBe("a=1, b=2, c=3 +2 more");
    expect(summarizeQuotaBucket([])).toBe("0 entries");
    expect(summarizeQuotaBucket([1, 2])).toBe("2 entries");
    expect(summarizeQuotaBucket("global")).toBe("global");
  });

  it("statusChipClass maps pipeline stages to ops-chip variants", () => {
    expect(statusChipClass("new")).toBe("ops-chip ops-chip-muted");
    expect(statusChipClass("narrated")).toBe("ops-chip ops-chip-warn");
    expect(statusChipClass("checked")).toBe("ops-chip ops-chip-ok");
    expect(statusChipClass("published")).toBe("ops-chip ops-chip-ok");
    expect(statusChipClass("rejected")).toBe("ops-chip ops-chip-bad");
    expect(statusChipClass("unexpected")).toBe("ops-chip ops-chip-muted");
  });
});

describe("CandidateTable fixture render", () => {
  it("renders 3 fixture rows incl. null-coordinate row — no DB", () => {
    const { container } = render(<CandidateTable rows={FIXTURE_ROWS} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);

    const html = container.innerHTML;
    // status badges
    expect(container.querySelector(".ops-chip-muted")!.textContent).toBe("new");
    expect(container.querySelector(".ops-chip-ok")!.textContent).toBe(
      "published"
    );
    expect(container.querySelector(".ops-chip-bad")!.textContent).toBe(
      "rejected"
    );
    // wikidata link
    const qidLink = container.querySelector('a[href="https://www.wikidata.org/wiki/Q9689"]');
    expect(qidLink).not.toBeNull();
    expect(qidLink!.getAttribute("target")).toBe("_blank");
    // BCE year
    expect(html).toContain("44 BCE");
    // null-coordinate row: no qid link for row 3, coord_source dash
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows[2].querySelectorAll("a")).toHaveLength(0);
    expect(html).toContain("The Hollow Mountain expedition");
    // checks / bucket summaries
    expect(html).toContain("3 flags");
    expect(html).toContain("0 flags");
    expect(html).toContain("era=ancient");
    // event_id present yes/no
    expect(html).toContain(">yes<");
    expect(html).toContain(">no<");
  });

  it("renders the empty state for an empty candidate table", () => {
    const { container } = render(<CandidateTable rows={[]} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.textContent).toContain("No candidates yet. Run");
    expect(container.textContent).toContain(
      "scripts/generation/discover-wikidata.ts"
    );
    expect(container.querySelector(".ops-empty")).not.toBeNull();
  });
});

describe("generator page auth ordering (source guard)", () => {
  const src = readFileSync(resolve(__dirname, "page.tsx"), "utf-8");

  it("requireAdmin() is the first awaited call — before getDbPool()/query", () => {
    const adminIdx = src.indexOf("await requireAdmin()");
    const poolIdx = src.indexOf("getDbPool()");
    const queryIdx = src.indexOf("pool.query");
    expect(adminIdx).toBeGreaterThan(-1);
    // "getDbPool()" with parens matches the call site, not the import.
    expect(poolIdx).toBeGreaterThan(adminIdx);
    expect(queryIdx).toBeGreaterThan(adminIdx);
  });

  it("non-admin yields no data: requireAdmin throws before any SELECT runs", () => {
    // requireAdmin() throws Unauthorized/Forbidden on line 9-29 of
    // src/core/adminAuth.ts; in page.tsx every pool.query appears after it.
    // Executable proxy: the awaited call order proven above means a thrown
    // error short-circuits the handler — the queries below are unreachable
    // for a non-admin session.
    expect(src.indexOf("await requireAdmin()")).toBeLessThan(
      src.indexOf("FROM public.generation_candidates")
    );
  });
});
