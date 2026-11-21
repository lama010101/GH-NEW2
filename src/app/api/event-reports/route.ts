import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { dbPool } from "@/server/db";
import { isUuid } from "@/core/isUuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_REASONS = [
  "wrong_year",
  "wrong_location",
  "not_real_event",
  "misleading_image",
  "other",
] as const;

const RATE_LIMIT_MAX_REPORTS = 10;

function formatError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type EventRow = {
  id: string;
  title: string;
  event_year: number | null;
  status: string | null;
  retired_at: string | null;
};

// POST /api/event-reports — file a problem report against an event.
// Guests (anonymous Supabase users) are allowed; reporter_is_anonymous is
// set from the same is_anonymous flag the guest gate reads. Reports never
// auto-retire an event — they queue for admin triage.
export async function POST(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return formatError("Unauthorized", 401);
  }

  const reporterIsAnonymous = user.is_anonymous === true;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return formatError("Invalid JSON body", 400);
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const eventId = payload.eventId;
  const reason = payload.reason;
  const details = payload.details;

  if (!isUuid(eventId)) {
    return formatError("eventId must be a valid UUID", 400);
  }

  if (
    typeof reason !== "string" ||
    !(REPORT_REASONS as readonly string[]).includes(reason)
  ) {
    return formatError(
      "reason must be one of: wrong_year, wrong_location, not_real_event, misleading_image, other",
      400
    );
  }

  let detailsText: string | null = null;
  if (details !== undefined && details !== null) {
    if (typeof details !== "string") {
      return formatError("details must be a string", 400);
    }
    const trimmed = details.trim();
    if (trimmed.length > 1000) {
      return formatError("details must be at most 1000 characters", 400);
    }
    detailsText = trimmed.length > 0 ? trimmed : null;
  }

  try {
    const eventResult = await dbPool.query<EventRow>(
      `SELECT id, title, event_year, status, retired_at
       FROM public.events
       WHERE id = $1`,
      [eventId]
    );

    const event = eventResult.rows[0];
    if (!event) {
      return formatError("Event not found", 404);
    }

    const rateResult = await dbPool.query<{ report_count: number }>(
      `SELECT COUNT(*)::int AS report_count
       FROM public.event_reports
       WHERE reporter_id = $1
         AND created_at >= now() - interval '24 hours'`,
      [user.id]
    );

    if ((rateResult.rows[0]?.report_count ?? 0) >= RATE_LIMIT_MAX_REPORTS) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const eventSnapshot = {
      title: event.title,
      event_year: event.event_year,
      status: event.status,
      retired_at: event.retired_at,
    };

    const insertResult = await dbPool.query<{ id: string }>(
      `INSERT INTO public.event_reports
         (event_id, reporter_id, reporter_is_anonymous, reason, details, event_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id, reporter_id, reason)
         WHERE status = 'open' AND reporter_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        eventId,
        user.id,
        reporterIsAnonymous,
        reason,
        detailsText,
        JSON.stringify(eventSnapshot),
      ]
    );

    const inserted = insertResult.rows[0];
    if (!inserted) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    return NextResponse.json({ ok: true, id: inserted.id }, { status: 201 });
  } catch (error) {
    console.error("[event-reports] Failed to save report:", error);
    return formatError("Unable to save report", 500);
  }
}
