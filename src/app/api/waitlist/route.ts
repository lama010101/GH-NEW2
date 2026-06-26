import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/waitlist — submit an email to the waitlist
export async function POST(request: NextRequest) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const email = body.email;
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  try {
    const { error } = await supabase
      .from("waitlist")
      .insert({ email });

    if (error) {
      // Supabase/Postgres unique-violation error code 23505
      if (error.code === "23505") {
        return NextResponse.json({ error: "already_registered" }, { status: 409 });
      }
      console.error("[waitlist] Failed to insert:", error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[waitlist] Unexpected error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
