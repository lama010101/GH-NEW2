import type { MetadataRoute } from "next";
import { fetchAllEligibleSlugs } from "@/server/seoEvents";
import { SITE_URL } from "@/server/seoConfig";

// Regenerated on-demand by Next's Route Cache (revalidate below) — never by
// a cron job. Every entry is read live from the `events` table at request
// time, so a DB write is the only thing needed to add/remove a URL here.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/events`, changeFrequency: "daily", priority: 0.8 },
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

  const eventEntries: MetadataRoute.Sitemap = eligible.map(({ slug, updatedAt }) => ({
    url: `${SITE_URL}/events/${slug}`,
    lastModified: updatedAt ? new Date(updatedAt) : undefined,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...eventEntries];
}
