import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { rankAccuracyGateEnabled, resolveRank } from "@/core/rank";
import { evaluateAndPersistRank } from "@/server/rankStatus";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// RANK-BUILD-ACCGATE-1103-003: evaluates the caller's own high-water-mark
// rank under the accuracy gate. Operates on the authenticated user's row
// only — no player id is accepted from the request. Idempotent.
export async function POST() {
  const supabase = createAuthenticatedServerClient();
  // Server per-request client: getUser() verifies the JWT with the auth server;
  // getSession() does not and must not be used for authz here.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  if (!rankAccuracyGateEnabled()) {
    return NextResponse.json({ gateEnabled: false }, { headers: NO_STORE });
  }

  try {
    const snap = await evaluateAndPersistRank(user.id);
    const resolved = resolveRank(snap.totalXp, {
      maxRankTier: snap.maxRankTier,
      rollingAccPct: snap.rollingAccPct,
      roundsSampled: snap.roundsSampled,
    });

    return NextResponse.json(
      {
        gateEnabled: true,
        tier: resolved.tier,
        maxRankTier: snap.maxRankTier,
        gate: resolved.gate,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("[api/player/rank-status] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: NO_STORE });
  }
}
