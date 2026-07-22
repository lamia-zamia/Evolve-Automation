import { readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
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
    throw new Error(`Test step failed: ${label} (${result.status ?? 1})`);
  }
}

runNode(["scripts/build-test-bundle.mjs"], "test bundle build");

const productionBundlePath = join(projectDir, "evolve_automation.user.js");
const testBundlePath = join(tmpdir(), "evolve-automation-test-bundle.js");
const productionBundle = await readFile(productionBundlePath, "utf8");
if (productionBundle.includes("__EA_TEST_HOOKS__")) {
  throw new Error(
    "Production bundle must not contain the characterization hook",
  );
}
const testBundle = await readFile(testBundlePath, "utf8");
await writeFile(productionBundlePath, testBundle, "utf8");

try {
  runNode(["--check", productionBundlePath], "userscript syntax");
  for (const testFile of testFiles) {
    runNode(["--import", "tsx", join("scripts", testFile)], testFile);
  }
} finally {
  await writeFile(productionBundlePath, productionBundle, "utf8");
}

console.log(
  `All checks passed (${testFiles.length} test files plus bundle syntax)`,
);
