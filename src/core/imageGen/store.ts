// EDQ-BUILD-ADMINGEN-1122-815 — Supabase Storage sink for generated images.
//
// Provider output (Runware imageURL) is fetched once, content-type is
// sniffed from the magic bytes (never trusted from headers), and the bytes
// are uploaded via the service-role client to the public bucket
// `event-images` at events/<event_id>/<image_id>.jpg with a 1-year
// cacheControl. The bucket is created idempotently (public) when absent.
//
// Existing Firebase-hosted images are untouched — this only writes NEW
// objects; servable-URL eligibility lives in src/core/servableImage.ts.

import { createSupabaseServerClient } from "@/core/supabaseServer";

export const EVENT_IMAGES_BUCKET = "event-images";
export const EVENT_IMAGE_CACHE_CONTROL = "31536000";
const PROVIDER_FETCH_TIMEOUT_MS = 30_000;

/** Magic-byte sniff -> MIME type, or null when unrecognized. */
export function sniffImageContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Download provider image bytes. Throws with status only — never the URL
 *  (provider URLs can carry signed query params). */
export async function fetchProviderImageBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`provider image fetch failed: HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Create the public `event-images` bucket when absent. Idempotent. */
export async function ensureEventImagesBucket(): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    throw new Error(`storage listBuckets failed: ${error.message}`);
  }
  if ((data ?? []).some((b) => b.id === EVENT_IMAGES_BUCKET)) return;
  const { error: createError } = await supabase.storage.createBucket(
    EVENT_IMAGES_BUCKET,
    { public: true }
  );
  if (createError && !/already exists|duplicate/i.test(createError.message)) {
    throw new Error(`storage createBucket failed: ${createError.message}`);
  }
}

/**
 * Upload bytes to an explicit object path inside `event-images`.
 * Returns the public URL. upsert:false — a collision is an error, never a
 * silent overwrite.
 */
export async function uploadToEventImagesBucket(
  storagePath: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.storage
    .from(EVENT_IMAGES_BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      cacheControl: EVENT_IMAGE_CACHE_CONTROL,
      upsert: false,
    });
  if (error) {
    throw new Error(`storage upload failed: ${error.message}`);
  }
  return supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(storagePath)
    .data.publicUrl;
}

export type StoredEventImage = {
  publicUrl: string;
  storagePath: string;
  contentType: string;
  byteLength: number;
};

/**
 * Fetch provider bytes -> sniff -> ensure bucket -> upload to
 * events/<scopeId>/<imageId>.jpg. `scopeId` is the event uuid; when a
 * generation targets only a candidate, the caller passes the candidate id
 * (or its resolved event_id) so the object path stays deterministic.
 */
export async function storeGeneratedEventImage(input: {
  scopeId: string;
  imageId: string;
  providerUrl: string;
}): Promise<StoredEventImage> {
  const bytes = await fetchProviderImageBytes(input.providerUrl);
  const contentType = sniffImageContentType(bytes);
  if (!contentType) {
    throw new Error("provider image bytes unrecognized (not jpeg/png/gif/webp)");
  }
  await ensureEventImagesBucket();
  const storagePath = `events/${input.scopeId}/${input.imageId}.jpg`;
  const publicUrl = await uploadToEventImagesBucket(storagePath, bytes, contentType);
  return {
    publicUrl,
    storagePath,
    contentType,
    byteLength: bytes.length,
  };
}
