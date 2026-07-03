import { NextResponse } from "next/server";
import { dbPool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/prototype/lobby-images
 *
 * Returns a representative event image URL for each era (by year range)
 * and region (by continent). Used by the lobby-settings-images prototype.
 *
 * Response: { eras: { ancient: "url", ... }, regions: { africa: "url", ... } }
 */
export async function GET() {
  try {
    // Era definitions: id → [yearMin, yearMax]
    const eras: { id: string; min: number; max: number }[] = [
      { id: "ancient", min: -3000, max: 476 },
      { id: "medieval", min: 476, max: 1492 },
      { id: "earlymodern", min: 1492, max: 1789 },
      { id: "modern", min: 1789, max: 1945 },
      { id: "contemporary", min: 1945, max: new Date().getFullYear() },
    ];

    // Region definitions: id → continents[]
    const regions: { id: string; continents: string[] }[] = [
      { id: "africa", continents: ["Africa"] },
      { id: "asia", continents: ["Asia"] },
      { id: "europe", continents: ["Europe"] },
      { id: "north_america", continents: ["North America"] },
      { id: "south_america", continents: ["South America"] },
      { id: "oceania_antarctica", continents: ["Oceania", "Antarctica"] },
    ];

    // Single query: get first image per event with year + continent
    const { rows } = await dbPool.query<{
      event_id: string;
      url: string;
      event_year: number;
      continent: string | null;
    }>(`
      SELECT
        i.event_id,
        i.url,
        e.event_year,
        l.continent
      FROM images i
      JOIN events e ON e.id = i.event_id
      JOIN locations l ON l.event_id = i.event_id
      WHERE i.url IS NOT NULL
      ORDER BY i.display_order NULLS LAST, i.created_at
      LIMIT 500
    `);

    const eraImages: Record<string, string> = {};
    for (const era of eras) {
      const match = rows.find(
        (r) => r.event_year >= era.min && r.event_year <= era.max
      );
      if (match) eraImages[era.id] = match.url;
    }

    const regionImages: Record<string, string> = {};
    for (const region of regions) {
      const match = rows.find(
        (r) => r.continent && region.continents.includes(r.continent)
      );
      if (match) regionImages[region.id] = match.url;
    }

    return NextResponse.json({ eras: eraImages, regions: regionImages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch lobby images";
    console.error("Failed to fetch lobby images:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
