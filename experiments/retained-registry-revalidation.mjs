// A/B of readRetainedNativeTechRegistry(): the deadspace full-snapshot revalidation (baseline) against the
// identity-only revalidation in the working tree (candidate), under the Stage 4F.3 measurement authority:
// renderer-process CPU (renderer rows summed) with CDP TaskDuration as the cross-check, per-operation in-page
// batches, fresh session per batch, alternating arms. ScriptDuration is not recorded.
//
// The baseline arm loads captured-game-mechanics.ts from `--base` (default deadspace); both arms get the same
// test-only hook injected at bundle time, so no measurement hook exists in committed source.
//
// node experiments/retained-registry-revalidation.mjs [--order base-first|candidate-first] [--out report.json]
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const baseRef = option("base", "deadspace");
const order = option("order", "base-first");
const repeats = Number(option("repeats", "3"));
const calls = Number(option("calls", "3000"));
const warmupPeriods = Number(option("warmup", "400"));
const outPath = option(
  "out",
  `${root}test-artifacts/benchmark/tmp/retained-registry-revalidation-${order}.json`,
);
const save = parseSave(
  await readFile(
    `${root}test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json`,
    "utf8",
  ),
);
const settings = JSON.parse(
  await readFile(
    `${root}test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`,
    "utf8",
  ),
);

const mechanicsPath = "src/adapters/evolve/captured-game-mechanics.ts";
const baseMechanics = execFileSync(
  "git",
  ["show", `${baseRef}:${mechanicsPath}`],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const hookAnchor = `Reflect.set(hooks, "sampleResearchCatalog", () => {`;
const hook = `Reflect.set(hooks, "readTechDefinitionsForTest", () => pageCapture.mechanics.readTechDefinitions());\n      `;
const counterAnchor = /function readRetainedNativeTechRegistry\(\):[^{]*\{/u;

async function buildArm(arm, { counting = false } = {}) {
  const metadata = (
    await readFile(`${root}src/userscript.meta.js`, "utf8")
  ).trimEnd();
  const out = `${root}test-artifacts/benchmark/tmp/retained-registry-${arm}${counting ? "-counting" : ""}.user.js`;
  const plugin = {
    name: "retained-registry-arms",
    setup(build) {
      build.onLoad(
        { filter: /captured-(game-mechanics|runtime-control)\.ts$/ },
        async (args) => {
          const path = args.path.replaceAll("\\", "/");
          let contents = path.endsWith(mechanicsPath)
            ? arm === "base"
              ? baseMechanics
              : await readFile(args.path, "utf8")
            : await readFile(args.path, "utf8");
          if (path.endsWith("captured-runtime-control.ts")) {
            if (!contents.includes(hookAnchor)) throw new Error("hook anchor");
            contents = contents.replace(hookAnchor, hook + hookAnchor);
          } else if (counting) {
            if (!counterAnchor.test(contents))
              throw new Error("counter anchor");
            contents = contents.replace(
              counterAnchor,
              (signature) =>
                `${signature} Reflect.set(globalThis, "__eaRegistryReads", Number(Reflect.get(globalThis, "__eaRegistryReads") ?? 0) + 1);`,
            );
          }
          return { contents, loader: "ts" };
        },
      );
    },
  };
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    outfile: out,
    bundle: true,
    banner: { js: `${metadata}\n\nglobalThis.__EA_TEST_HOOKS__ ??= {};` },
    charset: "utf8",
    format: "iife",
    logLevel: "warning",
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
      __EA_TEST_SURFACE_ENABLED__: "true",
    },
    minifySyntax: true,
    treeShaking: true,
    plugins: [plugin],
  });
  return out;
}

const rendererCpu = async (runner) =>
  (await runner.processCpu())
    .filter((entry) => entry.type === "renderer")
    .reduce((sum, entry) => sum + entry.cpuSec, 0);

async function measured(runner, session, run) {
  const cpuBefore = await rendererCpu(runner);
  const metricsBefore = await session.metrics();
  const inPage = await run();
  const metricsAfter = await session.metrics();
  const cpuAfter = await rendererCpu(runner);
  return {
    rendererCpuSec: Number((cpuAfter - cpuBefore).toFixed(3)),
    taskDurationSec: Number(
      (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(4),
    ),
    inPage,
  };
}

const batch = (session, count) =>
  session.evaluate((n) => {
    const read = window.__EA_TEST_HOOKS__.readTechDefinitionsForTest;
    const now = window.eaDiagnosticsNow;
    const first = read();
    const started = now();
    let unavailable = 0;
    let changedReference = 0;
    for (let index = 0; index < n; index++) {
      const definitions = read();
      if (definitions === undefined) unavailable++;
      else if (definitions !== first) changedReference++;
    }
    return {
      count: n,
      elapsedMs: now() - started,
      definitions: first?.length,
      unavailable,
      changedReference,
    };
  }, count);

const bundles = {
  base: await buildArm("base"),
  candidate: await buildArm("candidate"),
};
const countingBundle = await buildArm("candidate", { counting: true });
const arms =
  order === "base-first" ? ["base", "candidate"] : ["candidate", "base"];
const report = {
  baseRef,
  order,
  calls,
  warmupPeriods,
  batches: [],
  functional: {},
  perTick: {},
};
const runner = await createChromiumRunner();
report.runner = { inputs: runner.inputs, browser: runner.browser.version };
try {
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const arm of arms) {
      const session = await runner.openSession({
        bundle: bundles[arm],
        save,
        settings,
        seed: 42,
        perf: true,
      });
      try {
        await session.advance(warmupPeriods);
        await batch(session, 200);
        const result = await measured(runner, session, () =>
          batch(session, calls),
        );
        report.batches.push({
          repeat,
          arm,
          bundleSha256: session.bundle.sha256,
          ...result,
        });
        console.log(JSON.stringify(report.batches.at(-1)));
      } finally {
        await session.close();
      }
    }
  }

  // Functional equivalence and per-work-tick context: the same deterministic window in both arms.
  const functionalPeriods = Number(option("periods", "1000"));
  for (const arm of arms) {
    const session = await runner.openSession({
      bundle: bundles[arm],
      save,
      settings,
      seed: 42,
      perf: true,
    });
    try {
      const result = await measured(runner, session, () =>
        session.advance(functionalPeriods),
      );
      const state = await session.readState();
      const diagnostics = await session.diagnostics();
      report.functional[arm] = {
        ...result,
        gameSnapshot: runner.inputs?.gameSnapshot,
        workTicks: diagnostics.workTicks,
        errors: diagnostics.counts?.error,
        errorTexts: [
          ...new Set(
            (diagnostics.events ?? [])
              .filter(
                (entry) => entry.kind === "error" || entry.type === "error",
              )
              .map((entry) =>
                String(
                  entry.text ?? entry.message ?? JSON.stringify(entry),
                ).slice(0, 200),
              ),
          ),
        ],
        techDigest: JSON.stringify(state.tech),
        resourceDigest: JSON.stringify(
          Object.fromEntries(
            Object.entries(state.resource ?? {}).map(([key, value]) => [
              key,
              value?.amount,
            ]),
          ),
        ),
      };
    } finally {
      await session.close();
    }
  }
  const [first, second] = arms.map((arm) => report.functional[arm]);
  report.functionalEqual = {
    tech: first.techDigest === second.techDigest,
    resources: first.resourceDigest === second.resourceDigest,
  };
  for (const arm of arms) {
    delete report.functional[arm].techDigest;
    delete report.functional[arm].resourceDigest;
  }

  // Registry reads per work tick in production code paths (counting variant of the candidate).
  {
    const session = await runner.openSession({
      bundle: countingBundle,
      save,
      settings,
      seed: 42,
      perf: true,
    });
    try {
      await session.advance(functionalPeriods);
      const reads = await session.evaluate(
        () => globalThis.__eaRegistryReads ?? 0,
      );
      const diagnostics = await session.diagnostics();
      report.perTick = {
        periods: functionalPeriods,
        registryReads: reads,
        workTicks: diagnostics.workTicks,
      };
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      functionalEqual: report.functionalEqual,
      perTick: report.perTick,
      functional: report.functional,
    },
    null,
    2,
  ),
);
console.log(outPath);
