import { readdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptsDir, "..");

const args = process.argv.slice(2);
const jobsArg = args.find((arg) => arg.startsWith("--jobs="));
const filters = args.filter((arg) => !arg.startsWith("--"));
const jobs = Math.max(
  1,
  Number(jobsArg?.slice("--jobs=".length)) || availableParallelism(),
);

const allTestFiles = readdirSync(scriptsDir)
  .filter((name) => name.endsWith("-test.mjs"))
  .sort();
const testFiles = filters.length
  ? allTestFiles.filter((name) =>
      filters.some((filter) => name.includes(filter)),
    )
  : allTestFiles;

if (!testFiles.length) {
  throw new Error(`No test files matched: ${filters.join(", ")}`);
}

// Node 22.18+ strips TypeScript natively, which starts noticeably faster than
// loading tsx into every test process. Older supported runtimes still need tsx.
const loaderArgs = process.features.typescript ? [] : ["--import", "tsx"];

function runNode(nodeArgs, label) {
  const result = spawnSync(process.execPath, nodeArgs, {
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

function runTestFile(testFile) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [...loaderArgs, join("scripts", testFile)],
      { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (status) => {
      resolvePromise({
        testFile,
        status: status ?? 1,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
}

async function runTestFiles() {
  const pending = testFiles.slice();
  const failures = [];
  const workers = Array.from(
    { length: Math.min(jobs, pending.length) },
    async () => {
      for (let next = pending.shift(); next; next = pending.shift()) {
        const result = await runTestFile(next);
        if (result.status !== 0) {
          failures.push(result);
          process.stdout.write(
            `\nFAILED ${result.testFile}\n${result.output.trimEnd()}\n`,
          );
        }
      }
    },
  );
  await Promise.all(workers);
  return failures;
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

// Virus scanners and editors briefly hold this file open on Windows, which
// surfaces as EBUSY/EPERM/UNKNOWN on an otherwise valid write.
function writeBundle(contents) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      writeFileSync(productionBundlePath, contents, "utf8");
      return;
    } catch (error) {
      const locked = ["EBUSY", "EPERM", "EACCES", "UNKNOWN"].includes(
        error.code,
      );
      if (!locked || attempt >= 20) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

writeBundle(testBundle);

// The swapped-in bundle must never survive the run, including an interrupt.
let restored = false;
const restoreBundle = () => {
  if (!restored) {
    restored = true;
    writeBundle(productionBundle);
  }
};
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    restoreBundle();
    process.exit(1);
  });
}

const started = Date.now();
let failures;
try {
  runNode(["--check", productionBundlePath], "userscript syntax");
  failures = await runTestFiles();
} finally {
  restoreBundle();
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length) {
  console.log(
    `\nFAILED: ${failures.length} of ${testFiles.length} test files in ${elapsed}s:`,
  );
  for (const failure of failures) {
    console.log(`  ${failure.testFile}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `All checks passed (${testFiles.length} test files plus bundle syntax) in ${elapsed}s across ${jobs} workers`,
  );
}
