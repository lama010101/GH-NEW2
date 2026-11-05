import { NextResponse } from "next/server";

/**
 * GUEST-GATE-SERVER-1029-004: anonymous (guest) Supabase users must not reach
 * server surfaces that create durable non-journey state or expose social
 * surfaces. Callers insert `rejectIfGuest(user)` immediately after their
 * existing getUser()/401 check; a non-null return is a ready 403 response.
 */
export function rejectIfGuest(user: { is_anonymous?: boolean | null } | null | undefined) {
  if (user?.is_anonymous === true) {
    return NextResponse.json({ error: "guest_conversion_required" }, { status: 403 });
  }
  return null;
}
