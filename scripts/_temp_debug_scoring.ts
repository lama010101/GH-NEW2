// Debug script for MP-FIX-SCORING-001
import { calculateYearAccuracy } from "../src/core/rules";

console.log("Debugging grace period logic...\n");

// Test b: yearMax = 1950, should have gracePeriod = 1
console.log("Test b: yearMax = 1950");
const yearMax1950 = 1950;
let gracePeriod1950: number;
if (yearMax1950 >= 1950) {
  gracePeriod1950 = 0;
} else if (yearMax1950 >= 1800) {
  gracePeriod1950 = 1;
} else if (yearMax1950 >= 1400) {
  gracePeriod1950 = 5;
} else if (yearMax1950 >= 500) {
  gracePeriod1950 = 15;
} else {
  gracePeriod1950 = 50;
}
console.log(`  gracePeriod = ${gracePeriod1950}`);
console.log(`  yearDiff = 1, absDiff = 1`);
console.log(`  absDiff <= gracePeriod? ${1 <= gracePeriod1950}`);
console.log(`  calculateYearAccuracy(1, 1800, 1950) = ${calculateYearAccuracy(1, 1800, 1950)}\n`);

// Test d: yearMax = 500, should have gracePeriod = 15
console.log("Test d: yearMax = 500");
const yearMax500 = 500;
let gracePeriod500: number;
if (yearMax500 >= 1950) {
  gracePeriod500 = 0;
} else if (yearMax500 >= 1800) {
  gracePeriod500 = 1;
} else if (yearMax500 >= 1400) {
  gracePeriod500 = 5;
} else if (yearMax500 >= 500) {
  gracePeriod500 = 15;
} else {
  gracePeriod500 = 50;
}
console.log(`  gracePeriod = ${gracePeriod500}`);
console.log(`  yearDiff = 50, absDiff = 50`);
console.log(`  absDiff <= gracePeriod? ${50 <= gracePeriod500}`);
console.log(`  calculateYearAccuracy(50, 0, 500) = ${calculateYearAccuracy(50, 0, 500)}\n`);

// Check if the issue is with the condition ordering
console.log("Checking condition ordering...\n");
console.log("yearMax = 1950:");
console.log("  >= 1950? true -> gracePeriod = 0");
console.log("yearMax = 1800:");
console.log("  >= 1950? false");
console.log("  >= 1800? true -> gracePeriod = 1");
console.log("yearMax = 500:");
console.log("  >= 1950? false");
console.log("  >= 1800? false");
console.log("  >= 1400? false");
console.log("  >= 500? true -> gracePeriod = 15");
