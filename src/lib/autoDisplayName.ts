// Guard against overwriting a custom display_name when re-rolling an avatar.
// The auto-generated template used in both assign-avatar and update-avatar is:
//   `${baseName}#[1-9]\d{3}` (e.g. "Cleopatra#4721").
// See src/app/api/user/assign-avatar/route.ts and src/app/api/user/update-avatar/route.ts.
const AUTO_GENERATED_DISPLAY_NAME_RE = /^[^#]+#[1-9]\d{3}$/;

export function canOverwriteDisplayName(displayName: string | null | undefined): boolean {
  if (!displayName || displayName.trim().length === 0) {
    return true;
  }
  return AUTO_GENERATED_DISPLAY_NAME_RE.test(displayName.trim());
}
