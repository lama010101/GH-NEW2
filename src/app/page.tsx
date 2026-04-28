"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Playfair_Display, DM_Sans } from "next/font/google";
import { supabaseBrowser } from "@/core/supabaseBrowser";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  display: "swap",
  variable: "--font-playfair"
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-dm-sans"
});

type Tab = "signin" | "signup";

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/compete");
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error } = await supabaseBrowser.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/compete");
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
  }

  return (
    <main className={`landing ${playfair.variable} ${dmSans.variable}`}>
      <div className="bg-map" aria-hidden="true" />
      <div className="bg-grain" aria-hidden="true" />

      <div className="content">
        <section className="hero">
          <div className="compass" aria-hidden="true">
            <svg viewBox="0 0 200 200" width="100%" height="100%">
              <defs>
                <radialGradient id="compassGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.15" />
                  <stop offset="70%" stopColor="#f97316" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="100" cy="100" r="95" fill="url(#compassGlow)" />
              <circle cx="100" cy="100" r="90" fill="none" stroke="#f97316" strokeOpacity="0.5" strokeWidth="1" />
              <circle cx="100" cy="100" r="78" fill="none" stroke="#f97316" strokeOpacity="0.3" strokeWidth="0.5" />
              <circle cx="100" cy="100" r="60" fill="none" stroke="#f97316" strokeOpacity="0.4" strokeWidth="0.5" />
              <g stroke="#f97316" strokeOpacity="0.35" strokeWidth="0.5">
                {Array.from({ length: 16 }).map((_, i) => {
                  const a = (i * Math.PI) / 8;
                  const x1 = 100 + Math.cos(a) * 60;
                  const y1 = 100 + Math.sin(a) * 60;
                  const x2 = 100 + Math.cos(a) * 90;
                  const y2 = 100 + Math.sin(a) * 90;
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
                })}
              </g>
              <polygon points="100,15 108,100 100,90 92,100" fill="#f97316" />
              <polygon points="100,185 108,100 100,110 92,100" fill="#f97316" fillOpacity="0.45" />
              <polygon points="15,100 100,92 90,100 100,108" fill="#f97316" fillOpacity="0.6" />
              <polygon points="185,100 100,92 110,100 100,108" fill="#f97316" fillOpacity="0.6" />
              <circle cx="100" cy="100" r="5" fill="#0a0905" stroke="#f97316" strokeWidth="1.5" />
              <text x="100" y="10" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#f97316" fontWeight="700">N</text>
              <text x="100" y="198" textAnchor="middle" fontFamily="serif" fontSize="10" fill="#f97316" fillOpacity="0.6" fontWeight="700">S</text>
              <text x="6" y="104" textAnchor="start" fontFamily="serif" fontSize="10" fill="#f97316" fillOpacity="0.7" fontWeight="700">W</text>
              <text x="194" y="104" textAnchor="end" fontFamily="serif" fontSize="10" fill="#f97316" fillOpacity="0.7" fontWeight="700">E</text>
            </svg>
          </div>

          <h1 className="title reveal" style={{ animationDelay: "120ms" }}>GUESS HISTORY</h1>
          <p className="tagline reveal" style={{ animationDelay: "260ms" }}>How well do you know the past?</p>

          <ul className="bullets">
            <li className="reveal" style={{ animationDelay: "380ms" }}>
              <span className="dot" /> Pinpoint locations on a world map
            </li>
            <li className="reveal" style={{ animationDelay: "460ms" }}>
              <span className="dot" /> Guess the year of historical events
            </li>
            <li className="reveal" style={{ animationDelay: "540ms" }}>
              <span className="dot" /> Compete with players in real time
            </li>
          </ul>
        </section>

        <section className="auth-card reveal" style={{ animationDelay: "740ms" }}>
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "signin"}
              className={`tab ${tab === "signin" ? "active" : ""}`}
              onClick={() => switchTab("signin")}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "signup"}
              className={`tab ${tab === "signup" ? "active" : ""}`}
              onClick={() => switchTab("signup")}
            >
              Sign Up
            </button>
          </div>

          {tab === "signin" ? (
            <form onSubmit={handleSignIn} className="form">
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <div className="error" role="alert">{error}</div>}
              <button type="submit" className="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="form">
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Confirm Password</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              {error && <div className="error" role="alert">{error}</div>}
              <button type="submit" className="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Account"}
              </button>
            </form>
          )}
        </section>
      </div>

      <style jsx>{`
        .landing {
          position: relative;
          min-height: 100vh;
          width: 100%;
          background: #0a0905;
          color: #ece6d8;
          font-family: var(--font-dm-sans), system-ui, sans-serif;
          overflow: hidden;
        }
        .bg-map {
          position: absolute;
          inset: 0;
          opacity: 0.04;
          background-image:
            repeating-linear-gradient(0deg, #f97316 0 1px, transparent 1px 60px),
            repeating-linear-gradient(90deg, #f97316 0 1px, transparent 1px 60px),
            radial-gradient(ellipse at 30% 40%, rgba(249,115,22,0.25) 0%, transparent 40%),
            radial-gradient(ellipse at 70% 65%, rgba(249,115,22,0.18) 0%, transparent 45%);
          pointer-events: none;
        }
        .bg-grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.06;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95  0 0 0 0 0.9  0 0 0 0 0.7  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }
        .content {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          gap: 64px;
          padding: 48px 72px;
          max-width: 1280px;
          margin: 0 auto;
        }
        .hero {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        .compass {
          width: 200px;
          height: 200px;
          margin-bottom: 28px;
          opacity: 0;
          animation: reveal 700ms ease-out forwards;
          animation-delay: 0ms;
        }
        .title {
          font-family: var(--font-playfair), Georgia, serif;
          font-weight: 900;
          font-size: clamp(40px, 6vw, 84px);
          letter-spacing: 0.12em;
          line-height: 0.95;
          margin: 0 0 14px 0;
          color: #f5ecd6;
          text-shadow: 0 2px 30px rgba(249,115,22,0.18);
        }
        .tagline {
          font-family: var(--font-playfair), Georgia, serif;
          font-style: italic;
          font-size: clamp(16px, 1.4vw, 20px);
          color: #c8bfa8;
          margin: 0 0 32px 0;
        }
        .bullets {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .bullets li {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #d6cdb6;
          font-size: 15px;
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #f97316;
          box-shadow: 0 0 10px rgba(249,115,22,0.6);
          flex-shrink: 0;
        }
        .auth-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-radius: 14px;
          padding: 36px 32px;
          width: 100%;
          max-width: 440px;
          justify-self: center;
          box-shadow: 0 30px 80px rgba(0,0,0,0.5);
        }
        .tabs {
          display: flex;
          gap: 24px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 24px;
        }
        .tab {
          background: transparent;
          border: 0;
          color: #8c8676;
          font-family: inherit;
          font-size: 15px;
          font-weight: 500;
          padding: 10px 2px 12px;
          cursor: pointer;
          position: relative;
          transition: color 160ms ease;
        }
        .tab:hover { color: #d6cdb6; }
        .tab.active {
          color: #f5ecd6;
        }
        .tab.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 2px;
          background: #f97316;
          border-radius: 2px;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field span {
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #9a9281;
        }
        .field input {
          background: #1a1a14;
          border: 1px solid #333;
          color: #f5ecd6;
          font-family: inherit;
          font-size: 15px;
          padding: 11px 14px;
          border-radius: 8px;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .field input:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.18);
        }
        .submit {
          margin-top: 6px;
          background: #f97316;
          color: #0a0905;
          border: 0;
          font-family: inherit;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.04em;
          padding: 13px 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: filter 160ms ease, transform 160ms ease;
          width: 100%;
        }
        .submit:hover:not(:disabled) { filter: brightness(1.08); }
        .submit:active:not(:disabled) { transform: translateY(1px); }
        .submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .error {
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.35);
          color: #fecaca;
          font-size: 13px;
          padding: 10px 12px;
          border-radius: 8px;
        }
        .reveal {
          opacity: 0;
          transform: translateY(20px);
          animation: reveal 600ms ease-out forwards;
        }
        @keyframes reveal {
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .content {
            grid-template-columns: 1fr;
            padding: 40px 16px;
            gap: 32px;
            text-align: center;
          }
          .hero { align-items: center; }
          .compass { width: 120px; height: 120px; }
          .bullets li { justify-content: flex-start; text-align: left; }
          .auth-card { padding: 28px 20px; }
        }
      `}</style>
    </main>
  );
}
