import type { EventRecord, EventHint } from "@/core/types";

/**
 * Database image record structure (from JSONB array in DB)
 */
type EventImageRecord = {
  imageUrl: string;
  thumbUrl: string;
  isPrimary: boolean;
};

/**
 * Database row type for event queries
 * Uses actual DB column names from events + locations join (new schema)
 */
type EventDbRow = {
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
  hints?: unknown;
};

/**
 * Maps a database event row to the API EventRecord format.
 * 
 * This is the SINGLE source of truth for transforming DB columns
 * from prompts + locations join to API EventRecord format.
 * 
 * DB layer: latitude, longitude, display_name (from locations table)
 * API layer: location.lat, location.lng, location.name
 */
export function mapEventRowToEventRecord(row: EventDbRow): EventRecord {
  const images = (row.images as EventImageRecord[] | null) ?? [];
  const primaryImage = images.find((img) => img.isPrimary) || images[0] || null;
  const hintsRaw = (row.hints as EventHint[] | null) ?? [];

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    year: row.event_year,
    // Backend is the single source of truth for geo data
    location: {
      id: row.id, // Event ID serves as location identifier
      name: row.display_name ?? "Unknown location",
      lat: row.latitude,
      lng: row.longitude
    },
    region: row.region ?? "Unknown",
    imageUrl: primaryImage?.imageUrl ?? null,
    thumbUrl: primaryImage?.thumbUrl ?? null,
    hints: hintsRaw,
    category: row.category ?? undefined
  };
}
