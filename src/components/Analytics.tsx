import Script from 'next/script';

/**
 * Google Analytics 4 (gtag.js).
 * Measurement ID is a public identifier (shipped to every client on every
 * page load), so it is not treated as a secret. Single source of truth for
 * the GA property lives here.
 */
const GA_MEASUREMENT_ID = 'G-DQKZDDHBZL';

export function Analytics() {
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
