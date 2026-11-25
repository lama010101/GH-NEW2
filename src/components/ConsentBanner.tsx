"use client";

import { useTranslations } from "next-intl";
import { useConsentBannerVisible, writeConsent } from "@/core/consent";

/**
 * UX-BUILD-CONSENTGATE-1125-893 — non-blocking bottom-sheet consent banner.
 * Renders only client-side (useSyncExternalStore server snapshot keeps SSR
 * and first client render consistent → no hydration warning). Accept and
 * Reject are identical in size, weight and prominence. Sits above the
 * mobile bottom nav (h-14 = 3.5rem) plus the safe-area inset on small
 * screens; desktop has no bottom nav so it rests on the safe area only.
 */
export function ConsentBanner() {
  const t = useTranslations("consent");
  const visible = useConsentBannerVisible();

  if (!visible) return null;

  const buttonClass =
    "flex-1 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors";

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="fixed inset-x-0 z-40 px-4 bottom-[calc(3.5rem_+_var(--gh-safe-bottom))] md:bottom-[var(--gh-safe-bottom)]"
    >
      <div className="mx-auto max-w-xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-elevated)] p-4 shadow-lg">
        <p className="text-sm font-semibold text-[var(--gh-text-primary)]">
          {t("title")}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--gh-text-secondary)]">
          {t("body")}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => writeConsent("granted")}
            className={`${buttonClass} bg-[var(--gh-journey-stage-gradient)] text-white hover:opacity-90`}
          >
            {t("accept")}
          </button>
          <button
            type="button"
            onClick={() => writeConsent("denied")}
            className={`${buttonClass} border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] text-[var(--gh-text-primary)] hover:bg-[var(--gh-bg-base)]`}
          >
            {t("reject")}
          </button>
        </div>
      </div>
    </div>
  );
}
