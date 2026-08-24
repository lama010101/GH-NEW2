"use client";

import { useTranslations } from "next-intl";
import modalStyles from "@/components/AuthModal.module.css";

// iOS Safari non-PWA interstitial shown before Relax (async) create/join.
// Reuses the existing modal design tokens (overlay rgba(0,0,0,0.72) + blur(8px),
// card #2e3144, border rgba(255,255,255,0.13)) via AuthModal.module.css.
// Both the close (X) and the "Got it" CTA resolve to onClose (skip + proceed).
export function RelaxPwaInterstitialModal({ onClose }: { onClose: () => void }) {
  const tNav = useTranslations('nav');
  const t = useTranslations('pwa');

  return (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={modalStyles.closeButton}
          onClick={onClose}
          aria-label={tNav('close')}
        >
          ×
        </button>
        <h2 className={modalStyles.title}>{t('install_heading')}</h2>
        <p className={modalStyles.tagline} style={{ marginBottom: 16 }}>
          {t('description')}
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
          <li>{t.rich('step_share', { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          <li>{t.rich('step_add_home', { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          <li>{t.rich('step_add', { strong: (chunks) => <strong>{chunks}</strong> })}</li>
        </ol>
        <button
          type="button"
          className={modalStyles.submitButton}
          onClick={onClose}
        >
          {t('got_it')}
        </button>
      </div>
    </div>
  );
}
