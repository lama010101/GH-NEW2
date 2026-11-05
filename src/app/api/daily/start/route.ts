import { NextResponse } from "next/server";
import { startDailyAttempt } from "@/server/dailyChallenge";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { rejectIfGuest } from "@/server/guestGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const guest = rejectIfGuest(user);
    if (guest) return guest;

    const result = await startDailyAttempt(user.id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start daily challenge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
