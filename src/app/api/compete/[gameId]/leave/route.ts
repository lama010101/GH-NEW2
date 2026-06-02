import { NextResponse } from "next/server";
import { getTransactionClient, loadCompeteSessionSnapshot } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const secret = request.headers.get("x-partykit-secret");
  if (!secret || secret !== process.env.PARTYKIT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as { playerId?: unknown };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const client = await getTransactionClient();
    try {
      await client.query("BEGIN");

      // 1. Update left_at
      const result = await client.query<{ player_id: string; is_host: boolean }>(
        `UPDATE session_players
         SET left_at = now()
         WHERE game_id = $1
           AND player_id = $2
           AND left_at IS NULL
         RETURNING player_id, is_host`,
        [gameId, body.playerId]
      );

      if (result.rows.length === 0) {
        await client.query("COMMIT");
        const snapshot = await loadCompeteSessionSnapshot(gameId, body.playerId);
        if (!snapshot) return NextResponse.json({ error: "Session not found" }, { status: 404 });
        return NextResponse.json(snapshot);
      }

      // 2. If leaving player was host, reassign to earliest-joined active player
      if (result.rows[0].is_host) {
        const newHost = await client.query<{ player_id: string }>(
          `SELECT player_id
           FROM session_players
           WHERE game_id = $1
             AND left_at IS NULL
           ORDER BY joined_at ASC
           LIMIT 1`,
          [gameId]
        );

        if (newHost.rows.length > 0) {
          // Clear old host (partial unique index ensures at most one)
          await client.query(
            `UPDATE session_players
             SET is_host = false
             WHERE game_id = $1 AND is_host = true`,
            [gameId]
          );
          // Assign new host
          await client.query(
            `UPDATE session_players
             SET is_host = true
             WHERE game_id = $1 AND player_id = $2`,
            [gameId, newHost.rows[0].player_id]
          );
        }
        // else: no active players remain — no host assigned (acceptable)
      }

      await client.query("COMMIT");
    } catch (txError) {
      await client.query("ROLLBACK");
      const msg = txError instanceof Error ? txError.message : "Host reassignment failed";
      console.error("[/api/compete/:gameId/leave] Transaction error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    } finally {
      client.release();
    }

    const snapshot = await loadCompeteSessionSnapshot(gameId, body.playerId as string);
    if (!snapshot) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record disconnect";
    console.error("[/api/compete/:gameId/leave]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
