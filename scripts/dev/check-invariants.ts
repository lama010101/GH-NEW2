// EDQ-BUILD-GUARDRAILS-1127-920 / standing rule 5.1 — repository invariant checker.
//
// Usage:
//   npm run check:invariants              scan the current worktree
//   npm run check:invariants -- --self-test
//       prove rules 1, 3 and 4 FAIL on synthetic violating in-memory fixtures
//       and PASS on clean in-memory fixtures. No violating fixture is committed.
//
// Output contract: PASS/FAIL/MANUAL per rule with counts only. Source lines and
// secret-shaped text are never printed. MANUAL means the requested invariant is
// not mechanically decidable with the information available to a static scan.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type SourceFile = {
  path: string;
  text: string;
};

type LocationCount = {
  path: string;
  line: number;
  count: number;
};

type RuleResult = {
  id: string;
  title: string;
  status: "PASS" | "FAIL" | "MANUAL";
  counts: Record<string, number>;
  locations: LocationCount[];
  note?: string;
};

const RULE1_ID = "room-broadcast";
const RULE2_ID = "snapshot-authority";
const RULE3_ID = "signed-years";
const RULE4_ID = "committed-secrets";

// KNOWN-FAILING inventory required by the 920 dispatch. Entries are rule-level,
// non-blocking, and deliberately explicit; they do not suppress self-test raw
// rule evaluation. TODO: remove each entry only after the underlying product
// debt is migrated in a dedicated task.
const KNOWN_FAILING: Record<string, { todo: string; reason: string }> = {
  [RULE2_ID]: {
    todo: "EDQ-TODO-DO-SNAPSHOT-REFETCH-RECOVERY",
    reason:
      "origin/main still contains explicit fallbackSnapshot re-fetch/apply paths and one reload-then-broadcast path in partykit/server.ts; removing those recovery paths is product-code migration outside this guardrails phase.",
  },
  [RULE3_ID]: {
    todo: "EDQ-TODO-SIGNED-YEARS-LEGACY-NOTATION",
    reason:
      "origin/main still contains legacy era notation in year parsing tests/comments and generation-era bucket labels; product-code migration is outside this guardrails phase.",
  },
};

// Signed-year notation allowlist. Currently empty by design: no exception has
// been approved in the dispatch. Future entries must be line-specific and each
// must carry a reason comment explaining why recognizing legacy input notation
// is required rather than emitting it.
const SIGNED_YEAR_ALLOWLIST: ReadonlyArray<{ path: string; line: number; reason: string }> = [];

type SecretPatternClass =
  | "PRIVATE_KEY_BEGIN"
  | "JWT_LIKE"
  | "OPENROUTER_LIKE"
  | "GOOGLE_API_KEY_LIKE"
  | "BEARER_VALUE"
  | "TOKEN_QUERY_VALUE"
  | "POSTGRES_DSN"
  | "SENSITIVE_ASSIGNMENT";

type SecretAllowlistEntry = {
  path: string;
  line?: number;
  patternClass: SecretPatternClass;
  reason: string;
};

// Secret-scan allowlist. Entries are intentionally path+pattern-class specific
// or line-specific; none is a whole-directory suppression. Each reason records
// why the literal is test/documentation material or public client configuration.
const SECRET_ALLOWLIST: ReadonlyArray<SecretAllowlistEntry> = [
  {
    path: "android/app/google-services.json",
    patternClass: "GOOGLE_API_KEY_LIKE",
    reason: "Firebase Android client configuration is distributed with the app by design; dashboard/API restrictions cannot be verified from the repository.",
  },
  {
    path: "docs/SECRET_HYGIENE.md",
    line: 44,
    patternClass: "OPENROUTER_LIKE",
    reason: "Secret-hygiene documentation contains a deliberately non-usable example of the key format.",
  },
  {
    path: "package-lock.json",
    patternClass: "JWT_LIKE",
    reason: "Generated lockfile data contains a non-credential JWT-shaped substring in public package metadata.",
  },
  {
    path: "scripts/dev/envCheck.test.ts",
    line: 213,
    patternClass: "SENSITIVE_ASSIGNMENT",
    reason: "Environment-validation test fixture; not a deployed credential.",
  },
  {
    path: "scripts/dev/envCheck.test.ts",
    line: 249,
    patternClass: "SENSITIVE_ASSIGNMENT",
    reason: "Environment-validation test fixture; not a deployed credential.",
  },
  {
    path: "scripts/dev/envCheck.test.ts",
    line: 298,
    patternClass: "SENSITIVE_ASSIGNMENT",
    reason: "Environment-validation test fixture; not a deployed credential.",
  },
  {
    path: "scripts/dev/envCheck.test.ts",
    line: 301,
    patternClass: "POSTGRES_DSN",
    reason: "Environment-validation test DSN uses non-resolving test infrastructure and is not a deployed credential.",
  },
  {
    path: "scripts/dev/envCheck.test.ts",
    line: 302,
    patternClass: "SENSITIVE_ASSIGNMENT",
    reason: "Environment-validation test fixture; not a deployed credential.",
  },
  {
    path: "scripts/dev/envCheck.test.ts",
    line: 304,
    patternClass: "SENSITIVE_ASSIGNMENT",
    reason: "Environment-validation test fixture; not a deployed credential.",
  },
  {
    path: "scripts/dev/secretScan.test.ts",
    line: 39,
    patternClass: "PRIVATE_KEY_BEGIN",
    reason: "Secret-scanner test fixture proving detector behavior; not a credential in use.",
  },
  {
    path: "scripts/dev/secretScanCore.ts",
    patternClass: "OPENROUTER_LIKE",
    reason: "Scanner pattern-source/test constant documents the detector shape and is deliberately non-usable.",
  },
  {
    path: "scripts/dev/secretScanCore.ts",
    patternClass: "PRIVATE_KEY_BEGIN",
    reason: "Scanner pattern-source/test constant documents the detector shape and is deliberately non-usable.",
  },
  {
    path: "scripts/dev/security-posture-audit.sql",
    line: 149,
    patternClass: "PRIVATE_KEY_BEGIN",
    reason: "Security-audit fixture/pattern source used to test detection logic; not a credential in use.",
  },
  {
    path: "scripts/test/_scratch/theme-screenshots/contact-sheet.html",
    patternClass: "JWT_LIKE",
    reason: "Generated visual-test artifact contains a JWT-shaped base64 substring that is not credential material.",
  },
  {
    path: "src/app/api/push/fcm-token/route.test.ts",
    line: 4,
    patternClass: "SENSITIVE_ASSIGNMENT",
    reason: "Push-token route test fixture; not a deployed credential.",
  },
  {
    path: "src/server/pushSender.test.ts",
    line: 254,
    patternClass: "SENSITIVE_ASSIGNMENT",
    reason: "Push sender test fixture; not a deployed credential.",
  },
  {
    path: "src/server/pushSender.test.ts",
    line: 309,
    patternClass: "PRIVATE_KEY_BEGIN",
    reason: "Push sender test fixture key material generated for tests; not a credential in use.",
  },
];

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const REPO_ROOT = git(["rev-parse", "--show-toplevel"], process.cwd()).trim();

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function listTrackedFiles(cwd: string = REPO_ROOT): string[] {
  return git(["ls-files", "-z"], cwd)
    .split("\0")
    .filter((path) => path.length > 0)
    .map(normalizePath);
}

function baseName(path: string): string {
  const parts = normalizePath(path).split("/");
  return parts[parts.length - 1];
}

function isDotenvLike(path: string): boolean {
  const base = baseName(path);
  return base === ".dev.vars" || base.startsWith(".dev.vars.") || base === ".env" || base.startsWith(".env.");
}

function isExampleDotenvLike(path: string): boolean {
  return isDotenvLike(path) && baseName(path).endsWith(".example");
}

function isBinaryText(text: string): boolean {
  return text.includes("\0");
}

function readTrackedSourceFiles(cwd: string = REPO_ROOT): SourceFile[] {
  const out: SourceFile[] = [];
  for (const path of listTrackedFiles(cwd)) {
    // Secret-safety rule: dotenv-like files are never opened, even example
    // files. Their filenames are checked separately in rule 4.
    if (isDotenvLike(path)) continue;
    let text: string;
    try {
      text = readFileSync(join(cwd, path), "utf8");
    } catch {
      continue;
    }
    if (isBinaryText(text)) continue;
    out.push({ path, text });
  }
  return out;
}

const GLOBAL_RE_CACHE = new WeakMap<RegExp, RegExp>();

function countRegexInLine(line: string, re: RegExp): number {
  let globalRe = re;
  if (!re.flags.includes("g")) {
    const cached = GLOBAL_RE_CACHE.get(re);
    if (cached) {
      globalRe = cached;
    } else {
      globalRe = new RegExp(re.source, `${re.flags}g`);
      GLOBAL_RE_CACHE.set(re, globalRe);
    }
  }
  globalRe.lastIndex = 0;
  return line.match(globalRe)?.length ?? 0;
}

function scanLocations(
  files: SourceFile[],
  inScope: (path: string) => boolean,
  re: RegExp,
): { occurrences: number; locations: LocationCount[] } {
  let occurrences = 0;
  const locations: LocationCount[] = [];
  for (const file of files) {
    if (!inScope(file.path)) continue;
    const lines = file.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const count = countRegexInLine(lines[index], re);
      if (count > 0) {
        occurrences += count;
        locations.push({ path: file.path, line: index + 1, count });
      }
    }
  }
  return { occurrences, locations };
}

function scopedPartykitOrSrc(path: string): boolean {
  return path.startsWith("partykit/") || path.startsWith("src/");
}

function broadcastStateUpdateBlock(serverSource: string): string {
  const start = serverSource.indexOf("private broadcastStateUpdate");
  if (start < 0) return "";
  const next = serverSource.indexOf("\n  private ", start + 1);
  return next < 0 ? serverSource.slice(start) : serverSource.slice(start, next);
}

function checkBroadcastRule(files: SourceFile[]): RuleResult {
  const roomBroadcast = scanLocations(files, scopedPartykitOrSrc, /room\.broadcast\b/);
  const server = files.find((file) => file.path === "partykit/server.ts");
  const block = server ? broadcastStateUpdateBlock(server.text) : "";
  const perSocketLoops = countRegexInLine(block, /this\.room\.getConnections\(/);
  const fail = roomBroadcast.occurrences !== 0 || perSocketLoops === 0;
  return {
    id: RULE1_ID,
    title: "room.broadcast banned; broadcastStateUpdate uses per-socket getConnections loop",
    status: fail ? "FAIL" : "PASS",
    counts: {
      roomBroadcastOccurrences: roomBroadcast.occurrences,
      broadcastStateUpdateGetConnectionsOccurrences: perSocketLoops,
    },
    locations: roomBroadcast.locations,
  };
}

function countProductionOccurrences(
  files: SourceFile[],
  re: RegExp,
  exclude: (path: string) => boolean,
): number {
  return scanLocations(
    files,
    (path) => (path.startsWith("src/") || path.startsWith("partykit/")) && !exclude(path),
    re,
  ).occurrences;
}

function checkSnapshotRule(files: SourceFile[]): RuleResult {
  const productionCode = (path: string): boolean =>
    path.includes(".test.") || path.endsWith("src/server/getGameState.ts");
  const fallbackApply = scanLocations(
    files,
    (path) => path === "partykit/server.ts",
    /applySnapshotAndBroadcast\(fallbackSnapshot\)/,
  );
  const loadFromDbCalls = scanLocations(files, (path) => path === "partykit/server.ts", /this\.loadFromDB\(\)/);
  const server = files.find((file) => file.path === "partykit/server.ts");
  const reloadThenBroadcastRe = /await\s+this\.loadFromDB\(\);\s*this\.broadcastStateUpdate\(\)/g;
  const reloadThenBroadcastMatches = server ? [...server.text.matchAll(reloadThenBroadcastRe)] : [];
  const reloadThenBroadcastLocations: LocationCount[] = reloadThenBroadcastMatches.map((match) => ({
    path: "partykit/server.ts",
    line: server ? server.text.slice(0, match.index ?? 0).split(/\r?\n/).length : 0,
    count: 1,
  }));
  const hardViolations = fallbackApply.occurrences + reloadThenBroadcastMatches.length;
  return {
    id: RULE2_ID,
    title: "MP-DO-AUTHORITATIVE-006 snapshot authority and write/refetch/broadcast ordering",
    status: hardViolations > 0 ? "FAIL" : "MANUAL",
    counts: {
      loadCompeteSessionSnapshotOccurrences: countProductionOccurrences(
        files,
        /loadCompeteSessionSnapshot\b/,
        (path) => path.includes(".test."),
      ),
      directGetGameStateOccurrencesOutsideBuilderModule: countProductionOccurrences(
        files,
        /getGameState\b/,
        productionCode,
      ),
      fallbackSnapshotApplyOccurrences: fallbackApply.occurrences,
      reloadThenBroadcastOccurrences: reloadThenBroadcastMatches.length,
      loadFromDbCallOccurrences: loadFromDbCalls.occurrences,
    },
    locations: [...fallbackApply.locations, ...reloadThenBroadcastLocations, ...loadFromDbCalls.locations],
    note:
      "Static grep FAILs explicit fallbackSnapshot apply and reload-then-broadcast patterns. Even when those are absent, static analysis cannot prove cross-request write ordering, snapshot provenance, or whether every async helper is reachable only through loadCompeteSessionSnapshot(); absence of hard hits therefore remains MANUAL rather than a fake PASS.",
  };
}

function signedYearScope(path: string): boolean {
  return (
    path.startsWith("src/core/") ||
    path.startsWith("scripts/generation/") ||
    path.startsWith("scripts/factcheck/") ||
    path.startsWith("src/app/api/") ||
    baseName(path).toLowerCase().includes("prompt")
  );
}

function signedYearRegex(): RegExp {
  return /(^|[^A-Za-z0-9])(B\.C\.E\.|B\.C\.|BCE|BC)(?![A-Za-z0-9])/;
}

function checkSignedYearsRule(files: SourceFile[]): RuleResult {
  const raw = scanLocations(files, signedYearScope, signedYearRegex());
  const allowlisted = new Set(SIGNED_YEAR_ALLOWLIST.map((entry) => `${entry.path}:${entry.line}`));
  const locations = raw.locations.filter((location) => !allowlisted.has(`${location.path}:${location.line}`));
  const occurrences = locations.reduce((sum, location) => sum + location.count, 0);
  return {
    id: RULE3_ID,
    title: "years are signed numbers; legacy BC/BCE/B.C. notation absent",
    status: occurrences === 0 ? "PASS" : "FAIL",
    counts: {
      legacyNotationOccurrences: occurrences,
      rawLegacyNotationOccurrences: raw.occurrences,
      allowlistEntries: SIGNED_YEAR_ALLOWLIST.length,
    },
    locations,
  };
}

function secretPatterns(): ReadonlyArray<{ id: SecretPatternClass; re: RegExp }> {
  return [
    { id: "PRIVATE_KEY_BEGIN", re: new RegExp("-{5}BEGIN", "g") },
    { id: "JWT_LIKE", re: new RegExp("eyJ" + "[A-Za-z0-9_-]{10,}", "g") },
    { id: "OPENROUTER_LIKE", re: new RegExp("sk-or-" + "[A-Za-z0-9-]+", "g") },
    { id: "GOOGLE_API_KEY_LIKE", re: new RegExp("AIza" + "[0-9A-Za-z_-]{20,}", "g") },
    { id: "BEARER_VALUE", re: new RegExp("Bearer" + "\\s+" + "\\S+", "g") },
    { id: "TOKEN_QUERY_VALUE", re: new RegExp("token" + "=[^&\\s]+", "gi") },
    { id: "POSTGRES_DSN", re: new RegExp("postgres(ql)?" + "://" + "\\S+", "gi") },
  ];
}

const SENSITIVE_ASSIGNMENT_RE = new RegExp(
  "\\b([A-Za-z0-9_.$-]*(?:KEY|SECRET|TOKEN|PASSWORD|CONNECTION|PRIVATE)[A-Za-z0-9_.$-]*)\\s*[:=]\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"';,\\\\]+))",
  "gi",
);

const RE_PURE_VAR_REF = /^\$\{?[A-Z_][A-Z0-9_]*\}?\\?$|^%[A-Z_][A-Z0-9_]*%$/;
const RE_UNQUOTED_ENV_ACCESS = /process\.env|import\.meta\.env|Deno\.env|os\.environ|getenv|\.env\./;
const RE_UNQUOTED_CODE_SYNTAX = /[()\[\]?;]|=>/;
const RE_MEMBER_CHAIN = /^[A-Za-z_$][\w$]*(\.[\w$]+)+!?$/;

function isPlaceholderValue(raw: string): boolean {
  const value = raw.trim().replace(/^["']+|["']+$/g, "");
  if (value.length === 0) return true;
  if (value.includes("<") || value.includes("${")) return true;
  const lower = value.toLowerCase();
  for (const word of ["your", "xxx", "placeholder", "example", "redacted", "changeme", "replace"]) {
    if (lower.includes(word)) return true;
  }
  return /^(.)\1+$/.test(value);
}

function isPureVariableRef(raw: string): boolean {
  return RE_PURE_VAR_REF.test(raw);
}

function isEnvOrCodeValue(value: string): boolean {
  if (RE_UNQUOTED_ENV_ACCESS.test(value)) return true;
  if (RE_UNQUOTED_CODE_SYNTAX.test(value)) return true;
  if (!value.includes("://") && RE_MEMBER_CHAIN.test(value)) return true;
  return false;
}

type SecretScanResult = {
  occurrences: number;
  locations: LocationCount[];
  rawOccurrences: number;
  nonLiteralExclusions: number;
  nonCredentialExclusions: number;
  allowlistedOccurrences: number;
};

function stripSecretPunctuation(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`\),;\]]+$/g, "");
}

function isObviouslyNonLiteralSecretValue(raw: string): boolean {
  const value = raw.trim();
  const lower = value.toLowerCase();
  if (value.includes("${") || value.includes("$(") || value.includes("`")) return true;
  if (value.includes("<") || value.includes(">") || value.includes("[") || value.includes("]")) return true;
  if (/^(bearer\s+)?(token|apikey|api_key|key|secret|password|servicerolekey|service_role_key|anonkey|anon_key)[`'")\],;]*$/i.test(value)) {
    return true;
  }
  for (const word of ["your", "placeholder", "example", "redacted", "changeme", "replace", "dummy", "fake", "sample", "synthetic"]) {
    if (lower.includes(word)) return true;
  }
  return lower.includes("localhost") || lower.includes("127.0.0.1");
}

function entropyPerChar(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function highEntropyToken(raw: string): boolean {
  const value = stripSecretPunctuation(raw);
  if (value.length < 20) return false;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) return true;
  if (/^(sk|pk|xox|ghp|github_pat|hf|AIza)[A-Za-z0-9_\-]{12,}/.test(value)) return true;
  if (/^[A-Fa-f0-9]{32,}$/.test(value)) return true;
  return /^[A-Za-z0-9_\-+/=]{24,}$/.test(value) && entropyPerChar(value) >= 4.0;
}

function tokenQueryCredential(raw: string): boolean {
  return highEntropyToken(stripSecretPunctuation(raw).replace(new RegExp("^" + "token" + "=", "i"), ""));
}

function bearerCredential(raw: string): boolean {
  return highEntropyToken(stripSecretPunctuation(raw).replace(/^Bearer\s+/i, ""));
}

type PostgresDsnRisk = "credential" | "fixture" | "not_credential" | "unknown";

function postgresDsnRisk(raw: string): PostgresDsnRisk {
  const cleaned = stripSecretPunctuation(raw);
  if (isPlaceholderValue(cleaned) || isObviouslyNonLiteralSecretValue(cleaned)) return "fixture";
  try {
    const url = new URL(cleaned);
    const host = url.hostname.toLowerCase();
    const password = decodeURIComponent(url.password || "");
    if (!password) return "not_credential";
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local") ||
      host.endsWith(".test") ||
      host.endsWith(".invalid") ||
      host.endsWith(".example") ||
      /example|fake|dummy|placeholder/.test(host)
    ) {
      return "fixture";
    }
    if (["password", "postgres", "example", "placeholder", "changeme"].includes(password.toLowerCase())) return "fixture";
    if (/your|example|placeholder|changeme|fake|dummy/i.test(password)) return "fixture";
    return "credential";
  } catch {
    const lower = cleaned.toLowerCase();
    if (
      lower.includes("user:password@host") ||
      lower.includes(":password@") ||
      lower.includes("your") ||
      lower.includes("example") ||
      lower.includes("fake") ||
      lower.includes("dummy") ||
      lower.includes("localhost") ||
      lower.includes("127.0.0.1")
    ) {
      return "fixture";
    }
    return "unknown";
  }
}

function credentialShaped(patternClass: SecretPatternClass, raw: string): boolean {
  if (patternClass === "PRIVATE_KEY_BEGIN" || patternClass === "OPENROUTER_LIKE" || patternClass === "GOOGLE_API_KEY_LIKE") return true;
  if (patternClass === "JWT_LIKE" || patternClass === "SENSITIVE_ASSIGNMENT") {
    if (/^postgres(ql)?:\/\//i.test(stripSecretPunctuation(raw))) {
      const risk = postgresDsnRisk(raw);
      return risk === "credential" || risk === "unknown";
    }
    return highEntropyToken(raw);
  }
  if (patternClass === "BEARER_VALUE") return bearerCredential(raw);
  if (patternClass === "TOKEN_QUERY_VALUE") return tokenQueryCredential(raw);
  if (patternClass === "POSTGRES_DSN") {
    const risk = postgresDsnRisk(raw);
    return risk === "credential" || risk === "unknown";
  }
  return false;
}

function isSecretAllowlisted(path: string, line: number, patternClass: SecretPatternClass): boolean {
  return SECRET_ALLOWLIST.some(
    (entry) => entry.path === path && entry.patternClass === patternClass && (entry.line === undefined || entry.line === line),
  );
}

function emptySecretScanResult(): SecretScanResult {
  return {
    occurrences: 0,
    locations: [],
    rawOccurrences: 0,
    nonLiteralExclusions: 0,
    nonCredentialExclusions: 0,
    allowlistedOccurrences: 0,
  };
}

function scanSecretPattern(files: SourceFile[], pattern: { id: SecretPatternClass; re: RegExp }): SecretScanResult {
  const result = emptySecretScanResult();
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      let count = 0;
      for (const match of lines[index].matchAll(pattern.re)) {
        const raw = match[0];
        result.rawOccurrences += 1;
        if (isObviouslyNonLiteralSecretValue(raw)) {
          result.nonLiteralExclusions += 1;
          continue;
        }
        if (!credentialShaped(pattern.id, raw)) {
          result.nonCredentialExclusions += 1;
          continue;
        }
        if (isSecretAllowlisted(file.path, index + 1, pattern.id)) {
          result.allowlistedOccurrences += 1;
          continue;
        }
        count += 1;
      }
      if (count > 0) {
        result.occurrences += count;
        result.locations.push({ path: file.path, line: index + 1, count });
      }
    }
  }
  return result;
}

function isForbiddenCommittedEnvPath(path: string): boolean {
  const base = baseName(path);
  if (base === ".dev.vars") return true;
  if (base === ".env") return true;
  if (base.startsWith(".env.") && !base.endsWith(".example")) return true;
  return false;
}

function scanSensitiveAssignments(files: SourceFile[]): SecretScanResult {
  const result = emptySecretScanResult();
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      let count = 0;
      for (const match of line.matchAll(SENSITIVE_ASSIGNMENT_RE)) {
        const raw = match[2] ?? match[3] ?? match[4] ?? "";
        if (!(raw.length >= 20 && !isPlaceholderValue(raw) && !isPureVariableRef(raw) && !isEnvOrCodeValue(raw))) continue;
        result.rawOccurrences += 1;
        if (isObviouslyNonLiteralSecretValue(raw) || /\s/.test(raw.trim())) {
          result.nonLiteralExclusions += 1;
          continue;
        }
        if (!credentialShaped("SENSITIVE_ASSIGNMENT", raw)) {
          result.nonCredentialExclusions += 1;
          continue;
        }
        if (isSecretAllowlisted(file.path, index + 1, "SENSITIVE_ASSIGNMENT")) {
          result.allowlistedOccurrences += 1;
          continue;
        }
        count += 1;
      }
      if (count > 0) {
        result.occurrences += count;
        result.locations.push({ path: file.path, line: index + 1, count });
      }
    }
  }
  return result;
}

function checkCommittedSecretsRule(files: SourceFile[], trackedFiles: string[]): RuleResult {
  const forbiddenPaths = trackedFiles.filter(isForbiddenCommittedEnvPath);
  const dotenvExamplesSkipped = trackedFiles.filter(isExampleDotenvLike).length;
  const counts: Record<string, number> = {
    forbiddenEnvFiles: forbiddenPaths.length,
    dotenvExampleFilesSkippedForSecretSafety: dotenvExamplesSkipped,
    secretAllowlistEntries: SECRET_ALLOWLIST.length,
  };
  const locations: LocationCount[] = forbiddenPaths.map((path) => ({ path, line: 0, count: 1 }));
  let rawPatternOccurrences = 0;
  let nonLiteralExclusions = 0;
  let nonCredentialExclusions = 0;
  let allowlistedOccurrences = 0;

  for (const pattern of secretPatterns()) {
    const scan = scanSecretPattern(files, pattern);
    counts[`pattern_${pattern.id}`] = scan.occurrences;
    rawPatternOccurrences += scan.rawOccurrences;
    nonLiteralExclusions += scan.nonLiteralExclusions;
    nonCredentialExclusions += scan.nonCredentialExclusions;
    allowlistedOccurrences += scan.allowlistedOccurrences;
    locations.push(...scan.locations);
  }

  const assignments = scanSensitiveAssignments(files);
  counts.sensitiveEnvAssignmentValues = assignments.occurrences;
  rawPatternOccurrences += assignments.rawOccurrences;
  nonLiteralExclusions += assignments.nonLiteralExclusions;
  nonCredentialExclusions += assignments.nonCredentialExclusions;
  allowlistedOccurrences += assignments.allowlistedOccurrences;
  locations.push(...assignments.locations);

  const patternHitOccurrences = Object.keys(counts)
    .filter((key) => key.startsWith("pattern_"))
    .reduce((sum, key) => sum + counts[key], 0);
  counts.patternHitOccurrences = patternHitOccurrences;
  counts.rawPatternOccurrences = rawPatternOccurrences;
  counts.nonLiteralExclusions = nonLiteralExclusions;
  counts.nonCredentialExclusions = nonCredentialExclusions;
  counts.allowlistedOccurrences = allowlistedOccurrences;

  return {
    id: RULE4_ID,
    title: "no committed secrets or forbidden dotenv files",
    status: forbiddenPaths.length + patternHitOccurrences + assignments.occurrences === 0 ? "PASS" : "FAIL",
    counts,
    locations,
  };
}

function runNode(args: string[]): { exitCode: number; output: string } {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { exitCode: result.status ?? 1, output };
}

function sensitiveEnvValues(): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (/KEY|SECRET|TOKEN|PASSWORD|CONNECTION|PRIVATE/i.test(name) && typeof value === "string" && value.length >= 8) {
      values.push(value);
    }
  }
  return values.sort((a, b) => b.length - a.length);
}

function redactText(input: string): string {
  let out = input;
  for (const value of sensitiveEnvValues()) {
    out = out.split(value).join("[redacted]");
  }
  for (const pattern of secretPatterns()) {
    out = out.replace(pattern.re, "[redacted]");
  }
  return out;
}

function diagnosticLines(output: string): string[] {
  const lines = redactText(output).split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.slice(-12);
}

function checkAiHonestyRule(): RuleResult {
  const tests = [
    "src/i18n/ai-notice.guard.test.ts",
    "src/i18n/ai-notice-placement.guard.test.ts",
    "src/i18n/landing-honesty.guard.test.ts",
    "src/i18n/how-we-work.guard.test.ts",
  ];
  const run = runNode([join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs"), "run", ...tests]);
  return {
    id: "ai-honesty-copy",
    title: "AI-honesty copy guard vitest files",
    status: run.exitCode === 0 ? "PASS" : "FAIL",
    counts: { testFiles: tests.length, exitCode: run.exitCode, outputLines: run.output.split(/\r?\n/).length },
    locations: [],
    note: run.exitCode === 0 ? undefined : diagnosticLines(run.output).join("\n"),
  };
}

function checkTypeScriptRule(): RuleResult {
  const run = runNode([join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc"), "--noEmit"]);
  return {
    id: "typescript-clean",
    title: "tsc --noEmit clean",
    status: run.exitCode === 0 ? "PASS" : "FAIL",
    counts: { exitCode: run.exitCode, outputLines: run.output.split(/\r?\n/).length },
    locations: [],
    note: run.exitCode === 0 ? undefined : diagnosticLines(run.output).join("\n"),
  };
}

function checkProtectedFilesRule(trackedFiles: string[]): RuleResult {
  const protectedListPath = join(REPO_ROOT, "scripts", "dev", "protected-files.txt");
  let entries: string[] = [];
  try {
    entries = readFileSync(protectedListPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return {
      id: "protected-files-integrity",
      title: "protected-files.txt integrity",
      status: "FAIL",
      counts: { entries: 0, missingFiles: 0, invalidPrefixes: 0, listReadable: 0 },
      locations: [],
    };
  }

  const tracked = new Set(trackedFiles);
  const missingFiles: LocationCount[] = [];
  const invalidPrefixes: LocationCount[] = [];
  for (const entry of entries) {
    if (entry.endsWith("/**")) {
      const prefix = entry.slice(0, -3).replace(/\/$/, "");
      const hasTrackedDescendant = trackedFiles.some((path) => path.startsWith(`${prefix}/`));
      const filesystemDir = existsSync(join(REPO_ROOT, prefix)) && statSync(join(REPO_ROOT, prefix)).isDirectory();
      if (!hasTrackedDescendant && !filesystemDir) invalidPrefixes.push({ path: entry, line: 0, count: 1 });
    } else {
      const normalized = normalizePath(entry);
      if (!tracked.has(normalized) && !existsSync(join(REPO_ROOT, normalized))) {
        missingFiles.push({ path: entry, line: 0, count: 1 });
      }
    }
  }

  return {
    id: "protected-files-integrity",
    title: "protected-files.txt integrity",
    status: missingFiles.length + invalidPrefixes.length === 0 ? "PASS" : "FAIL",
    counts: {
      entries: entries.length,
      missingFiles: missingFiles.length,
      invalidPrefixes: invalidPrefixes.length,
      listReadable: 1,
    },
    locations: [...missingFiles, ...invalidPrefixes],
  };
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

function printRule(result: RuleResult, includeLocations: boolean): void {
  console.log(`RULE ${result.id}: ${result.status} ${formatCounts(result.counts)} — ${result.title}`);
  if (result.note) {
    for (const line of result.note.split("\n")) console.log(`  note: ${line}`);
  }
  const known = KNOWN_FAILING[result.id];
  if (result.status === "FAIL" && known) {
    console.log(`  known-failing: ${known.todo}`);
    console.log(`  reason: ${known.reason}`);
  }
  if (includeLocations && result.locations.length > 0) {
    const cap = 40;
    for (const location of result.locations.slice(0, cap)) {
      console.log(`  location-count ${location.path}:${location.line} count=${location.count}`);
    }
    if (result.locations.length > cap) {
      console.log(`  location-count omitted=${result.locations.length - cap}`);
    }
  }
}

function fixture(path: string, text: string): SourceFile {
  return { path, text };
}

function selfTestFixtures(violating: boolean): { files: SourceFile[]; tracked: string[] } {
  if (!violating) {
    return {
      files: [
        fixture(
          "partykit/server.ts",
          "class X {\n  private broadcastStateUpdate(): void {\n    for (const connection of this.room.getConnections()) connection.send(\"{}\");\n  }\n}\n",
        ),
        fixture("src/core/clean.ts", "export const year = -44;\n"),
        fixture("src/app/api/clean.ts", "export const year = 1066;\n"),
        fixture("src/clean.txt", "plain source text\n"),
      ],
      tracked: ["partykit/server.ts", "src/core/clean.ts", "src/app/api/clean.ts", "src/clean.txt"],
    };
  }

  const highEntropyFixture = "abcdefghijklmnopqrstuvwxyz0123456789";
  const jwtLike = "eyJ" + highEntropyFixture;
  const openRouterLike = "sk-or-" + highEntropyFixture;
  const googleLike = "AIza" + highEntropyFixture;
  const bearerLike = "Bearer" + " " + highEntropyFixture;
  const tokenLike = "token" + "=" + highEntropyFixture;
  const postgresLike = "postgresql" + "://runner:" + highEntropyFixture + "@db.internal:5432/postgres";
  const privateBegin = "-".repeat(5) + "BEGIN";
  return {
    files: [
      fixture(
        "partykit/server.ts",
        "class X {\n  private broadcastStateUpdate(): void {\n    this.room.broadcast(\"{}\");\n  }\n}\n",
      ),
      fixture("src/core/bad.ts", "export const label = \"44 BCE\";\n"),
      fixture("src/app/api/bad.ts", "export const label = \"44 B.C.\";\n"),
      fixture(
        "src/secrets-fixture.txt",
        `${jwtLike}\n${openRouterLike}\n${googleLike}\n${bearerLike}\n${tokenLike}\n${postgresLike}\n${privateBegin}\n`,
      ),
    ],
    tracked: [
      "partykit/server.ts",
      "src/core/bad.ts",
      "src/app/api/bad.ts",
      "src/secrets-fixture.txt",
      ".dev.vars",
      ".env.local",
    ],
  };
}

function runSelfTest(): number {
  let failed = false;
  for (const violating of [true, false]) {
    const { files, tracked } = selfTestFixtures(violating);
    const results = [checkBroadcastRule(files), checkSignedYearsRule(files), checkCommittedSecretsRule(files, tracked)];
    console.log(`SELF-TEST ${violating ? "violating-input" : "clean-input"}`);
    for (const result of results) printRule(result, true);
    for (const result of results) {
      const expected = violating ? "FAIL" : "PASS";
      if (result.status !== expected) {
        console.log(`SELF-TEST EXPECTATION-FAIL ${result.id}: expected=${expected} actual=${result.status}`);
        failed = true;
      }
    }
  }
  console.log(`SELF-TEST: ${failed ? "FAIL" : "PASS"}`);
  return failed ? 1 : 0;
}

function runMain(): number {
  const files = readTrackedSourceFiles();
  const tracked = listTrackedFiles();
  const results = [
    checkBroadcastRule(files),
    checkSnapshotRule(files),
    checkSignedYearsRule(files),
    checkCommittedSecretsRule(files, tracked),
    checkAiHonestyRule(),
    checkTypeScriptRule(),
    checkProtectedFilesRule(tracked),
  ];

  for (const result of results) printRule(result, true);

  const unblockedFailures = results.filter((result) => result.status === "FAIL" && !KNOWN_FAILING[result.id]);
  const knownFailures = results.filter((result) => result.status === "FAIL" && KNOWN_FAILING[result.id]);
  const manual = results.filter((result) => result.status === "MANUAL");
  console.log(
    `SUMMARY: fail=${unblockedFailures.length} knownFailing=${knownFailures.length} manual=${manual.length} rules=${results.length}`,
  );
  if (manual.length > 0) {
    console.log("SUMMARY-NOTE: MANUAL rules are neither passes nor failures; manual audit remains required.");
  }
  if (knownFailures.length > 0) {
    console.log("SUMMARY-NOTE: FAIL rules on the explicit KNOWN-FAILING list do not block this run; each carries a TODO above.");
  }
  const ok = unblockedFailures.length === 0;
  console.log(`INVARIANTS: ${ok ? "PASS" : "FAIL"}`);
  return ok ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  process.exit(runSelfTest());
} else {
  process.exit(runMain());
}
