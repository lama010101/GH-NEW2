import { NextResponse } from "next/server";
import { requireAdmin } from "@/core/adminAuth";
import { fetchOpenRouterModels } from "@/server/openrouter";

export const dynamic = "force-dynamic";

function authError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : "";
  return NextResponse.json(
    { error: msg === "Forbidden" ? "Forbidden" : "Unauthorized" },
    { status: msg === "Forbidden" ? 403 : 401 }
  );
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return authError(e);
  }

  try {
    const models = await fetchOpenRouterModels();
    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
