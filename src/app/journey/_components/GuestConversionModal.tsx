"use client";

// Historian's Journey — guest→permanent account conversion modal
// (HJ-BUILD-GUESTGATE-INVESTPLUS-001, spec §0.5).
//
// A guest (anonymous auth.users row) plays stage 1 fully; stage 2+ requires
// converting to a permanent account first, via Supabase identity-linking so
// auth.users.id — and therefore every journey_player_progress/journey_playthroughs
// row already written under that id — is preserved with zero data migration.
//
// Two conversion paths, both preserving the same user id:
//   - Google: supabase.auth.linkIdentity() — full-page OAuth redirect; the
//     player lands back on this same page with is_anonymous now false.
//   - Email/password: supabase.auth.updateUser({ email, password }). If email
//     confirmation is enabled project-wide, is_anonymous only flips to false
//     once the confirmation link is clicked, so onConverted is not called yet.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import styles from "./GuestConversionModal.module.css";

interface GuestConversionModalProps {
  isOpen: boolean;
  stageNumber: number;
  onClose: () => void;
  onConverted: () => void;
}

export function GuestConversionModal({
  isOpen,
  stageNumber,
  onClose,
  onConverted,
}: GuestConversionModalProps) {
  const t = useTranslations("journey");
  const tAuth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  if (!isOpen) return null;

  async function handleGoogleLink() {
    setLoading(true);
    setError(null);
    const { error: linkError } = await supabaseBrowser.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    });
    if (linkError) {
      setError(linkError.message);
      setLoading(false);
    }
    // On success the browser navigates away to Google; this component unmounts.
  }

  async function handleEmailConvert() {
    setError(null);
    if (!email || !password) {
      setError(tAuth("err_email_password_required"));
      return;
    }
    if (password !== confirmPassword) {
      setError(tAuth("err_passwords_mismatch"));
      return;
    }
    if (password.length < 6) {
      setError(tAuth("err_password_min_length"));
      return;
    }
    setLoading(true);
    const { data, error: updateError } = await supabaseBrowser.auth.updateUser({
      email,
      password,
    });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (data.user && data.user.is_anonymous === false) {
      onConverted();
      return;
    }
    setConfirmationSent(true);
  }

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      data-testid="guest-conversion-modal"
    >
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
        data-testid="guest-conversion-card"
      >
        <button onClick={onClose} className={styles.closeButton}>
          ×
        </button>

        <h2 className={styles.title}>{t("guest_gate_title")}</h2>
        <p className={styles.body}>{t("guest_gate_body", { number: stageNumber })}</p>

        {error && <p className={styles.error}>{error}</p>}

        {confirmationSent ? (
          <p className={styles.successMessage}>{tAuth("confirm_email_sent")}</p>
        ) : (
          <>
            <button
              onClick={handleGoogleLink}
              disabled={loading}
              className={styles.googleButton}
              data-testid="guest-conversion-google"
            >
              {loading ? tAuth("redirecting") : `${tAuth("continue")} with Google`}
            </button>

            <div className={styles.divider}>
              <div className={styles.dividerLine} />
              <span className={styles.dividerText}>{tAuth("or")}</span>
              <div className={styles.dividerLine} />
            </div>

            <div className={styles.form}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className={styles.input}
                placeholder={tAuth("email_placeholder")}
                data-testid="guest-conversion-email"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className={styles.input}
                placeholder={tAuth("password_placeholder")}
                data-testid="guest-conversion-password"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className={styles.input}
                placeholder={tAuth("password_placeholder")}
                data-testid="guest-conversion-confirm-password"
              />
              <button
                onClick={handleEmailConvert}
                disabled={loading}
                className={styles.submitButton}
                data-testid="guest-conversion-submit"
              >
                {loading ? tAuth("loading") : tAuth("sign_up")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
