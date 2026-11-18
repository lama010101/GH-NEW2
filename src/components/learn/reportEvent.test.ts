import { describe, it, expect, vi } from "vitest";
import {
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  buildEventReportPayload,
  classifyReportStatus,
  isReportReason,
  isValidReportDetails,
  reportErrorMessageKey,
  submitEventReport,
} from "./reportEvent";

// EVT-BUILD-REPORTFORM-1118-608 — the helpers must mirror the
// POST /api/event-reports contract exactly: body {eventId, reason,
// details?}, reason enum, details trimmed <= 1000 chars, and the error
// classes the route returns (400/401/404/429/500 + network failure).

const EVENT_ID = "22222222-2222-4222-8222-222222222222";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("reportEvent helpers — route contract", () => {
  it("REPORT_REASONS matches the route enum exactly", () => {
    expect([...REPORT_REASONS]).toEqual([
      "wrong_year",
      "wrong_location",
      "not_real_event",
      "misleading_image",
      "other",
    ]);
  });

  it("isReportReason accepts every allowed value and rejects others", () => {
    for (const r of REPORT_REASONS) {
      expect(isReportReason(r)).toBe(true);
    }
    expect(isReportReason("WRONG_YEAR")).toBe(false);
    expect(isReportReason("")).toBe(false);
    expect(isReportReason(null)).toBe(false);
    expect(isReportReason(42)).toBe(false);
    expect(isReportReason(undefined)).toBe(false);
  });

  it("isValidReportDetails enforces the 1000-char route cap after trim", () => {
    expect(isValidReportDetails("")).toBe(true);
    expect(isValidReportDetails("x".repeat(1000))).toBe(true);
    expect(isValidReportDetails("x".repeat(1001))).toBe(false);
    expect(
      isValidReportDetails("  " + "x".repeat(1000) + "  ")
    ).toBe(true);
    expect(isValidReportDetails("x".repeat(REPORT_DETAILS_MAX + 1))).toBe(
      false
    );
  });

  it("buildEventReportPayload trims details and sends null when empty", () => {
    expect(
      buildEventReportPayload(EVENT_ID, "wrong_year", "  hello  ")
    ).toEqual({ eventId: EVENT_ID, reason: "wrong_year", details: "hello" });
    expect(
      buildEventReportPayload(EVENT_ID, "other", "   ")
    ).toEqual({ eventId: EVENT_ID, reason: "other", details: null });
    expect(
      buildEventReportPayload(EVENT_ID, "other", "")
    ).toEqual({ eventId: EVENT_ID, reason: "other", details: null });
  });

  it("classifyReportStatus maps every route status to an error class", () => {
    expect(classifyReportStatus(200)).toBeNull();
    expect(classifyReportStatus(201)).toBeNull();
    expect(classifyReportStatus(400)).toBe("invalid");
    expect(classifyReportStatus(401)).toBe("unauthorized");
    expect(classifyReportStatus(404)).toBe("not_found");
    expect(classifyReportStatus(429)).toBe("rate_limited");
    expect(classifyReportStatus(500)).toBe("server");
    expect(classifyReportStatus(503)).toBe("server");
    expect(classifyReportStatus(418)).toBe("server");
  });

  it("reportErrorMessageKey maps kinds to learn_report_err_* keys", () => {
    expect(reportErrorMessageKey("unauthorized")).toBe(
      "learn_report_err_signin"
    );
    expect(reportErrorMessageKey("invalid")).toBe("learn_report_err_invalid");
    expect(reportErrorMessageKey("not_found")).toBe(
      "learn_report_err_notfound"
    );
    expect(reportErrorMessageKey("rate_limited")).toBe(
      "learn_report_err_ratelimit"
    );
    expect(reportErrorMessageKey("server")).toBe("learn_report_err_generic");
    expect(reportErrorMessageKey("network")).toBe("learn_report_err_generic");
  });
});

describe("submitEventReport", () => {
  it("POSTs the contract body to /api/event-reports and returns ok on 201", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(201, { ok: true, id: "33333333-3333-4333-8333-333333333333" })
    );
    const result = await submitEventReport(
      EVENT_ID,
      "wrong_location",
      "  near the wrong town  ",
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: true, deduped: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/event-reports");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      eventId: EVENT_ID,
      reason: "wrong_location",
      details: "near the wrong town",
    });
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("reporter_id");
    expect(body).not.toHaveProperty("user_id");
  });

  it("treats 200 {ok:true,deduped:true} as success", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true, deduped: true }));
    const result = await submitEventReport(
      EVENT_ID,
      "other",
      "",
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: true, deduped: true });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      eventId: EVENT_ID,
      reason: "other",
      details: null,
    });
  });

  it("maps route error statuses to error classes", async () => {
    const cases: [number, string][] = [
      [400, "invalid"],
      [401, "unauthorized"],
      [404, "not_found"],
      [429, "rate_limited"],
      [500, "server"],
    ];
    for (const [status, kind] of cases) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(status, { error: "x" }));
      const result = await submitEventReport(
        EVENT_ID,
        "other",
        "",
        fetchImpl as unknown as typeof fetch
      );
      expect(result).toEqual({ ok: false, error: kind });
    }
  });

  it("returns server error when a 2xx body lacks ok:true", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: false }));
    const result = await submitEventReport(
      EVENT_ID,
      "other",
      "",
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: false, error: "server" });
  });

  it("returns network error when fetch rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await submitEventReport(
      EVENT_ID,
      "other",
      "",
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: false, error: "network" });
  });
});
