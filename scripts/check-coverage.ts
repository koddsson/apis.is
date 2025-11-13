#!/usr/bin/env -S deno run
/**
 * Check coverage thresholds from deno coverage output
 * Usage: deno coverage coverage | deno run scripts/check-coverage.ts <branch_threshold> <line_threshold>
 */

const branchThreshold = parseFloat(Deno.args[0] || "90");
const lineThreshold = parseFloat(Deno.args[1] || "92");

const decoder = new TextDecoder();
let input = "";

// Read from stdin
for await (const chunk of Deno.stdin.readable) {
  input += decoder.decode(chunk);
}

// Remove ANSI color codes
// deno-lint-ignore no-control-regex
input = input.replace(/\x1b\[[0-9;]*m/g, "");

// Parse the coverage table output
const lines = input.split("\n");
let allFilesLine = "";

for (const line of lines) {
  if (line.includes("All files")) {
    allFilesLine = line;
    break;
  }
}

if (!allFilesLine) {
  console.error("❌ Could not find coverage summary in output");
  Deno.exit(1);
}

// Parse the "All files" line to extract percentages
// Format: | All files                  |     86.7 |   96.9 |
const parts = allFilesLine.split("|").map((p) => p.trim()).filter((p) => p);

if (parts.length < 3) {
  console.error("❌ Could not parse coverage output");
  console.error(`Parsed parts: ${JSON.stringify(parts)}`);
  Deno.exit(1);
}

// Extract just the numeric part, removing any extra spaces
const branchCoverage = parseFloat(parts[1].replace(/\s+/g, ""));
const lineCoverage = parseFloat(parts[2].replace(/\s+/g, ""));

console.log(`\n📊 Coverage Summary:`);
console.log(
  `   Branch Coverage: ${branchCoverage}% (threshold: ${branchThreshold}%)`,
);
console.log(
  `   Line Coverage:   ${lineCoverage}% (threshold: ${lineThreshold}%)`,
);

let failed = false;

if (branchCoverage < branchThreshold) {
  console.error(
    `\n❌ Branch coverage ${branchCoverage}% is below threshold ${branchThreshold}%`,
  );
  failed = true;
}

if (lineCoverage < lineThreshold) {
  console.error(
    `\n❌ Line coverage ${lineCoverage}% is below threshold ${lineThreshold}%`,
  );
  failed = true;
}

if (failed) {
  Deno.exit(1);
}

console.log(`\n✅ Coverage thresholds met!`);
