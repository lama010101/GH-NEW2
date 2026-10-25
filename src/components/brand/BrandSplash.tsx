'use client';

import { useEffect, useState } from 'react';
import { BRAND_PRIMARY_HEX, BRAND_ACCENT_HEX } from '@/core/brand';
import styles from './brand.module.css';

/**
 * BrandSplash — full-screen intro showing the FULL brand symbol animating
 * (ring draw -> cardinals/ticks pop -> hand swing -> ripple, ~1.5s), then a
 * 150ms hold, a 250ms fade and unmount. Hard cap: gone by 2.2s after mount.
 *
 * Renders null on the server and on the first client render (no hydration
 * mismatch). Shows only for installed surfaces (PWA display-mode: standalone
 * or Capacitor native), never for webdriver runs, and only once per session
 * (sessionStorage 'gh_splash_seen'). QA escape hatch: ?splash=1 forces it on
 * regardless of display-mode/webdriver/seen (still honours reduced-motion).
 * pointer-events: none always — never delays or gates any app logic.
 */
export default function BrandSplash() {
  const [show, setShow] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    let seen = false;
    let reducedMotion = false;
    try {
      seen = !!window.sessionStorage.getItem('gh_splash_seen');
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* storage / matchMedia unavailable -> treat as not seen, no motion pref */
    }
    const force = new URLSearchParams(window.location.search).get('splash') === '1';
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean(
        (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
          .Capacitor?.isNativePlatform?.()
      );
    const ok = force || (standalone && !navigator.webdriver && !seen);
    if (!ok || reducedMotion) return;

    setShow(true);
    const finish = () => {
      try {
        window.sessionStorage.setItem('gh_splash_seen', '1');
      } catch {
        /* ignore */
      }
      setShow(false);
    };
    const tFade = window.setTimeout(() => setHiding(true), 1650);
    const tGone = window.setTimeout(finish, 1900);
    const tCap = window.setTimeout(finish, 2200);
    return () => {
      window.clearTimeout(tFade);
      window.clearTimeout(tGone);
      window.clearTimeout(tCap);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`${styles.splash} ${hiding ? styles.splashHide : ''}`}
      style={{ background: BRAND_PRIMARY_HEX }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        className={styles.splashSymbol}
        role="img"
        aria-label="Back to the Past"
      >
        {/* Ring — draws from the top. The transform attribute must NOT get a
            transform-origin class (it would displace the rotation). */}
        <circle
          cx="256"
          cy="256"
          r="112"
          fill="none"
          stroke="#fff"
          strokeWidth="30"
          transform="rotate(-90 256 256)"
          strokeDasharray="703.7"
          className={styles.ringDraw}
        />
        {/* Compass cardinals — N .21s, E .26s, S .31s, W .35s */}
        <g className={styles.popG} style={{ animationDelay: '.21s' }}>
          <polygon points="256,44 290,106 222,106" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
        </g>
        <g className={styles.popG} style={{ animationDelay: '.26s' }}>
          <polygon points="468,256 406,290 406,222" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
        </g>
        <g className={styles.popG} style={{ animationDelay: '.31s' }}>
          <polygon points="256,468 222,406 290,406" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
        </g>
        <g className={styles.popG} style={{ animationDelay: '.35s' }}>
          <polygon points="44,256 106,222 106,290" fill="#fff" stroke="#fff" strokeWidth="14" strokeLinejoin="round" />
        </g>
        {/* Clock ticks — clockwise from top-right: .42s .47s .52s .56s */}
        <g className={styles.popG} style={{ animationDelay: '.42s' }}>
          <line x1="373" y1="139" x2="399" y2="113" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
        </g>
        <g className={styles.popG} style={{ animationDelay: '.47s' }}>
          <line x1="373" y1="373" x2="399" y2="399" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
        </g>
        <g className={styles.popG} style={{ animationDelay: '.52s' }}>
          <line x1="139" y1="373" x2="113" y2="399" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
        </g>
        <g className={styles.popG} style={{ animationDelay: '.56s' }}>
          <line x1="139" y1="139" x2="113" y2="113" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
        </g>
        {/* Hub */}
        <circle cx="256" cy="256" r="17" fill="#fff" className={styles.popHub} />
        {/* Hand group: both hand polygons + counterweight */}
        <g className={styles.swingG}>
          <polygon points="255,267 297,240 291,228 246,251" fill="#fff" stroke="#fff" strokeWidth="8" strokeLinejoin="round" />
          <polygon points="296,240 334,215 330,209 290,229" fill={BRAND_ACCENT_HEX} stroke={BRAND_ACCENT_HEX} strokeWidth="8" strokeLinejoin="round" />
          <circle cx="233" cy="269" r="8" fill="#fff" />
        </g>
        {/* Ripple — rests invisible */}
        <circle cx="256" cy="256" r="112" fill="none" stroke="#fff" strokeWidth="6" className={styles.rippleC} />
      </svg>
    </div>
  );
}
