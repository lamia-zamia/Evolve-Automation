import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptsDir, "..");
const testFiles = readdirSync(scriptsDir)
  .filter((name) => name.endsWith("-test.mjs"))
  .sort();

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectDir,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    console.error(`Test step failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

runNode(["--check", "evolve_automation.user.js"], "userscript syntax");

for (const testFile of testFiles) {
  runNode(["--import", "tsx", join("scripts", testFile)], testFile);
}

console.log(`All checks passed (${testFiles.length} test files plus bundle syntax)`);
