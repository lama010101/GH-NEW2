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

for (let i = 0; i < 10; i++) {
  const seed = BigInt("0x" + randomBytes(8).toString("hex")) & BigInt("0x7FFFFFFFFFFFFFFF");
  console.log(generateRoomCode(seed));
}
