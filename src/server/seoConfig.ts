/** Canonical public origin for SEO pages (sitemap, robots, canonical/OG URLs). */
export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || "https://www.guess-history.com").replace(/\/$/, "");
