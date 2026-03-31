import { EventRecord, MAX_ROUNDS, PreflightResult } from "./types";

export function runPreflightCheck(events: EventRecord[]): PreflightResult {
  const issues: string[] = [];

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    issues.push("Browser reports offline status.");
  }

  if (!Array.isArray(events) || events.length < MAX_ROUNDS) {
    issues.push(`At least ${MAX_ROUNDS} events are required to start practice mode.`);
  }

  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.id)) {
      issues.push(`Duplicate event id detected: ${event.id}`);
      break;
    }
    ids.add(event.id);
  }

  return {
    passed: issues.length === 0,
    issues
  };
}
