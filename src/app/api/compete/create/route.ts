import { NextResponse } from "next/server";
import type { CreateCompeteSessionInput } from "@/core/types";
import { createCompeteSession } from "@/server/sessionCore";
import { requireAuthenticatedPlayer } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedPlayer(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json().catch(() => ({}))) as Partial<CreateCompeteSessionInput>;

    if (typeof body.displayName !== "string") {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (body.playerId !== auth.playerId) {
      return NextResponse.json({ error: "playerId does not match authenticated user" }, { status: 403 });
    }

    const snapshot = await createCompeteSession({
      displayName: body.displayName,
      playerId: body.playerId,
      mode: body.mode,
      roundTimerSec: body.roundTimerSec,
      totalRounds: body.totalRounds,
      yearMin: body.yearMin,
      yearMax: body.yearMax
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create compete session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
