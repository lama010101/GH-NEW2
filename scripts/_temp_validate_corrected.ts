// Corrected validation tests for MP-FIX-SCORING-001
import { calculateYearAccuracy } from "../src/core/rules";

console.log("Running corrected validation tests for calculateYearAccuracy...\n");

let passCount = 0;
let failCount = 0;

// Test a: calculateYearAccuracy(0, 1950, 2025) === 100
const testA = calculateYearAccuracy(0, 1950, 2025);
const resultA = testA === 100;
console.log(`Test a: calculateYearAccuracy(0, 1950, 2025) = ${testA}`);
console.log(`Expected: 100 (exact match, contemporary, gracePeriod=0), Result: ${resultA ? "PASS" : "FAIL"}`);
if (resultA) passCount++; else failCount++;
console.log();

// Test b: calculateYearAccuracy(1, 1800, 1950) < 100
const testB = calculateYearAccuracy(1, 1800, 1950);
const resultB = testB < 100;
console.log(`Test b: calculateYearAccuracy(1, 1800, 1950) = ${testB}`);
console.log(`Expected: < 100 (yearMax=1950 → gracePeriod=0, so 1 year off decays), Result: ${resultB ? "PASS" : "FAIL"}`);
if (resultB) passCount++; else failCount++;
console.log();

// Test c: calculateYearAccuracy(0, 1800, 1950) === 100
const testC = calculateYearAccuracy(0, 1800, 1950);
const resultC = testC === 100;
console.log(`Test c: calculateYearAccuracy(0, 1800, 1950) = ${testC}`);
console.log(`Expected: 100 (exact match, modern, gracePeriod=0 at yearMax=1950), Result: ${resultC ? "PASS" : "FAIL"}`);
if (resultC) passCount++; else failCount++;
console.log();

// Test d: calculateYearAccuracy(1, 1800, 1949) === 100
const testD = calculateYearAccuracy(1, 1800, 1949);
const resultD = testD === 100;
console.log(`Test d: calculateYearAccuracy(1, 1800, 1949) = ${testD}`);
console.log(`Expected: 100 (yearMax=1949 → gracePeriod=1, within grace), Result: ${resultD ? "PASS" : "FAIL"}`);
if (resultD) passCount++; else failCount++;
console.log();

// Test e: calculateYearAccuracy(2, 1800, 1949) < 100
const testE = calculateYearAccuracy(2, 1800, 1949);
const resultE = testE < 100;
console.log(`Test e: calculateYearAccuracy(2, 1800, 1949) = ${testE}`);
console.log(`Expected: < 100 (yearMax=1949 → gracePeriod=1, outside grace), Result: ${resultE ? "PASS" : "FAIL"}`);
if (resultE) passCount++; else failCount++;
console.log();

// Test f: calculateYearAccuracy(50, 0, 499) === 100
const testF = calculateYearAccuracy(50, 0, 499);
const resultF = testF === 100;
console.log(`Test f: calculateYearAccuracy(50, 0, 499) = ${testF}`);
console.log(`Expected: 100 (yearMax=499 → gracePeriod=50, within grace), Result: ${resultF ? "PASS" : "FAIL"}`);
if (resultF) passCount++; else failCount++;
console.log();

// Test g: calculateYearAccuracy(51, 0, 499) < 100
const testG = calculateYearAccuracy(51, 0, 499);
const resultG = testG < 100;
console.log(`Test g: calculateYearAccuracy(51, 0, 499) = ${testG}`);
console.log(`Expected: < 100 (yearMax=499 → gracePeriod=50, outside grace), Result: ${resultG ? "PASS" : "FAIL"}`);
if (resultG) passCount++; else failCount++;
console.log();

// Test h: calculateYearAccuracy(15, 500, 1399) === 100
const testH = calculateYearAccuracy(15, 500, 1399);
const resultH = testH === 100;
console.log(`Test h: calculateYearAccuracy(15, 500, 1399) = ${testH}`);
console.log(`Expected: 100 (yearMax=1399 → gracePeriod=15, within grace), Result: ${resultH ? "PASS" : "FAIL"}`);
if (resultH) passCount++; else failCount++;
console.log();

// Test i: calculateYearAccuracy(16, 500, 1399) < 100
const testI = calculateYearAccuracy(16, 500, 1399);
const resultI = testI < 100;
console.log(`Test i: calculateYearAccuracy(16, 500, 1399) = ${testI}`);
console.log(`Expected: < 100 (yearMax=1399 → gracePeriod=15, outside grace), Result: ${resultI ? "PASS" : "FAIL"}`);
if (resultI) passCount++; else failCount++;
console.log();

// Test j: calculateYearAccuracy(40, 1950, 2025) < calculateYearAccuracy(40, 0, 2025)
const testJ1 = calculateYearAccuracy(40, 1950, 2025);
const testJ2 = calculateYearAccuracy(40, 0, 2025);
const resultJ = testJ1 < testJ2;
console.log(`Test j: calculateYearAccuracy(40, 1950, 2025) = ${testJ1}`);
console.log(`Test j: calculateYearAccuracy(40, 0, 2025) = ${testJ2}`);
console.log(`Expected: ${testJ1} < ${testJ2} (same error, wider range = higher score), Result: ${resultJ ? "PASS" : "FAIL"}`);
if (resultJ) passCount++; else failCount++;
console.log();

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passCount}/10`);
console.log(`Failed: ${failCount}/10`);
console.log(`All tests passed: ${passCount === 10 ? "YES" : "NO"}`);
