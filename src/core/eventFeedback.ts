// UX-BUILD-EVENTFEEDBACK-1128-925 — single shared owner of the player
// event-feedback contract. The client form and the API route both import this
// module; do not duplicate field names, image presets, limits, or year bounds.

export const FEEDBACK_FIELDS = [
  "title",
  "year",
  "location",
  "description",
  "image",
] as const;

export type FeedbackField = (typeof FEEDBACK_FIELDS)[number];

export type FeedbackTextField = Exclude<FeedbackField, "image">;

export const FEEDBACK_IMAGE_REASONS = [
  "anachronism",
  "wrong_place_culture",
  "wrong_people_objects",
  "does_not_match_description",
  "looks_artificial",
  "offensive_or_inappropriate",
  "other",
] as const;

export type FeedbackImageReason = (typeof FEEDBACK_IMAGE_REASONS)[number];

export const FEEDBACK_TITLE_MAX = 200;
export const FEEDBACK_LOCATION_MAX = 200;
export const FEEDBACK_DESCRIPTION_MAX = 1500;
export const FEEDBACK_COMMENT_MAX = 1000;

// CTO ruling 0e: plausibility gate only. Year 0 is valid; the reviewer decides truth.
export const FEEDBACK_YEAR_MIN = -5000;
export function feedbackYearMax(): number {
  return new Date().getUTCFullYear();
}

export type FeedbackSubmissionItem = {
  field: FeedbackField;
  proposedValue?: string;
  imageReasons?: FeedbackImageReason[];
  comment?: string;
};

export type ValidatedFeedbackItem =
  | {
      field: "title" | "location" | "description";
      proposedValue: string;
      comment: string | null;
    }
  | {
      field: "year";
      proposedValue: string;
      proposedYear: number;
      comment: string | null;
    }
  | {
      field: "image";
      imageReasons: FeedbackImageReason[];
      comment: string | null;
    };

export type FeedbackValidationFailureReason =
  | "invalid_shape"
  | "invalid_field"
  | "invalid_proposed_value"
  | "invalid_year"
  | "invalid_comment"
  | "invalid_image_reasons"
  | "image_requires_reason_or_comment";

export type FeedbackItemValidation =
  | { ok: true; item: ValidatedFeedbackItem }
  | { ok: false; reason: FeedbackValidationFailureReason };

export function isFeedbackField(value: unknown): value is FeedbackField {
  return (
    typeof value === "string" &&
    (FEEDBACK_FIELDS as readonly string[]).includes(value)
  );
}

export function isFeedbackImageReason(
  value: unknown
): value is FeedbackImageReason {
  return (
    typeof value === "string" &&
    (FEEDBACK_IMAGE_REASONS as readonly string[]).includes(value)
  );
}

/** Signed-integer parser for the editable year value; bounds included. */
export function parseFeedbackYear(value: unknown): number | null {
  let year: number;
  if (typeof value === "number") {
    year = value;
  } else if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    year = Number(value.trim());
  } else {
    return null;
  }
  if (!Number.isSafeInteger(year)) return null;
  if (year < FEEDBACK_YEAR_MIN || year > feedbackYearMax()) return null;
  return year;
}

function parseComment(value: unknown): { ok: true; comment: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, comment: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > FEEDBACK_COMMENT_MAX) return { ok: false };
  return { ok: true, comment: trimmed.length > 0 ? trimmed : null };
}

function textLimit(field: FeedbackTextField): number {
  switch (field) {
    case "title":
      return FEEDBACK_TITLE_MAX;
    case "location":
      return FEEDBACK_LOCATION_MAX;
    case "description":
      return FEEDBACK_DESCRIPTION_MAX;
    case "year":
      return 10;
  }
}

/** Validate one raw item of the POST body or one client-built submission item. */
export function validateFeedbackItem(input: unknown): FeedbackItemValidation {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid_shape" };
  }
  const raw = input as Record<string, unknown>;
  if (!isFeedbackField(raw.field)) {
    return { ok: false, reason: "invalid_field" };
  }
  const field = raw.field;
  const commentResult = parseComment(raw.comment);
  if (!commentResult.ok) return { ok: false, reason: "invalid_comment" };
  const comment = commentResult.comment;

  if (field === "image") {
    if (raw.proposedValue !== undefined && raw.proposedValue !== null) {
      return { ok: false, reason: "invalid_proposed_value" };
    }
    let imageReasons: FeedbackImageReason[] = [];
    if (raw.imageReasons !== undefined && raw.imageReasons !== null) {
      if (!Array.isArray(raw.imageReasons)) {
        return { ok: false, reason: "invalid_image_reasons" };
      }
      const seen = new Set<FeedbackImageReason>();
      for (const reason of raw.imageReasons) {
        if (!isFeedbackImageReason(reason)) {
          return { ok: false, reason: "invalid_image_reasons" };
        }
        seen.add(reason);
      }
      imageReasons = [...seen];
    }
    if (imageReasons.length === 0 && comment === null) {
      return { ok: false, reason: "image_requires_reason_or_comment" };
    }
    return { ok: true, item: { field, imageReasons, comment } };
  }

  if (raw.imageReasons !== undefined && raw.imageReasons !== null) {
    return { ok: false, reason: "invalid_image_reasons" };
  }
  if (typeof raw.proposedValue !== "string") {
    return { ok: false, reason: "invalid_proposed_value" };
  }
  const proposedValue = raw.proposedValue.trim();
  if (
    proposedValue.length === 0 ||
    proposedValue.length > textLimit(field)
  ) {
    return { ok: false, reason: "invalid_proposed_value" };
  }

  if (field === "year") {
    const proposedYear = parseFeedbackYear(proposedValue);
    if (proposedYear === null) return { ok: false, reason: "invalid_year" };
    return {
      ok: true,
      item: { field, proposedValue, proposedYear, comment },
    };
  }

  return { ok: true, item: { field, proposedValue, comment } };
}
