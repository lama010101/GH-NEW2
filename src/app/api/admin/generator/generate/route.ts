import { NextResponse } from "next/server";
import { requireAdmin } from "@/core/adminAuth";
import { getDbPool } from "@/server/db";
import { isUuid } from "@/core/isUuid";
import {
  generateAndStoreImage,
  getAdminSpendToday,
  assertSpendWithinCap,
  utcDateString,
  GenerateError,
  CONFIRM_PRICE_THRESHOLD_USD,
  resolveRegistryModel,
  providerApiKeyFor,
} from "./lib";

// EDQ-BUILD-ADMINGEN-1122-815 — POST /api/admin/generator/generate.
// requireAdmin() is the FIRST awaited call (middleware /admin gate is
// dev-bypassed). Spend cap is checked BEFORE any provider call.

export const runtime = "nodejs";
export const maxDuration = 60;

function authError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : "";
  return NextResponse.json(
    { error: msg === "Forbidden" ? "Forbidden" : "Unauthorized" },
    { status: msg === "Forbidden" ? 403 : 401 }
  );
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requireAdmin();
  } catch (e) {
    return authError(e);
  }
  const pool = getDbPool();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const eventId = typeof body.event_id === "string" && body.event_id ? body.event_id : null;
  const candidateId =
    typeof body.candidate_id === "string" && body.candidate_id ? body.candidate_id : null;
  const modelId = typeof body.model_id === "string" ? body.model_id : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const negativePrompt =
    typeof body.negative_prompt === "string" ? body.negative_prompt : null;
  const confirm = body.confirm === true;

  if (!eventId && !candidateId) {
    return NextResponse.json({ error: "event_id or candidate_id required" }, { status: 400 });
  }
  if (eventId && !isUuid(eventId)) {
    return NextResponse.json({ error: "invalid event_id" }, { status: 400 });
  }
  if (candidateId && !isUuid(candidateId)) {
    return NextResponse.json({ error: "invalid candidate_id" }, { status: 400 });
  }
  if (!modelId) {
    return NextResponse.json({ error: "model_id required" }, { status: 400 });
  }
  if (!prompt.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  let entry;
  try {
    entry = resolveRegistryModel(modelId);
  } catch (e) {
    if (e instanceof GenerateError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    }
    throw e;
  }

  // Price gate: expensive models require explicit confirm=true.
  if (
    (entry.price_usd_est ?? 0) > CONFIRM_PRICE_THRESHOLD_USD &&
    !confirm
  ) {
    return NextResponse.json(
      { error: "confirm_required", message: `model ${entry.id} costs > $${CONFIRM_PRICE_THRESHOLD_USD}` },
      { status: 400 }
    );
  }
  if (!providerApiKeyFor(entry)) {
    return NextResponse.json(
      { error: "key_not_configured", message: `${entry.requiredKeyName} is not configured` },
      { status: 400 }
    );
  }

  // Spend cap BEFORE the provider call: per admin per UTC day.
  try {
    const spend = await getAdminSpendToday(pool, session.user.id, utcDateString());
    assertSpendWithinCap(spend);
  } catch (e) {
    if (e instanceof GenerateError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    }
    throw e;
  }

  try {
    const result = await generateAndStoreImage({
      pool,
      modelId: entry.id,
      prompt,
      negativePrompt,
      eventId,
      candidateId,
      adminUserId: session.user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof GenerateError) {
      return NextResponse.json(
        { error: e.code, message: e.message, providerStatus: e.providerStatus },
        { status: e.status }
      );
    }
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
