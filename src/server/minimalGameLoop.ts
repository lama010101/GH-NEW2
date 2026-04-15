/**
 * 🚫 DISABLED MODULE
 *
 * This file previously contained a mutable in-memory game loop.
 * It violated core architecture rules:
 * - Multiple sources of truth
 * - Non-deterministic state mutation
 * - No lifecycle ownership
 *
 * This module is intentionally disabled.
 * DO NOT USE.
 */

throw new Error(
  "minimalGameLoop.ts is disabled — orphan mutation authority is forbidden"
);
