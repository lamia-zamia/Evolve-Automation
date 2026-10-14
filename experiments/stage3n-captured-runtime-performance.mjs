import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "test-artifacts/benchmark/slice0";
const settingsPath = path.join(
  root,
  base,
  "settings/stage2e-integrated-mad-no-triggers.json",
);
const fullSettingsPath = path.join(root, base, "settings/current-full.json");
const earlyPath = path.join(root, base, "saves/deadspace-early-day14.json");
const progressionPath = path.join(
  root,
  base,
  "saves/stage2f-fixed-progression-export.json",
);
const latePath = path.join(root, base, "saves/mad-tech-offered-blocked.json");
const outputPath = path.resolve(
  root,
  process.argv.find((value) => value.startsWith("--out="))?.slice(6) ??
    "test-artifacts/benchmark/tmp/stage3n-captured-runtime-performance.json",
);
const warmup = Number(
  process.argv.find((value) => value.startsWith("--warmup="))?.slice(9) ?? 100,
);
const periods = Number(
  process.argv.find((value) => value.startsWith("--periods="))?.slice(10) ??
    200,
);
const repeats = Number(
  process.argv.find((value) => value.startsWith("--repeats="))?.slice(10) ?? 2,
);
const sampleMs = Number(
  process.argv.find((value) => value.startsWith("--sample-ms="))?.slice(12) ??
    100,
);
const onlyScenario = process.argv
  .find((value) => value.startsWith("--only="))
  ?.slice(7);
const correctnessOnly = process.argv.includes("--correctness-only");
const epoch = Date.parse("2026-09-21T00:00:00.000Z");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [
  stageSettings,
  fullSettings,
  earlyText,
  progressionText,
  lateText,
  gameText,
  metadata,
] = await Promise.all([
  readJson(settingsPath),
  readJson(fullSettingsPath),
  readFile(earlyPath, "utf8"),
  readFile(progressionPath, "utf8"),
  readFile(latePath, "utf8"),
  readFile(path.join(root, "test-artifacts/game/evolve-deadspace.js")),
  readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
]);
assert.ok(
  periods > 0 &&
    warmup >= 0 &&
    repeats > 1 &&
    sampleMs >= 25 &&
    Number.isSafeInteger(epoch),
);

const testBundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage3n-test-surface.user.js",
);
const testBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\n\n// Stage 3M D test-surface control.`,
  },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
await mkdir(path.dirname(testBundlePath), { recursive: true });
await writeFile(testBundlePath, testBundle.outputFiles[0].contents);

const scenarios = [
  {
    name: "early",
    savePath: earlyPath,
    saveText: earlyText,
    settingsPath,
    settings: stageSettings,
  },
  {
    name: "progression",
    savePath: progressionPath,
    saveText: progressionText,
    settingsPath,
    settings: stageSettings,
  },
  {
    name: "late-many-owners",
    savePath: latePath,
    saveText: lateText,
    settingsPath: fullSettingsPath,
    settings: fullSettings,
  },
  {
    name: "stage3m-D-test-surface-control",
    savePath: progressionPath,
    saveText: progressionText,
    settingsPath,
    settings: { ...stageSettings, autoResearch: true },
    bundle: testBundlePath,
    testSurfaceD: true,
  },
];

function summarize(samples) {
  const sorted = samples.toSorted((left, right) => left - right);
  const quantile = (q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return {
    sampleCount: sorted.length,
    median: quantile(0.5),
    p95: quantile(0.95),
    maximum: sorted.at(-1),
  };
}

async function run(runner, scenario, enabled, repeat) {
  const targetPeriods = warmup + periods;
  const session = await runner.openSession({
    bundle: scenario.bundle,
    save: parseSave(scenario.saveText),
    settings: scenario.settings,
    seed: 42,
    epoch,
    perf: enabled,
    forwardPerfSummary: enabled,
    nativeTrace: scenario.testSurfaceD === true,
    manaTrace: scenario.testSurfaceD === true,
    nativeStopAt: targetPeriods + 1,
  });
  try {
    if (scenario.testSurfaceD) {
      await session.evaluate(() => {
        window.__EA_TEST_HOOKS__ ??= {};
        window.__EA_TEST_HOOKS__.gatherIntervention = {
          resourceClaimMode: "goal-derived-conjunctive",
        };
        window.__EA_TEST_HOOKS__.researchShadowEnabled = false;
      });
    }
    let priorPeriod = 0;
    let priorMetrics = await session.metrics();
    const periodScriptMs = [];
    const measuredWindows = [];
    while (priorPeriod < targetPeriods) {
      await new Promise((resolve) => setTimeout(resolve, sampleMs));
      const currentPeriod = await session.periods();
      const currentMetrics = await session.metrics();
      const deltaPeriods = currentPeriod - priorPeriod;
      if (
        deltaPeriods > 0 &&
        priorPeriod >= warmup &&
        currentPeriod <= targetPeriods
      ) {
        const windowScriptDurationMs =
          (currentMetrics.ScriptDuration - priorMetrics.ScriptDuration) * 1000;
        measuredWindows.push({
          fromPeriod: priorPeriod,
          toPeriod: currentPeriod,
          periods: deltaPeriods,
          scriptDurationMs: windowScriptDurationMs,
          taskDurationMs:
            (currentMetrics.TaskDuration - priorMetrics.TaskDuration) * 1000,
        });
        periodScriptMs.push(windowScriptDurationMs / deltaPeriods);
      }
      priorPeriod = currentPeriod;
      priorMetrics = currentMetrics;
    }
    const [state, diagnostics] = await Promise.all([
      session.readState(),
      session.diagnostics(),
    ]);
    const finalMetrics = await session.metrics();
    const totalJavaScriptDurationMs = measuredWindows.reduce(
      (total, sample) => total + sample.scriptDurationMs,
      0,
    );
    const periodsCoveredByWindows = measuredWindows.reduce(
      (total, sample) => total + sample.periods,
      0,
    );
    return {
      scenario: scenario.name,
      instrumentation: enabled ? "enabled" : "disabled",
      repeat,
      periods: priorPeriod,
      workTicks: diagnostics.workTicks,
      prestigeCount: state.stats?.reset,
      controlUsage: diagnostics.controlUsage,
      stateSha256: hash(JSON.stringify(state)),
      controlUsageSha256: hash(JSON.stringify(diagnostics.controlUsage)),
      windowScriptMsPerPeriod: summarize(periodScriptMs),
      totalJavaScriptDurationMs: Number(totalJavaScriptDurationMs.toFixed(3)),
      periodsCoveredByWindows,
      meanScriptMsPerCoveredPeriod:
        periodsCoveredByWindows === 0
          ? null
          : Number(
              (totalJavaScriptDurationMs / periodsCoveredByWindows).toFixed(3),
            ),
      measurementWindows: measuredWindows.length,
      taskDurationMs: Number(
        measuredWindows
          .reduce((total, sample) => total + sample.taskDurationMs, 0)
          .toFixed(3),
      ),
      jsHeapBytes: finalMetrics.JSHeapUsedSize,
      domNodes: finalMetrics.Nodes,
      perfSummaries: diagnostics.perfSummaries,
      counts: diagnostics.counts,
      errors: diagnostics.events,
      saveSha256: hash(scenario.saveText),
      settingsSha256: hash(JSON.stringify(scenario.settings)),
      bundleSha256: hash(
        await readFile(
          scenario.bundle ?? path.join(root, "evolve_automation.user.js"),
        ),
      ),
    };
  } finally {
    await session.close();
  }
}

async function runControlledComparison(runner, scenario, enabled) {
  const session = await runner.openSession({
    bundle: scenario.bundle,
    save: parseSave(scenario.saveText),
    settings: scenario.settings,
    seed: 42,
    epoch,
    perf: enabled,
    nativeTrace: true,
    manaTrace: scenario.testSurfaceD === true,
  });
  try {
    if (scenario.testSurfaceD) {
      await session.evaluate(() => {
        window.__EA_TEST_HOOKS__ ??= {};
        window.__EA_TEST_HOOKS__.gatherIntervention = {
          resourceClaimMode: "goal-derived-conjunctive",
        };
        window.__EA_TEST_HOOKS__.researchShadowEnabled = false;
      });
    }
    await session.advance(periods);
    const [state, diagnostics] = await Promise.all([
      session.readState(),
      session.diagnostics(),
    ]);
    const trace = diagnostics.nativeInvocations ?? [];
    return {
      instrumentation: enabled ? "enabled" : "disabled",
      stateSha256: hash(JSON.stringify(state)),
      controlUsageSha256: hash(JSON.stringify(diagnostics.controlUsage)),
      nativeInvocationSha256: hash(JSON.stringify(trace)),
      nativeInvocations: trace.length,
      errors: diagnostics.events,
    };
  } finally {
    await session.close();
  }
}

const runner = await createChromiumRunner();
try {
  const results = [];
  const scenarioFilter = onlyScenario?.split(",");
  const selectedScenarios = scenarioFilter
    ? scenarios.filter((scenario) => scenarioFilter.includes(scenario.name))
    : scenarios;
  assert.ok(selectedScenarios.length > 0, `Unknown scenario: ${onlyScenario}`);
  if (correctnessOnly) {
    const comparisons = [];
    for (const scenario of selectedScenarios) {
      const disabled = await runControlledComparison(runner, scenario, false);
      const enabled = await runControlledComparison(runner, scenario, true);
      comparisons.push({
        scenario: scenario.name,
        saveSha256: hash(scenario.saveText),
        settingsSha256: hash(JSON.stringify(scenario.settings)),
        instrumentationDisabled: disabled,
        instrumentationEnabled: enabled,
        stateEqual: disabled.stateSha256 === enabled.stateSha256,
        controlUsageEqual:
          disabled.controlUsageSha256 === enabled.controlUsageSha256,
        nativeInvocationTraceEqual:
          disabled.nativeInvocationSha256 === enabled.nativeInvocationSha256,
      });
    }
    const report = {
      stage: "3N deterministic instrumentation comparison",
      upstreamCommit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
      gameSnapshotSha256: hash(gameText),
      periods,
      seed: 42,
      epoch,
      comparisons,
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify({ outputPath, comparisons: comparisons.length }),
    );
  } else {
    const writeReport = async () => {
      const report = {
        stage: "3N",
        runner:
          "tools/chromium-evolve-runner.mjs native timers + CDP Performance metrics",
        upstreamCommit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
        gameSnapshotSha256: hash(gameText),
        warmupPeriods: warmup,
        measuredPeriods: periods,
        repeats,
        sampleIntervalMs: sampleMs,
        epoch,
        methodology:
          "Diagnostics-off/enabled alternating native-timer Chromium runs. ScriptDuration is total renderer JS including upstream game. Adjacent CDP samples form polling windows; windows crossing either the warm-up or measured-run boundary are excluded because their ScriptDuration cannot be apportioned. The report gives summed JavaScript duration, its mean per period covered by accepted windows, and per-window period-normalized samples. Window median/p95/maximum are polling-window statistics, not per-period callback latency. Diagnostics-enabled runs include instrumentation overhead and are attribution runs, not runtime performance estimates. State and control-usage hashes identify workload changes; changed workloads must not be presented as a pure speed comparison. Phase summaries are attribution only. Epoch is numeric milliseconds because the runner bridge applies Number(epoch). Stage 3M D is the existing test-surface intervention with shadow disabled.",
        results,
      };
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    };
    for (const scenario of selectedScenarios) {
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        for (const enabled of repeat % 2 === 1
          ? [false, true]
          : [true, false]) {
          results.push(await run(runner, scenario, enabled, repeat));
          await writeReport();
        }
      }
    }
    await writeReport();
    console.log(
      JSON.stringify({
        outputPath,
        runs: results.length,
        gameSnapshotSha256: hash(gameText),
      }),
    );
  }
} finally {
  await runner.close();
}
