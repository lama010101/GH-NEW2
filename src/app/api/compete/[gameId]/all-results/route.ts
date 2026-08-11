import { NextResponse } from "next/server";
import { dbPool } from "@/server/db";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { verifyPartyKitSecret } from "@/server/partykitAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    // Authorization: PartyKit server-to-server bypass, or an authenticated user
    // who has a session_players row for this game and was not kicked (they may
    // have left after the session completed, which is allowed for final results).
    const partyKitSecret = request.headers.get("x-partykit-secret");
    if (partyKitSecret && verifyPartyKitSecret(partyKitSecret)) {
      const viewerHeader = request.headers.get("x-viewer-player-id");
      if (!viewerHeader || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(viewerHeader)) {
        return NextResponse.json({ error: "invalid viewer header" }, { status: 400 });
      }
    } else {
      const supabase = createAuthenticatedServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "authentication required" }, { status: 401 });
      }

      const participantResult = await dbPool.query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM session_players
          WHERE game_id = $1 AND player_id = $2 AND kicked IS NOT TRUE
        ) AS exists`,
        [gameId, user.id]
      );

      if (!participantResult.rows[0]?.exists) {
        return NextResponse.json({ error: "not a participant" }, { status: 403 });
      }
    }

    const result = await dbPool.query<{
      player_id: string;
      round_index: number;
      score: number | null;
      rank: number | null;
      distance_km: number | null;
      year_diff: number | null;
      location_score: number | null;
      time_score: number | null;
      year_guess: number | null;
      location_lat: number | null;
      location_lng: number | null;
      region: string | null;
      absent: boolean | null;
    }>(
      `SELECT
        rr.player_id,
        rr.round_index,
        rr.score,
        rr.rank,
        rr.distance_km,
        rr.year_diff,
        rr.location_score,
        rr.time_score,
        rc.year_guess,
        rc.location_lat,
        rc.location_lng,
        COALESCE(rc.absent, FALSE) AS absent,
        l.continent AS region
      FROM round_results rr
      LEFT JOIN round_commits rc
        ON rc.game_id = rr.game_id
        AND rc.round_index = rr.round_index
        AND rc.player_id = rr.player_id
      LEFT JOIN LATERAL (
        SELECT (payload->'eventIds'->rr.round_index)#>>'{}' AS event_id
        FROM round_events
        WHERE game_id = rr.game_id AND event_type = 'SESSION_CREATED'
        LIMIT 1
      ) sce ON true
      LEFT JOIN locations l ON l.event_id = sce.event_id::uuid
      WHERE rr.game_id = $1
      ORDER BY rr.round_index ASC, rr.rank ASC`,
      [gameId]
    );

    const results = result.rows.map((row) => ({
      playerId: row.player_id,
      roundIndex: row.round_index,
      score: row.score ?? 0,
      rank: row.rank ?? 0,
      distanceKm: row.distance_km,
      yearDiff: row.year_diff,
      locationScore: row.location_score,
      timeScore: row.time_score,
      didSubmit: row.year_guess !== null || row.location_lat !== null || row.location_lng !== null,
      region: row.region,
      absent: row.absent ?? false,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to get all round results";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
