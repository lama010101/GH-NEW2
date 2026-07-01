"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Submit button CTA animation alternatives
// Route: /prototype/submit-animations   (direct access, self-contained)
//
// Goal: call the user to action AFTER they have made their WHERE + WHEN
// guesses. The button is therefore shown in its "ready" (orange) state.
//
// Shows 4 ALTERNATIVE animations, distinct from the current production
// animation (ripplePulse box-shadow + rotating conic glow + shine sweep):
//
//   A. Breathe     — button scales 1.0 <-> 1.08 (breathing pulse)
//   B. Aura        — soft blurred radial halo fading in/out behind button
//   C. Sonar       — staggered concentric expanding rings emanating outward
//   D. Arrow Bob   — the send-arrow icon wiggles inside the button
//
// Does NOT touch any existing files. Reuses the production send-arrow SVG
// and the orange ready color (var(--gh-orange, #f59e0b)).
// ============================================================================

const VARIANTS = [
  { id: "breathe", label: "A · Breathe", desc: "Button scales 1.0 ↔ 1.08 — a breathing pulse." },
  { id: "aura", label: "B · Aura", desc: "Soft blurred radial halo fading in/out behind." },
  { id: "sonar", label: "C · Sonar", desc: "Staggered concentric expanding rings outward." },
  { id: "arrow", label: "D · Arrow Bob", desc: "Send-arrow icon wiggles inside the button." },
  { id: "combo", label: "E · Breathe + Sonar + Arrow", desc: "Combined: button breathes + sonar rings expand + arrow wiggles." },
] as const;

// Scenarios F-H focus on the WHERE/WHEN buttons BEFORE all guesses are made.
// Sonar animation draws attention to buttons that still need input; once a
// guess is made, the answer tag appears above the button and animation stops.
const SCENARIOS = [
  {
    id: "neither",
    label: "F · Neither guessed",
    desc: "Both WHERE + WHEN buttons sonar-pulse. No answer tags. Submit disabled.",
    whenGuessed: false,
    whereGuessed: false,
  },
  {
    id: "when-only",
    label: "G · Only WHEN guessed",
    desc: "WHEN shows answer tag + stops. WHERE keeps sonar. Submit still disabled.",
    whenGuessed: true,
    whereGuessed: false,
  },
  {
    id: "where-only",
    label: "H · Only WHERE guessed",
    desc: "WHERE shows answer tag + stops. WHEN keeps sonar. Submit still disabled.",
    whenGuessed: false,
    whereGuessed: true,
  },
] as const;

export default function SubmitAnimationsPrototypePage() {
  return (
    <main className="screen">
      <div className="protoBar">
        <span className="protoTitle">Submit Button — CTA Animation Alternatives</span>
        <span className="protoHint">Ready state · 4 alternatives</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="Historical event" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="roundPill">3 / 5</div>

      <div className="hintLine">
        Both guesses made — pick the animation that best calls the user to submit.
      </div>

      <div className="grid">
        {VARIANTS.map((v) => (
          <div key={v.id} className="card">
            <div className="cardLabel">{v.label}</div>

            {/* Mock navbar context: Hints · WHEN ✓ · WHERE ✓ · Submit */}
            <div className="navbar">
              <button type="button" className="circleBtn hintsBtn" aria-label="Hints">
                <span className="hintsCount">0</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.663 17h4.673M12 3v1m0 16v1M4.22 4.22l.707.707M19.778 19.778l-.707-.707M3 12h1m16 0h1M4.22 19.778l.707-.707M19.778 4.22l-.707.707M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
                </svg>
              </button>

              <div className="circleWrap">
                <span className="overlayTag overlayTagWhen overlayTagAnswer">1987</span>
                <button type="button" className="circleBtn whenBtn" aria-label="When">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/badges/when.webp" alt="When" className="btnIcon" />
                </button>
              </div>

              <div className="circleWrap">
                <span className="overlayTag overlayTagWhere overlayTagAnswer">Paris, France</span>
                <button type="button" className="circleBtn whereBtn" aria-label="Where">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/badges/where.webp" alt="Where" className="btnIcon" />
                </button>
              </div>

              {/* Submit — ready state, variant animation */}
              <button
                type="button"
                className={`circleBtn submitBtn submitReady variant-${v.id}`}
                aria-label="Submit"
              >
                <svg
                  className={v.id === "arrow" || v.id === "combo" ? "sendIcon sendIconBob" : "sendIcon"}
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>

            <div className="cardDesc">{v.desc}</div>
          </div>
        ))}
      </div>

      {/* ════ Scenarios F-H: WHERE/WHEN buttons in pre-submit states ════ */}
      <div className="hintLine">
        Guesses in progress — sonar draws attention to buttons that still need input.
      </div>

      <div className="grid">
        {SCENARIOS.map((s) => (
          <div key={s.id} className="card">
            <div className="cardLabel">{s.label}</div>

            <div className="navbar">
              <button type="button" className="circleBtn hintsBtn" aria-label="Hints">
                <span className="hintsCount">0</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.663 17h4.673M12 3v1m0 16v1M4.22 4.22l.707.707M19.778 19.778l-.707-.707M3 12h1m16 0h1M4.22 19.778l.707-.707M19.778 4.22l-.707.707M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
                </svg>
              </button>

              {/* WHEN */}
              <div className="circleWrap">
                {s.whenGuessed && (
                  <span className="overlayTag overlayTagWhen overlayTagAnswer">1987</span>
                )}
                <button
                  type="button"
                  className={`circleBtn whenBtn ${!s.whenGuessed ? "whenBtnSonar" : ""}`}
                  aria-label="When"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/badges/when.webp" alt="When" className="btnIcon" />
                </button>
              </div>

              {/* WHERE */}
              <div className="circleWrap">
                {s.whereGuessed && (
                  <span className="overlayTag overlayTagWhere overlayTagAnswer">Paris, France</span>
                )}
                <button
                  type="button"
                  className={`circleBtn whereBtn ${!s.whereGuessed ? "whereBtnSonar" : ""}`}
                  aria-label="Where"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/badges/where.webp" alt="Where" className="btnIcon" />
                </button>
              </div>

              {/* Submit — disabled (not all guesses made) */}
              <button
                type="button"
                className="circleBtn submitBtn submitDisabled"
                aria-label="Submit"
                disabled
              >
                <svg
                  className="sendIcon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>

            <div className="cardDesc">{s.desc}</div>
          </div>
        ))}
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #000; }
      `}</style>

      <style jsx>{`
        .screen {
          position: fixed; inset: 0; overflow-y: auto;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #fff; user-select: none;
        }
        .bgImg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .bgScrim {
          position: fixed; inset: 0; z-index: 1;
          background: linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.75) 100%);
        }

        .protoBar {
          position: relative; z-index: 60;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; flex-wrap: wrap;
          background: rgba(10,10,12,0.6); backdrop-filter: blur(8px);
        }
        .protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }
        .protoHint { font-size: 12px; font-weight: 600; opacity: 0.6; }

        .roundPill {
          position: relative; z-index: 30; margin: 14px 0 0; align-self: flex-start;
          margin-left: 14px;
          background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600;
          width: fit-content;
        }

        .hintLine {
          position: relative; z-index: 30;
          margin: 14px 16px 8px;
          font-size: 14px; font-weight: 600; opacity: 0.8;
        }

        .grid {
          position: relative; z-index: 30;
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 14px; padding: 8px 14px 40px;
        }
        @media (max-width: 560px) {
          .grid { grid-template-columns: 1fr; }
        }

        .card {
          background: rgba(12,12,14,0.55);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 18px;
          padding: 14px 14px 16px;
          backdrop-filter: blur(6px);
          display: flex; flex-direction: column; gap: 12px;
        }
        .cardLabel { font-size: 13px; font-weight: 700; letter-spacing: 0.4px; opacity: 0.95; }
        .cardDesc { font-size: 12px; font-weight: 500; opacity: 0.65; line-height: 1.4; }

        /* ── Navbar (per card) ── */
        .navbar {
          display: flex; align-items: center; justify-content: center; gap: 14px;
          padding: 18px 8px;
          background: rgba(0,0,0,0.35);
          border-radius: 14px;
        }
        .circleBtn {
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%; border: 2px solid rgba(255,255,255,0.4);
          background: rgba(30,30,34,0.85);
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          cursor: pointer; position: relative;
        }
        .hintsBtn, .submitBtn { width: 52px; height: 52px; }
        .whereBtn, .whenBtn { width: 64px; height: 64px; overflow: hidden; }
        .btnIcon { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
        .whereBtn { background: #06b6d4; border-color: rgba(255,255,255,0.85); }
        .whenBtn  { background: #8b5cf6; border-color: rgba(255,255,255,0.85); }

        .hintsCount {
          position: absolute; top: -4px; right: -4px;
          background: var(--gh-orange, #f59e0b); color: #000;
          font-size: 11px; font-weight: 700; min-width: 18px; height: 18px;
          border-radius: 999px; display: flex; align-items: center; justify-content: center;
        }

        .circleWrap { display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative; }
        .overlayTag {
          position: absolute; bottom: 100%; margin-bottom: 6px;
          left: 50%; transform: translateX(-50%); z-index: 2;
          border-radius: 999px; padding: 3px 10px;
          font-size: 12px; font-weight: 700; letter-spacing: 0.6px;
          pointer-events: none; white-space: nowrap;
          max-width: 130px; overflow: hidden; text-overflow: ellipsis;
        }
        .overlayTagWhere { background: rgba(6,182,212,0.95); }
        .overlayTagWhen  { background: rgba(139,92,246,0.95); }
        .overlayTagAnswer { letter-spacing: 0.2px; text-transform: none; }

        /* ── Submit ready (shared) ── */
        .submitBtn { color: #fff; }
        .submitReady {
          background: var(--gh-orange, #f59e0b);
          color: #000;
          border-color: rgba(255,255,255,0.85);
        }
        .sendIcon { display: block; }

        /* ============================================================ */
        /* Variant A — Breathe (scale pulse)                            */
        /* ============================================================ */
        .variant-breathe { animation: breathe 1.6s ease-in-out infinite; }
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }

        /* ============================================================ */
        /* Variant B — Aura (soft radial halo fading in/out)            */
        /* ============================================================ */
        .variant-aura::before {
          content: "";
          position: absolute; inset: -14px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(245,158,11,0.55) 0%, rgba(245,158,11,0) 70%);
          filter: blur(4px);
          pointer-events: none;
          animation: aura 2s ease-in-out infinite;
        }
        @keyframes aura {
          0%, 100% { opacity: 0.25; transform: scale(0.9); }
          50%      { opacity: 0.9;  transform: scale(1.25); }
        }

        /* ============================================================ */
        /* Variant C — Sonar (staggered concentric expanding rings)     */
        /* ============================================================ */
        .variant-sonar::before,
        .variant-sonar::after {
          content: "";
          position: absolute; inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(245,158,11,0.7);
          pointer-events: none;
          animation: sonar 2s ease-out infinite;
        }
        .variant-sonar::after { animation-delay: 1s; }
        @keyframes sonar {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        /* ============================================================ */
        /* Variant D — Arrow Bob (send icon wiggles)                    */
        /* ============================================================ */
        .sendIconBob { animation: arrowBob 1.4s ease-in-out infinite; }
        @keyframes arrowBob {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25%      { transform: translate(2px, -2px) rotate(-8deg); }
          50%      { transform: translate(4px, 0)  rotate(0deg); }
          75%      { transform: translate(2px, 2px)  rotate(8deg); }
        }

        /* ============================================================ */
        /* Variant E — Combo: Breathe (A) + Sonar (C) + Arrow Bob (D)   */
        /* ============================================================ */
        .variant-combo { animation: breathe 1.6s ease-in-out infinite; }
        .variant-combo::before,
        .variant-combo::after {
          content: "";
          position: absolute; inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(245,158,11,0.7);
          pointer-events: none;
          animation: sonar 2s ease-out infinite;
        }
        .variant-combo::after { animation-delay: 1s; }

        /* ============================================================ */
        /* Scenarios F-H — WHERE/WHEN sonar (pre-submit)                */
        /* Un-guessed buttons sonar-pulse to call user to action.       */
        /* Guessed buttons show answer tag + stop animating.            */
        /* ============================================================ */

        /* WHEN sonar — violet rings */
        .whenBtnSonar::before,
        .whenBtnSonar::after {
          content: "";
          position: absolute; inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(139, 92, 246, 0.7);
          pointer-events: none;
          animation: sonar 2s ease-out infinite;
        }
        .whenBtnSonar::after { animation-delay: 1s; }

        /* WHERE sonar — cyan rings */
        .whereBtnSonar::before,
        .whereBtnSonar::after {
          content: "";
          position: absolute; inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(6, 182, 212, 0.7);
          pointer-events: none;
          animation: sonar 2s ease-out infinite;
        }
        .whereBtnSonar::after { animation-delay: 1s; }

        /* Submit disabled state (not all guesses made) */
        .submitDisabled {
          background: rgba(30, 30, 34, 0.85);
          color: rgba(255, 255, 255, 0.35);
          border-color: rgba(255, 255, 255, 0.2);
          cursor: not-allowed;
        }
      `}</style>
    </main>
  );
}
