import { mapEventRowToEventRecord } from "./mappers/eventMapper";
import { dbPool } from "./db";
import type { Pool } from "pg";
import type { EventRecord } from "@/core/types";

type DbExecutor = Pick<Pool, "query">;

/**
 * Fetch events with their locations and images.
 * Returns EventRecord format for game consumption.
 */
export async function fetchEventsWithDetails(options: {
  limit?: number;
  excludeIds?: string[];
  minYear?: number;
  maxYear?: number;
  regions?: string[];
} = {}, executor: DbExecutor = dbPool): Promise<EventRecord[]> {
  const { limit = 10, excludeIds = [], minYear, maxYear, regions } = options;

  const whereClauses: string[] = [
    "e.status = 'validated'",
    "l.latitude IS NOT NULL",
    "l.longitude IS NOT NULL"
  ];
  const params: (string | number | string[])[] = [];
  let paramIndex = 1;

  if (excludeIds.length > 0) {
    whereClauses.push(`e.id != ALL($${paramIndex}::uuid[])`);
    params.push(excludeIds);
    paramIndex++;
  }

  if (minYear !== undefined) {
    whereClauses.push(`e.event_year >= $${paramIndex}`);
    params.push(minYear);
    paramIndex++;
  }

  if (maxYear !== undefined) {
    whereClauses.push(`e.event_year <= $${paramIndex}`);
    params.push(maxYear);
    paramIndex++;
  }

  if (regions && regions.length > 0) {
    whereClauses.push(`l.continent = ANY($${paramIndex}::text[])`);
    params.push(regions);
    paramIndex++;
  }

  const whereClause = whereClauses.join(" AND ");

  // PHASE 1: Select random IDs only (cheap query)
  const phase1Query = `
    SELECT e.id
    FROM events e
    JOIN locations l ON l.event_id = e.id
    WHERE ${whereClause}
    ORDER BY RANDOM()
    LIMIT $${paramIndex}
  `;

  params.push(limit);

  const phase1Result = await executor.query<{ id: string }>(phase1Query, params);

  if (phase1Result.rows.length === 0) {
    return [];
  }

  const selectedIds = phase1Result.rows.map(row => row.id);

  // PHASE 2: Fetch full details only for selected IDs (indexed lookup)
  const phase2Query = `
    SELECT
      e.id,
      e.title,
      e.description,
      e.event_year,
      l.latitude,
      l.longitude,
      l.display_name,
      l.country as region,
      e.category,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'imageUrl', i.url,
            'thumbUrl', i.url,
            'isPrimary', true
          ) ORDER BY i.display_order, i.created_at
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::jsonb
      ) as images
    FROM events e
    JOIN locations l ON l.event_id = e.id
    LEFT JOIN images i ON i.event_id = e.id
    WHERE e.id = ANY($1::uuid[])
    GROUP BY e.id, e.title, e.description, e.event_year, l.latitude, l.longitude, l.display_name, l.country
    ORDER BY e.id
  `;

  const result = await executor.query<{
    id: string;
    title: string;
    description: string | null;
    event_year: number;
    latitude: number;
    longitude: number;
    display_name: string | null;
    region: string | null;
    category: string | null;
    images: unknown;
  }>(phase2Query, [selectedIds]);

  return result.rows.map((row) => mapEventRowToEventRecord(row));
}

/**
 * Fetch a single event by ID with all details including hints
 */
export async function fetchEventById(eventId: string, executor: DbExecutor = dbPool): Promise<EventRecord | null> {
  // Main event query with location and images
  const eventQuery = `
    SELECT
      e.id,
      e.title,
      e.description,
      e.event_year,
      l.latitude,
      l.longitude,
      l.display_name,
      l.country as region,
      e.category,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'imageUrl', i.url,
            'thumbUrl', i.url,
            'isPrimary', true
          ) ORDER BY i.display_order, i.created_at
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::jsonb
      ) as images
    FROM events e
    JOIN locations l ON l.event_id = e.id
    LEFT JOIN images i ON i.event_id = e.id
    WHERE e.id = $1
      AND e.status = 'validated'
      AND l.latitude IS NOT NULL
      AND l.longitude IS NOT NULL
    GROUP BY e.id, e.title, e.description, e.event_year, l.latitude, l.longitude, l.display_name, l.country
  `;

  const eventResult = await executor.query<{
    id: string;
    title: string;
    description: string | null;
    event_year: number;
    latitude: number;
    longitude: number;
    display_name: string | null;
    region: string | null;
    category: string | null;
    images: unknown;
  }>(eventQuery, [eventId]);

  if (eventResult.rows.length === 0) {
    return null;
  }

  // Separate query for hints ordered by tier, type
  const hintsQuery = `
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'tier', tier,
          'type', type,
          'content', content,
          'metadata', metadata
        ) ORDER BY tier, type
      ) as hints
    FROM hints
    WHERE event_id = $1
  `;

  const hintsResult = await executor.query<{ hints: unknown }>(hintsQuery, [eventId]);

  const row = eventResult.rows[0];
  const hints = hintsResult.rows[0]?.hints ?? '[]';

  return mapEventRowToEventRecord({ ...row, hints });
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
 * Get available regions (continents) for filtering
 */
export async function fetchAvailableRegions(): Promise<string[]> {
  const result = await dbPool.query<{ continent: string }>(`
    SELECT DISTINCT continent
    FROM locations
    WHERE continent IS NOT NULL
    ORDER BY continent
  `);

  return result.rows.map((row) => row.continent);
}

/**
 * Get year range of available events
 */
export async function fetchYearRange(): Promise<{ min: number; max: number }> {
  const result = await dbPool.query<{ min_year: number | null; max_year: number | null }>(`
    SELECT MIN(event_year) as min_year, MAX(event_year) as max_year
    FROM events
    WHERE event_year IS NOT NULL
  `);

  return {
    min: result.rows[0]?.min_year ?? 1800,
    max: result.rows[0]?.max_year ?? 2024
  };
}
