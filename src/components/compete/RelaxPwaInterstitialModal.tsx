"use client";

import modalStyles from "@/components/AuthModal.module.css";

// iOS Safari non-PWA interstitial shown before Relax (async) create/join.
// Reuses the existing modal design tokens (overlay rgba(0,0,0,0.72) + blur(8px),
// card #2e3144, border rgba(255,255,255,0.13)) via AuthModal.module.css.
// Both the close (X) and the "Got it" CTA resolve to onClose (skip + proceed).
export function RelaxPwaInterstitialModal({ onClose }: { onClose: () => void }) {
  return (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={modalStyles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className={modalStyles.title}>Install for turn notifications</h2>
        <p className={modalStyles.tagline} style={{ marginBottom: 16 }}>
          Relax games are turn-based. On iPhone, turn notifications only work when this site is added to your Home Screen.
        </p>
        <ol
          style={{
            color: "var(--gh-modal-text-secondary)",
            fontSize: "var(--font-sm)",
            paddingLeft: 20,
            margin: "0 0 20px 0",
            lineHeight: 1.5,
          }}
        >
          <li>Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>, then open Guess-History from your Home Screen.</li>
        </ol>
        <button
          type="button"
          className={modalStyles.submitButton}
          onClick={onClose}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
