// AIP-FIX-FLEETHALT-MERGE-1102-051: shared strict UUID validator.
// Shape matches the existing per-route uuidRegex convention
// (e.g. src/app/api/invitations/send/route.ts): 8-4-4-4-12 hex,
// case-insensitive, anchored — anything else is rejected.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
