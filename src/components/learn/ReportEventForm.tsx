"use client";

// EVT-BUILD-REPORTFORM-1118-608 — "report a problem" inline form at the
// bottom of EventLearnModal. Posts to /api/event-reports (contract in
// src/app/api/event-reports/route.ts). The route accepts guests (anonymous
// Supabase users set reporter_is_anonymous) and rejects only callers with
// no session (401), so the widget renders for every identity "ready" state
// — anonymous included — and stays hidden while identity is loading,
// unauthenticated, or errored.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useIdentity } from "@/hooks/useIdentity";
import {
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  isValidReportDetails,
  reportErrorMessageKey,
  submitEventReport,
  type ReportReason,
} from "./reportEvent";
import styles from "./ReportEventForm.module.css";

type FormPhase = "idle" | "sending" | "success" | "error";

export function ReportEventForm({ eventId }: { eventId: string }) {
  const t = useTranslations("game");
  const { state: identity } = useIdentity();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [phase, setPhase] = useState<FormPhase>("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (identity.status !== "ready") return null;

  const collapse = () => {
    setOpen(false);
    setReason(null);
    setDetails("");
    setPhase("idle");
    setErrorKey(null);
  };

  const send = async () => {
    if (!reason || phase === "sending" || phase === "success") return;
    if (!isValidReportDetails(details)) {
      setPhase("error");
      setErrorKey("learn_report_err_invalid");
      return;
    }
    setPhase("sending");
    setErrorKey(null);
    const result = await submitEventReport(eventId, reason, details);
    if (result.ok) {
      setPhase("success");
    } else {
      setPhase("error");
      setErrorKey(reportErrorMessageKey(result.error));
    }
  };

  if (phase === "success") {
    return (
      <div className={styles.wrap}>
        <p className={styles.success} role="status">
          {t("learn_report_success")}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpen(true)}
        >
          {t("learn_report_open")}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <fieldset className={styles.reasons} disabled={phase === "sending"}>
          <legend className={styles.legend}>{t("learn_report_what")}</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className={styles.reason}>
              <input
                type="radio"
                name="learn-report-reason"
                className={styles.radio}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              <span>{t(`learn_report_reason_${r}`)}</span>
            </label>
          ))}
        </fieldset>

        <label className={styles.noteLabel} htmlFor="learn-report-note">
          {t("learn_report_note")}
        </label>
        <textarea
          id="learn-report-note"
          className={styles.note}
          rows={3}
          maxLength={REPORT_DETAILS_MAX}
          value={details}
          disabled={phase === "sending"}
          onChange={(e) => setDetails(e.target.value)}
        />
        <div className={styles.metaRow}>
          <span className={styles.counter} aria-live="polite">
            {details.length}/{REPORT_DETAILS_MAX}
          </span>
        </div>

        {phase === "error" && errorKey ? (
          <p className={styles.error} role="alert">
            {t(errorKey)}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.send}
            disabled={!reason || phase === "sending"}
          >
            {phase === "sending"
              ? t("learn_report_sending")
              : t("learn_report_send")}
          </button>
          <button
            type="button"
            className={styles.cancel}
            onClick={collapse}
            disabled={phase === "sending"}
          >
            {t("learn_report_cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
