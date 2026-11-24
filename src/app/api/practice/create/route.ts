import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { CreateCompeteSessionInput } from "@/core/types";
import { createCompeteSession } from "@/server/sessionCore";
import { localizeSnapshot } from "@/server/localizedSnapshot";
import { resolveOverlayLocale } from "@/server/contentTranslations";
import { LOCALE_COOKIE } from "@/i18n/config";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { rejectIfGuest } from "@/server/guestGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const guest = rejectIfGuest(user);
    if (guest) return guest;

    const body = (await request.json().catch(() => ({}))) as Partial<CreateCompeteSessionInput>;

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (body.playerId !== user.id) {
      return NextResponse.json({ error: "playerId must match authenticated user" }, { status: 403 });
    }

    const snapshot = await createCompeteSession({
      displayName: body.displayName,
      playerId: body.playerId,
      mode: "practice",
      roundTimerSec: body.roundTimerSec,
      yearMin: body.yearMin,
      yearMax: body.yearMax,
      selectedRegions: Array.isArray(body.selectedRegions) ? body.selectedRegions : undefined,
    });

    const cookieStore = await cookies();
    const lang = resolveOverlayLocale(cookieStore.get(LOCALE_COOKIE)?.value);
    return NextResponse.json(await localizeSnapshot(snapshot, lang));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create practice session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
