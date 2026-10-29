import { NextResponse } from "next/server";
import { syncOpenRouterCatalog } from "@/server/openrouterCatalogSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cron entrypoint that snapshots the OpenRouter model catalog.
// Task: AIP-BUILD-CATALOGSTORE-1026-204.
//
// Auth: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when the
// CRON_SECRET env var is configured. This route is NOT under /api/admin so
// the admin middleware does not cover it — the bearer check below is the gate.
// If CRON_SECRET is not configured the route is disabled (503), never open.
//
// `?dry=1` fetches and plans only: no DB writes, no sync_runs row.

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim().length === 0) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured — catalog sync disabled" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const summary = await syncOpenRouterCatalog({
      source: "vercel_cron",
      dryRun,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
