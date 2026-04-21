/**
 * Disabled script.
 *
 * This script previously depended on `src/server/minimalGameLoop.ts`, which is
 * intentionally disabled. Keep this file as an explicit guard so accidental
 * execution fails fast with a clear message.
 */

throw new Error(
  "runSinglePlayerServerLoop.ts is disabled because src/server/minimalGameLoop.ts is disabled."
);
