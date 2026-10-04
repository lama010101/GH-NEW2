import { describe, expect, it } from "vitest";
import {
  decodeLegacyJwtClaims,
  envCheckFailed,
  evaluateEnv,
  formatRows,
  type Row,
} from "./envCheckCore";

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
