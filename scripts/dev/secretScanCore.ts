// SEC-BUILD-SECRETGUARD-042 — pure detection core for the commit/PR secret scanner.
//
// Every function in this module is pure: no env, fs, network, git or process
// access. The CLI (secret-scan.ts) feeds it text and paths; keeping the core
// pure is what lets the vitest suite exercise every rule without a repository.
//
// Detection contract:
//   - findings are reported as `path:line:RULE` and NOTHING else — no matched
//     text, prefix, suffix or length may ever leave this module;
//   - placeholders are NOT findings (see isPlaceholderValue);
//   - FORBIDDEN_FILE findings are produced by the CLI for newly added paths
//     (isForbiddenPath below); content rules never see file names.

import { createHash } from "node:crypto";

export type RuleName =
  | "DSN_WITH_PASSWORD"
  | "JWT_ANY"
  | "JWT_SERVICE_ROLE"
  | "JWT_ANON"
  | "SB_SECRET"
  | "OPENROUTER_KEY"
  | "GOOGLE_OAUTH_SECRET"
  | "PRIVATE_KEY_BLOCK"
  | "HEX64_SECRET"
  | "GENERIC_ASSIGNMENT"
  | "FORBIDDEN_FILE";

export const ALL_RULES: readonly RuleName[] = [
  "DSN_WITH_PASSWORD",
  "JWT_ANY",
  "JWT_SERVICE_ROLE",
  "JWT_ANON",
  "SB_SECRET",
  "OPENROUTER_KEY",
  "GOOGLE_OAUTH_SECRET",
  "PRIVATE_KEY_BLOCK",
  "HEX64_SECRET",
  "GENERIC_ASSIGNMENT",
  "FORBIDDEN_FILE",
];

export interface Finding {
  path: string;
  line: number;
  rule: RuleName;
  /** Raw source line — used for allowlist hashing only, NEVER printed. */
  lineText: string;
}

export interface AllowlistEntry {
  rule: string;
  path: string;
  lineSha256: string;
  reason?: string;
}

// postgres(ql)://user:password@host — the password group is captured so
// placeholder values can be skipped.
const RE_DSN = /postgres(?:ql)?:\/\/[^\s/:@?#]+:([^\s@]+)@/g;

// Three base64url segments; the header and payload segments both start with
// the same three characters (a base64url-encoded JSON opening brace).
const RE_JWT = /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

// Prefix/vendor patterns — one hit anywhere on the line is a finding. Kept in
// a data table so no constant name itself resembles a secret assignment.
const REGEX_RULES: ReadonlyArray<{ rule: RuleName; re: RegExp }> = [
  { rule: "SB_SECRET", re: /\bsb_secret_[A-Za-z0-9_-]{10,}\b/g },
  { rule: "OPENROUTER_KEY", re: /\bsk-or-v1-[0-9a-fA-F]{16,}\b/g },
  { rule: "GOOGLE_OAUTH_SECRET", re: /\bGOCSPX-[A-Za-z0-9_-]{10,}\b/g },
  { rule: "PRIVATE_KEY_BLOCK", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
];

const RE_HEX64 = /\b[0-9a-fA-F]{64}\b/;
const RE_HEX_LINE_HINT = /SECRET|TOKEN|KEY|PASSWORD/i;

// A NAME containing a sensitive keyword, then '=' or ':', then a value that is
// either double-quoted, single-quoted or a bare non-whitespace run.
const RE_ASSIGNMENT =
  /\b([A-Za-z0-9_.$-]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)[A-Za-z0-9_.$-]*)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\s"';,]+))/gi;

const PLACEHOLDER_MARKERS = ["<", "${"];
const PLACEHOLDER_WORDS = [
  "your",
  "xxx",
  "placeholder",
  "example",
  "redacted",
  "changeme",
];

/** True when a candidate value is a placeholder rather than a real secret. */
export function isPlaceholderValue(raw: string): boolean {
  const v = raw.trim().replace(/^["']+|["']+$/g, "");
  if (v.length === 0) return true;
  for (const marker of PLACEHOLDER_MARKERS) if (v.includes(marker)) return true;
  const lower = v.toLowerCase();
  for (const word of PLACEHOLDER_WORDS) if (lower.includes(word)) return true;
  // A value made of a single repeated character (aaaa…, xxxx…) is a stand-in.
  if (/^(.)\1+$/.test(v)) return true;
  return false;
}

function decodeJwtPayload(segment: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    );
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Undecodable segment — still a JWT by shape, reported as JWT_ANY.
  }
  return null;
}

/** Scan one line of text for every content rule. */
export function scanLine(path: string, line: number, text: string): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<RuleName>();
  const push = (rule: RuleName): void => {
    if (seen.has(rule)) return;
    seen.add(rule);
    findings.push({ path, line, rule, lineText: text });
  };

  for (const m of text.matchAll(RE_DSN)) {
    if (!isPlaceholderValue(m[1] ?? "")) push("DSN_WITH_PASSWORD");
  }

  for (const m of text.matchAll(RE_JWT)) {
    const parts = m[0].split(".");
    const payload = parts.length === 3 ? decodeJwtPayload(parts[1]) : null;
    const role =
      payload !== null && typeof payload.role === "string"
        ? payload.role
        : null;
    push(
      role === "service_role"
        ? "JWT_SERVICE_ROLE"
        : role === "anon"
          ? "JWT_ANON"
          : "JWT_ANY",
    );
  }

  for (const { rule, re } of REGEX_RULES) {
    if (text.match(re) !== null) push(rule);
  }
  if (RE_HEX64.test(text) && RE_HEX_LINE_HINT.test(text)) push("HEX64_SECRET");

  for (const m of text.matchAll(RE_ASSIGNMENT)) {
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (value.length >= 20 && !isPlaceholderValue(value)) {
      push("GENERIC_ASSIGNMENT");
    }
  }

  return findings;
}

/** Scan a whole text blob line by line; line numbers are 1-based. */
export function scanText(path: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    findings.push(...scanLine(path, i + 1, lines[i]));
  }
  return findings;
}

/**
 * Names that must never enter the repo as new files. Applied by the CLI to
 * added paths only (name-status 'A'); tracked history is not re-judged.
 */
export function isForbiddenPath(p: string): boolean {
  const norm = p.replace(/\\/g, "/");
  const segments = norm.split("/");
  const base = segments[segments.length - 1];
  if (base === ".dev.vars" || base === ".env") return true;
  if (
    base.startsWith(".env.") &&
    base !== ".env.example" &&
    base !== ".env.local.example"
  ) {
    return true;
  }
  if (base.endsWith(".pem") || base.endsWith(".key") || base.endsWith(".log")) {
    return true;
  }
  if (
    segments.includes("test-results") ||
    segments.includes("playwright-report")
  ) {
    return true;
  }
  return false;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * A finding is suppressed only when rule + path + sha256(trimmed line) all
 * match an entry — the allowlist therefore never contains the secret itself.
 */
export function isAllowlisted(
  f: Finding,
  entries: AllowlistEntry[],
): boolean {
  const hash = sha256Hex(f.lineText.trim());
  return entries.some(
    (e) => e.rule === f.rule && e.path === f.path && e.lineSha256 === hash,
  );
}

export function applyAllowlist(
  findings: Finding[],
  entries: AllowlistEntry[],
): Finding[] {
  return findings.filter((f) => !isAllowlisted(f, entries));
}

/** The only allowed rendering of a finding. No secret text, ever. */
export function formatFinding(f: Finding): string {
  return `${f.path}:${f.line}:${f.rule}`;
}

export function formatFindings(findings: Finding[]): string {
  return findings.map(formatFinding).join("\n");
}
