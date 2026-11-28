"use client";

// UX-BUILD-EVENTFEEDBACK-1128-925 — "Suggest a correction" claim form.
// Player edits are claims only: they are posted to /api/event-feedback for
// storage/review and never change the event directly.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useIdentity } from "@/hooks/useIdentity";
import { toProxiedImageUrl } from "@/lib/imageProxy";
import type { EventLearnResponse } from "@/core/learnTypes";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_DESCRIPTION_MAX,
  FEEDBACK_IMAGE_REASONS,
  FEEDBACK_LOCATION_MAX,
  FEEDBACK_TITLE_MAX,
  validateFeedbackItem,
  type FeedbackField,
  type FeedbackImageReason,
  type FeedbackSubmissionItem,
} from "@/core/eventFeedback";
import styles from "./ReportEventForm.module.css";

type Canonical = EventLearnResponse["canonical"];
type TextField = "title" | "year" | "location" | "description";
type FormPhase = "idle" | "sending" | "success" | "error";

type FeedbackErrorKey =
  | "learn_feedback_err_nochanges"
  | "learn_feedback_err_image_required"
  | "learn_feedback_err_invalid"
  | "learn_feedback_err_signin"
  | "learn_feedback_err_notfound"
  | "learn_feedback_err_ratelimit"
  | "learn_feedback_err_generic";

const TEXT_FIELDS: readonly TextField[] = [
  "title",
  "year",
  "location",
  "description",
];

const TEXT_LIMIT: Record<TextField, number> = {
  title: FEEDBACK_TITLE_MAX,
  year: 10,
  location: FEEDBACK_LOCATION_MAX,
  description: FEEDBACK_DESCRIPTION_MAX,
};

function canonicalText(canonical: Canonical, field: TextField): string {
  switch (field) {
    case "title":
      return canonical.title;
    case "year":
      return String(canonical.year);
    case "location":
      return canonical.locationName ?? "";
    case "description":
      return canonical.description ?? "";
  }
}

function errorKeyForStatus(status: number): FeedbackErrorKey {
  if (status === 401) return "learn_feedback_err_signin";
  if (status === 404) return "learn_feedback_err_notfound";
  if (status === 429) return "learn_feedback_err_ratelimit";
  if (status === 400) return "learn_feedback_err_invalid";
  return "learn_feedback_err_generic";
}

export function EventFeedbackForm({
  eventId,
  canonical,
}: {
  eventId: string;
  canonical: Canonical;
}) {
  const t = useTranslations("game");
  const { state: identity } = useIdentity();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<TextField, string>>(() => ({
    title: canonical.title,
    year: String(canonical.year),
    location: canonical.locationName ?? "",
    description: canonical.description ?? "",
  }));
  const [comments, setComments] = useState<Record<FeedbackField, string>>({
    title: "",
    year: "",
    location: "",
    description: "",
    image: "",
  });
  const [imageReasons, setImageReasons] = useState<FeedbackImageReason[]>([]);
  const [imageTouched, setImageTouched] = useState(false);
  const [phase, setPhase] = useState<FormPhase>("idle");
  const [errorKey, setErrorKey] = useState<FeedbackErrorKey | null>(null);

  if (identity.status !== "ready") return null;

  const collapse = () => {
    setOpen(false);
    setValues({
      title: canonical.title,
      year: String(canonical.year),
      location: canonical.locationName ?? "",
      description: canonical.description ?? "",
    });
    setComments({
      title: "",
      year: "",
      location: "",
      description: "",
      image: "",
    });
    setImageReasons([]);
    setImageTouched(false);
    setPhase("idle");
    setErrorKey(null);
  };

  const toggleImageReason = (reason: FeedbackImageReason) => {
    setImageTouched(true);
    setImageReasons((current) =>
      current.includes(reason)
        ? current.filter((r) => r !== reason)
        : [...current, reason]
    );
  };

  const buildItems = (): FeedbackSubmissionItem[] => {
    const items: FeedbackSubmissionItem[] = [];
    for (const field of TEXT_FIELDS) {
      const proposedValue = values[field].trim();
      if (proposedValue === canonicalText(canonical, field)) continue;
      const comment = comments[field].trim();
      items.push({
        field,
        proposedValue,
        ...(comment ? { comment } : {}),
      });
    }

    const imageComment = comments.image.trim();
    if (imageReasons.length > 0 || imageComment.length > 0) {
      items.push({
        field: "image",
        imageReasons,
        ...(imageComment ? { comment: imageComment } : {}),
      });
    }
    return items;
  };

  const send = async () => {
    if (phase === "sending" || phase === "success") return;
    const items = buildItems();
    if (items.length === 0) {
      setPhase("error");
      setErrorKey(
        imageTouched
          ? "learn_feedback_err_image_required"
          : "learn_feedback_err_nochanges"
      );
      return;
    }
    for (const item of items) {
      const validation = validateFeedbackItem(item);
      if (!validation.ok) {
        setPhase("error");
        setErrorKey(
          validation.reason === "image_requires_reason_or_comment"
            ? "learn_feedback_err_image_required"
            : "learn_feedback_err_invalid"
        );
        return;
      }
    }

    setPhase("sending");
    setErrorKey(null);
    try {
      const response = await fetch("/api/event-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, items }),
      });
      if (!response.ok) {
        setPhase("error");
        setErrorKey(errorKeyForStatus(response.status));
        return;
      }
      const body = (await response.json()) as { ok?: unknown };
      if (body.ok === true) {
        setPhase("success");
      } else {
        setPhase("error");
        setErrorKey("learn_feedback_err_generic");
      }
    } catch {
      setPhase("error");
      setErrorKey("learn_feedback_err_generic");
    }
  };

  if (phase === "success") {
    return (
      <div className={styles.wrap}>
        <p className={styles.success} role="status">
          {t("learn_feedback_success")}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.send}
          onClick={() => setOpen(true)}
        >
          {t("learn_feedback_open")}
        </button>
      </div>
    );
  }

  const disabled = phase === "sending";

  return (
    <div className={styles.wrap}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <p className={styles.success}>{t("learn_feedback_intro")}</p>

        {TEXT_FIELDS.map((field) => {
          const inputId = `event-feedback-${field}`;
          const commentId = `event-feedback-comment-${field}`;
          const current = canonicalText(canonical, field);
          return (
            <section key={field} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className={styles.noteLabel} htmlFor={inputId}>
                {t(`learn_feedback_${field}`)}
              </label>
              <div style={{ fontSize: "var(--font-2xs)", color: "var(--gh-modal-text-muted)" }}>
                {t("learn_feedback_current")}: {current || "—"}
              </div>
              {field === "description" ? (
                <textarea
                  id={inputId}
                  className={styles.note}
                  rows={4}
                  maxLength={TEXT_LIMIT[field]}
                  value={values[field]}
                  disabled={disabled}
                  onChange={(e) =>
                    setValues((currentValues) => ({
                      ...currentValues,
                      [field]: e.target.value,
                    }))
                  }
                />
              ) : (
                <input
                  id={inputId}
                  className={styles.note}
                  type="text"
                  inputMode={field === "year" ? "numeric" : undefined}
                  maxLength={TEXT_LIMIT[field]}
                  value={values[field]}
                  disabled={disabled}
                  onChange={(e) =>
                    setValues((currentValues) => ({
                      ...currentValues,
                      [field]: e.target.value,
                    }))
                  }
                />
              )}
              {field === "year" ? (
                <div style={{ fontSize: "var(--font-2xs)", color: "var(--gh-modal-text-muted)" }}>
                  {t("learn_feedback_year_hint")}
                </div>
              ) : null}
              <label className={styles.noteLabel} htmlFor={commentId}>
                {t("learn_feedback_comment")}
              </label>
              <input
                id={commentId}
                className={styles.note}
                type="text"
                maxLength={FEEDBACK_COMMENT_MAX}
                value={comments[field]}
                disabled={disabled}
                onChange={(e) =>
                  setComments((currentComments) => ({
                    ...currentComments,
                    [field]: e.target.value,
                  }))
                }
              />
            </section>
          );
        })}

        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className={styles.legend}>{t("learn_feedback_image")}</div>
          {canonical.imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={toProxiedImageUrl(canonical.imageUrl) ?? ''}
                alt={canonical.title}
                style={{ width: "100%", borderRadius: 10, display: "block" }}
              />
            </>
          ) : null}
          <fieldset className={styles.reasons} disabled={disabled}>
            <legend className={styles.legend}>{t("learn_feedback_image_problem")}</legend>
            {FEEDBACK_IMAGE_REASONS.map((reason) => {
              const selected = imageReasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  className={styles.cancel}
                  aria-pressed={selected}
                  onClick={() => toggleImageReason(reason)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    marginTop: 4,
                    borderColor: selected ? "var(--gh-primary)" : undefined,
                  }}
                >
                  {t(`learn_feedback_image_reason_${reason}`)}
                </button>
              );
            })}
          </fieldset>
          <label className={styles.noteLabel} htmlFor="event-feedback-comment-image">
            {t("learn_feedback_comment")}
          </label>
          <textarea
            id="event-feedback-comment-image"
            className={styles.note}
            rows={2}
            maxLength={FEEDBACK_COMMENT_MAX}
            value={comments.image}
            disabled={disabled}
            onChange={(e) => {
              setImageTouched(true);
              setComments((currentComments) => ({
                ...currentComments,
                image: e.target.value,
              }));
            }}
          />
        </section>

        {phase === "error" && errorKey ? (
          <p className={styles.error} role="alert">
            {t(errorKey)}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button type="submit" className={styles.send} disabled={disabled}>
            {phase === "sending"
              ? t("learn_feedback_sending")
              : t("learn_feedback_submit")}
          </button>
          <button
            type="button"
            className={styles.cancel}
            onClick={collapse}
            disabled={disabled}
          >
            {t("learn_feedback_cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
