// EVT-BUILD-REPORTFORM-1118-608 — pure helpers for the "report a problem"
// form in EventLearnModal. Mirrors the POST /api/event-reports contract
// (src/app/api/event-reports/route.ts): JSON body {eventId, reason,
// details?}; reason must be one of REPORT_REASONS; details is optional,
// trimmed, at most REPORT_DETAILS_MAX chars. No user id is ever sent — the
// route derives reporter_id from the Supabase session.

export const REPORT_REASONS = [
  "wrong_year",
  "wrong_location",
  "not_real_event",
  "misleading_image",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_DETAILS_MAX = 1000;

export type EventReportPayload = {
  eventId: string;
  reason: ReportReason;
  details: string | null;
};

export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  );
}

export function isValidReportDetails(details: string): boolean {
  return details.trim().length <= REPORT_DETAILS_MAX;
}

export function buildEventReportPayload(
  eventId: string,
  reason: ReportReason,
  details: string
): EventReportPayload {
  const trimmed = details.trim();
  return {
    eventId,
    reason,
    details: trimmed.length > 0 ? trimmed : null,
  };
}

export type ReportErrorKind =
  | "unauthorized" // 401 — no Supabase session
  | "invalid" // 400 — failed route validation
  | "not_found" // 404 — unknown event id
  | "rate_limited" // 429 — over the per-day report cap
  | "server" // 5xx / unexpected success body
  | "network"; // fetch itself failed

export type EventReportResult =
  | { ok: true; deduped: boolean }
  | { ok: false; error: ReportErrorKind };

export function classifyReportStatus(status: number): ReportErrorKind | null {
  if (status === 200 || status === 201) return null;
  if (status === 401) return "unauthorized";
  if (status === 400) return "invalid";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "server";
}

export function reportErrorMessageKey(kind: ReportErrorKind): string {
  switch (kind) {
    case "unauthorized":
      return "learn_report_err_signin";
    case "invalid":
      return "learn_report_err_invalid";
    case "not_found":
      return "learn_report_err_notfound";
    case "rate_limited":
      return "learn_report_err_ratelimit";
    default:
      return "learn_report_err_generic";
  }
}

export async function submitEventReport(
  eventId: string,
  reason: ReportReason,
  details: string,
  fetchImpl: typeof fetch = fetch
): Promise<EventReportResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/event-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEventReportPayload(eventId, reason, details)),
    });
  } catch {
    return { ok: false, error: "network" };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: classifyReportStatus(res.status) ?? "server",
    };
  }

  try {
    const body = (await res.json()) as { ok?: unknown; deduped?: unknown };
    if (body && body.ok === true) {
      return { ok: true, deduped: body.deduped === true };
    }
    return { ok: false, error: "server" };
  } catch {
    return { ok: false, error: "server" };
  }
}
