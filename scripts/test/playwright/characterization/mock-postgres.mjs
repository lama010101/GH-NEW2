// AUTH-TEST-TWOCTXLOCK-CHARACTERIZE-1013-003 — minimal PostgreSQL wire-protocol
// mock. Exists because src/server/db.ts enforceDbConnection() process.exit(1)s
// the whole dev server when SUPABASE_DB_CONNECTION is absent/unreachable, and
// DB-backed API routes (e.g. /api/daily/status) get invoked by pages under
// test. This answers the pool's startup `SELECT 1, current_database(),
// version()` with a synthetic row, and every other query with an empty result.
// Never stores or returns real data — routes that need rows get [] and may
// answer 500, which is acceptable for auth-lock characterization.

import net from "node:net";
import tls from "node:tls";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.MOCK_PG_PORT || 5433);

// db.ts forces ssl:{rejectUnauthorized:false}, so the client WILL request an
// SSL upgrade. Generate a throwaway localhost cert once per process.
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-pg-"));
execSync(
  `openssl req -x509 -newkey rsa:2048 -nodes -days 2 ` +
    `-keyout ${certDir}/key.pem -out ${certDir}/cert.pem -subj /CN=localhost`,
  { stdio: "ignore" }
);
const secureContext = tls.createSecureContext({
  key: fs.readFileSync(`${certDir}/key.pem`),
  cert: fs.readFileSync(`${certDir}/cert.pem`),
});

// --- message builders -----------------------------------------------------
const buf32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};

function msg(type, body) {
  return Buffer.concat([Buffer.from(type), buf32(body.length + 4), body]);
}

const authenticationOk = () => msg("R", buf32(0));
const backendKeyData = () => msg("K", Buffer.concat([buf32(1234), buf32(5678)]));
const readyForQuery = () => msg("Z", Buffer.from("I"));
const paramStatus = (k, v) =>
  msg("S", Buffer.concat([Buffer.from(k + "\0"), Buffer.from(v + "\0")]));
const commandComplete = (tag) => msg("C", Buffer.from(tag + "\0"));
const emptyQueryResponse = () => msg("I", Buffer.alloc(0));

function rowDescription(cols) {
  const parts = [buf32(0).subarray(2)]; // field count as int16
  parts[0] = Buffer.alloc(2);
  parts[0].writeInt16BE(cols.length);
  for (const c of cols) {
    const name = Buffer.from(c.name + "\0");
    const rest = Buffer.alloc(18);
    rest.writeInt32BE(0, 0); // table oid
    rest.writeInt16BE(0, 4); // column attnum
    rest.writeInt32BE(c.text ? 25 : 23, 6); // type oid: text=25, int4=23
    rest.writeInt16BE(c.text ? -1 : 4, 10); // typlen
    rest.writeInt32BE(-1, 12); // typmod
    rest.writeInt16BE(0, 16); // format: text
    parts.push(name, rest);
  }
  return msg("T", Buffer.concat(parts));
}

function dataRow(values) {
  const parts = [Buffer.alloc(2)];
  parts[0].writeInt16BE(values.length);
  for (const v of values) {
    const cell = Buffer.from(String(v));
    parts.push(buf32(cell.length), cell);
  }
  return msg("D", Buffer.concat(parts));
}

function errorResponse(text) {
  const b = Buffer.concat([
    Buffer.from("SERROR\0"), // severity
    Buffer.from("CXX000\0"), // sqlstate
    Buffer.from("M" + text + "\0"),
    Buffer.from("\0"),
  ]);
  return msg("E", b);
}

// --- per-socket state machine ---------------------------------------------
const server = net.createServer((socket) => {
  let started = false;
  socket.on("data", function onData(chunk) {
    let off = 0;
    while (off < chunk.length) {
      if (!started) {
        // Startup packets are length-prefixed, no type byte.
        if (chunk.length - off < 4) return;
        const len = chunk.readInt32BE(off);
        if (chunk.length - off < len) return;
        const code = chunk.readInt32BE(off + 4);
        off += len;
        if (code === 80877103) {
          // SSLRequest — accept: write 'S' then upgrade this socket to TLS.
          socket.write("S");
          const plain = socket;
          plain.removeAllListeners("data");
          const secure = new tls.TLSSocket(plain, {
            secureContext,
            isServer: true,
          });
          secure.on("data", onData);
          secure.on("error", () => {});
          socket = secure;
          return;
        }
        if (code === 80877104) {
          socket.write("N"); // GSSENC refused — client falls back to plain/SSL
          continue;
        }
        socket.write(
          Buffer.concat([
            authenticationOk(),
            paramStatus("server_version", "16.0"),
            paramStatus("standard_conforming_strings", "on"),
            paramStatus("client_encoding", "UTF8"),
            backendKeyData(),
            readyForQuery(),
          ])
        );
        started = true;
        continue;
      }

      // Typed messages: 1-byte type + int32 length.
      if (chunk.length - off < 5) return;
      const type = String.fromCharCode(chunk[off]);
      const len = chunk.readInt32BE(off + 1);
      if (chunk.length - off < 1 + len) return;
      const body = chunk.subarray(off + 5, off + 1 + len);
      off += 1 + len;

      switch (type) {
        case "Q": {
          const sql = body.toString("utf8", 0, body.length - 1);
          const out = [];
          if (/current_database\(\)/.test(sql)) {
            out.push(
              rowDescription([
                { name: "db_alive" },
                { name: "db_name", text: true },
                { name: "version", text: true },
              ]),
              dataRow(["1", "mock_pg", "PostgreSQL 16.0 (mock)"]),
              commandComplete("SELECT 1")
            );
          } else {
            out.push(rowDescription([]), commandComplete("SELECT 0"));
          }
          out.push(readyForQuery());
          socket.write(Buffer.concat(out));
          break;
        }
        case "P": {
          // Parse — accept and reply ParseComplete ('1').
          socket.write(msg("1", Buffer.alloc(0)));
          break;
        }
        case "B":
          socket.write(msg("2", Buffer.alloc(0))); // BindComplete
          break;
        case "D":
          socket.write(msg("t", buf32(0).subarray(2))); // ParameterDescription(0)
          socket.write(msg("n", Buffer.alloc(0))); // NoData
          break;
        case "E":
          socket.write(emptyQueryResponse());
          socket.write(commandComplete("SELECT 0"));
          break;
        case "S":
          socket.write(readyForQuery()); // Sync
          break;
        case "C": // Close
          socket.write(msg("3", Buffer.alloc(0))); // CloseComplete
          break;
        case "X": // Terminate
          socket.end();
          return;
        case "d": // CopyData
        case "c": // CopyDone
        case "f": // CopyFail
        case "F": // FunctionCall
        case "H": // Flush
          break;
        default:
          socket.write(
            Buffer.concat([errorResponse(`unsupported message ${type}`), readyForQuery()])
          );
      }
    }
  });
  socket.on("error", () => {});
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-postgres] listening on 127.0.0.1:${PORT}`);
});
