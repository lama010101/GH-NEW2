// Spot check for exponential decay scoring formulas
import { calculateLocationAccuracy, calculateYearAccuracy } from "../src/core/rules.js";

console.log("=== LOCATION ACCURACY SPOT CHECKS ===");
console.log(`calculateLocationAccuracy(0) === 100: ${calculateLocationAccuracy(0)}`);
console.log(`calculateLocationAccuracy(204) === 87: ${calculateLocationAccuracy(204)}`);
console.log(`calculateLocationAccuracy(500) → should be ~72 (accept 71-73): ${calculateLocationAccuracy(500)}`);
console.log(`calculateLocationAccuracy(1500) === 37: ${calculateLocationAccuracy(1500)}`);
console.log(`calculateLocationAccuracy(10000) → should be ~0: ${calculateLocationAccuracy(10000)}`);

console.log("\n=== YEAR ACCURACY SPOT CHECKS ===");
console.log(`calculateYearAccuracy(0) === 100: ${calculateYearAccuracy(0)}`);
console.log(`calculateYearAccuracy(10) → should be ~78 (accept 77-79): ${calculateYearAccuracy(10)}`);
console.log(`calculateYearAccuracy(40) → should be ~37 (accept 36-38): ${calculateYearAccuracy(40)}`);
console.log(`calculateYearAccuracy(100) → should be ~8 (accept 7-9): ${calculateYearAccuracy(100)}`);
console.log(`calculateYearAccuracy(200) → should be ~0: ${calculateYearAccuracy(200)}`);

console.log("\n=== VALIDATION ===");
const loc204 = calculateLocationAccuracy(204);
const loc500 = calculateLocationAccuracy(500);
const loc1500 = calculateLocationAccuracy(1500);
const loc10000 = calculateLocationAccuracy(10000);

const year10 = calculateYearAccuracy(10);
const year40 = calculateYearAccuracy(40);
const year100 = calculateYearAccuracy(100);
const year200 = calculateYearAccuracy(200);

const locPass = 
  loc204 === 87 &&
  loc500 >= 71 && loc500 <= 73 &&
  loc1500 === 37 &&
  loc10000 <= 1;

const yearPass =
  year10 >= 77 && year10 <= 79 &&
  year40 >= 36 && year40 <= 38 &&
  year100 >= 7 && year100 <= 9 &&
  year200 <= 1;

console.log(`Location accuracy: ${locPass ? "PASS" : "FAIL"}`);
console.log(`Year accuracy: ${yearPass ? "PASS" : "FAIL"}`);
console.log(`Overall: ${locPass && yearPass ? "PASS" : "FAIL"}`);

process.exit(locPass && yearPass ? 0 : 1);
