import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient, createSupabaseServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser(): Promise<{ user: { id: string } } | null> {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  return { user };
}

// POST /api/ratings — upsert a 1-10 rating for an event
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = auth;

  let body: { event_id?: unknown; rating?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventIdRaw = body.event_id;
  const ratingRaw = body.rating;

  if (typeof eventIdRaw !== "string" || eventIdRaw.length === 0) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  if (typeof ratingRaw !== "number" || !Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 10) {
    return NextResponse.json({ error: "rating must be an integer between 1 and 10" }, { status: 400 });
  }

  const serviceRoleClient = createSupabaseServerClient();

  try {
    // rated_at omitted so it defaults on INSERT and is preserved on re-rate; updated_at sent every write.
    const now = new Date().toISOString();
    const { error: upsertError } = await serviceRoleClient
      .from("player_event_ratings")
      .upsert(
        {
          player_id: user.id,
          event_id: eventIdRaw,
          rating: ratingRaw,
          updated_at: now,
        },
        { onConflict: "player_id,event_id" }
      );

    if (upsertError) {
      console.error("[ratings] Failed to upsert rating:", upsertError);
      return NextResponse.json({ error: "Failed to save rating" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rating: ratingRaw });
  } catch (error) {
    console.error("[ratings] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to save rating" }, { status: 500 });
  }
}

// GET /api/ratings?event_id=... — fetch the current player's rating for one event
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = auth;
  const eventId = request.nextUrl.searchParams.get("event_id");

  if (!eventId) {
    return NextResponse.json({ error: "event_id query param is required" }, { status: 400 });
  }

  const serviceRoleClient = createSupabaseServerClient();

  try {
    const { data, error } = await serviceRoleClient
      .from("player_event_ratings")
      .select("rating")
      .eq("player_id", user.id)
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) {
      console.error("[ratings] Failed to fetch rating:", error);
      return NextResponse.json({ error: "Failed to fetch rating" }, { status: 500 });
    }

    return NextResponse.json({ rating: data?.rating ?? null });
  } catch (error) {
    console.error("[ratings] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to fetch rating" }, { status: 500 });
  }
}
