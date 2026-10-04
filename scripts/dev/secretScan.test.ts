// SEC-BUILD-SECRETGUARD-042 — tests for the secret scanner core.
//
// Every secret-looking fixture is built at RUNTIME by string concatenation or
// base64url-encoding, so this file itself contains no secret-like literal and
// passes its own scan (the last test proves it for all of this task's files).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAllowlist,
  collectRangeFindings,
  formatFinding,
  formatFindings,
  isForbiddenPath,
  isPlaceholderValue,
  scanLine,
  scanText,
  sha256Hex,
} from "./secretScanCore";

const b64url = (s: string): string =>
  Buffer.from(s, "utf8").toString("base64url");

// Hand-minted fake JWTs: base64url(header).base64url(payload).base64url(sig)
const fakeJwt = (payload: Record<string, unknown>): string =>
  [
    b64url('{"alg":"HS256","typ":"JWT"}'),
    b64url(JSON.stringify(payload)),
    b64url("not-a-real-signature"),
  ].join(".");

const DSN =
  "post" + "gresql" + "://svc_user:" + "pw" + "123456789" + "@db.internal:5432/prod";
const SB_TOKEN = "sb_" + "secret_" + "aB3xZ9qLmP7r";
const OR_TOKEN = "sk-" + "or-" + "v1-" + "ab12cd34".repeat(3);
const GOOGLE_TOKEN = "GOC" + "SPX-" + "kX9fT2mQ8wzL";
const PEM_HEADER = "-----BEGIN " + "RSA" + " PRIVATE KEY-----";
const HEX64_VALUE = "a1".repeat(32);
const GENERIC_VALUE = "q9Zx8wYt7Lm3Pb6Cv1Nk5Jr";
const GENERIC_NAME = "MY_" + "SERVICE" + "_" + "TOKEN";
const JWT_PLAIN = fakeJwt({ sub: "fixture", iat: 1 });
const JWT_SVC = fakeJwt({ role: "service_role", iss: "fixture" });
const JWT_ANON = fakeJwt({ role: "anon", iss: "fixture" });

const rulesOf = (line: string): string[] =>
  scanLine("fixture.txt", 1, line).map((f) => f.rule);

describe("rule detection", () => {
  it("detects DSN_WITH_PASSWORD", () => {
    expect(rulesOf("export DB_URL=" + DSN)).toContain("DSN_WITH_PASSWORD");
    // postgres:// variant of the scheme
    expect(rulesOf("uri=" + "post" + "gres://u:" + "x9w8v7u6t5@h/db")).toContain(
      "DSN_WITH_PASSWORD",
    );
  });

  it("detects every JWT and tags the payload role", () => {
    expect(rulesOf("jwt=" + JWT_PLAIN)).toContain("JWT_ANY");
    expect(rulesOf("jwt=" + JWT_SVC)).toEqual(["JWT_SERVICE_ROLE"]);
    expect(rulesOf("jwt=" + JWT_ANON)).toEqual(["JWT_ANON"]);
  });

  it("detects SB_SECRET", () => {
    expect(rulesOf("k " + SB_TOKEN)).toContain("SB_SECRET");
  });

  it("detects OPENROUTER_KEY", () => {
    expect(rulesOf("k " + OR_TOKEN)).toContain("OPENROUTER_KEY");
  });

  it("detects GOOGLE_OAUTH_SECRET", () => {
    expect(rulesOf("k " + GOOGLE_TOKEN)).toContain("GOOGLE_OAUTH_SECRET");
  });

  it("detects PRIVATE_KEY_BLOCK", () => {
    expect(rulesOf(PEM_HEADER)).toContain("PRIVATE_KEY_BLOCK");
  });

  it("detects HEX64_SECRET only when the line names a secret", () => {
    expect(rulesOf("APP_" + "TOKEN" + "=" + HEX64_VALUE)).toContain(
      "HEX64_SECRET",
    );
    // same 64-hex literal on an innocent line: no finding
    expect(rulesOf("checksum=" + HEX64_VALUE)).not.toContain("HEX64_SECRET");
  });

  it("detects GENERIC_ASSIGNMENT with '=' and ':' forms", () => {
    expect(rulesOf(GENERIC_NAME + "=" + GENERIC_VALUE)).toContain(
      "GENERIC_ASSIGNMENT",
    );
    expect(rulesOf(GENERIC_NAME + ": " + GENERIC_VALUE)).toContain(
      "GENERIC_ASSIGNMENT",
    );
    expect(rulesOf(GENERIC_NAME + '="' + GENERIC_VALUE + '"')).toContain(
      "GENERIC_ASSIGNMENT",
    );
  });

  it("does not fire on short values", () => {
    expect(rulesOf(GENERIC_NAME + "=" + "short9")).toEqual([]);
  });

  it("does not fire on env-read code lines (SEC-FIX-SECRETGUARD-FALSEPOS-045)", () => {
    const cron = "CRON_" + "SECRET";
    const pk = "PARTYKIT_" + "SECRET";
    const supa = "SUPABASE_" + "SECRET" + "_KEY";
    // Every keyword-named variable below is assigned a value that evaluates
    // an expression or reads an environment — none of them is a literal
    // secret, so the env/code/member-chain exemption must save each line.
    const lines = [
      "const cronSecret = process.env." + cron + ";",
      "const partykitSecret = this.room.env." + pk + " as string;",
      "const lobbySecret = lobby.env." + supa + ";",
      "const envToken = process.env." + cron + ' ?? "";',
      "const viteSecret = import.meta.env." + cron + ";",
      "const { " + cron + " } = process.env;",
      "const denoSecret = Deno.env.get(\"" + cron + "\");",
      'const osSecret = os.environ["' + cron + '"];',
      "const " + cron + "_READ = config.secrets." + cron + ";",
      "const apiTokenVar = config.secrets.current" + "Token" + "!;",
    ];
    for (const l of lines) expect(rulesOf(l), `${lines.indexOf(l)}`).toEqual([]);
  });

  it("still fires on a quoted 20+ char literal", () => {
    expect(rulesOf(GENERIC_NAME + '="' + GENERIC_VALUE + '"')).toContain(
      "GENERIC_ASSIGNMENT",
    );
    expect(rulesOf(GENERIC_NAME + "='" + GENERIC_VALUE + "'")).toContain(
      "GENERIC_ASSIGNMENT",
    );
  });

  it("still fires on unquoted .env-style values", () => {
    // bare 64-hex and a 30-char base64-ish run: no dots, no code syntax
    expect(rulesOf(GENERIC_NAME + "=" + HEX64_VALUE)).toContain(
      "GENERIC_ASSIGNMENT",
    );
    const b64ish30 = GENERIC_VALUE + "Xy7mKw2"; // 30 chars, alphanumeric
    expect(b64ish30.length).toBe(30);
    expect(rulesOf(GENERIC_NAME + "=" + b64ish30)).toContain(
      "GENERIC_ASSIGNMENT",
    );
  });
});

describe("placeholders", () => {
  it("isPlaceholderValue recognises stand-ins", () => {
    expect(isPlaceholderValue("<" + "fill-me>")).toBe(true);
    expect(isPlaceholderValue("$" + "{VAR}")).toBe(true);
    expect(isPlaceholderValue("YOUR" + "_KEY_HERE")).toBe(true);
    expect(isPlaceholderValue("x".repeat(24))).toBe(true);
    expect(isPlaceholderValue("example" + "_value_123456")).toBe(true);
    expect(isPlaceholderValue("redacted" + "_value")).toBe(true);
    expect(isPlaceholderValue("Change" + "Me" + "_now")).toBe(true);
    expect(isPlaceholderValue("a".repeat(40))).toBe(true);
    expect(isPlaceholderValue("")).toBe(true);
    expect(isPlaceholderValue(GENERIC_VALUE)).toBe(false);
  });

  it("placeholder DSN passwords are not findings", () => {
    expect(rulesOf("post" + "gresql://u:" + "<pw>" + "@h/db")).toEqual([]);
    expect(rulesOf("post" + "gresql://u:" + "YOUR_PW" + "@h/db")).toEqual([]);
  });

  it("DSN placeholder words are not findings but a real password is", () => {
    const scheme = "post" + "gresql" + "://u:";
    const tail = "@h/db";
    const words = [
      "pass" + "word",
      "pa" + "ss",
      "p" + "wd",
      "sec" + "ret",
      "project" + "-ref",
      "your" + "password",
      "PaSs" + "WoRd", // case-insensitive
    ];
    for (const w of words) {
      expect(rulesOf(scheme + w + tail), `${w.length}`).toEqual([]);
    }
    expect(rulesOf(scheme + "x9w8v7u6t5" + tail)).toContain(
      "DSN_WITH_PASSWORD",
    );
  });

  it("placeholder GENERIC values are not findings", () => {
    for (const v of [
      "<" + "fill-me>",
      "$" + "{VAR}",
      "YOUR" + "_TOKEN_HERE_1234",
      "x".repeat(24),
      "example" + "_value_abcdefghij",
      "redacted" + "_abcdefghijklm",
      "changeme" + "_abcdefghijkl",
      "a".repeat(30),
    ]) {
      expect(rulesOf(GENERIC_NAME + "=" + v), v).toEqual([]);
    }
  });
});

describe("FORBIDDEN_FILE names", () => {
  it("flags every forbidden new-file name", () => {
    for (const p of [
      ".dev.vars",
      "config/.dev.vars",
      ".env",
      ".env.production",
      "deploy/.env.staging",
      "certs/server.pem",
      "ssh/id.key",
      "test-results/snap.png",
      "apps/web/test-results/out.xml",
      "playwright-report/index.html",
      "debug.log",
    ]) {
      expect(isForbiddenPath(p), p).toBe(true);
    }
  });

  it("allows example env files and normal sources", () => {
    for (const p of [
      ".env.example",
      ".env.local.example",
      "src/app/page.tsx",
      "scripts/dev/secret-scan.ts",
      "docs/SECRET_HYGIENE.md",
      ".dev.vars.local",
      "results.xml",
    ]) {
      expect(isForbiddenPath(p), p).toBe(false);
    }
  });
});

describe("allowlist", () => {
  const line = "export DB=" + DSN;
  const entry = {
    rule: "DSN_WITH_PASSWORD",
    path: "x.sh",
    lineSha256: sha256Hex(line.trim()),
    reason: "unit test fixture",
  };

  it("suppresses a finding only when rule+path+lineSha256 all match", () => {
    const found = scanText("x.sh", line);
    expect(found.length).toBeGreaterThan(0);
    expect(applyAllowlist(found, [entry])).toEqual([]);
  });

  it("does not suppress when the line changes", () => {
    const found = scanText("x.sh", line + " # edited");
    expect(applyAllowlist(found, [entry]).length).toBeGreaterThan(0);
  });

  it("does not suppress on a different path or rule", () => {
    const found = scanText("x.sh", line);
    expect(
      applyAllowlist(found, [{ ...entry, path: "other.sh" }]).length,
    ).toBeGreaterThan(0);
    expect(
      applyAllowlist(found, [{ ...entry, rule: "GENERIC_ASSIGNMENT" }]).length,
    ).toBeGreaterThan(0);
  });
});

describe("no-leak output", () => {
  it("formatted output contains no fixture value nor any 8-char window", () => {
    const secretFixtures = [
      DSN,
      SB_TOKEN,
      OR_TOKEN,
      GOOGLE_TOKEN,
      PEM_HEADER,
      HEX64_VALUE,
      GENERIC_VALUE,
      JWT_PLAIN,
      JWT_SVC,
      JWT_ANON,
    ];
    const findings = [
      ...scanLine("a.sh", 3, "DB=" + DSN),
      ...scanLine("a.sh", 4, "k " + SB_TOKEN),
      ...scanLine("b.json", 1, JWT_SVC),
      ...scanLine("b.json", 2, GENERIC_NAME + "=" + GENERIC_VALUE),
      ...scanLine("c.pem", 1, PEM_HEADER),
    ];
    expect(findings.length).toBeGreaterThan(0);
    const out =
      findings.map(formatFinding).join("\n") + "\n" + formatFindings(findings);
    for (const s of secretFixtures) {
      expect(out.includes(s), s.slice(0, 4)).toBe(false);
      for (let i = 0; i + 8 <= s.length; i++) {
        const window = s.slice(i, i + 8);
        expect(out.includes(window), `window@${i}`).toBe(false);
      }
    }
  });
});

describe("per-commit range scan (SEC-FIX-SECRETGUARD-FALSEPOS-045)", () => {
  it("reports a secret added then removed inside one range", () => {
    const sha1 = "a".repeat(40);
    const sha2 = "b".repeat(40);
    const secretLine = "DB_" + "SECRET" + "=" + HEX64_VALUE;
    const diffSha1 = [
      "diff --git a/x.ts b/x.ts",
      "+++ b/x.ts",
      "@@ -0,0 +1 @@",
      "+" + secretLine,
      "",
    ].join("\n");
    const diffSha2 = [
      "diff --git a/x.ts b/x.ts",
      "+++ b/x.ts",
      "@@ -1 +0,0 @@",
      "-" + secretLine,
      "",
    ].join("\n");
    const runner = (args: string[]): string => {
      const last = args[args.length - 1];
      if (args[0] === "rev-list") return sha2 + "\n" + sha1 + "\n";
      if (args[0] === "show") return last === sha1 ? diffSha1 : diffSha2;
      if (args[0] === "diff-tree") {
        return last === sha1 ? "A\tx.ts\n" : "D\tx.ts\n";
      }
      throw new Error("unexpected git invocation: " + args[0]);
    };
    const findings = collectRangeFindings("base..head", runner);
    // The net diff base..head is EMPTY for the secret — only per-commit
    // scanning can still report it, tagged with the introducing commit.
    const hits = findings.filter((f) => f.sha === sha1);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(formatFinding(h)).toBe(
        `x.ts:1:${h.rule} @${sha1.slice(0, 7)}`,
      );
    }
    // Nothing may be attributed to the removing commit.
    expect(findings.filter((f) => f.sha === sha2)).toEqual([]);
  });

  it("keeps zero-base behavior: head commit only", () => {
    const head = "c".repeat(40);
    const diff = [
      "diff --git a/.env b/.env",
      "+++ b/.env",
      "@@ -0,0 +1 @@",
      "+X=1",
      "",
    ].join("\n");
    const runner = (args: string[]): string => {
      if (args[0] === "rev-list") {
        throw new Error("rev-list must not run for a zero base");
      }
      if (args[0] === "diff-tree") {
        return args.includes("-U0") ? diff : "A\t.env\n";
      }
      throw new Error("unexpected git invocation: " + args[0]);
    };
    const findings = collectRangeFindings(
      "0".repeat(40) + ".." + head,
      runner,
    );
    expect(
      findings.find(
        (f) => f.rule === "FORBIDDEN_FILE" && f.path === ".env" && f.sha === head,
      ),
    ).toBeDefined();
  });
});

describe("self scan", () => {
  it("reports zero findings on this task's own new files", () => {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
    // Only files NEW in this task: modified files may carry pre-existing
    // findings (docs/PROGRESS.md documents past incidents); the pre-commit
    // gate itself only ever scans added lines.
    const files = [
      "scripts/dev/secretScanCore.ts",
      "scripts/dev/secret-scan.ts",
      "scripts/dev/secretScan.test.ts",
      "scripts/dev/secret-scan-allow.json",
      ".github/workflows/secret-scan.yml",
      "docs/SECRET_HYGIENE.md",
    ];
    for (const rel of files) {
      const text = readFileSync(join(root, rel), "utf8");
      expect(scanText(rel, text), rel).toEqual([]);
    }
  });
});
