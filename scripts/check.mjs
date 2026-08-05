import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptsDir, "..");

// Every step is independent, so they all run at once: the three single-threaded
// checkers finish while the test runner is still working through its own pool.
const steps = [
  {
    name: "typecheck",
    args: [
      join("node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.json",
    ],
  },
  {
    name: "typecheck:architecture",
    args: [
      join("node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.architecture.json",
    ],
  },
  {
    name: "lint",
    args: [
      join("node_modules", "eslint", "bin", "eslint.js"),
      ".",
      "--quiet",
      "--cache",
      "--cache-location",
      "node_modules/.cache/eslint/",
    ],
  },
  {
    name: "format",
    args: [
      join("node_modules", "prettier", "bin", "prettier.cjs"),
      ".",
      "--check",
      "--cache",
    ],
  },
  { name: "test", args: [join("scripts", "test.mjs")] },
];

// Passing steps stay silent unless asked for, so anything on stdout is a
// problem and a grep for "FAILED" is enough to triage a run.
const verbose = process.argv.includes("--verbose");

function runStep(step) {
  return new Promise((resolvePromise, rejectPromise) => {
    const started = Date.now();
    const child = spawn(process.execPath, step.args, {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (status) => {
      const result = {
        name: step.name,
        status: status ?? 1,
        seconds: (Date.now() - started) / 1000,
        output: Buffer.concat(chunks).toString("utf8").trimEnd(),
      };
      // Report a failure the moment it lands rather than at the end, so a run
      // that still has minutes of tests left already shows what broke.
      if (result.status !== 0 || verbose) {
        const mark = result.status === 0 ? "ok" : "FAILED";
        const header = `\n=== ${result.name}: ${mark} (${result.seconds.toFixed(1)}s)`;
        const body = result.output ? `${header}\n${result.output}` : header;
        // Reports go to stdout whether they pass or fail; the exit code is the
        // machine-readable signal, so `npm run check | grep FAILED` works.
        process.stdout.write(`${body}\n`);
      }
      resolvePromise(result);
    });
  });
}

const started = Date.now();
const results = await Promise.all(steps.map(runStep));

const failed = results.filter((result) => result.status !== 0);
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const timings = results
  .map((result) => `${result.name} ${result.seconds.toFixed(1)}s`)
  .join(", ");

if (failed.length) {
  console.log(
    `\nFAILED in ${elapsed}s: ${failed.map((result) => result.name).join(", ")} (${timings})`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `All ${results.length} checks passed in ${elapsed}s (${timings})`,
  );
}
