"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import styles from "./AuthModal.module.css";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `https://guess-history.com/auth/callback?next=/`,
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
      setError("Email and password are required");
      return;
    }

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
    }

    setLoading(true);

    let result;
    if (mode === "signin") {
      result = await supabaseBrowser.auth.signInWithPassword({ email, password });
      if (!result.error && !rememberMe) {
        // User wants session-only (no persist): remove localStorage entry after sign-in
        // so the session is cleared when the tab closes.
        // Supabase stores the session under a key prefixed with "sb-"
        const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (storageKey) {
          const raw = localStorage.getItem(storageKey);
          localStorage.removeItem(storageKey);
          // Store in sessionStorage so the tab stays authenticated until closed
          if (raw) sessionStorage.setItem(storageKey, raw);
        }
      }
    } else {
      result = await supabaseBrowser.auth.signUp({ email, password });
    }

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
    } else {
      onClose();
      window.location.reload();
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email address first, then click Forgot password.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
      redirectTo: "https://guess-history.com/auth/callback?next=/account",
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
      onClick={onClose}
    >
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className={styles.closeButton}
        >
          ×
        </button>

        <h2
          className={styles.title}
        >
          Sign in to Guess-History
        </h2>

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
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className={styles.divider}>
          <div className={styles.dividerLine}></div>
          <span className={styles.dividerText}>or</span>
          <div className={styles.dividerLine}></div>
        </div>

        <div className={styles.form}>
          <div>
            <label
              className={styles.label}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className={styles.input}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              className={styles.label}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className={styles.input}
              placeholder="••••••••"
            />
          </div>

          {mode === "signin" && (
            <>
              {forgotSent ? (
                <p className={styles.successMessage}>
                  Password reset email sent. Check your inbox.
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
                    />
                    <label
                      htmlFor="remember-me"
                      className={styles.rememberMeLabel}
                    >
                      Remember me
                    </label>
                  </div>
                  <button
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className={styles.forgotPasswordButton}
                  >
                    Forgot password?
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
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className={styles.input}
                placeholder="••••••••"
              />
            </div>
          )}

          <button
            onClick={handleEmailAuth}
            disabled={loading}
            className={styles.submitButton}
          >
            {loading ? "Processing…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>

          <p
            className={styles.switchModeText}
          >
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(null); setForgotSent(false); }}
                  disabled={loading}
                  className={styles.switchModeButton}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("signin"); setError(null); setForgotSent(false); }}
                  disabled={loading}
                  className={styles.switchModeButton}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
