import { NextResponse } from "next/server";
import { isPersistedGameState } from "@/core/gamePersistence";
import { savePersistedGameState } from "@/server/gameSessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (!isPersistedGameState(body)) {
      return NextResponse.json({ error: "Invalid game state payload" }, { status: 400 });
    }

    await savePersistedGameState(body);

    return NextResponse.json({ success: true, gameId: body.gameId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save game state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
