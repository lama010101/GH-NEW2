/**
 * Constant-time comparison of the x-partykit-secret header against the
 * configured PARTYKIT_SECRET env var. Prevents timing attacks that could
 * leak the secret byte-by-byte.
 *
 * Returns true if the secret matches, false otherwise (including when
 * either value is missing/empty).
 *
 * Implementation note: uses TextEncoder + manual XOR accumulation instead
 * of Node's `crypto.timingSafeEqual` so this module is safe to import from
 * the Next.js edge runtime (src/middleware.ts), which does not support the
 * Node.js `crypto` module. TextEncoder is available in both edge and node
 * runtimes. The comparison has no early exit, preserving constant-time
 * behavior on equal-length inputs.
 */
export function verifyPartyKitSecret(headerValue: string | null): boolean {
  const expected = process.env.PARTYKIT_SECRET;
  if (!headerValue || !expected) return false;
  if (headerValue.length !== expected.length) return false;

  const a = new TextEncoder().encode(headerValue);
  const b = new TextEncoder().encode(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
