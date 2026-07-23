"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Desktop landing page with sign-in module
// Route: /prototype   (direct access, fully self-contained)
//
// Two-column desktop layout:
//   - Left: brand logo, tagline, hero description, feature bullets.
//   - Right: self-contained sign-in / sign-up / forgot-password card.
//
// All data and auth are MOCK. No Supabase, no real network, no i18n.
// ============================================================================

import { useState } from "react";

type AuthMode = "signin" | "signup" | "forgot";

const FEATURES = [
  {
    title: "Practice",
    desc: "Solo warm-up with custom timers and year ranges.",
    color: "#fb923c",
  },
  {
    title: "Daily Challenge",
    desc: "Same events for everyone. New challenge every 24 hours.",
    color: "#ef4444",
  },
  {
    title: "Compete",
    desc: "Real-time Rush or turn-based Relax with friends.",
    color: "#22d3ee",
  },
  {
    title: "Level Up",
    desc: "Progressive runs from level 1 to 100.",
    color: "#e879f9",
  },
];

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill={color} fillOpacity="0.18" />
      <path
        d="M6 10l3 3 5-6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

function SignInModule() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetMessages();
    setConfirmPassword("");
  };

  const handleGoogle = () => {
    resetMessages();
    setError("Google sign-in is mocked in this prototype.");
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resetMessages();

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (mode === "forgot") {
        setSuccess("Password reset email sent. Check your inbox.");
        setMode("signin");
        setPassword("");
        return;
      }
      setSuccess(mode === "signup" ? "Account created (mock). Welcome!" : "Signed in (mock). Welcome back!");
    }, 900);
  };

  const submitLabel =
    mode === "forgot" ? "Send reset email" : mode === "signup" ? "Create account" : "Sign in";

  return (
    <section className="signInCard" aria-label="Sign in module">
      <h2 className="cardTitle">
        {mode === "forgot" ? "Reset password" : mode === "signup" ? "Create account" : "Welcome back"}
      </h2>
      <p className="cardTagline">Where and when did it happen?</p>

      <button
        type="button"
        className="googleButton"
        onClick={handleGoogle}
        disabled={loading}
        aria-label="Sign in with Google"
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>

      <div className="divider" role="separator">
        <span className="dividerLine" />
        <span className="dividerText">or</span>
        <span className="dividerLine" />
      </div>

      <form onSubmit={handleSubmit} noValidate className="form">
        <div className="field">
          <label htmlFor="proto-email" className="label">
            Email
          </label>
          <input
            id="proto-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="input"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        {mode !== "forgot" && (
          <div className="field">
            <label htmlFor="proto-password" className="label">
              Password
            </label>
            <input
              id="proto-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="input"
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
        )}

        {mode === "signup" && (
          <div className="field">
            <label htmlFor="proto-confirm-password" className="label">
              Confirm password
            </label>
            <input
              id="proto-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              className="input"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        )}

        {mode === "signin" && (
          <div className="rowBetween">
            <label className="checkboxWrap">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="checkbox"
              />
              <span className="checkboxLabel">Remember me</span>
            </label>
            <button
              type="button"
              className="textLink"
              onClick={() => switchMode("forgot")}
              disabled={loading}
            >
              Forgot password?
            </button>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        {success && <p className="success" role="status">{success}</p>}

        <button type="submit" disabled={loading} className="submitButton">
          {loading ? "Loading…" : submitLabel}
        </button>
      </form>

      <p className="switchText">
        {mode === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="switchLink"
              onClick={() => switchMode("signup")}
              disabled={loading}
            >
              Sign up
            </button>
          </>
        ) : mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="switchLink"
              onClick={() => switchMode("signin")}
              disabled={loading}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            Remember your password?{" "}
            <button
              type="button"
              className="switchLink"
              onClick={() => switchMode("signin")}
              disabled={loading}
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </section>
  );
}

function FeatureItem({
  title,
  desc,
  color,
}: {
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <div className="featureItem">
      <span className="featureIcon">
        <CheckIcon color={color} />
      </span>
      <div className="featureText">
        <span className="featureTitle">{title}</span>
        <span className="featureDesc">{desc}</span>
      </div>
    </div>
  );
}

export default function LandingPrototypePage() {
  return (
    <main className="screen">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/desktop-home_background.webp"
        alt=""
        className="bgImg"
        draggable={false}
      />
      <div className="bgScrim" aria-hidden="true" />

      <div className="protoBar">
        <span className="protoTitle">Landing — Prototype</span>
        <span className="protoHint">Mock sign-in · desktop view</span>
      </div>

      <div className="content">
        <section className="hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/logo.webp"
            alt="Guess-History"
            width={240}
            height={64}
            className="heroLogo"
            draggable={false}
          />
          <h1 className="heroTitle">Where and when did it happen?</h1>
          <p className="heroDesc">
            Test your knowledge of history. See real events and guess the exact
            year and location. Challenge your friends, climb the leaderboard,
            and prove you know your history.
          </p>

          <div className="features">
            {FEATURES.map((f) => (
              <FeatureItem key={f.title} {...f} />
            ))}
          </div>
        </section>

        <SignInModule />
      </div>

      <style jsx>{`
        .screen {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-family: var(--font-dm-sans), system-ui, -apple-system,
            BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--gh-text-primary);
          background: var(--gh-bg-base);
        }

        .bgImg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
        }

        .bgScrim {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: rgba(8, 12, 20, 0.78);
        }

        .protoBar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          background: rgba(10, 10, 12, 0.6);
          backdrop-filter: blur(8px);
          flex-wrap: wrap;
        }

        .protoTitle {
          font-size: var(--font-xs);
          font-weight: 600;
          letter-spacing: 0.3px;
          opacity: 0.85;
        }

        .protoHint {
          font-size: var(--font-2xs);
          font-weight: 600;
          opacity: 0.55;
        }

        .content {
          position: relative;
          z-index: 5;
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          padding: 72px 24px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 40px;
          box-sizing: border-box;
          overflow-y: auto;
          max-height: 100vh;
        }

        .hero {
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 560px;
          text-align: center;
          align-items: center;
        }

        .heroLogo {
          width: 220px;
          height: auto;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
        }

        .heroTitle {
          font-size: var(--font-3xl);
          font-weight: 800;
          margin: 0;
          line-height: 1.15;
          letter-spacing: -0.3px;
        }

        .heroDesc {
          font-size: var(--font-base);
          color: var(--gh-text-secondary);
          line-height: 1.55;
          margin: 0;
        }

        .features {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          width: 100%;
          margin-top: 8px;
        }

        .featureItem {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.07),
            rgba(255, 255, 255, 0.03)
          );
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--gh-general-card-radius);
          backdrop-filter: var(--gh-glass-blur);
        }

        .featureIcon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .featureText {
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: left;
        }

        .featureTitle {
          font-size: var(--font-sm);
          font-weight: 700;
          color: var(--gh-text-primary);
        }

        .featureDesc {
          font-size: var(--font-xs);
          color: var(--gh-text-muted);
          line-height: 1.45;
        }

        .signInCard {
          width: 100%;
          max-width: 420px;
          padding: 32px;
          background: var(--gh-bg-surface);
          border: 1px solid var(--gh-border-default);
          border-radius: var(--gh-general-card-radius);
          box-shadow: var(--gh-general-card-shadow);
          backdrop-filter: var(--gh-glass-blur);
          box-sizing: border-box;
        }

        .cardTitle {
          font-size: var(--font-2xl);
          font-weight: 800;
          margin: 0 0 6px 0;
          text-align: center;
        }

        .cardTagline {
          font-size: var(--font-sm);
          color: var(--gh-text-muted);
          text-align: center;
          margin: 0 0 24px 0;
        }

        .googleButton {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: #ffffff;
          color: #111827;
          font-weight: 700;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          border: none;
          cursor: pointer;
          font-size: var(--font-sm);
          margin-bottom: 20px;
        }

        .googleButton:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .divider {
          display: flex;
          align-items: center;
          margin-bottom: 20px;
          gap: 12px;
        }

        .dividerLine {
          flex: 1;
          height: 1px;
          background: var(--gh-border-default);
        }

        .dividerText {
          color: var(--gh-text-muted);
          font-size: var(--font-sm);
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .label {
          font-size: var(--font-sm);
          color: var(--gh-text-muted);
          font-weight: 500;
        }

        .input {
          width: 100%;
          background: var(--gh-bg-input);
          border: 1px solid var(--gh-border-default);
          border-radius: var(--radius-md);
          padding: 12px 14px;
          color: var(--gh-text-primary);
          outline: none;
          font-size: var(--font-base);
          box-sizing: border-box;
        }

        .input::placeholder {
          color: var(--gh-text-muted);
          opacity: 0.6;
        }

        .input:disabled {
          opacity: 0.5;
        }

        .rowBetween {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .checkboxWrap {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .checkbox {
          width: 16px;
          height: 16px;
          accent-color: var(--gh-teal);
          cursor: pointer;
        }

        .checkboxLabel {
          font-size: var(--font-sm);
          color: var(--gh-text-muted);
        }

        .textLink {
          background: none;
          border: none;
          color: var(--gh-text-secondary);
          font-size: var(--font-xs);
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }

        .textLink:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error {
          color: var(--gh-danger);
          font-size: var(--font-sm);
          margin: 0;
          padding: 10px 12px;
          background: rgba(var(--gh-danger-rgb), 0.1);
          border: 1px solid rgba(var(--gh-danger-rgb), 0.25);
          border-radius: var(--radius-md);
        }

        .success {
          color: var(--gh-success);
          font-size: var(--font-sm);
          margin: 0;
          padding: 10px 12px;
          background: rgba(var(--gh-success-rgb), 0.1);
          border: 1px solid rgba(var(--gh-success-rgb), 0.25);
          border-radius: var(--radius-md);
        }

        .submitButton {
          width: 100%;
          background: var(--gh-orange);
          color: var(--gh-btn-text);
          font-weight: 700;
          padding: 14px 16px;
          border-radius: var(--radius-md);
          border: none;
          cursor: pointer;
          font-size: var(--font-sm);
          margin-top: 4px;
        }

        .submitButton:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .switchText {
          color: var(--gh-text-muted);
          font-size: var(--font-sm);
          text-align: center;
          margin: 18px 0 0 0;
        }

        .switchLink {
          background: none;
          border: none;
          color: var(--gh-text-secondary);
          cursor: pointer;
          font-size: var(--font-sm);
          padding: 0;
          text-decoration: underline;
        }

        .switchLink:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (min-width: 1024px) {
          .content {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 64px;
            padding-top: 84px;
          }

          .hero {
            flex: 1.35;
            text-align: left;
            align-items: flex-start;
            max-width: none;
          }

          .heroLogo {
            width: 260px;
          }

          .features {
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }

          .signInCard {
            flex: 1;
            max-width: 440px;
          }
        }

        @media (max-width: 480px) {
          .content {
            padding: 68px 16px 24px;
            gap: 28px;
          }

          .signInCard {
            padding: 24px;
          }

          .heroLogo {
            width: 180px;
          }

          .heroTitle {
            font-size: var(--font-2xl);
          }
        }
      `}</style>
    </main>
  );
}
