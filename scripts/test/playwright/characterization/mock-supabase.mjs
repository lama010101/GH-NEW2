// AUTH-TEST-TWOCTXLOCK-CHARACTERIZE-1013-003 — local mock Supabase (auth + REST)
// used ONLY by the characterization harness in this directory. Pure node http,
// no dependencies. Never proxies or contacts a real Supabase project.
//
// Implemented endpoints:
//   POST /auth/v1/token?grant_type=password       -> password sign-in
//   POST /auth/v1/token?grant_type=refresh_token  -> SINGLE-USE refresh tokens
//         with a configurable reuse window (REUSE_WINDOW_MS env / POST /__config)
//   GET  /auth/v1/user                            -> Bearer-token user lookup
//   POST /auth/v1/logout                          -> 204 (signOut stub)
//   GET  /auth/v1/settings                        -> minimal settings stub
//   GET  /rest/v1/profiles                        -> display_name 'Mock User'
//         (honors Accept: application/vnd.pgrst.object+json; configurable delay
//         via PROFILES_DELAY_MS env / POST /__config)
//   POST /__seed    {refresh_token, user_id?}     -> register a refresh token
//   POST /__config  {reuseWindowMs?, profilesDelayMs?}
//   POST /__reset                                 -> clear the request log
//   GET  /__log                                   -> { requests, config }
//   GET  /__health                                -> 200
//
// Request log: { seq, t (Date.now), mono (ms since start), method, url,
// grant_type, status }. No header or token VALUES are ever logged.

import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 3999);
const USER_ID = "11111111-2222-3333-4444-555555555555";
const USER_EMAIL = "mock.user@localhost.test";

const started = Date.now();
let config = {
  reuseWindowMs: Number(process.env.REUSE_WINDOW_MS ?? 10_000),
  profilesDelayMs: Number(process.env.PROFILES_DELAY_MS ?? 0),
};

// refresh_token -> { usedAt: number|null, issued: session|null }
const refreshTokens = new Map();
const accessTokens = new Map(); // access_token -> userId
const requests = [];
let seq = 0;
let tokenSeq = 0;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeJwt(userId, expiresAtUnix) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      aud: "authenticated",
      role: "authenticated",
      email: USER_EMAIL,
      iat: Math.floor(Date.now() / 1000),
      exp: expiresAtUnix,
    })
  );
  return `${header}.${payload}.mock-sig`;
}

function issueSession(userId, expiresInSec = 3600) {
  const n = ++tokenSeq;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
  const session = {
    access_token: makeJwt(userId, expiresAt),
    token_type: "bearer",
    expires_in: expiresInSec,
    expires_at: expiresAt,
    refresh_token: `rt-${n}-${Math.random().toString(36).slice(2, 10)}`,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: USER_EMAIL,
      email_confirmed_at: new Date().toISOString(),
      phone: "",
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
  refreshTokens.set(session.refresh_token, { usedAt: null, issued: null });
  accessTokens.set(session.access_token, userId);
  return session;
}

function log(req, status, extra = {}) {
  requests.push({
    seq: ++seq,
    t: Date.now(),
    mono: Date.now() - started,
    method: req.method,
    url: req.url,
    status,
    // First 24 chars of UA — distinguishes middleware/server-side node fetches
    // from browser-side supabase-js calls. Never logs header VALUES.
    ua: String(req.headers["user-agent"] || "").slice(0, 24),
    ...extra,
  });
}

function sendJson(res, status, obj, req, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  });
  res.end(body);
  log(req, status, extra);
}

function sendEmpty(res, status, req) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  });
  res.end();
  log(req, status);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    sendEmpty(res, 204, req);
    return;
  }

  // ---------- harness admin ----------
  if (u.pathname === "/__health") return sendJson(res, 200, { ok: true }, req);
  if (u.pathname === "/__log")
    return sendJson(res, 200, { requests, config }, req, { internal: true });
  if (u.pathname === "/__reset") {
    requests.length = 0;
    return sendJson(res, 200, { ok: true }, req, { internal: true });
  }
  if (u.pathname === "/__config" && req.method === "POST") {
    const body = await readBody(req);
    if (typeof body.reuseWindowMs === "number") config.reuseWindowMs = body.reuseWindowMs;
    if (typeof body.profilesDelayMs === "number") config.profilesDelayMs = body.profilesDelayMs;
    return sendJson(res, 200, { ok: true, config }, req, { internal: true });
  }
  if (u.pathname === "/__seed" && req.method === "POST") {
    const body = await readBody(req);
    if (typeof body.refresh_token === "string" && body.refresh_token.length > 0) {
      refreshTokens.set(body.refresh_token, { usedAt: null, issued: null });
      return sendJson(res, 200, { ok: true }, req, { internal: true });
    }
    return sendJson(res, 400, { error: "refresh_token required" }, req, { internal: true });
  }

  // ---------- auth ----------
  if (u.pathname === "/auth/v1/token" && req.method === "POST") {
    const grant = u.searchParams.get("grant_type");
    const body = await readBody(req);
    if (grant === "password") {
      const session = issueSession(USER_ID);
      return sendJson(res, 200, session, req, { grant_type: "password" });
    }
    if (grant === "refresh_token") {
      const rt = body.refresh_token;
      const rec = typeof rt === "string" ? refreshTokens.get(rt) : undefined;
      if (!rec) {
        return sendJson(
          res,
          400,
          { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" },
          req,
          { grant_type: "refresh_token", outcome: "not_found" }
        );
      }
      const now = Date.now();
      if (rec.usedAt === null) {
        rec.usedAt = now;
        const session = issueSession(USER_ID);
        rec.issued = session;
        return sendJson(res, 200, session, req, { grant_type: "refresh_token", outcome: "rotated" });
      }
      if (now - rec.usedAt < config.reuseWindowMs) {
        // Reuse window: real Supabase replays the already-issued session.
        return sendJson(res, 200, rec.issued, req, { grant_type: "refresh_token", outcome: "replay_within_window" });
      }
      return sendJson(
        res,
        400,
        { code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" },
        req,
        { grant_type: "refresh_token", outcome: "already_used" }
      );
    }
    return sendJson(res, 400, { error: "unsupported grant_type" }, req, { grant_type: grant });
  }

  if (u.pathname === "/auth/v1/user" && req.method === "GET") {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = accessTokens.get(token);
    if (!userId) {
      return sendJson(
        res,
        401,
        { code: 401, error_code: "bad_jwt", msg: "invalid JWT" },
        req
      );
    }
    return sendJson(
      res,
      200,
      {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: USER_EMAIL,
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      req
    );
  }

  if (u.pathname === "/auth/v1/logout" && req.method === "POST") {
    return sendEmpty(res, 204, req);
  }

  if (u.pathname === "/auth/v1/settings" && req.method === "GET") {
    return sendJson(res, 200, {
      disable_signup: false,
      mailer_autoconfirm: true,
      external: { email: true },
    }, req);
  }

  // ---------- rest ----------
  if (u.pathname === "/rest/v1/profiles" && req.method === "GET") {
    const respond = () => {
      const acceptsObject = (req.headers.accept || "").includes("application/vnd.pgrst.object+json");
      const row = { id: USER_ID, display_name: "Mock User" };
      return sendJson(res, 200, acceptsObject ? row : [row], req);
    };
    if (config.profilesDelayMs > 0) {
      setTimeout(respond, config.profilesDelayMs);
      return;
    }
    return respond();
  }

  return sendJson(res, 404, { error: `mock: unhandled ${req.method} ${u.pathname}` }, req);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-supabase] listening on http://localhost:${PORT} reuseWindowMs=${config.reuseWindowMs} profilesDelayMs=${config.profilesDelayMs}`);
});
