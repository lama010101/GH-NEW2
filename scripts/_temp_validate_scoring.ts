// Manual validation tests for MP-FIX-SCORING-001
import { calculateYearAccuracy } from "../src/core/rules";

console.log("Running manual validation tests for calculateYearAccuracy...\n");

// Test a: calculateYearAccuracy(0, 1950, 2025) === 100
const testA = calculateYearAccuracy(0, 1950, 2025);
console.log(`Test a: calculateYearAccuracy(0, 1950, 2025) = ${testA}`);
console.log(`Expected: 100, Result: ${testA === 100 ? "PASS" : "FAIL"}\n`);

// Test b: calculateYearAccuracy(1, 1800, 1950) === 100 (grace=1, within grace)
const testB = calculateYearAccuracy(1, 1800, 1950);
console.log(`Test b: calculateYearAccuracy(1, 1800, 1950) = ${testB}`);
console.log(`Expected: 100 (grace=1, within grace), Result: ${testB === 100 ? "PASS" : "FAIL"}\n`);

// Test c: calculateYearAccuracy(2, 1800, 1950) < 100 (outside grace)
const testC = calculateYearAccuracy(2, 1800, 1950);
console.log(`Test c: calculateYearAccuracy(2, 1800, 1950) = ${testC}`);
console.log(`Expected: < 100 (outside grace), Result: ${testC < 100 ? "PASS" : "FAIL"}\n`);

// Test d: calculateYearAccuracy(50, 0, 500) === 100 (grace=50, within grace)
const testD = calculateYearAccuracy(50, 0, 500);
console.log(`Test d: calculateYearAccuracy(50, 0, 500) = ${testD}`);
console.log(`Expected: 100 (grace=50, within grace), Result: ${testD === 100 ? "PASS" : "FAIL"}\n`);

// Test e: calculateYearAccuracy(51, 0, 500) < 100 (outside grace)
const testE = calculateYearAccuracy(51, 0, 500);
console.log(`Test e: calculateYearAccuracy(51, 0, 500) = ${testE}`);
console.log(`Expected: < 100 (outside grace), Result: ${testE < 100 ? "PASS" : "FAIL"}\n`);

// Test f: calculateYearAccuracy(40, 1950, 2025) < calculateYearAccuracy(40, 0, 2025)
// (same error, wider range = higher score)
const testF1 = calculateYearAccuracy(40, 1950, 2025);
const testF2 = calculateYearAccuracy(40, 0, 2025);
console.log(`Test f: calculateYearAccuracy(40, 1950, 2025) = ${testF1}`);
console.log(`Test f: calculateYearAccuracy(40, 0, 2025) = ${testF2}`);
console.log(`Expected: ${testF1} < ${testF2} (wider range = higher score), Result: ${testF1 < testF2 ? "PASS" : "FAIL"}\n`);

console.log("All manual validation tests completed.");
