"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useTranslations } from 'next-intl';
import { supabaseBrowser } from "@/core/supabaseBrowser";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { defaultLocale } from "@/i18n/config";
import styles from "./AuthModal.module.css";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  required?: boolean;
}

export function AuthModal({ isOpen, onClose, required }: AuthModalProps) {
  const t = useTranslations('auth');
  const tLanding = useTranslations('landing');
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotSent, setForgotSent] = useState(false);
  const [signUpSent, setSignUpSent] = useState(false);
  const signInSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setError(null);
      setSignUpSent(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      signInSubscriptionRef.current?.unsubscribe();
      signInSubscriptionRef.current = null;
    };
  }, []);

  if (!isOpen) return null;

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    const next = searchParams.get("next") || "/home";
    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success: browser redirects to Google. Loading stays true intentionally
    // until the redirect happens. The overlay click handler (onClose) and the
    // useEffect below in page.tsx will recover if the user returns without completing.
  }

  async function handleEmailAuth() {
    setError(null);

    if (!email || !password) {
      setError(t('err_email_password_required'));
      return;
    }

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError(t('err_passwords_mismatch'));
        return;
      }
      if (password.length < 6) {
        setError(t('err_password_min_length'));
        return;
      }
    }

    setLoading(true);

    signInSubscriptionRef.current?.unsubscribe();
    signInSubscriptionRef.current = null;

    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        subscription.unsubscribe();
        signInSubscriptionRef.current = null;
        onClose();
      }
    });
    signInSubscriptionRef.current = subscription;

    let result;
    if (mode === "signin") {
      result = await supabaseBrowser.auth.signInWithPassword({ email, password });
    } else {
      const next = searchParams.get("next") || "/home";
      result = await supabaseBrowser.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
    }

    if (result.error) {
      subscription.unsubscribe();
      signInSubscriptionRef.current = null;
      setLoading(false);
      setError(result.error.message);
      return;
    }

    // signUp returns a session when email confirmation is disabled — close
    // the modal immediately. The onAuthStateChange subscription above also
    // handles SIGNED_IN, but it may not fire reliably for signUp.
    if (mode === "signup" && result.data.session) {
      subscription.unsubscribe();
      signInSubscriptionRef.current = null;
      onClose();
      return;
    }

    // signUp with no session means email confirmation is enabled — tell the
    // user to check their inbox instead of leaving the modal with no feedback.
    if (mode === "signup" && !result.data.session) {
      subscription.unsubscribe();
      signInSubscriptionRef.current = null;
      setLoading(false);
      setSignUpSent(true);
      return;
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError(t('err_enter_email_first'));
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/account`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setForgotSent(true);
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={required ? undefined : onClose}
      data-testid="auth-modal"
    >
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
        data-testid="auth-modal-card"
      >
        {!required && (
          <button
            onClick={onClose}
            className={styles.closeButton}
          >
            ×
          </button>
        )}

        <div className={styles.langSwitcherWrap}>
          <LanguageSwitcher initialLocale={defaultLocale} />
        </div>

        <h2 className={styles.title}>
          {t('welcome')}
        </h2>

        <div className={styles.logoWrap}>
          <Image
            src="/icons/logo.webp"
            alt={tLanding('logo_alt')}
            width={180}
            height={48}
            priority
            className={styles.logoImg}
          />
        </div>

        <p className={styles.tagline}>
          {tLanding('tagline')}
        </p>

        {error && (
          <p
            className={styles.error}
          >
            {error}
          </p>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className={styles.googleButton}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          {loading ? t('redirecting') : t('continue') + " with Google"}
        </button>

        <div className={styles.divider}>
          <div className={styles.dividerLine}></div>
          <span className={styles.dividerText}>{t('or')}</span>
          <div className={styles.dividerLine}></div>
        </div>

        <div className={styles.form}>
          <div>
            <label
              className={styles.label}
            >
              {t('email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className={styles.input}
              placeholder={t('email_placeholder')}
              data-testid="auth-email-input"
            />
          </div>

          <div>
            <label
              className={styles.label}
            >
              {t('password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className={styles.input}
              placeholder={t('password_placeholder')}
              data-testid="auth-password-input"
            />
          </div>

          {mode === "signin" && (
            <>
              {forgotSent ? (
                <p className={styles.successMessage}>
                  {t('reset_email_sent')}
                </p>
              ) : (
                <>
                  <div className={styles.rememberMeContainer}>
                    <input
                      type="checkbox"
                      id="remember-me"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={loading}
                      className={styles.rememberMeCheckbox}
                    />
                    <label
                      htmlFor="remember-me"
                      className={styles.rememberMeLabel}
                    >
                      {t('remember_me')}
                    </label>
                  </div>
                  <button
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className={styles.forgotPasswordButton}
                  >
                    {t('forgot_password')}
                  </button>
                </>
              )}
            </>
          )}

          {mode === "signup" && (
            <div>
              <label
                className={styles.label}
              >
                {t('confirm_password')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className={styles.input}
                placeholder={t('password_placeholder')}
              />
            </div>
          )}

          <button
            onClick={handleEmailAuth}
            disabled={loading}
            className={styles.submitButton}
            data-testid="auth-submit-btn"
          >
            {loading ? t('loading') : mode === "signin" ? t('sign_in') : t('sign_up')}
          </button>

          {signUpSent && (
            <p className={styles.successMessage}>
              {t('confirm_email_sent')}
            </p>
          )}

          <p
            className={styles.switchModeText}
          >
            {mode === "signin" ? (
              <>
                {t('no_account')}{" "}
                <button
                  onClick={() => { setMode("signup"); setError(null); setForgotSent(false); setSignUpSent(false); }}
                  disabled={loading}
                  className={styles.switchModeButton}
                >
                  {t('sign_up')}
                </button>
              </>
            ) : (
              <>
                {t('have_account')}{" "}
                <button
                  onClick={() => { setMode("signin"); setError(null); setForgotSent(false); setSignUpSent(false); }}
                  disabled={loading}
                  className={styles.switchModeButton}
                >
                  {t('sign_in')}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
