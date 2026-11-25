'use client';

import Script from 'next/script';
import { useConsentState } from '@/core/consent';

/**
 * Google Analytics 4 (gtag.js).
 * Measurement ID is a public identifier (shipped to every client on every
 * page load), so it is not treated as a secret. Single source of truth for
 * the GA property lives here.
 *
 * UX-BUILD-CONSENTGATE-1125-893: renders NOTHING (no <Script>, no
 * dataLayer, no gtag, no googletagmanager request) unless the visitor
 * explicitly granted analytics consent. SSR + first client render both
 * see 'unknown' via the server snapshot → no hydration warning and no
 * Google request before consent.
 */
const GA_MEASUREMENT_ID = 'G-DQKZDDHBZL';

export function Analytics() {
  const consent = useConsentState();
  if (consent !== 'granted') return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
