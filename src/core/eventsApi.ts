import { EventRecord, MAX_ROUNDS } from "@/core/types";

export type FetchEventsOptions = {
  count?: number;
  excludeIds?: string[];
  minYear?: number;
  maxYear?: number;
  regions?: string[];
};

export type FetchEventsResponse = {
  events: EventRecord[];
  count: number;
  filters?: {
    minYear?: number;
    maxYear?: number;
    regions?: string[];
  };
};

export type EventsMetadata = {
  regions: string[];
  yearRange: {
    min: number;
    max: number;
  };
};

/**
 * Fetch random events for a game session
 */
export async function fetchEvents(options: FetchEventsOptions = {}): Promise<FetchEventsResponse> {
  const { count = MAX_ROUNDS, excludeIds, minYear, maxYear, regions } = options;

  const params = new URLSearchParams();
  params.set("count", String(count));

  if (excludeIds && excludeIds.length > 0) {
    params.set("exclude", excludeIds.join(","));
  }

  if (minYear !== undefined) {
    params.set("minYear", String(minYear));
  }

  if (maxYear !== undefined) {
    params.set("maxYear", String(maxYear));
  }

  if (regions && regions.length > 0) {
    params.set("regions", regions.join(","));
  }

  const response = await fetch(`/api/events?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Failed to fetch events: ${response.status}`);
  }

  const payload = (await response.json()) as FetchEventsResponse;
  if (!Array.isArray(payload.events) || payload.events.length < count) {
    throw new Error(`Expected ${count} real events from the database, received ${payload.events?.length ?? 0}`);
  }

  return payload;
}

/**
 * Fetch available metadata for events (regions, year range)
 */
export async function fetchEventsMetadata(): Promise<EventsMetadata> {
  const response = await fetch("/api/events/metadata");

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Failed to fetch metadata: ${response.status}`);
  }

  return response.json();
}
