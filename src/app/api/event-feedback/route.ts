import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { dbPool } from "@/server/db";
import { isUuid } from "@/core/isUuid";
import {
  validateFeedbackItem,
  type FeedbackField,
  type ValidatedFeedbackItem,
} from "@/core/eventFeedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_MAX_ITEMS = 30;
const REVIEW_QUEUE_PRIORITY = 12;

function formatError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type EventRow = {
  id: string;
  title: string;
  event_year: number;
  description: string | null;
  display_name: string | null;
  image_url: string | null;
};

function currentValueFor(field: FeedbackField, event: EventRow): string | null {
  switch (field) {
    case "title":
      return event.title;
    case "year":
      return String(event.event_year);
    case "location":
      return event.display_name;
    case "description":
      return event.description;
    case "image":
      return event.image_url;
  }
}

function equalsCurrentValue(
  item: ValidatedFeedbackItem,
  event: EventRow
): boolean {
  if (item.field === "image") return false;
  if (item.field === "year") return item.proposedYear === event.event_year;
  return item.proposedValue === currentValueFor(item.field, event);
}

// POST /api/event-feedback — store player correction claims. Player input is
// never written to events.*; current_value is captured from the DB here, and
// text claims only raise the generic review-queue priority for later review.
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
  const rawItems = payload.items;

  if (!isUuid(eventId)) {
    return formatError("eventId must be a valid UUID", 400);
  }
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 5) {
    return formatError("items must contain 1 to 5 entries", 400);
  }

  const submittedFields = rawItems
    .map((rawItem) =>
      rawItem !== null && typeof rawItem === "object" && !Array.isArray(rawItem)
        ? (rawItem as Record<string, unknown>).field
        : undefined
    )
    .filter((field): field is string => typeof field === "string");
  if (new Set(submittedFields).size !== submittedFields.length) {
    return formatError("duplicate feedback field", 400);
  }

  type ItemOutcome = {
    field: string;
    status: "accepted" | "rejected";
    reason?: string;
  };
  const outcomes: ItemOutcome[] = [];
  const candidates: { index: number; item: ValidatedFeedbackItem }[] = [];
  const seenFields = new Set<string>();
  rawItems.forEach((rawItem, index) => {
    const rawField =
      rawItem !== null &&
      typeof rawItem === "object" &&
      !Array.isArray(rawItem) &&
      typeof (rawItem as Record<string, unknown>).field === "string"
        ? ((rawItem as Record<string, unknown>).field as string)
        : "unknown";
    const validation = validateFeedbackItem(rawItem);
    if (!validation.ok) {
      outcomes[index] = {
        field: rawField,
        status: "rejected",
        reason: validation.reason,
      };
      return;
    }
    if (seenFields.has(validation.item.field)) {
      outcomes[index] = {
        field: validation.item.field,
        status: "rejected",
        reason: "duplicate_field",
      };
      return;
    }
    seenFields.add(validation.item.field);
    candidates.push({ index, item: validation.item });
  });

  if (candidates.length === 0) {
    return NextResponse.json({ error: "invalid", items: outcomes }, { status: 400 });
  }

  try {
    const eventResult = await dbPool.query<EventRow>(
      `SELECT e.id, e.title, e.event_year, e.description, l.display_name,
              (SELECT i.url
               FROM public.images i
               WHERE i.event_id = e.id
               ORDER BY i.display_order, i.created_at
               LIMIT 1) AS image_url
       FROM public.events e
       LEFT JOIN public.locations l ON l.event_id = e.id
       WHERE e.id = $1
       LIMIT 1`,
      [eventId]
    );

    const event = eventResult.rows[0];
    if (!event) {
      return formatError("Event not found", 404);
    }

    const accepted: { index: number; item: ValidatedFeedbackItem }[] = [];
    for (const candidate of candidates) {
      if (equalsCurrentValue(candidate.item, event)) {
        outcomes[candidate.index] = {
          field: candidate.item.field,
          status: "rejected",
          reason: "equal_to_current",
        };
      } else {
        accepted.push(candidate);
      }
    }
    if (accepted.length === 0) {
      return NextResponse.json({ error: "invalid", items: outcomes }, { status: 400 });
    }

    const rateResult = await dbPool.query<{ feedback_count: number }>(
      `SELECT COUNT(*)::int AS feedback_count
       FROM public.event_feedback
       WHERE reporter_id = $1
         AND updated_at >= now() - interval '24 hours'`,
      [user.id]
    );

    const recentCount = rateResult.rows[0]?.feedback_count ?? 0;
    if (recentCount + rawItems.length > RATE_LIMIT_MAX_ITEMS) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    for (const { item } of accepted) {
      const currentValue = currentValueFor(item.field, event);
      const proposedValue = item.field === "image" ? null : item.proposedValue;
      const imageReasons =
        item.field === "image" && item.imageReasons.length > 0
          ? item.imageReasons
          : null;
      await dbPool.query(
        `INSERT INTO public.event_feedback
           (event_id, reporter_id, reporter_is_anonymous, field, current_value,
            proposed_value, image_reasons, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (event_id, reporter_id, field)
           WHERE reporter_id IS NOT NULL
         DO UPDATE SET
           reporter_is_anonymous = EXCLUDED.reporter_is_anonymous,
           current_value = EXCLUDED.current_value,
           proposed_value = EXCLUDED.proposed_value,
           image_reasons = EXCLUDED.image_reasons,
           comment = EXCLUDED.comment,
           review_status = 'pending',
           review_ref = NULL,
           updated_at = now()`,
        [
          eventId,
          user.id,
          reporterIsAnonymous,
          item.field,
          currentValue,
          proposedValue,
          imageReasons,
          item.comment,
        ]
      );
    }

    if (accepted.some(({ item }) => item.field !== "image")) {
      await dbPool.query(
        `INSERT INTO public.event_review_queue (event_id, priority)
         VALUES ($1, ${REVIEW_QUEUE_PRIORITY})
         ON CONFLICT (event_id) DO UPDATE SET
           priority = GREATEST(event_review_queue.priority, ${REVIEW_QUEUE_PRIORITY}),
           done_at = NULL,
           claimed_by = CASE
             WHEN event_review_queue.done_at IS NOT NULL
               OR event_review_queue.lease_until IS NULL
               OR event_review_queue.lease_until < now()
             THEN NULL
             ELSE event_review_queue.claimed_by
           END,
           claimed_at = CASE
             WHEN event_review_queue.done_at IS NOT NULL
               OR event_review_queue.lease_until IS NULL
               OR event_review_queue.lease_until < now()
             THEN NULL
             ELSE event_review_queue.claimed_at
           END,
           lease_until = CASE
             WHEN event_review_queue.done_at IS NOT NULL
               OR event_review_queue.lease_until IS NULL
               OR event_review_queue.lease_until < now()
             THEN NULL
             ELSE event_review_queue.lease_until
           END`,
        [eventId]
      );
    }

    for (const candidate of accepted) {
      outcomes[candidate.index] = {
        field: candidate.item.field,
        status: "accepted",
      };
    }

    return NextResponse.json(
      {
        ok: true,
        items: outcomes,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "[event-feedback] Failed to save feedback:",
      error instanceof Error ? error.message : "unknown"
    );
    return formatError("Unable to save feedback", 500);
  }
}
