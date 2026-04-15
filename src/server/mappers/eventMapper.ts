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
 * Uses actual DB column names (location_*)
 */
type EventDbRow = {
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
};

/**
 * Maps a database event row to the API EventRecord format.
 * 
 * This is the SINGLE source of truth for transforming DB location_* columns
 * to API geo_* fields. All event queries must use this mapper.
 * 
 * DB layer: location_lat, location_lng, location_name
 * API layer: geo_latitude, geo_longitude, geo_display_name
 */
export function mapEventRowToEventRecord(row: EventDbRow): EventRecord {
  const images = (row.images as EventImageRecord[] | null) ?? [];
  const primaryImage = images.find((img) => img.isPrimary) || images[0] || null;
  const hintsRaw = (row.hints as EventHint[] | null) ?? [];

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    year: row.year,
    // Backend is the single source of truth for geo data
    location: {
      id: row.id, // Event ID serves as location identifier
      name: row.location_name ?? "Unknown location",
      lat: row.location_lat,
      lng: row.location_lng
    },
    region: row.region ?? "Unknown",
    imageUrl: primaryImage?.imageUrl ?? null,
    thumbUrl: primaryImage?.thumbUrl ?? null,
    hints: hintsRaw,
    category: row.category ?? undefined,
    difficulty: row.difficulty ?? undefined,
  };
}
