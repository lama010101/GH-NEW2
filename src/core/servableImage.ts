// EDQ-BUILD-ADMINGEN-1122-815 — single source of truth for "servable"
// event-image URLs. Gameplay/SEO consumers previously hardcoded the
// Firebase Storage prefix; AI-generated images now land in the Supabase
// Storage public bucket `event-images`, so eligibility predicates must
// accept BOTH prefixes.
//
// SERVABLE_IMAGE_URL_LIKE is a SQL boolean fragment for use inside queries
// that alias public.images as `i` (the alias used by every call site).
// isServableImageUrl() is the TypeScript twin — same two prefixes.
//
// The Supabase prefix is built from EXPECTED_SUPABASE_PROJECT_REF (the
// repo's single source of truth for the project ref) — deterministic, no
// env access, safe in tests and client bundles.

import { EXPECTED_SUPABASE_PROJECT_REF } from "./projectRef";

export const FIREBASE_IMAGE_URL_PREFIX =
  "https://firebasestorage.googleapis.com/";

export const SUPABASE_EVENT_IMAGES_URL_PREFIX =
  `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co` +
  "/storage/v1/object/public/event-images/";

/** TypeScript twin of SERVABLE_IMAGE_URL_LIKE. */
export function isServableImageUrl(
  url: string | null | undefined
): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  return (
    url.startsWith(FIREBASE_IMAGE_URL_PREFIX) ||
    url.startsWith(SUPABASE_EVENT_IMAGES_URL_PREFIX)
  );
}

/**
 * SQL fragment replacing `i.url LIKE 'https://firebasestorage.googleapis.com/%'`.
 * Requires the images table to be aliased `i`.
 */
export const SERVABLE_IMAGE_URL_LIKE =
  `(i.url LIKE '${FIREBASE_IMAGE_URL_PREFIX}%'` +
  ` OR i.url LIKE '${SUPABASE_EVENT_IMAGES_URL_PREFIX}%')`;
