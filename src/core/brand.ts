// Brand primary (purple) — mid-stop of --gh-journey-stage-gradient.
// Single source of truth for hex literals that cannot reference CSS variables.
// public/manifest.json theme_color and --gh-primary in globals.css mirror it;
// src/guards/brand-primary-single-source.guard.test.ts enforces equality.
export const BRAND_PRIMARY_HEX = "#6b21a8";
export const BRAND_ACCENT_HEX = "#F97316";
