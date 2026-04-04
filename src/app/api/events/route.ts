import { NextResponse } from "next/server";
import { fetchRandomEventsForSession, fetchAvailableRegions, fetchYearRange } from "@/server/events";
import { MAX_ROUNDS } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events?count=5&minYear=1800&maxYear=2000&regions=Europe,Asia
 *
 * Fetch random events for a game session
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const count = Math.min(
      parseInt(searchParams.get("count") || String(MAX_ROUNDS), 10),
      20 // Max 20 events per request
    );

    const excludeIds = searchParams.get("exclude")?.split(",").filter(Boolean) || [];
    const minYear = searchParams.has("minYear") ? parseInt(searchParams.get("minYear")!, 10) : undefined;
    const maxYear = searchParams.has("maxYear") ? parseInt(searchParams.get("maxYear")!, 10) : undefined;
    const regions = searchParams.get("regions")?.split(",").filter(Boolean) || undefined;

    const events = await fetchRandomEventsForSession(count, {
      excludeEventIds: excludeIds,
      minYear,
      maxYear,
      regions
    });

    if (events.length === 0) {
      return NextResponse.json(
        { error: "No events found matching criteria" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      events,
      count: events.length,
      filters: {
        minYear,
        maxYear,
        regions
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch events";
    console.error("Failed to fetch events:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
