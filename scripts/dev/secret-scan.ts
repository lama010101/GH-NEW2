// SEC-BUILD-SECRETGUARD-042 — commit/PR secret scanner CLI.
//
// Usage:
//   tsx scripts/dev/secret-scan.ts --staged
//       Scan ADDED lines of `git diff --cached` plus FORBIDDEN_FILE checks on
//       newly added paths. Exits 1 on any non-allowlisted finding.
//   tsx scripts/dev/secret-scan.ts --range <base>..<head>
//       Same scan over a commit range (`<base>...<head>` also accepted). A base
//       of all zeros scans the head commit only (first push to a new main).
//       Exits 1 on any non-allowlisted finding.
//   tsx scripts/dev/secret-scan.ts --tree
//       REPORT-ONLY scan of every tracked text file. Always exits 0; prints a
//       per-rule count block before the findings list.
//
// Output is `path:line:RULE` lines plus a final
// `SECRET SCAN: PASS|FAIL (mode=<m>, findings=<n>)` summary. Matched text is
// never printed — this tool must be safe to run in public CI logs.
// Usage errors exit 2.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_RULES,
  applyAllowlist,
  formatFinding,
  isForbiddenPath,
  scanLine,
  scanText,
  type AllowlistEntry,
  type Finding,
} from "./secretScanCore";

const here = dirname(fileURLToPath(import.meta.url));

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// ls-files and friends are cwd-scoped — every git call runs at the toplevel.
const REPO_ROOT = git(["rev-parse", "--show-toplevel"], here).trim();

type Mode = "staged" | "range" | "tree";

function unquoteDiffPath(p: string): string {
  let s = p;
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith("b/")) s = s.slice(2);
  return s;
}

/** Paths with name-status 'A' in the given git diff invocation. */
function addedPaths(diffArgs: string[]): string[] {
  const out = git([...diffArgs, "--name-status", "--no-color"], REPO_ROOT);
  const paths: string[] = [];
  for (const raw of out.split("\n")) {
    if (raw.length === 0) continue;
    const parts = raw.split("\t");
    if (parts[0] === "A" && parts.length > 1) {
      paths.push(parts[parts.length - 1]);
    }
  }
  return paths;
}

/**
 * Collect findings from a unified -U0 diff: every '+' line is scanned at its
 * new-file line number. Binary files emit no '+' content, so they are skipped
 * by construction.
 */
function findingsFromDiff(diff: string): Finding[] {
  const findings: Finding[] = [];
  let curPath = "";
  let newLine = 0;
  let inHunk = false;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      curPath = "";
      inHunk = false;
      continue;
    }
    if (raw.startsWith("Binary files ")) {
      curPath = "";
      inHunk = false;
      continue;
    }
    if (raw.startsWith("+++ ")) {
      const target = raw.slice(4).trim();
      curPath = target === "/dev/null" ? "" : unquoteDiffPath(target);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk !== null) {
      newLine = Number.parseInt(hunk[1], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk || curPath === "") continue;
    if (raw.startsWith("+")) {
      findings.push(...scanLine(curPath, newLine, raw.slice(1)));
      newLine++;
    } else if (raw.startsWith(" ")) {
      newLine++;
    }
  }
  return findings;
}

function forbiddenFileFindings(paths: string[]): Finding[] {
  return paths
    .filter((p) => isForbiddenPath(p))
    .map((p) => ({ path: p, line: 0, rule: "FORBIDDEN_FILE", lineText: "" }));
}

function isBinaryBuffer(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function collectStaged(): Finding[] {
  const findings = findingsFromDiff(
    git(["diff", "--cached", "-U0", "--no-color"], REPO_ROOT),
  );
  findings.push(
    ...forbiddenFileFindings(
      addedPaths(["diff", "--cached"]),
    ),
  );
  return findings;
}

function collectRange(range: string): Finding[] {
  const parts = range.split(/\.{2,3}/);
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    throw new Error(`invalid range '${range}' — expected <base>..<head>`);
  }
  const [base, head] = parts;
  if (/^0+$/.test(base)) {
    // First push of a branch with no ancestor: scan the head commit alone.
    const findings = findingsFromDiff(
      git(["diff-tree", "--root", "-r", "-U0", "--no-color", head], REPO_ROOT),
    );
    findings.push(
      ...forbiddenFileFindings(
        addedPaths(["diff-tree", "--root", "-r", "--no-commit-id", head]),
      ),
    );
    return findings;
  }
  const findings = findingsFromDiff(
    git(["diff", "-U0", "--no-color", range], REPO_ROOT),
  );
  findings.push(
    ...forbiddenFileFindings(addedPaths(["diff", "--no-color", range])),
  );
  return findings;
}

function collectTree(): Finding[] {
  const findings: Finding[] = [];
  const entries = git(["ls-files", "-z"], REPO_ROOT).split("\0");
  for (const rel of entries) {
    if (rel === "") continue;
    let buf: Buffer;
    try {
      buf = readFileSync(join(REPO_ROOT, rel));
    } catch {
      continue; // file vanished between ls-files and read
    }
    if (isBinaryBuffer(buf)) continue;
    findings.push(...scanText(rel, buf.toString("utf8")));
  }
  return findings;
}

function loadAllowlist(): AllowlistEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(here, "secret-scan-allow.json"), "utf8"),
    );
    return Array.isArray(parsed) ? (parsed as AllowlistEntry[]) : [];
  } catch {
    return [];
  }
}

function usage(): never {
  console.error(
    "usage: tsx scripts/dev/secret-scan.ts --staged | --range <base>..<head> | --tree",
  );
  process.exit(2);
}

function main(): void {
  const args = process.argv.slice(2);
  let mode: Mode;
  let range = "";
  if (args[0] === "--staged" && args.length === 1) {
    mode = "staged";
  } else if (args[0] === "--range" && args.length === 2) {
    mode = "range";
    range = args[1];
  } else if (args[0] === "--tree" && args.length === 1) {
    mode = "tree";
  } else {
    usage();
  }

  let findings: Finding[];
  try {
    findings =
      mode === "staged"
        ? collectStaged()
        : mode === "range"
          ? collectRange(range)
          : collectTree();
  } catch (err) {
    console.error(
      `secret-scan: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(2);
  }

  findings = applyAllowlist(findings, loadAllowlist());

  if (mode === "tree") {
    console.log("COUNTS:");
    const counts = new Map<string, number>();
    for (const f of findings) {
      counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);
    }
    for (const rule of ALL_RULES) {
      console.log(`${rule} ${counts.get(rule) ?? 0}`);
    }
  }

  for (const f of findings) {
    console.log(formatFinding(f));
  }

  const verdict = findings.length === 0 ? "PASS" : "FAIL";
  console.log(
    `SECRET SCAN: ${verdict} (mode=${mode}, findings=${findings.length})`,
  );

  if (mode === "tree") {
    process.exit(0); // report-only: findings never fail the tree scan
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

main();
