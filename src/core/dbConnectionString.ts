// DB-HARDEN-CONNSTRING-1027-001 — secret-free structural diagnosis for
// SUPABASE_DB_CONNECTION. Shared single implementation used by
// src/server/db.ts (fail-fast enforcement) and scripts/dev/envCheckCore.ts
// (env:check reporting).
//
// Pure module: no env access, no node-only imports — safe to bundle anywhere.
// NEVER put the input value — or any fragment, prefix, suffix or length of
// its secret parts — into `problems`. Problems are fixed machine codes from
// a closed set. `facts` may only carry scheme/host/port/db name, whether the
// username embeds a project ref, and the password LENGTH as a number —
// never the username, never the password, never the full string.

export interface DbConnectionStringFacts {
  scheme?: string;
  host?: string;
  port?: string;
  dbName?: string;
  userHasProjectRef?: boolean;
  passwordLength?: number;
}

export interface DbConnectionStringDiagnosis {
  ok: boolean;
  problems: string[];
  fatalProblems: string[];
  warnings: string[];
  facts: DbConnectionStringFacts;
}

// DB-HARDEN-CONNSTRING-1027-002 — the app may only refuse to start for
// strings pg provably cannot parse. Everything else is a warning. These
// WARNING codes partition `problems` together with the FATAL ones (any code
// not listed here is fatal).
const WARNING_CODES = new Set([
  "LEADING_OR_TRAILING_WHITESPACE",
  "EMBEDDED_WHITESPACE",
  "UNENCODED_AT_IN_PASSWORD",
  "HOST_UNEXPECTED",
  "DB_NAME_UNEXPECTED",
  "USER_MISSING_PROJECT_REF",
]);

export function diagnoseDbConnectionString(
  raw: string | undefined,
): DbConnectionStringDiagnosis {
  const problems: string[] = [];
  const facts: DbConnectionStringFacts = {};
  const done = () => {
    const warnings = problems.filter((p) => WARNING_CODES.has(p));
    const fatalProblems = problems.filter((p) => !WARNING_CODES.has(p));
    return {
      ok: fatalProblems.length === 0,
      problems,
      fatalProblems,
      warnings,
      facts,
    };
  };

  if (raw === undefined || raw.trim() === "") {
    problems.push("EMPTY");
    return done();
  }

  let value = raw;
  if (value !== value.trim()) {
    problems.push("LEADING_OR_TRAILING_WHITESPACE");
    value = value.trim();
  }
  if (/\s/.test(value)) {
    problems.push("EMBEDDED_WHITESPACE");
  }
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    problems.push("WRAPPING_QUOTES");
    value = value.slice(1, -1);
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(value);
  if (schemeMatch) {
    facts.scheme = schemeMatch[1];
  }
  if (schemeMatch === null || !/^postgres(ql)?$/i.test(schemeMatch[1])) {
    problems.push("BAD_SCHEME");
  }

  // Authority = between "://" and the first / ? # — URL parsing may still
  // fail below, so host/port/password structure is diagnosed on this raw
  // substring first (e.g. an unencoded # truncates the authority).
  const authority =
    schemeMatch === null
      ? ""
      : value.slice(schemeMatch[0].length).split(/[/?#]/, 1)[0];

  const userinfoEnd = authority.lastIndexOf("@");
  if (authority.split("@").length - 1 > 1) {
    problems.push("UNENCODED_AT_IN_PASSWORD");
  }

  const userinfo = userinfoEnd >= 0 ? authority.slice(0, userinfoEnd) : "";
  const hostport = userinfoEnd >= 0 ? authority.slice(userinfoEnd + 1) : authority;
  const colonIdx = userinfo.indexOf(":");
  const username = colonIdx >= 0 ? userinfo.slice(0, colonIdx) : userinfo;
  const password = colonIdx >= 0 ? userinfo.slice(colonIdx + 1) : "";
  if (password.length > 0) {
    facts.passwordLength = password.length;
  }
  // Placeholder brackets only when the ENTIRE password is wrapped — raw
  // brackets inside a real password are legal (pg percent-encodes them).
  if (
    (password.startsWith("[") && password.endsWith("]")) ||
    (password.startsWith("<") && password.endsWith(">"))
  ) {
    problems.push("PLACEHOLDER_BRACKETS");
  }

  const portColon = hostport.lastIndexOf(":");
  const host = portColon >= 0 ? hostport.slice(0, portColon) : hostport;
  const port = portColon >= 0 ? hostport.slice(portColon + 1) : "";
  if (host !== "") {
    facts.host = host;
  }
  if (!/\.supabase\.(com|co)$/i.test(host)) {
    problems.push("HOST_UNEXPECTED");
  }
  if (port === "" || !/^[0-9]+$/.test(port)) {
    problems.push("PORT_MISSING_OR_NONNUMERIC");
  } else {
    facts.port = port;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    problems.push("URL_PARSE_FAILED");
    return done();
  }

  facts.dbName = parsed.pathname.replace(/^\//, "");
  if (parsed.pathname !== "/postgres") {
    problems.push("DB_NAME_UNEXPECTED");
  }

  if (username !== "") {
    facts.userHasProjectRef = /\..+/.test(username);
  }
  if (host.toLowerCase().includes("pooler") && !/\..+/.test(username)) {
    problems.push("USER_MISSING_PROJECT_REF");
  }

  return done();
}
