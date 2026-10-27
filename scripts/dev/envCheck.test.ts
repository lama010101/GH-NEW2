import { describe, expect, it } from "vitest";
import {
  decodeLegacyJwtClaims,
  envCheckFailed,
  evaluateEnv,
  formatRows,
  type Row,
} from "./envCheckCore";
import { diagnoseDbConnectionString } from "../../src/core/dbConnectionString";

// INFRA-BUILD-ENVCHECK-038 — fabricated values only. Refs look like Supabase
// project refs but are invented; passwords/JWTs are fake. The real
// EXPECTED_SUPABASE_PROJECT_REF literal must not appear in this file.

const EXPECTED = "fakeprojref0001";
const OTHER = "otherref9999";

function mintJwt(claims: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.${Buffer.from("unsigned").toString("base64url")}`;
}

const URL_OK = `https://${EXPECTED}.supabase.co`;
const URL_FOREIGN = `https://${OTHER}.supabase.co`;
const JWT_SERVICE_OK = mintJwt({ ref: EXPECTED, role: "service_role" });
const JWT_ANON_OK = mintJwt({ ref: EXPECTED, role: "anon" });
const JWT_SERVICE_FOREIGN = mintJwt({ ref: OTHER, role: "service_role" });
const JWT_WRONG_ROLE = mintJwt({ ref: EXPECTED, role: "anon" });
const DSN_OK = `postgresql://postgres.${EXPECTED}:pw@aws-1-us-east-2.pooler.supabase.com:6543/postgres`;
const DSN_FOREIGN = `postgresql://postgres.${OTHER}:pw@aws-1-us-east-2.pooler.supabase.com:6543/postgres`;
const SB_PUBLISHABLE = "sb_publishable_fakefixturevalue00000001";
const SB_SECRET = "sb_secret_fakefixturevalue0000000000001";

function rowsFor(
  env: Record<string, string | undefined>,
  context: "build" | "test" | "live-db" = "test",
): Row[] {
  return evaluateEnv(env, context, EXPECTED);
}

function row(
  rows: Row[],
  logical: string,
  name?: string,
): Row | undefined {
  return rows.find((r) => r.logical === logical && (name === undefined || r.name === name));
}

describe("decodeLegacyJwtClaims", () => {
  it("decodes ref and role from a hand-minted unsigned JWT", () => {
    expect(decodeLegacyJwtClaims(JWT_SERVICE_OK)).toEqual({
      ref: EXPECTED,
      role: "service_role",
    });
  });

  it("returns only ref and role — extra claims are dropped", () => {
    const token = mintJwt({ ref: EXPECTED, role: "anon", secret: "x".repeat(40) });
    const claims = decodeLegacyJwtClaims(token);
    expect(claims).toEqual({ ref: EXPECTED, role: "anon" });
    expect(claims).not.toHaveProperty("secret");
  });

  it("non-3-part token → null", () => {
    expect(decodeLegacyJwtClaims("not-a-jwt")).toBeNull();
    expect(decodeLegacyJwtClaims("a.b")).toBeNull();
    expect(decodeLegacyJwtClaims("a.b.c.d")).toBeNull();
  });

  it("unparseable payload → null", () => {
    expect(decodeLegacyJwtClaims("aaa.!!!.ccc")).toBeNull();
    expect(decodeLegacyJwtClaims(`aaa.${Buffer.from("not json").toString("base64url")}.ccc`)).toBeNull();
  });
});

describe("evaluateEnv — verdicts", () => {
  it("MATCH: URL ref equals expectedRef", () => {
    const rows = rowsFor({ NEXT_PUBLIC_SUPABASE_URL: URL_OK }, "build");
    expect(row(rows, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")?.verdict).toBe("MATCH");
  });

  it("MISMATCH: URL carries a foreign ref", () => {
    const rows = rowsFor({ NEXT_PUBLIC_SUPABASE_URL: URL_FOREIGN }, "build");
    expect(row(rows, "SUPABASE_URL")?.verdict).toBe("MISMATCH");
    expect(envCheckFailed(rows)).toBe(true);
  });

  it("UNPARSEABLE: value is not a supabase URL/DSN/JWT", () => {
    const rows = rowsFor({ NEXT_PUBLIC_SUPABASE_URL: "not a url" }, "build");
    expect(row(rows, "SUPABASE_URL")?.verdict).toBe("UNPARSEABLE");
    expect(envCheckFailed(rows)).toBe(true); // required var unparseable
  });

  it("UNVERIFIABLE with matching URL is acceptable for required vars", () => {
    const rows = rowsFor(
      {
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SB_PUBLISHABLE,
      },
      "build",
    );
    expect(row(rows, "SUPABASE_PUBLISHABLE")?.verdict).toBe("UNVERIFIABLE");
    expect(envCheckFailed(rows)).toBe(false);
  });

  it("UNVERIFIABLE without matching URL gets the note and fails required vars", () => {
    const rows = rowsFor(
      {
        NEXT_PUBLIC_SUPABASE_URL: URL_FOREIGN,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SB_PUBLISHABLE,
      },
      "build",
    );
    const pub = row(rows, "SUPABASE_PUBLISHABLE");
    expect(pub?.verdict).toBe("UNVERIFIABLE");
    expect(pub?.note).toContain("paired URL not verified");
    expect(envCheckFailed(rows)).toBe(true);
  });

  it("MISSING: required logical var has no present candidate", () => {
    const rows = rowsFor({}, "build");
    expect(row(rows, "SUPABASE_URL")?.verdict).toBe("MISSING");
    expect(row(rows, "SUPABASE_URL")?.required).toBe(true);
    expect(envCheckFailed(rows)).toBe(true);
  });

  it("MISSING on a never-required var is not a failure", () => {
    const rows = rowsFor(
      {
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SB_PUBLISHABLE,
      },
      "build",
    );
    expect(row(rows, "OPENROUTER")?.verdict).toBe("MISSING");
    expect(row(rows, "OPENROUTER")?.required).toBe(false);
    expect(envCheckFailed(rows)).toBe(false);
  });

  it("CONFLICT: two present candidates hold different values", () => {
    const rows = rowsFor(
      {
        GH_SUPABASE_URL: URL_OK,
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        SUPABASE_URL: URL_FOREIGN,
      },
      "build",
    );
    expect(row(rows, "SUPABASE_URL", "GH_SUPABASE_URL")?.verdict).toBe("MATCH");
    expect(row(rows, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")?.verdict).toBe("MATCH");
    expect(row(rows, "SUPABASE_URL", "SUPABASE_URL")?.verdict).toBe("CONFLICT");
    expect(envCheckFailed(rows)).toBe(true);
  });

  it("CONFLICT: candidates resolving to different refs conflict even without URL verdicts", () => {
    const rows = rowsFor(
      {
        GH_SUPABASE_DB_CONNECTION: DSN_OK,
        SUPABASE_DB_CONNECTION: DSN_FOREIGN,
      },
      "live-db",
    );
    expect(row(rows, "SUPABASE_DB", "GH_SUPABASE_DB_CONNECTION")?.verdict).toBe("MATCH");
    expect(row(rows, "SUPABASE_DB", "SUPABASE_DB_CONNECTION")?.verdict).toBe("CONFLICT");
    expect(envCheckFailed(rows)).toBe(true);
  });

  it("legacy JWT keys decode ref/role → MATCH or MISMATCH", () => {
    const rows = rowsFor(
      {
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        GH_SUPABASE_SERVICE_ROLE_KEY: JWT_SERVICE_OK,
        SUPABASE_SERVICE_ROLE_KEY: JWT_SERVICE_FOREIGN,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: JWT_ANON_OK,
      },
      "test",
    );
    expect(row(rows, "SUPABASE_SERVICE", "GH_SUPABASE_SERVICE_ROLE_KEY")?.verdict).toBe("MATCH");
    expect(row(rows, "SUPABASE_SERVICE", "GH_SUPABASE_SERVICE_ROLE_KEY")?.ref).toBe(EXPECTED);
    expect(row(rows, "SUPABASE_SERVICE", "SUPABASE_SERVICE_ROLE_KEY")?.verdict).toBe("CONFLICT");
    expect(row(rows, "SUPABASE_ANON")?.verdict).toBe("MATCH");
  });

  it("service JWT must carry role=service_role, else MISMATCH", () => {
    const rows = rowsFor(
      {
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        SUPABASE_SERVICE_ROLE_KEY: JWT_WRONG_ROLE,
      },
      "test",
    );
    expect(row(rows, "SUPABASE_SERVICE")?.verdict).toBe("MISMATCH");
    expect(row(rows, "SUPABASE_SERVICE")?.note).toContain("role=anon");
    expect(envCheckFailed(rows)).toBe(true);
  });

  it("sb_secret_ values are UNVERIFIABLE (no ref inside the token)", () => {
    const rows = rowsFor(
      {
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        GH_SUPABASE_SECRET_KEY: SB_SECRET,
      },
      "test",
    );
    expect(row(rows, "SUPABASE_SERVICE", "GH_SUPABASE_SECRET_KEY")?.verdict).toBe("UNVERIFIABLE");
  });

  it("PARTYKIT_SECRET is presence-only UNVERIFIABLE; host is INFO", () => {
    const rows = rowsFor(
      {
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        GH_PARTYKIT_SECRET: "pk-fixture-secret-value",
        NEXT_PUBLIC_PARTY_KIT_HOST: "localhost:1999",
      },
      "test",
    );
    expect(row(rows, "PARTYKIT_SECRET")?.verdict).toBe("UNVERIFIABLE");
    expect(row(rows, "PARTYKIT_HOST")?.verdict).toBe("INFO");
    expect(row(rows, "PARTYKIT_HOST")?.required).toBe(false);
  });

  it("GH_ precedence: first present candidate is the used name; source flags prefix", () => {
    const rows = rowsFor(
      {
        GH_SUPABASE_URL: URL_FOREIGN,
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
      },
      "build",
    );
    const gh = row(rows, "SUPABASE_URL", "GH_SUPABASE_URL");
    const legacy = row(rows, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
    expect(gh?.source).toBe("GH_prefixed");
    expect(legacy?.source).toBe("legacy");
    expect(gh?.verdict).toBe("MISMATCH");
    expect(legacy?.verdict).toBe("CONFLICT");
  });
});

describe("evaluateEnv — required sets per context", () => {
  const buildEnv = {
    NEXT_PUBLIC_SUPABASE_URL: URL_OK,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SB_PUBLISHABLE,
  };
  const testEnv = {
    ...buildEnv,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: JWT_ANON_OK,
    GH_SUPABASE_SECRET_KEY: SB_SECRET,
    PARTYKIT_SECRET: "pk-fixture-secret-value",
  };
  const liveEnv = { ...testEnv, GH_SUPABASE_DB_CONNECTION: DSN_OK };

  it("build needs SUPABASE_URL + SUPABASE_PUBLISHABLE only", () => {
    const rows = rowsFor(buildEnv, "build");
    expect(row(rows, "SUPABASE_SERVICE")?.required).toBe(false);
    expect(row(rows, "SUPABASE_DB")?.required).toBe(false);
    expect(envCheckFailed(rows)).toBe(false);
  });

  it("test adds SUPABASE_SERVICE, SUPABASE_ANON, PARTYKIT_SECRET", () => {
    const rows = rowsFor(testEnv, "test");
    expect(row(rows, "SUPABASE_SERVICE")?.required).toBe(true);
    expect(row(rows, "SUPABASE_ANON")?.required).toBe(true);
    expect(row(rows, "PARTYKIT_SECRET")?.required).toBe(true);
    expect(envCheckFailed(rows)).toBe(false);
    const missing = rowsFor(buildEnv, "test");
    expect(envCheckFailed(missing)).toBe(true);
  });

  it("live-db adds SUPABASE_DB and it must MATCH", () => {
    const rows = rowsFor(liveEnv, "live-db");
    expect(row(rows, "SUPABASE_DB")?.required).toBe(true);
    expect(row(rows, "SUPABASE_DB")?.verdict).toBe("MATCH");
    expect(envCheckFailed(rows)).toBe(false);
    expect(envCheckFailed(rowsFor(testEnv, "live-db"))).toBe(true); // missing DSN
    expect(
      envCheckFailed(rowsFor({ ...liveEnv, GH_SUPABASE_DB_CONNECTION: DSN_FOREIGN }, "live-db")),
    ).toBe(true); // foreign DSN
  });
});

describe("formatRows — NO-LEAK guarantee", () => {
  it("output never contains a value or any 8-char window of one", () => {
    const fixtures: Record<string, string> = {
      // Values are long distinctive strings that share no ≥8-char window with
      // printed metadata (names/logicals/roles/verdicts). Parsed refs stay
      // <8 chars — the ref itself is the only fragment allowed to appear,
      // and only in the REF column.
      NEXT_PUBLIC_SUPABASE_URL: "https://zz1.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_Z9QXKLMNBVCXZAQWER0123456789",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: mintJwt({
        ref: "zz1",
        role: "anon",
        iat: 1700000000,
        pad: "Z9QXKLMNBVCXZAQWER0123456789",
      }),
      GH_SUPABASE_SECRET_KEY: "sb_secret_Z9QXKLMNBVCXZAQWER0123456789",
      SUPABASE_SERVICE_ROLE_KEY: JWT_SERVICE_FOREIGN,
      GH_SUPABASE_DB_CONNECTION:
        "postgresql://postgres.zz1:K9XWVQPLMNBVCXZAQWER0123@aws-9.pooler.supabase.com:6543/postgres",
      GH_PARTYKIT_SECRET: "Z9QXKLMNBVCXZAQWER0123456789abcdef",
      NEXT_PUBLIC_PARTY_KIT_HOST: "k9zxwv-host.example.internal:1999",
      OPENROUTER_API_KEY: "or-Z9QXKLMNBVCXZAQWER0123456789",
    };
    const rows = rowsFor(fixtures, "live-db");
    const output = formatRows(rows) + "\n" + JSON.stringify(rows);
    for (const value of Object.values(fixtures)) {
      expect(output).not.toContain(value);
      for (let i = 0; i + 8 <= value.length; i++) {
        expect(output).not.toContain(value.slice(i, i + 8));
      }
    }
  });

  it("prints the mandated fixed-width columns", () => {
    const out = formatRows(rowsFor({ NEXT_PUBLIC_SUPABASE_URL: URL_OK }, "build"));
    const header = out.split("\n")[0];
    expect(header).toContain("LOGICAL");
    expect(header).toContain("NAME");
    expect(header).toContain("PRESENT");
    expect(header).toContain("SOURCE");
    expect(header).toContain("REF");
    expect(header).toContain("VERDICT");
    expect(out).toContain("MATCH");
  });
});

// DB-HARDEN-CONNSTRING-1027-001 — structural diagnosis tests. DSN strings are
// built at runtime by concatenation so no password-shaped literal ever
// appears in this source file. Passwords are split into parts for the same
// reason.
function mkDsn(parts: {
  scheme?: string;
  user?: string;
  pw?: string[];
  host?: string;
  port?: string;
  db?: string;
}): string {
  return [
    parts.scheme ?? "postgresql",
    "://",
    parts.user ?? "postgres",
    ":",
    (parts.pw ?? ["pw"]).join(""),
    "@",
    parts.host ?? "db.zz1.supabase.co",
    ":",
    parts.port ?? "5432",
    "/",
    parts.db ?? "postgres",
  ].join("");
}

const PW_PARTS = ["Fake", "Pw", "9090x"] as const;
const PW_VALUE = PW_PARTS.join("");
const POOLER = "aws-0-us-fake-1.pooler.supabase.com";
const USER_WITH_REF = `postgres.${EXPECTED}`;

describe("diagnoseDbConnectionString", () => {
  it("valid direct DSN → ok, facts carry no secret", () => {
    const r = diagnoseDbConnectionString(mkDsn({ pw: [...PW_PARTS] }));
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.facts.scheme).toBe("postgresql");
    expect(r.facts.host).toBe("db.zz1.supabase.co");
    expect(r.facts.port).toBe("5432");
    expect(r.facts.dbName).toBe("postgres");
    expect(r.facts.passwordLength).toBe(PW_VALUE.length);
    expect(r.facts.userHasProjectRef).toBe(false);
  });

  it("valid pooler DSN with project-ref username → ok", () => {
    const r = diagnoseDbConnectionString(
      mkDsn({ user: USER_WITH_REF, pw: [...PW_PARTS], host: POOLER, port: "6543" }),
    );
    expect(r.ok).toBe(true);
    expect(r.facts.userHasProjectRef).toBe(true);
  });

  it("EMPTY: undefined or blank", () => {
    expect(diagnoseDbConnectionString(undefined).problems).toEqual(["EMPTY"]);
    expect(diagnoseDbConnectionString("").problems).toEqual(["EMPTY"]);
    expect(diagnoseDbConnectionString("   ").problems).toEqual(["EMPTY"]);
  });

  it("LEADING_OR_TRAILING_WHITESPACE on an otherwise-valid DSN", () => {
    const good = mkDsn({ pw: [...PW_PARTS] });
    for (const padded of [` ${good}`, `${good} `, `\n${good}\t`]) {
      const r = diagnoseDbConnectionString(padded);
      expect(r.ok).toBe(false);
      expect(r.problems).toContain("LEADING_OR_TRAILING_WHITESPACE");
    }
  });

  it("EMBEDDED_WHITESPACE inside the DSN", () => {
    const r = diagnoseDbConnectionString(
      mkDsn({ pw: [...PW_PARTS] }).replace("://", ":// "),
    );
    expect(r.problems).toContain("EMBEDDED_WHITESPACE");
    expect(r.ok).toBe(false);
  });

  it("WRAPPING_QUOTES around an otherwise-valid DSN", () => {
    const good = mkDsn({ pw: [...PW_PARTS] });
    for (const q of [`"${good}"`, `'${good}'`]) {
      const r = diagnoseDbConnectionString(q);
      expect(r.problems).toContain("WRAPPING_QUOTES");
      expect(r.ok).toBe(false);
    }
  });

  it("PLACEHOLDER_BRACKETS around the password", () => {
    const r = diagnoseDbConnectionString(
      mkDsn({ pw: ["[", "YOUR", "-PASSWORD", "]"] }),
    );
    expect(r.problems).toContain("PLACEHOLDER_BRACKETS");
    expect(r.ok).toBe(false);
  });

  it("BAD_SCHEME for non-postgres schemes", () => {
    const r = diagnoseDbConnectionString(mkDsn({ scheme: "mysql", pw: [...PW_PARTS] }));
    expect(r.problems).toContain("BAD_SCHEME");
    expect(r.facts.scheme).toBe("mysql");
    expect(r.ok).toBe(false);
  });

  it("UNENCODED_AT_IN_PASSWORD when the authority holds more than one @", () => {
    const r = diagnoseDbConnectionString(mkDsn({ pw: [...PW_PARTS, "@", "x"] }));
    expect(r.problems).toContain("UNENCODED_AT_IN_PASSWORD");
    expect(r.ok).toBe(false);
  });

  it("unencoded # in password → HOST_UNEXPECTED", () => {
    const r = diagnoseDbConnectionString(mkDsn({ pw: [...PW_PARTS, "#", "x"] }));
    expect(r.problems).toContain("HOST_UNEXPECTED");
    expect(r.ok).toBe(false);
  });

  it("PORT_MISSING_OR_NONNUMERIC for a non-numeric or absent port", () => {
    const bad = diagnoseDbConnectionString(
      mkDsn({ pw: [...PW_PARTS], port: "abc" }),
    );
    expect(bad.problems).toContain("PORT_MISSING_OR_NONNUMERIC");
    const missing = diagnoseDbConnectionString(
      `postgresql://postgres:${PW_PARTS.join("")}@db.zz1.supabase.co/postgres`,
    );
    expect(missing.problems).toContain("PORT_MISSING_OR_NONNUMERIC");
  });

  it("DB_NAME_UNEXPECTED when the path is not /postgres", () => {
    const r = diagnoseDbConnectionString(
      mkDsn({ pw: [...PW_PARTS], db: "postgre" }),
    );
    expect(r.problems).toContain("DB_NAME_UNEXPECTED");
    expect(r.facts.dbName).toBe("postgre");
    expect(r.ok).toBe(false);
  });

  it("USER_MISSING_PROJECT_REF on pooler host without .ref in username", () => {
    const r = diagnoseDbConnectionString(
      mkDsn({ user: "postgres", pw: [...PW_PARTS], host: POOLER, port: "6543" }),
    );
    expect(r.problems).toContain("USER_MISSING_PROJECT_REF");
    expect(r.facts.userHasProjectRef).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("NO-LEAK: no substring of the password appears in the result", () => {
    const inputs = [
      mkDsn({ pw: [...PW_PARTS] }),
      mkDsn({ pw: [...PW_PARTS], host: "not-supabase.example.invalid" }),
      mkDsn({ scheme: "mysql", pw: [...PW_PARTS] }),
      mkDsn({ user: "postgres", pw: [...PW_PARTS], host: POOLER, port: "6543" }),
      ` ${mkDsn({ pw: [...PW_PARTS] })} `,
    ];
    for (const input of inputs) {
      const r = diagnoseDbConnectionString(input);
      const serialized = JSON.stringify(r) + r.problems.join(",");
      expect(serialized).not.toContain(PW_VALUE);
      for (let i = 0; i + 8 <= PW_VALUE.length; i++) {
        expect(serialized).not.toContain(PW_VALUE.slice(i, i + 8));
      }
    }
  });
});

describe("evaluateEnv — DSN diagnosis in notes (DB-HARDEN-CONNSTRING-1027-001)", () => {
  it("malformed DSN reports problem codes, never the value", () => {
    const malformed = mkDsn({ scheme: "mysql", pw: [...PW_PARTS] });
    const rows = rowsFor({ GH_SUPABASE_DB_CONNECTION: malformed }, "live-db");
    const dbRow = row(rows, "SUPABASE_DB", "GH_SUPABASE_DB_CONNECTION");
    expect(dbRow?.note).toContain("dsn malformed: ");
    expect(dbRow?.note).toContain("BAD_SCHEME");
    expect(dbRow?.note).not.toContain(malformed);
    expect(dbRow?.note).not.toContain(PW_VALUE);
  });

  it("structurally-ok foreign DSN still reports dsn=ok alongside MISMATCH", () => {
    const rows = rowsFor(
      {
        GH_SUPABASE_DB_CONNECTION: mkDsn({
          user: `postgres.${OTHER}`,
          pw: [...PW_PARTS],
          host: POOLER,
          port: "6543",
        }),
      },
      "live-db",
    );
    const dbRow = row(rows, "SUPABASE_DB", "GH_SUPABASE_DB_CONNECTION");
    expect(dbRow?.verdict).toBe("MISMATCH");
    expect(dbRow?.note).toContain("dsn=ok");
    expect(dbRow?.note).toContain("user-ref=yes");
  });

  it("DSN notes never contain an 8-char window of the password", () => {
    const rows = rowsFor(
      { GH_SUPABASE_DB_CONNECTION: mkDsn({ pw: [...PW_PARTS] }) },
      "live-db",
    );
    const out = formatRows(rows) + JSON.stringify(rows);
    for (let i = 0; i + 8 <= PW_VALUE.length; i++) {
      expect(out).not.toContain(PW_VALUE.slice(i, i + 8));
    }
  });
});
