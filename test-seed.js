const { randomBytes } = require("crypto");
const seed = BigInt("0x" + randomBytes(8).toString("hex")) & BigInt("0x7FFFFFFFFFFFFFFF");
console.log(seed.toString());
