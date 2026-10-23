import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { createBuildOptions } from "../build-config.mjs";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseCommit = "a092cb90";
const p30Commit = "e04590d4";
const routePath = "src/adapters/evolve/economy/market/captured-trade-routes.ts";
const outputPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p31-allocation-readiness.json",
);
const scratch = path.join(root, "test-artifacts/benchmark/tmp/p31");
const epoch = Date.parse("2026-09-21T00:00:00.000Z");
const seed = 42;
const periods = 800;
const warmup = 100;
const repeats = 3;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const save = (name) =>
  path.join(root, "test-artifacts/benchmark/slice0/saves", name);
const setting = (name) =>
  path.join(root, "test-artifacts/benchmark/slice0/settings", name);

const sourceChanges = execFileSync(
  "git",
  ["diff", "--name-only", `${baseCommit}..${p30Commit}`, "--", "src"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
assert.deepEqual(
  sourceChanges,
  [routePath],
  "pre-P30 source delta is not isolated to the P30 Market route implementation",
);

const scenarios = [
  {
    name: "early",
    savePath: save("deadspace-early-day14.json"),
    settingsPath: setting("stage2e-integrated-mad-no-triggers.json"),
    seed: 42,
  },
  {
    name: "progression",
    savePath: save("stage2f-fixed-progression-export.json"),
    settingsPath: setting("stage2e-integrated-mad-no-triggers.json"),
    seed: 42,
  },
  {
    name: "late-MAD",
    savePath: save("mad-tech-offered-blocked.json"),
    settingsPath: setting("current-full.json"),
    seed: 42,
  },
  {
    name: "Standard-Human",
    savePath: save("p18-standard-human-fixture.txt"),
    settingsPath: path.join(
      root,
      "experiments/p18-standard-human-settings.json",
    ),
    seed: 44,
  },
].map((scenario) => ({ ...scenario, epoch }));

const [metadata, gameBytes] = await Promise.all([
  readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
  readFile(path.join(root, "test-artifacts/game/evolve-deadspace.js")),
]);
assert.equal(
  hash(gameBytes),
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
  "pinned game snapshot changed; update only after verifying the intended commit",
);
await mkdir(scratch, { recursive: true });

const baselineRoute = execFileSync(
  "git",
  ["show", `${baseCommit}:${routePath}`],
  {
    cwd: root,
    encoding: "utf8",
  },
);
const build = async (name, baseline) => {
  const outfile = path.join(scratch, `${name}.user.js`);
  const options = createBuildOptions({
    root,
    outfile,
    banner: {
      js: `${metadata.trimEnd()}\n\n// P31 ordinary production-profile bundle.`,
    },
    plugins: baseline
      ? [
          {
            name: "p31-pre-p30-market-route",
            setup(builder) {
              builder.onLoad({ filter: /captured-trade-routes\.ts$/ }, () => ({
                contents: baselineRoute,
                loader: "ts",
              }));
            },
          },
        ]
      : [],
  });
  await esbuild.build(options);
  const bytes = await readFile(outfile);
  return { path: outfile, sha256: hash(bytes), bytes: bytes.length };
};
const bundles = {
  preP30: await build("pre-p30", true),
  P30: await build("p30", false),
};

const fixtureMeta = {};
for (const scenario of scenarios) {
  const [saveText, settingsText] = await Promise.all([
    readFile(scenario.savePath, "utf8"),
    readFile(scenario.settingsPath, "utf8"),
  ]);
  scenario.saveText = saveText;
  scenario.settings = JSON.parse(settingsText);
  fixtureMeta[scenario.name] = {
    savePath: path.relative(root, scenario.savePath),
    saveSha256: hash(saveText),
    saveBytes: Buffer.byteLength(saveText),
    settingsPath: path.relative(root, scenario.settingsPath),
    settingsSha256: hash(JSON.stringify(scenario.settings)),
    seed: scenario.seed,
  };
}

const runner = await createChromiumRunner();
const profiles = {};
const cpuRuns = [];
const calibrations = {};
const rows = (before, after) => {
  const left = new Map(before.map((row) => [row.id, row]));
  return after
    .filter((row) => row.type === "renderer")
    .map((row) => ({
      id: row.id,
      cpuSec: Number((row.cpuSec - (left.get(row.id)?.cpuSec ?? 0)).toFixed(4)),
    }));
};
const rendererCpu = (before, after) =>
  Number(
    rows(before, after)
      .reduce((sum, row) => sum + row.cpuSec, 0)
      .toFixed(4),
  );

async function open(scenario, bundle, diagnostics = false) {
  return runner.openSession({
    bundle: bundle.path,
    save: parseSave(scenario.saveText),
    settings: scenario.settings,
    seed: scenario.seed,
    epoch: scenario.epoch,
    perf: diagnostics,
    forwardPerfSummary: diagnostics,
    nativeTrace: diagnostics,
  });
}

try {
  for (const scenario of scenarios) {
    const session = await open(scenario, bundles.P30, true);
    try {
      await session.advance(periods);
      const diagnostics = await session.diagnostics();
      profiles[scenario.name] = {
        bundleSha256: bundles.P30.sha256,
        periods: diagnostics.periods,
        workTicks: diagnostics.workTicks,
        perfSummaries: diagnostics.perfSummaries,
        counts: diagnostics.counts,
        nativeControlCalls: Object.values(
          diagnostics.controlUsage ?? {},
        ).reduce(
          (sum, usage) => sum + (usage.returned ?? 0) + (usage.threw ?? 0),
          0,
        ),
      };
    } finally {
      await session.close();
    }
  }

  for (const scenario of scenarios) {
    const sequence = [];
    for (let repeat = 1; repeat <= repeats; repeat++) {
      sequence.push(
        ...(repeat % 2 === 1
          ? ["preP30", "P30", "P30-control"]
          : ["P30", "preP30", "P30-control"]),
      );
    }
    for (const [index, label] of sequence.entries()) {
      const variant = label === "P30-control" ? "P30" : label;
      const session = await open(scenario, bundles[variant]);
      try {
        await session.advance(warmup);
        const startPeriod = await session.periods();
        const [cpuBefore, metricsBefore] = await Promise.all([
          runner.processCpu(),
          session.metrics(),
        ]);
        await session.advance(periods);
        const [cpuAfter, metricsAfter] = await Promise.all([
          runner.processCpu(),
          session.metrics(),
        ]);
        cpuRuns.push({
          scenario: scenario.name,
          round: Math.floor(index / 3) + 1,
          label,
          variant,
          sameBundleControl: label === "P30-control",
          bundleSha256: bundles[variant].sha256,
          startPeriod,
          periods: (await session.periods()) - startPeriod,
          rendererCpuRowsSec: rows(cpuBefore, cpuAfter),
          rendererCpuSec: rendererCpu(cpuBefore, cpuAfter),
          taskDurationSec: Number(
            (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(4),
          ),
          scriptDurationSec: Number(
            (
              metricsAfter.ScriptDuration - metricsBefore.ScriptDuration
            ).toFixed(4),
          ),
        });
      } finally {
        await session.close();
      }
    }
  }

  // A separate in-renderer positive control calibrates the CPU counters without advancing or
  // mutating the game. The injected work is 2% of the median matched-window P30 renderer CPU.
  for (const scenario of scenarios) {
    const controlValues = cpuRuns
      .filter((run) => run.scenario === scenario.name && run.sameBundleControl)
      .map((run) => run.rendererCpuSec)
      .toSorted((left, right) => left - right);
    const targetMs = Number((controlValues[1] * 20).toFixed(2));
    const results = [];
    for (let repeat = 1; repeat <= 3; repeat++) {
      for (const calibrated of repeat % 2 === 1
        ? [false, true]
        : [true, false]) {
        const session = await open(scenario, bundles.P30);
        try {
          await session.advance(warmup);
          const [cpuBefore, metricsBefore] = await Promise.all([
            runner.processCpu(),
            session.metrics(),
          ]);
          const workload = calibrated
            ? await session.evaluate((durationMs) => {
                const started = window.__EA_RUNNER__.nativeNow();
                let value = 0;
                while (
                  window.__EA_RUNNER__.nativeNow() - started <
                  durationMs
                ) {
                  for (let index = 1; index <= 500; index++)
                    value = (value + Math.imul(index, index + value)) | 0;
                }
                return {
                  elapsedMs: window.__EA_RUNNER__.nativeNow() - started,
                  value,
                };
              }, targetMs)
            : null;
          if (!calibrated)
            await new Promise((resolve) => setTimeout(resolve, targetMs));
          const [cpuAfter, metricsAfter] = await Promise.all([
            runner.processCpu(),
            session.metrics(),
          ]);
          results.push({
            repeat,
            calibrated,
            targetMs,
            workload,
            rendererCpuSec: rendererCpu(cpuBefore, cpuAfter),
            taskDurationSec: Number(
              (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(
                4,
              ),
            ),
          });
        } finally {
          await session.close();
        }
      }
    }
    calibrations[scenario.name] = results;
  }
} finally {
  await runner.close();
}

const report = {
  experiment: "P31 performance headroom and allocation authority readiness",
  pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
  baseCommit,
  p30Commit,
  sourceChanges,
  gameSha256: hash(gameBytes),
  runnerInputs: runner.inputs,
  chromiumVersion: runner.browser.version,
  epoch,
  periods,
  warmup,
  repeats,
  bundles,
  fixtures: fixtureMeta,
  profiles,
  cpuRuns,
  calibrations,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    outputPath,
    profileScenarios: Object.keys(profiles),
    cpuRuns: cpuRuns.length,
  }),
);
