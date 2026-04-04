import { dbPool } from "./db";
import type { EventRecord, EventHint } from "@/core/types";

export type EventImageRecord = {
  id: string;
  eventId: string;
  imageUrl: string;
  thumbUrl: string | null;
  altText: string | null;
  source: string;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
};

/**
 * Fetch events with their images and hints, returned as EventRecord format
 */
export async function fetchEventsWithDetails(options: {
  limit?: number;
  excludeIds?: string[];
  minYear?: number;
  maxYear?: number;
  regions?: string[];
} = {}): Promise<EventRecord[]> {
  const { limit = 10, excludeIds = [], minYear, maxYear, regions } = options;

  let whereClauses: string[] = [
    "e.year IS NOT NULL",
    "e.location_lat IS NOT NULL",
    "e.location_lng IS NOT NULL",
    "EXISTS (SELECT 1 FROM event_images ei_required WHERE ei_required.event_id = e.id AND ei_required.image_url IS NOT NULL)",
  ];
  const params: (string | number | string[])[] = [];
  let paramIndex = 1;

  if (excludeIds.length > 0) {
    whereClauses.push(`e.id != ALL($${paramIndex}::uuid[])`);
    params.push(excludeIds);
    paramIndex++;
  }

  if (minYear !== undefined) {
    whereClauses.push(`e.year >= $${paramIndex}`);
    params.push(minYear);
    paramIndex++;
  }

  if (maxYear !== undefined) {
    whereClauses.push(`e.year <= $${paramIndex}`);
    params.push(maxYear);
    paramIndex++;
  }

  if (regions && regions.length > 0) {
    whereClauses.push(`e.region = ANY($${paramIndex}::text[])`);
    params.push(regions);
    paramIndex++;
  }

  const whereClause = whereClauses.join(" AND ");

  const query = `
    SELECT
      e.id,
      e.title,
      e.description,
      e.year,
      e.location_lat,
      e.location_lng,
      e.location_name,
      e.region,
      e.category,
      e.difficulty,
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'id', ei.id,
            'eventId', ei.event_id,
            'imageUrl', ei.image_url,
            'thumbUrl', ei.thumb_url,
            'altText', ei.alt_text,
            'source', ei.source,
            'width', ei.width,
            'height', ei.height,
            'isPrimary', ei.is_primary
          )
        ) FILTER (WHERE ei.id IS NOT NULL),
        '[]'::jsonb
      ) as images,
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'id', h.id,
            'eventId', h.event_id,
            'level', h.level,
            'type', h.type,
            'text', h.text,
            'distanceKm', h.distance_km,
            'timeDiffYears', h.time_diff_years,
            'penaltyBp', h.penalty_bp
          )
        ) FILTER (WHERE h.id IS NOT NULL),
        '[]'::jsonb
      ) as hints
    FROM events e
    LEFT JOIN event_images ei ON ei.event_id = e.id AND ei.image_url IS NOT NULL
    LEFT JOIN hints h ON h.event_id = e.id
    WHERE ${whereClause}
    GROUP BY e.id
    ORDER BY RANDOM()
    LIMIT $${paramIndex}
  `;

  params.push(limit);

  const result = await dbPool.query<{
    id: string;
    title: string;
    description: string | null;
    year: number;
    location_lat: number;
    location_lng: number;
    location_name: string | null;
    region: string | null;
    category: string | null;
    difficulty: number | null;
    images: unknown;
    hints: unknown;
  }>(query, params);

  return result.rows.map((row): EventRecord => {
    const images = (row.images as EventImageRecord[] | null) ?? [];
    const primaryImage = images.find((img) => img.isPrimary) || images[0] || null;
    const hintsRaw = (row.hints as EventHint[] | null) ?? [];

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      year: row.year,
      location: {
        lat: row.location_lat,
        lng: row.location_lng,
      },
      locationName: row.location_name ?? "Unknown location",
      region: row.region ?? "Unknown",
      imageUrl: primaryImage?.imageUrl ?? null,
      thumbUrl: primaryImage?.thumbUrl ?? null,
      hints: hintsRaw,
      category: row.category ?? undefined,
      difficulty: row.difficulty ?? undefined,
    };
  });
}

/**
 * Fetch a single event by ID with all details
 */
export async function fetchEventById(eventId: string): Promise<EventRecord | null> {
  const query = `
    SELECT
      e.id,
      e.title,
      e.description,
      e.year,
      e.location_lat,
      e.location_lng,
      e.location_name,
      e.region,
      e.category,
      e.difficulty,
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'id', ei.id,
            'eventId', ei.event_id,
            'imageUrl', ei.image_url,
            'thumbUrl', ei.thumb_url,
            'altText', ei.alt_text,
            'source', ei.source,
            'width', ei.width,
            'height', ei.height,
            'isPrimary', ei.is_primary
          )
        ) FILTER (WHERE ei.id IS NOT NULL),
        '[]'::jsonb
      ) as images,
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'id', h.id,
            'eventId', h.event_id,
            'level', h.level,
            'type', h.type,
            'text', h.text,
            'distanceKm', h.distance_km,
            'timeDiffYears', h.time_diff_years,
            'penaltyBp', h.penalty_bp
          )
        ) FILTER (WHERE h.id IS NOT NULL),
        '[]'::jsonb
      ) as hints
    FROM events e
    LEFT JOIN event_images ei ON ei.event_id = e.id AND ei.image_url IS NOT NULL
    LEFT JOIN hints h ON h.event_id = e.id
    WHERE e.id = $1
      AND e.year IS NOT NULL
      AND e.location_lat IS NOT NULL
      AND e.location_lng IS NOT NULL
      AND EXISTS (SELECT 1 FROM event_images ei_required WHERE ei_required.event_id = e.id AND ei_required.image_url IS NOT NULL)
    GROUP BY e.id
  `;

  const result = await dbPool.query<{
    id: string;
    title: string;
    description: string | null;
    year: number;
    location_lat: number;
    location_lng: number;
    location_name: string | null;
    region: string | null;
    category: string | null;
    difficulty: number | null;
    images: unknown;
    hints: unknown;
  }>(query, [eventId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const images = (row.images as EventImageRecord[] | null) ?? [];
  const primaryImage = images.find((img) => img.isPrimary) || images[0] || null;
  const hintsRaw = (row.hints as EventHint[] | null) ?? [];

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    year: row.year,
    location: {
      lat: row.location_lat,
      lng: row.location_lng
    },
    locationName: row.location_name ?? "Unknown location",
    region: row.region ?? "Unknown",
    imageUrl: primaryImage?.imageUrl ?? null,
    thumbUrl: primaryImage?.thumbUrl ?? null,
    hints: hintsRaw,
    category: row.category ?? undefined,
    difficulty: row.difficulty ?? undefined
  };
}

/**
 * Fetch random events for a game session with repeat protection
 */
export async function fetchRandomEventsForSession(
  count: number,
  options: {
    excludeEventIds?: string[];
    minYear?: number;
    maxYear?: number;
    regions?: string[];
  } = {}
): Promise<EventRecord[]> {
  return fetchEventsWithDetails({
    limit: count,
    excludeIds: options.excludeEventIds,
    minYear: options.minYear,
    maxYear: options.maxYear,
    regions: options.regions
  });
}

/**
 * Get available regions for filtering
 */
export async function fetchAvailableRegions(): Promise<string[]> {
  const result = await dbPool.query<{ region: string }>(`
    SELECT DISTINCT region
    FROM events
    WHERE region IS NOT NULL
    ORDER BY region
  `);

  return result.rows.map((row) => row.region);
}

/**
 * Get year range of available events
 */
export async function fetchYearRange(): Promise<{ min: number; max: number }> {
  const result = await dbPool.query<{ min_year: number | null; max_year: number | null }>(`
    SELECT MIN(year) as min_year, MAX(year) as max_year
    FROM events
    WHERE year IS NOT NULL
  `);

  return {
    min: result.rows[0]?.min_year ?? 1800,
    max: result.rows[0]?.max_year ?? 2024
  };
}
