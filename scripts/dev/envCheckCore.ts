// INFRA-BUILD-ENVCHECK-038 — pure evaluation core for `npm run env:check`.
// The Devin Cloud secret store is shared between this repo and other products
// under the same env var names, so a PRESENT variable is not evidence it
// belongs to this project. This module decides MATCH/MISMATCH/etc. per
// candidate name without ever touching process.env, the DB, or the network.
//
// HARD RULE: never put an env value — or any fragment, prefix, suffix or
// length of one — into a Row, a note, or any thrown error. Only the parsed
// project ref may be reported.

import {
  parseProjectRefFromDsn,
  parseProjectRefFromSupabaseUrl,
} from "../../src/core/projectRef";

export type EnvCheckContext = "build" | "test" | "live-db";

export type Verdict =
  | "MATCH"
  | "MISMATCH"
  | "UNVERIFIABLE"
  | "UNPARSEABLE"
  | "MISSING"
  | "CONFLICT"
  | "INFO";

export interface Row {
  logical: string;
  name: string;
  present: boolean;
  source: "GH_prefixed" | "legacy" | "-";
  ref: string | "-";
  verdict: Verdict;
  required: boolean;
  note?: string;
}

type CheckKind =
  | "supabaseUrl"
  | "jwtOrPublishable"
  | "jwtOrSecret"
  | "dsn"
  | "presence"
  | "info";

interface LogicalSpec {
  logical: string;
  candidates: string[]; // precedence order: first present is the "used" name
  kind: CheckKind;
}

const LOGICAL_SPECS: LogicalSpec[] = [
  {
    logical: "SUPABASE_URL",
    candidates: ["GH_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
    kind: "supabaseUrl",
  },
  {
    logical: "SUPABASE_PUBLISHABLE",
    candidates: ["GH_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    kind: "jwtOrPublishable",
  },
  {
    logical: "SUPABASE_ANON",
    candidates: ["GH_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    kind: "jwtOrPublishable",
  },
  {
    logical: "SUPABASE_SERVICE",
    candidates: [
      "GH_SUPABASE_SECRET_KEY",
      "SUPABASE_SECRET_KEY_PROD",
      "GH_SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    kind: "jwtOrSecret",
  },
  {
    logical: "SUPABASE_DB",
    candidates: ["GH_SUPABASE_DB_CONNECTION", "SUPABASE_DB_CONNECTION", "SUPABASE_DB_POOLER"],
    kind: "dsn",
  },
  {
    logical: "PARTYKIT_SECRET",
    candidates: ["GH_PARTYKIT_SECRET", "PARTYKIT_SECRET"],
    kind: "presence",
  },
  {
    logical: "PARTYKIT_HOST",
    candidates: ["NEXT_PUBLIC_PARTY_KIT_HOST"],
    kind: "info",
  },
  {
    logical: "OPENROUTER",
    candidates: ["GH_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"],
    kind: "presence",
  },
];

// Required logical vars per context. SUPABASE_URL and SUPABASE_DB are
// "must MATCH" vars — being parseable is not enough.
const REQUIRED: Record<EnvCheckContext, string[]> = {
  build: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE"],
  test: [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE",
    "SUPABASE_SERVICE",
    "SUPABASE_ANON",
    "PARTYKIT_SECRET",
  ],
  "live-db": [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE",
    "SUPABASE_SERVICE",
    "SUPABASE_ANON",
    "PARTYKIT_SECRET",
    "SUPABASE_DB",
  ],
};

// Decodes the payload of a legacy (anon/service_role) Supabase JWT locally.
// Returns ONLY the ref and role claims; null when the token is not a 3-part
// JWT or the payload does not parse. The token itself is never reported.
export function decodeLegacyJwtClaims(
  token: string,
): { ref?: string; role?: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    const claims = JSON.parse(payload) as unknown;
    if (typeof claims !== "object" || claims === null) {
      return null;
    }
    const out: { ref?: string; role?: string } = {};
    const ref = (claims as Record<string, unknown>).ref;
    const role = (claims as Record<string, unknown>).role;
    if (typeof ref === "string") {
      out.ref = ref;
    }
    if (typeof role === "string") {
      out.role = role;
    }
    return out;
  } catch {
    return null;
  }
}

interface Resolved {
  verdict: Verdict;
  ref: string | "-";
  role?: string;
}

function verdictForValue(
  kind: CheckKind,
  value: string,
  expectedRef: string,
): Resolved {
  switch (kind) {
    case "supabaseUrl": {
      const ref = parseProjectRefFromSupabaseUrl(value);
      if (ref === null) {
        return { verdict: "UNPARSEABLE", ref: "-" };
      }
      return { verdict: ref === expectedRef ? "MATCH" : "MISMATCH", ref };
    }
    case "dsn": {
      const ref = parseProjectRefFromDsn(value);
      if (ref === null) {
        return { verdict: "UNPARSEABLE", ref: "-" };
      }
      return { verdict: ref === expectedRef ? "MATCH" : "MISMATCH", ref };
    }
    case "jwtOrPublishable": {
      if (value.startsWith("sb_publishable_")) {
        return { verdict: "UNVERIFIABLE", ref: "-" };
      }
      const claims = decodeLegacyJwtClaims(value);
      if (claims === null || typeof claims.ref !== "string" || claims.ref === "") {
        return { verdict: "UNPARSEABLE", ref: "-" };
      }
      return {
        verdict: claims.ref === expectedRef ? "MATCH" : "MISMATCH",
        ref: claims.ref,
        role: claims.role,
      };
    }
    case "jwtOrSecret": {
      if (value.startsWith("sb_secret_")) {
        return { verdict: "UNVERIFIABLE", ref: "-" };
      }
      const claims = decodeLegacyJwtClaims(value);
      if (claims === null || typeof claims.ref !== "string" || claims.ref === "") {
        return { verdict: "UNPARSEABLE", ref: "-" };
      }
      const ok = claims.ref === expectedRef && claims.role === "service_role";
      return { verdict: ok ? "MATCH" : "MISMATCH", ref: claims.ref, role: claims.role };
    }
    case "presence":
      return { verdict: "UNVERIFIABLE", ref: "-" };
    case "info":
      return { verdict: "INFO", ref: "-" };
  }
}

export function evaluateEnv(
  env: Record<string, string | undefined>,
  context: EnvCheckContext,
  expectedRef: string,
): Row[] {
  const requiredSet = new Set(REQUIRED[context]);
  const rows: Row[] = [];

  for (const spec of LOGICAL_SPECS) {
    const required = requiredSet.has(spec.logical);
    const present = spec.candidates
      .map((name) => ({ name, value: env[name] }))
      .filter(
        (c): c is { name: string; value: string } =>
          typeof c.value === "string" && c.value.length > 0,
      );

    if (present.length === 0) {
      rows.push({
        logical: spec.logical,
        name: "-",
        present: false,
        source: "-",
        ref: "-",
        verdict: "MISSING",
        required,
      });
      continue;
    }

    // First present candidate is the "used" name; every present candidate
    // still gets its own row.
    const used = present[0];
    const usedResolved = verdictForValue(spec.kind, used.value, expectedRef);

    for (const candidate of present) {
      const resolved =
        candidate === used ? usedResolved : verdictForValue(spec.kind, candidate.value, expectedRef);
      const conflict =
        candidate !== used &&
        (candidate.value !== used.value ||
          (resolved.ref !== "-" && usedResolved.ref !== "-" && resolved.ref !== usedResolved.ref));
      const notes: string[] = [];
      if (resolved.role !== undefined) {
        notes.push(`role=${resolved.role}`);
      }
      rows.push({
        logical: spec.logical,
        name: candidate.name,
        present: true,
        source: candidate.name.startsWith("GH_") ? "GH_prefixed" : "legacy",
        ref: resolved.ref,
        verdict: conflict ? "CONFLICT" : resolved.verdict,
        required,
        note: notes.length > 0 ? notes.join("; ") : undefined,
      });
    }
  }

  // An UNVERIFIABLE key is acceptable only when the SUPABASE_URL logical var
  // proved MATCH — without that anchor the key cannot be tied to this project.
  const urlMatched = rows.some(
    (r) => r.logical === "SUPABASE_URL" && r.verdict === "MATCH",
  );
  if (!urlMatched) {
    for (const row of rows) {
      if (row.verdict === "UNVERIFIABLE") {
        row.note = row.note
          ? `${row.note}; paired URL not verified`
          : "paired URL not verified";
      }
    }
  }

  return rows;
}

// Overall PASS/FAIL. Failure when any row is MISMATCH or CONFLICT, any
// required logical var has no present candidate (MISSING), any required var
// is UNPARSEABLE, or a required var stays UNVERIFIABLE without a matching
// SUPABASE_URL row.
export function envCheckFailed(rows: Row[]): boolean {
  const urlMatched = rows.some(
    (r) => r.logical === "SUPABASE_URL" && r.verdict === "MATCH",
  );
  return rows.some((row) => {
    if (row.verdict === "MISMATCH" || row.verdict === "CONFLICT") {
      return true;
    }
    if (!row.required) {
      return false;
    }
    return (
      row.verdict === "MISSING" ||
      row.verdict === "UNPARSEABLE" ||
      (row.verdict === "UNVERIFIABLE" && !urlMatched)
    );
  });
}

// Fixed-width table. Values are never printed — only logical var names,
// candidate env var names, parsed refs, JWT roles, verdicts and notes.
export function formatRows(rows: Row[]): string {
  const header = ["LOGICAL", "NAME", "PRESENT", "SOURCE", "REF", "VERDICT", "REQUIRED", "NOTES"];
  const body = rows.map((r) => [
    r.logical,
    r.name,
    r.present ? "yes" : "no",
    r.source,
    r.ref,
    r.verdict,
    r.required ? "yes" : "no",
    r.note ?? "-",
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...body.map((line) => line[i].length)),
  );
  const fmt = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join(" | ").replace(/\s+$/, "");
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");
  return [fmt(header), separator, ...body.map(fmt)].join("\n");
}
