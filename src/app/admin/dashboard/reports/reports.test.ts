import { describe, it, expect, vi, beforeEach } from "vitest";

// ADM-BUILD-REPORTTRIAGE-1117-507: pure helper coverage for the reports
// queries module (status/reason vocabularies, sort whitelist, note split)
// plus the server action's admin gate — requireAdmin is mocked to reject,
// proving the action never reaches the DB for non-admins.

const mockFns = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getDbPool: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/core/adminAuth", () => ({
  requireAdmin: mockFns.requireAdmin,
}));

vi.mock("@/server/db", () => ({
  getDbPool: mockFns.getDbPool,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockFns.revalidatePath,
}));

const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("event report vocabularies", () => {
  it("exposes exactly the CHECK-constrained statuses", async () => {
    const { EVENT_REPORT_STATUSES, isEventReportStatus } = await import(
      "./queries"
    );
    expect([...EVENT_REPORT_STATUSES]).toEqual([
      "open",
      "triaged",
      "upheld",
      "dismissed",
    ]);
    expect(isEventReportStatus("open")).toBe(true);
    expect(isEventReportStatus("resolved")).toBe(false);
    expect(isEventReportStatus("")).toBe(false);
  });

  it("labels every status and reason in plain language", async () => {
    const {
      EVENT_REPORT_STATUSES,
      EVENT_REPORT_STATUS_LABEL,
      EVENT_REPORT_REASON_LABEL,
    } = await import("./queries");
    for (const s of EVENT_REPORT_STATUSES) {
      expect(EVENT_REPORT_STATUS_LABEL[s]).toBeTruthy();
      expect(EVENT_REPORT_STATUS_LABEL[s]).not.toContain("_");
    }
    for (const reason of [
      "wrong_year",
      "wrong_location",
      "not_real_event",
      "misleading_image",
      "other",
    ]) {
      expect(EVENT_REPORT_REASON_LABEL[reason]).toBeTruthy();
    }
  });
});

describe("report sort helpers", () => {
  it("parseReportSort whitelists keys and defaults to reported", async () => {
    const { parseReportSort } = await import("./queries");
    expect(parseReportSort("event")).toBe("event");
    expect(parseReportSort("status")).toBe("status");
    expect(parseReportSort("bogus")).toBe("reported");
    expect(parseReportSort(undefined)).toBe("reported");
    expect(parseReportSort("1; DROP TABLE")).toBe("reported");
  });

  it("parseReportDir only accepts asc", async () => {
    const { parseReportDir } = await import("./queries");
    expect(parseReportDir("asc")).toBe("asc");
    expect(parseReportDir("desc")).toBe("desc");
    expect(parseReportDir(undefined)).toBe("desc");
    expect(parseReportDir("sideways")).toBe("desc");
  });

  it("buildReportOrderBy emits whitelisted fragments only", async () => {
    const { buildReportOrderBy } = await import("./queries");
    expect(buildReportOrderBy("reported", "desc")).toBe(
      "r.created_at DESC NULLS LAST"
    );
    expect(buildReportOrderBy("event", "asc")).toBe(
      "event_title ASC NULLS FIRST"
    );
    expect(buildReportOrderBy("note", "desc")).toBe(
      "r.details DESC NULLS LAST"
    );
  });
});

describe("reporter note helpers", () => {
  it("truncateReportNote caps long text and leaves short text alone", async () => {
    const { truncateReportNote, REPORT_NOTE_PREVIEW_LENGTH } = await import(
      "./queries"
    );
    const short = "Wrong year on this one";
    expect(truncateReportNote(short)).toBe(short);
    const long = "x".repeat(REPORT_NOTE_PREVIEW_LENGTH + 20);
    const out = truncateReportNote(long);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(
      REPORT_NOTE_PREVIEW_LENGTH + 1
    );
  });

  it("splitReportNote flags expandable only past the preview length", async () => {
    const { splitReportNote, REPORT_NOTE_PREVIEW_LENGTH } = await import(
      "./queries"
    );
    expect(splitReportNote(null)).toEqual({
      text: null,
      expandable: false,
    });
    expect(splitReportNote("   ")).toEqual({
      text: null,
      expandable: false,
    });
    const short = splitReportNote("  a short note  ");
    expect(short).toEqual({ text: "a short note", expandable: false });
    const long = splitReportNote("y".repeat(REPORT_NOTE_PREVIEW_LENGTH + 1));
    expect(long.text).toHaveLength(REPORT_NOTE_PREVIEW_LENGTH + 1);
    expect(long.expandable).toBe(true);
  });
});

describe("updateEventReportStatus", () => {
  async function loadAction() {
    const mod = await import("./actions");
    return mod.updateEventReportStatus;
  }

  it("rejects non-admin callers before touching the DB", async () => {
    mockFns.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    const updateEventReportStatus = await loadAction();

    await expect(
      updateEventReportStatus(
        makeFormData({ reportId: REPORT_ID, status: "triaged" })
      )
    ).rejects.toThrow("Forbidden");
    expect(mockFns.getDbPool).not.toHaveBeenCalled();
    expect(mockFns.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an invalid status before touching the DB", async () => {
    mockFns.requireAdmin.mockResolvedValue({ user: { id: ADMIN_USER_ID } });
    const updateEventReportStatus = await loadAction();

    await expect(
      updateEventReportStatus(
        makeFormData({ reportId: REPORT_ID, status: "bogus" })
      )
    ).rejects.toThrow("Invalid status");
    expect(mockFns.getDbPool).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID report id before touching the DB", async () => {
    mockFns.requireAdmin.mockResolvedValue({ user: { id: ADMIN_USER_ID } });
    const updateEventReportStatus = await loadAction();

    await expect(
      updateEventReportStatus(
        makeFormData({ reportId: "not-a-uuid", status: "open" })
      )
    ).rejects.toThrow("Invalid report id");
    expect(mockFns.getDbPool).not.toHaveBeenCalled();
  });

  it("updates status, stamps resolver for terminal statuses, keeps note on blank", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    mockFns.getDbPool.mockReturnValue({ query });
    mockFns.requireAdmin.mockResolvedValue({ user: { id: ADMIN_USER_ID } });
    const updateEventReportStatus = await loadAction();

    await updateEventReportStatus(
      makeFormData({
        reportId: REPORT_ID,
        status: "upheld",
        note: "  confirmed wrong year  ",
      })
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("UPDATE event_reports");
    expect(sql).toContain("resolution_note = COALESCE($5::text, resolution_note)");
    expect(params[0]).toBe(REPORT_ID);
    expect(params[1]).toBe("upheld");
    expect(params[2]).toBe(ADMIN_USER_ID);
    expect(params[3]).toBe(true);
    expect(params[4]).toBe("confirmed wrong year");
    expect(mockFns.revalidatePath).toHaveBeenCalledWith(
      "/admin/dashboard/reports"
    );
  });

  it("clears resolver fields for non-terminal statuses and nulls blank note", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    mockFns.getDbPool.mockReturnValue({ query });
    mockFns.requireAdmin.mockResolvedValue({ user: { id: ADMIN_USER_ID } });
    const updateEventReportStatus = await loadAction();

    await updateEventReportStatus(
      makeFormData({ reportId: REPORT_ID, status: "open", note: "   " })
    );

    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe("open");
    expect(params[3]).toBe(false);
    expect(params[4]).toBeNull();
  });
});
