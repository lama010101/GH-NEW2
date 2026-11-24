import type { MetadataRoute } from "next";
import { fetchAllEligibleSlugs } from "@/server/seoEvents";
import { SITE_ORIGIN } from "@/core/brand";

// Regenerated on-demand by Next's Route Cache (revalidate below) — never by
// a cron job. Every entry is read live from the `events` table at request
// time, so a DB write is the only thing needed to add/remove a URL here.
export const revalidate = 3600;

// Sitemap protocol hard limit: 50,000 URLs per file. fetchAllEligibleSlugs
// is ORDER BY slug, so slicing keeps the cap deterministic. Today the
// eligible set is ~1.2k events; the cap is a safety bound, not pagination.
const SITEMAP_URL_LIMIT = 50_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_ORIGIN, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_ORIGIN}/events`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_ORIGIN}/how-we-work`, changeFrequency: "monthly", priority: 0.5 },
  ];

  let eligible: Awaited<ReturnType<typeof fetchAllEligibleSlugs>> = [];
  try {
    eligible = await fetchAllEligibleSlugs();
  } catch (error) {
    // DB unreachable (e.g. a build-time pass with no DB credentials) — fall
    // back to the static entries only; the live route always re-reads the DB.
    console.warn(
      "[sitemap] DB unavailable, returning static entries only",
      error instanceof Error ? error.message : error
    );
  }

  if (eligible.length > SITEMAP_URL_LIMIT) {
    console.warn(
      `[sitemap] eligible events (${eligible.length}) exceed ${SITEMAP_URL_LIMIT}; truncating`
    );
    eligible = eligible.slice(0, SITEMAP_URL_LIMIT);
  }

  const eventEntries: MetadataRoute.Sitemap = eligible.map(({ slug, updatedAt }) => ({
    url: `${SITE_ORIGIN}/events/${slug}`,
    lastModified: updatedAt ? new Date(updatedAt) : undefined,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...eventEntries];
}
