import { readdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptsDir, "..");
const testsDir = join(projectDir, "tests");

const args = process.argv.slice(2);
const jobsArg = args.find((arg) => arg.startsWith("--jobs="));
const requestedJobs = Number(jobsArg?.slice("--jobs=".length));
const jobs = Math.max(
  1,
  Number.isInteger(requestedJobs) && requestedJobs > 0
    ? requestedJobs
    : availableParallelism(),
);
const verbose = args.includes("--verbose");
const filters = args
  .filter((arg) => !arg.startsWith("--"))
  .map((filter) => filter.replaceAll("\\", "/").toLowerCase());

function discoverTestFiles(directory = testsDir) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return discoverTestFiles(path);
      }
      if (entry.isFile() && entry.name.endsWith("-test.mjs")) {
        return [relative(testsDir, path).split(sep).join("/")];
      }
      return [];
    });
}

const allTestFiles = discoverTestFiles().sort();
const testFiles = filters.length
  ? allTestFiles.filter((testFile) => {
      const searchablePath = testFile.toLowerCase();
      return filters.some((filter) => searchablePath.includes(filter));
    })
  : allTestFiles;

if (!testFiles.length) {
  console.error(
    `No test files matched${filters.length ? `: ${filters.join(", ")}` : " under tests/"}`,
  );
  process.exit(1);
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
    const started = performance.now();
    const child = spawn(
      process.execPath,
      [...loaderArgs, join("tests", testFile)],
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
        elapsedSeconds: (performance.now() - started) / 1000,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
}

async function runTestFiles() {
  const pending = testFiles.slice();
  const results = [];
  const workers = Array.from(
    { length: Math.min(jobs, pending.length) },
    async () => {
      for (let next = pending.shift(); next; next = pending.shift()) {
        const result = await runTestFile(next);
        results.push(result);
        if (result.status !== 0) {
          process.stdout.write(
            `\nFAILED ${result.testFile}\n${result.output.trimEnd()}\n`,
          );
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

const started = performance.now();
runNode(["--check", "evolve_automation.user.js"], "userscript syntax");
const results = await runTestFiles();
const failures = results.filter((result) => result.status !== 0);
const elapsed = (performance.now() - started) / 1000;
const workerCount = Math.min(jobs, testFiles.length);
const slowest = results
  .slice()
  .sort(
    (left, right) =>
      right.elapsedSeconds - left.elapsedSeconds ||
      (left.testFile < right.testFile
        ? -1
        : left.testFile > right.testFile
          ? 1
          : 0),
  );
const timingReport = verbose ? slowest : slowest.slice(0, 15);

console.log("\nSlowest test files:");
for (const result of timingReport) {
  console.log(`  ${result.elapsedSeconds.toFixed(2)}s  ${result.testFile}`);
}

if (failures.length) {
  console.log(
    `\nFAILED: ${failures.length} of ${testFiles.length} test files in ${elapsed.toFixed(1)}s across ${workerCount} workers:`,
  );
  for (const failure of failures) {
    console.log(`  ${failure.testFile}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `All checks passed (${testFiles.length} test files plus bundle syntax) in ${elapsed.toFixed(1)}s across ${workerCount} workers`,
  );
}
