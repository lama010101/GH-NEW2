// Brand primary (purple) — mid-stop of --gh-journey-stage-gradient.
// Single source of truth for hex literals that cannot reference CSS variables.
// public/manifest.json theme_color and --gh-primary in globals.css mirror it;
// src/guards/brand-primary-single-source.guard.test.ts enforces equality.
export const BRAND_PRIMARY_HEX = "#6b21a8";
export const BRAND_ACCENT_HEX = "#F97316";

// SEO-BUILD-REVIVE-DIGTHEPAST-1118-616 — canonical public identity.
// SITE_ORIGIN is the ONE place the production origin is declared: every
// canonical URL, sitemap entry, robots sitemap reference, OG URL and JSON-LD
// url must derive from it. guess-history.com is a backup domain only — all
// SEO surfaces canonicalize to digthepast.org. BRAND_NAME is the single
// user-visible product name for metadata/JSON-LD strings.
export const SITE_ORIGIN = "https://digthepast.org";
export const BRAND_NAME = "Dig the Past";
