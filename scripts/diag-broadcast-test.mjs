/**
 * Diagnostic test script for MP-INV-BROADCAST-001
 * Simulates two players via WebSocket to trace PLAYER_SUBMITTED and TIMER_CLAMPED broadcasts.
 */
import http from "http";
import WebSocket from "ws";

const BASE_URL = "http://localhost:3000";
const PARTY_URL = "ws://localhost:1999/parties/lobby";

function makeUUID(seed) {
  const hex = Array.from({ length: 32 }, (_, i) => {
    const c = seed.charCodeAt(i % seed.length) + i;
    return (c % 16).toString(16);
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
const PLAYER_A_ID = makeUUID("player-a" + Date.now());
const PLAYER_B_ID = makeUUID("player-b" + Date.now());
let gameId = null;

function api(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "localhost",
      port: 3000,
      path,
      method,
      headers: { "Content-Type": "application/json" }
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function connectWs(gid, pid, name, logPrefix) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${PARTY_URL}/${gid}`);
    const messages = [];
    ws.on("open", () => {
      console.log(`[${logPrefix}] WS connected`);
      ws.send(JSON.stringify({ type: "JOIN_ROOM", playerId: pid, displayName: name }));
      resolve({ ws, messages });
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      if (msg.type === "PLAYER_SUBMITTED" || msg.type === "TIMER_CLAMPED" || msg.type === "ERROR") {
        console.log(`[${logPrefix}] Received ${msg.type}:`, JSON.stringify(msg));
      } else if (msg.type === "STATE_UPDATE") {
        const snap = msg.snapshot;
        if (snap && snap.status) {
          console.log(`[${logPrefix}] STATE_UPDATE status=${snap.status} round=${snap.currentRoundIndex} players=${(snap.players || []).length}`);
        }
      }
    });
    ws.on("error", (err) => {
      console.error(`[${logPrefix}] WS error:`, err.message);
      reject(err);
    });
    ws.on("close", () => console.log(`[${logPrefix}] WS closed`));
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForState(messages, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const match = messages.find((m) => m.type === "STATE_UPDATE" && predicate(m.snapshot));
      if (match) return resolve(match.snapshot);
      if (Date.now() - start > timeoutMs) return reject(new Error("Timeout waiting for state condition"));
      setTimeout(check, 100);
    };
    check();
  });
}

async function main() {
  console.log("=== Diagnostic Broadcast Test (MP-INV-BROADCAST-001) ===\n");

  // 1. Create game
  console.log("[Test] Creating game...");
  const createRes = await api("/api/compete/create", "POST", {
    playerId: PLAYER_A_ID,
    displayName: "PlayerA",
    roundTimerSec: 120,
    totalRounds: 1
  });
  if (createRes.status !== 200) {
    console.error("Create failed:", createRes.status, createRes.body);
    process.exit(1);
  }
  gameId = createRes.body.gameId;
  console.log("[Test] Game created:", gameId, "\n");

  // 2. Connect both players
  const playerA = await connectWs(gameId, PLAYER_A_ID, "PlayerA", "A");
  await sleep(500);
  const playerB = await connectWs(gameId, PLAYER_B_ID, "PlayerB", "B");
  await sleep(500);

  // 3. Toggle ready (both)
  console.log("[Test] Toggling ready...\n");
  playerA.ws.send(JSON.stringify({ type: "TOGGLE_READY", playerId: PLAYER_A_ID, ready: true }));
  await sleep(200);
  playerB.ws.send(JSON.stringify({ type: "TOGGLE_READY", playerId: PLAYER_B_ID, ready: true }));

  // Wait until snapshot confirms all players ready
  console.log("[Test] Waiting for allPlayersReady...\n");
  await waitForState(playerA.messages, (s) => s.allPlayersReady === true);
  console.log("[Test] allPlayersReady confirmed\n");

  // 4. Start game (Player A is host)
  console.log("[Test] Starting game...\n");
  playerA.ws.send(JSON.stringify({ type: "START_GAME", playerId: PLAYER_A_ID }));

  // Wait until round is active
  console.log("[Test] Waiting for ROUND_ACTIVE...\n");
  await waitForState(playerA.messages, (s) => s.status === "ROUND_ACTIVE");
  console.log("[Test] ROUND_ACTIVE confirmed\n");

  // 5. Player A submits guess (should trigger PLAYER_SUBMITTED + TIMER_CLAMPED if >60s remaining)
  console.log("[Test] Player A submitting guess...\n");
  playerA.ws.send(
    JSON.stringify({
      type: "SUBMIT_GUESS",
      playerId: PLAYER_A_ID,
      roundIndex: 0,
      year: 1950,
      lat: 40.7128,
      lng: -74.006,
      hintsUsed: 0
    })
  );

  // Wait for broadcasts to arrive
  console.log("[Test] Waiting for broadcasts...\n");
  await sleep(2000);

  console.log("\n=== Summary ===");
  console.log("Player A messages received:");
  for (const m of playerA.messages) {
    if (["PLAYER_SUBMITTED", "TIMER_CLAMPED", "ERROR"].includes(m.type)) {
      console.log("  ", m.type, JSON.stringify(m));
    }
  }
  console.log("Player B messages received:");
  for (const m of playerB.messages) {
    if (["PLAYER_SUBMITTED", "TIMER_CLAMPED", "ERROR"].includes(m.type)) {
      console.log("  ", m.type, JSON.stringify(m));
    }
  }

  const aGotSubmitted = playerA.messages.some((m) => m.type === "PLAYER_SUBMITTED");
  const bGotSubmitted = playerB.messages.some((m) => m.type === "PLAYER_SUBMITTED");
  const aGotClamped = playerA.messages.some((m) => m.type === "TIMER_CLAMPED");
  const bGotClamped = playerB.messages.some((m) => m.type === "TIMER_CLAMPED");

  console.log("\n");
  console.log(`Player A received PLAYER_SUBMITTED: ${aGotSubmitted}`);
  console.log(`Player B received PLAYER_SUBMITTED: ${bGotSubmitted}`);
  console.log(`Player A received TIMER_CLAMPED:    ${aGotClamped}`);
  console.log(`Player B received TIMER_CLAMPED:    ${bGotClamped}`);

  playerA.ws.close();
  playerB.ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
