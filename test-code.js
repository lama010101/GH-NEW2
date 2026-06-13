const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(seed) {
  let s = Number(BigInt(seed) % BigInt(2 ** 31));
  let code = '';
  for (let i = 0; i < 6; i++) {
    s = (s * 1664525 + 1013904223) % (2 ** 32);
    code += chars[s % chars.length];
  }
  return code;
}
console.log(generateRoomCode("1234567890"));
console.log(generateRoomCode("9876543210"));
console.log(generateRoomCode("1111111111"));
