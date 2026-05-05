"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/core/supabaseBrowser";

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

  if (!isOpen) return null;

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
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
    } else {
      result = await supabaseBrowser.auth.signUp({ email, password });
    }

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
    } else {
      onClose();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          background: "#1a1a2e",
          borderRadius: 12,
          padding: 32,
          width: "100%",
          maxWidth: 400,
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            color: "#9ca3af",
            fontSize: 24,
            cursor: "pointer",
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#fff",
            marginBottom: 8,
            marginTop: 0,
          }}
        >
          Sign in to Guess-History
        </h2>

        {error && (
          <p
            style={{
              color: "#f87171",
              fontSize: 14,
              marginBottom: 16,
              background: "#450a0a",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              padding: "8px 16px",
            }}
          >
            {error}
          </p>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "#fff",
            color: "#111827",
            fontWeight: 600,
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
            marginBottom: 24,
            fontSize: 15,
          }}
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

        <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
          <div style={{ flex: 1, borderTop: "1px solid #374151" }}></div>
          <span style={{ padding: "0 16px", color: "#6b7280", fontSize: 14 }}>or</span>
          <div style={{ flex: 1, borderTop: "1px solid #374151" }}></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              style={{
                display: "block",
                color: "#9ca3af",
                fontSize: 14,
                marginBottom: 8,
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={{
                width: "100%",
                background: "#1f2937",
                border: "1px solid #374151",
                borderRadius: 8,
                padding: "12px 16px",
                color: "#fff",
                outline: "none",
                fontSize: 15,
                boxSizing: "border-box",
                opacity: loading ? 0.5 : 1,
              }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                color: "#9ca3af",
                fontSize: 14,
                marginBottom: 8,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={{
                width: "100%",
                background: "#1f2937",
                border: "1px solid #374151",
                borderRadius: 8,
                padding: "12px 16px",
                color: "#fff",
                outline: "none",
                fontSize: 15,
                boxSizing: "border-box",
                opacity: loading ? 0.5 : 1,
              }}
              placeholder="••••••••"
            />
          </div>

          {mode === "signup" && (
            <div>
              <label
                style={{
                  display: "block",
                  color: "#9ca3af",
                  fontSize: 14,
                  marginBottom: 8,
                }}
              >
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  background: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: 8,
                  padding: "12px 16px",
                  color: "#fff",
                  outline: "none",
                  fontSize: 15,
                  boxSizing: "border-box",
                  opacity: loading ? 0.5 : 1,
                }}
                placeholder="••••••••"
              />
            </div>
          )}

          <button
            onClick={handleEmailAuth}
            disabled={loading}
            style={{
              width: "100%",
              background: "#7c3aed",
              color: "#fff",
              fontWeight: 600,
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              fontSize: 15,
            }}
          >
            {loading ? "Processing…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>

          <p
            style={{
              color: "#6b7280",
              fontSize: 14,
              textAlign: "center",
              margin: 0,
            }}
          >
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(null); }}
                  disabled={loading}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#a78bfa",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("signin"); setError(null); }}
                  disabled={loading}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#a78bfa",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 0,
                    textDecoration: "underline",
                  }}
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
