import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison of the x-partykit-secret header against the
 * configured PARTYKIT_SECRET env var. Prevents timing attacks that could
 * leak the secret byte-by-byte.
 *
 * Returns true if the secret matches, false otherwise (including when
 * either value is missing/empty).
 */
export function verifyPartyKitSecret(headerValue: string | null): boolean {
  const expected = process.env.PARTYKIT_SECRET;
  if (!headerValue || !expected) return false;
  if (headerValue.length !== expected.length) return false;

  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}
