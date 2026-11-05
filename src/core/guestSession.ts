"use client";

// Guest-first entry (GUEST-BUILD-ANONSIGNIN-1029-003): resolves the current
// auth state, creating an anonymous Supabase session when none exists.
//
// Ordering is dictated by the shared GoTrueClient mutex (CTO ruling
// 2026-09-01 in supabaseBrowser.ts): every step below is a sequential
// `await` — never concurrent GoTrueClient calls, no getUser(), no
// Promise.race between GoTrue calls, no retry loop.
//
//   1. readSession() — the app-wide single-flight/backoff wrapper; returns
//      null on resolved-null AND on its internal 8s timeout.
//   2. supabaseBrowser.auth.getSession() — one direct SDK read covering the
//      timeout/stale-cache cases readSession() can legitimately miss.
//   3. supabaseBrowser.auth.signInAnonymously() — only when both reads are
//      provably sessionless.
//
// The new identity is published by the existing onAuthStateChange identity
// subscriber — this module never touches it.

import { readSession, supabaseBrowser } from "./supabaseBrowser";

export type EnsureGuestSessionResult = "existing" | "guest" | "error";

export async function ensureGuestSession(): Promise<EnsureGuestSessionResult> {
  try {
    const session = await readSession();
    if (session?.user) {
      return "existing";
    }

    const { data } = await supabaseBrowser.auth.getSession();
    if (data.session?.user) {
      return "existing";
    }

    const { data: anonData, error } =
      await supabaseBrowser.auth.signInAnonymously();
    if (error || !anonData.user) {
      return "error";
    }
    return "guest";
  } catch {
    return "error";
  }
}
