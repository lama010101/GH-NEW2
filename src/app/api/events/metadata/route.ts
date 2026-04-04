import { NextResponse } from "next/server";
import { fetchAvailableRegions, fetchYearRange } from "@/server/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/metadata
 *
 * Fetch available filters (regions, year range) for events
 */
export async function GET() {
  try {
    const [regions, yearRange] = await Promise.all([
      fetchAvailableRegions(),
      fetchYearRange()
    ]);

    return NextResponse.json({
      regions,
      yearRange
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch metadata";
    console.error("Failed to fetch events metadata:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
