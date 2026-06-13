import { randomBytes } from "crypto";

function generateRoomCode(seed) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = Number(seed % BigInt(2 ** 31))
  let code = ''
  for (let i = 0; i < 6; i++) {
    s = (s * 1664525 + 1013904223) % (2 ** 32)
    code += chars[s % chars.length]
  }
  return code
}

const set = new Set();
for (let i = 0; i < 1000; i++) {
  const seed = BigInt("0x" + randomBytes(8).toString("hex")) & BigInt("0x7FFFFFFFFFFFFFFF");
  set.add(generateRoomCode(seed));
}
console.log("Unique room codes in 1000 attempts:", set.size);
