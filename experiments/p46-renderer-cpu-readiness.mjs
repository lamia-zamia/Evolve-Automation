import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  accountProcessCpu,
  createChromiumRunner,
  decodeExport,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolRoot = path.join(root, "tools");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const defaultOutput = path.join(
  root,
  "experiments/p46-renderer-cpu-readiness-evidence.json",
);
const periods = 160;
const warmupPeriods = 160;
const seed = 42;
const epoch = Date.parse("2026-09-21T00:00:00.000Z");
const calibrationIterations = 30_000_000;
const dosePercents = [2, 5, 10];
const maximumWorkloadIterations = 500_000_000;
const pairOrder = [
  { dose: 2, order: "control-treatment" },
  { dose: 5, order: "treatment-control" },
  { dose: 10, order: "control-treatment" },
  { dose: 10, order: "treatment-control" },
  { dose: 5, order: "control-treatment" },
  { dose: 2, order: "treatment-control" },
];
let runSequence = 0;

const hash = (value) => createHash("sha256").update(value).digest("hex");
const round = (value, digits = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

function tCritical95(df) {
  return (
    {
      1: 12.706,
      2: 4.303,
      3: 3.182,
      4: 2.776,
      5: 2.571,
      6: 2.447,
      7: 2.365,
      8: 2.306,
      9: 2.262,
      10: 2.228,
    }[df] ?? 1.96
  );
}

export function summarize(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const sd =
    sorted.length < 2
      ? null
      : Math.sqrt(
          sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            (sorted.length - 1),
        );
  const halfWidth =
    sd === null
      ? null
      : (tCritical95(sorted.length - 1) * sd) / Math.sqrt(sorted.length);
  const quantile = (q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return {
    n: sorted.length,
    mean: round(mean),
    median: round(
      (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.ceil((sorted.length - 1) / 2)]) /
        2,
    ),
    p95: round(quantile(0.95)),
    min: round(sorted[0]),
    max: round(sorted.at(-1)),
    range: round(sorted.at(-1) - sorted[0]),
    rangePercentOfMean:
      mean === 0 ? null : round(((sorted.at(-1) - sorted[0]) / mean) * 100, 3),
    sampleStandardDeviation: round(sd),
    ci95Mean:
      halfWidth === null
        ? null
        : [round(mean - halfWidth), round(mean + halfWidth)],
  };
}

export function medianRaw(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  return (
    (sorted[Math.floor((sorted.length - 1) / 2)] +
      sorted[Math.ceil((sorted.length - 1) / 2)]) /
    2
  );
}

function correlation(left, right) {
  const pairs = left
    .map((value, index) => [value, right[index]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  const numerator = pairs.reduce(
    (sum, [x, y]) => sum + (x - meanX) * (y - meanY),
    0,
  );
  const denominator = Math.sqrt(
    pairs.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0) *
      pairs.reduce((sum, [, y]) => sum + (y - meanY) ** 2, 0),
  );
  return denominator === 0 ? null : round(numerator / denominator, 3);
}

export function accountRendererWindow(
  beforeRows,
  afterRows,
  browserPid,
  expectedRendererId = null,
) {
  const accounting = accountProcessCpu(beforeRows, afterRows, null);
  const renderers = accounting.rows
    .filter((row) => row.type === "renderer")
    .toSorted(
      (left, right) => (right.cpuSec ?? -Infinity) - (left.cpuSec ?? -Infinity),
    );
  const beforeIds = beforeRows
    .filter((row) => row.type === "renderer")
    .map((row) => row.id)
    .toSorted((a, b) => a - b);
  const afterIds = afterRows
    .filter((row) => row.type === "renderer")
    .map((row) => row.id)
    .toSorted((a, b) => a - b);
  const rendererChurn = accounting.processChurn.some(
    (row) => row.type === "renderer",
  );
  const idSetStable =
    beforeIds.length > 0 &&
    beforeIds.length === afterIds.length &&
    beforeIds.every((id, index) => id === afterIds[index]);
  const totalRendererCpuSec = renderers.every((row) =>
    Number.isFinite(row.cpuSec),
  )
    ? renderers.reduce((sum, row) => sum + row.cpuSec, 0)
    : null;
  const active =
    expectedRendererId === null
      ? renderers[0]
      : renderers.find((row) => row.id === expectedRendererId);
  const activeRendererShare =
    totalRendererCpuSec > 0 && Number.isFinite(active?.cpuSec)
      ? active.cpuSec / totalRendererCpuSec
      : null;
  const browserRowBefore = beforeRows.find((row) => row.type === "browser");
  const browserRowAfter = afterRows.find((row) => row.type === "browser");
  const browserPidObserved =
    browserRowBefore?.id === browserPid && browserRowAfter?.id === browserPid;
  const identityVerified =
    idSetStable &&
    !rendererChurn &&
    renderers.every((row) => Number.isFinite(row.cpuSec)) &&
    active !== undefined &&
    (expectedRendererId !== null ||
      (activeRendererShare !== null && activeRendererShare >= 0.98));
  return {
    rendererIdsBefore: beforeIds,
    rendererIdsAfter: afterIds,
    processChurn: accounting.processChurn,
    idSetStable,
    activeRendererId: active?.id ?? null,
    activeRendererCpuSec: identityVerified ? active.cpuSec : null,
    allRendererCpuSec: totalRendererCpuSec,
    activeRendererShare: round(activeRendererShare, 4),
    browserPid,
    browserPidObserved,
    identityVerified,
    rows: renderers,
  };
}

function cpuTime(totals) {
  return totals.user + totals.system;
}

export function hostCpuBusyPercent(before, after) {
  if (before.length !== after.length) return null;
  let total = 0;
  let idle = 0;
  for (let index = 0; index < before.length; index++) {
    const left = before[index].times;
    const right = after[index].times;
    for (const key of Object.keys(right)) total += right[key] - left[key];
    idle += right.idle - left.idle;
  }
  return total > 0 ? round(((total - idle) / total) * 100, 2) : null;
}

function processSnapshot(runner) {
  const startedAt = performance.now();
  return runner.processCpu().then((rows) => ({
    startedAtMs: round(startedAt),
    atMs: round(performance.now()),
    queryWallMs: round(performance.now() - startedAt, 3),
    rows,
  }));
}

function controlCallCount(controlUsage) {
  return Object.values(controlUsage).reduce(
    (sum, entry) => sum + entry.returned + entry.threw,
    0,
  );
}

function captureHostCpu() {
  return os.cpus().map(({ times }) => ({ times: { ...times } }));
}

function gitInfo(cwd) {
  const run = (...args) =>
    execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  return {
    revision: run("rev-parse", "HEAD"),
    status: run("status", "--short"),
    unstagedPatchSha256: hash(run("diff", "--binary")),
  };
}

async function runWindow({
  runner,
  save,
  settings,
  id,
  group,
  evaluation = null,
  dose = null,
  warmup: requestedWarmup = 0,
}) {
  console.log(`[P46] start window ${id}`);
  const session = await runner.openSession({
    bundle: path.join(root, "evolve_automation.user.js"),
    save: structuredClone(save),
    settings,
    seed,
    epoch,
    perf: false,
    callbackProfile: false,
    nativeTrace: false,
  });
  try {
    const initialExport = await session.exportSave();
    const initialStateSha256 = hash(
      JSON.stringify(decodeExport(initialExport)),
    );
    let warmup = null;
    if (requestedWarmup > 0) {
      const warmStartPeriod = await session.periods();
      const warmMetricsBefore = await session.metrics();
      const warmCpuBefore = await processSnapshot(runner);
      const warmHostBefore = captureHostCpu();
      const warmNodeBefore = process.cpuUsage();
      const warmStartedAt = performance.now();
      const warmResult = await session.advance(requestedWarmup);
      const warmFinishedAt = performance.now();
      const warmCpuAfter = await processSnapshot(runner);
      const warmMetricsAfter = await session.metrics();
      const warmHostAfter = captureHostCpu();
      const warmNodeAfter = process.cpuUsage(warmNodeBefore);
      warmup = {
        requestedPeriods: requestedWarmup,
        periodsAdvanced: warmResult.periods - warmStartPeriod,
        reloads: warmResult.reloads,
        rendererCpu: accountRendererWindow(
          warmCpuBefore.rows,
          warmCpuAfter.rows,
          runner.browser.pid,
        ),
        taskDurationSec: round(
          warmMetricsAfter.TaskDuration - warmMetricsBefore.TaskDuration,
        ),
        scriptDurationSec: round(
          warmMetricsAfter.ScriptDuration - warmMetricsBefore.ScriptDuration,
        ),
        wallMs: round(warmFinishedAt - warmStartedAt, 2),
        hostCpuBusyPercent: hostCpuBusyPercent(warmHostBefore, warmHostAfter),
        nodeCpuSec: round(cpuTime(warmNodeAfter) / 1_000_000),
        processCounterSamples: {
          before: warmCpuBefore,
          after: warmCpuAfter,
        },
      };
    }

    const startPeriod = await session.periods();
    const startExport =
      warmup === null ? initialExport : await session.exportSave();
    const startStateSha256 = hash(JSON.stringify(decodeExport(startExport)));
    const metricsBefore = await session.metrics();
    const hostCpuBefore = captureHostCpu();
    const nodeCpuBefore = process.cpuUsage();
    const processBefore = await processSnapshot(runner);
    const advanceStartedAt = performance.now();
    const advanceResult = await session.advance(periods);
    const advanceFinishedAt = performance.now();
    let evaluationCpu = null;
    let evaluationCounterSamples = null;
    let evaluationMetricSamples = null;
    let processAfter;
    let metricsAfter;
    if (evaluation !== null) {
      const metricsBeforeEvaluation = await session.metrics();
      const processBeforeEvaluation = await processSnapshot(runner);
      const evaluationValue = await session.evaluate(
        evaluation === "noop"
          ? () => 0
          : (count) => {
              let value = 0x13579bdf;
              for (let index = 0; index < count; index++) {
                value = (Math.imul(value ^ index, 1664525) + 1013904223) | 0;
              }
              return value >>> 0;
            },
        ...(evaluation === "noop" ? [] : [evaluation.iterations]),
      );
      const processAfterEvaluation = await processSnapshot(runner);
      const metricsAfterEvaluation = await session.metrics();
      evaluationMetricSamples = {
        before: metricsBeforeEvaluation,
        after: metricsAfterEvaluation,
      };
      evaluationCounterSamples = {
        before: processBeforeEvaluation,
        after: processAfterEvaluation,
      };
      evaluationCpu = {
        kind: evaluation === "noop" ? "noop" : "integer-loop",
        iterations: evaluation === "noop" ? 0 : evaluation.iterations,
        checksum: evaluationValue,
        rendererCpu: null,
        taskDurationSec: round(
          metricsAfterEvaluation.TaskDuration -
            metricsBeforeEvaluation.TaskDuration,
        ),
        scriptDurationSec: round(
          metricsAfterEvaluation.ScriptDuration -
            metricsBeforeEvaluation.ScriptDuration,
        ),
      };
      processAfter = processAfterEvaluation;
      metricsAfter = metricsAfterEvaluation;
    } else {
      processAfter = await processSnapshot(runner);
      metricsAfter = await session.metrics();
    }
    const cpuWindowFinishedAt = performance.now();
    const hostCpuAfter = captureHostCpu();
    const nodeCpuAfter = process.cpuUsage(nodeCpuBefore);
    const diagnostic = await session.diagnostics();
    const exportSave = await session.exportSave();
    const state = decodeExport(exportSave);
    const processAccounting = accountRendererWindow(
      processBefore.rows,
      processAfter.rows,
      runner.browser.pid,
    );
    const counterSnapshots = [
      processBefore,
      ...(evaluationCounterSamples === null
        ? []
        : [evaluationCounterSamples.before, evaluationCounterSamples.after]),
      processAfter,
    ];
    const rendererIdsAcrossReads = counterSnapshots.map((sample) =>
      sample.rows
        .filter((row) => row.type === "renderer")
        .map((row) => row.id)
        .toSorted((a, b) => a - b),
    );
    const allReadIdsStable = rendererIdsAcrossReads.every(
      (ids) =>
        ids.length === rendererIdsAcrossReads[0].length &&
        ids.every((id, index) => id === rendererIdsAcrossReads[0][index]),
    );
    processAccounting.identityVerified &&=
      allReadIdsStable &&
      (!warmup ||
        warmup.rendererCpu.activeRendererId ===
          processAccounting.activeRendererId);
    processAccounting.rendererIdsAcrossReads = rendererIdsAcrossReads;
    if (!processAccounting.identityVerified)
      processAccounting.activeRendererCpuSec = null;
    if (evaluationCpu !== null) {
      evaluationCpu.rendererCpu = accountRendererWindow(
        evaluationCounterSamples.before.rows,
        evaluationCounterSamples.after.rows,
        runner.browser.pid,
        processAccounting.activeRendererId,
      );
    }
    console.log(
      `[P46] end window ${id} rendererCpuSec=${processAccounting.activeRendererCpuSec} taskDurationSec=${round(metricsAfter.TaskDuration - metricsBefore.TaskDuration)}`,
    );
    return {
      sequence: ++runSequence,
      id,
      group,
      browserPid: runner.browser.pid,
      browserVersion: runner.browser.version,
      pageTargetId: session.pageTargetId,
      sessionTimings: session.timings,
      startPeriod,
      endPeriod: advanceResult.periods,
      requestedPeriods: periods,
      periodsAdvanced: advanceResult.periods - startPeriod,
      expectedWorkTicksFromTickRate: periods / settings.tickRate,
      scheduledWorkTicks: periods / settings.tickRate,
      workTickCountObservedByRunner: diagnostic.workTicks,
      reloads: advanceResult.reloads,
      warmup,
      initialStateSha256,
      measuredStartStateSha256: startStateSha256,
      rendererCpu: processAccounting,
      taskDurationSec: round(
        metricsAfter.TaskDuration - metricsBefore.TaskDuration,
      ),
      scriptDurationSec: round(
        metricsAfter.ScriptDuration - metricsBefore.ScriptDuration,
      ),
      evaluationCpu,
      metricNames: Object.keys(metricsAfter).sort(),
      compileMetrics: Object.fromEntries(
        Object.entries(metricsAfter).filter(([name]) =>
          /compile|optim/i.test(name),
        ),
      ),
      advanceWallMs: round(advanceFinishedAt - advanceStartedAt, 2),
      cpuWindowWallMs: round(cpuWindowFinishedAt - processBefore.atMs, 2),
      hostCpuBusyPercent: hostCpuBusyPercent(hostCpuBefore, hostCpuAfter),
      nodeCpuSec: round(cpuTime(nodeCpuAfter) / 1_000_000),
      processCounterSamples: {
        order:
          evaluation === null
            ? [
                "metrics-before",
                "process-cpu-before",
                "advance",
                "process-cpu-after",
                "metrics-after",
              ]
            : [
                "metrics-before",
                "process-cpu-before",
                "advance",
                "metrics-before-evaluation",
                "process-cpu-before-evaluation",
                "Runtime.evaluate",
                "process-cpu-after-evaluation",
                "metrics-after-evaluation",
              ],
        before: processBefore,
        evaluationBefore: evaluationCounterSamples?.before ?? null,
        evaluationAfter: evaluationCounterSamples?.after ?? null,
        after: processAfter,
      },
      metricBoundaryValues: {
        taskBefore: metricsBefore.TaskDuration,
        taskAfter: metricsAfter.TaskDuration,
        scriptBefore: metricsBefore.ScriptDuration,
        scriptAfter: metricsAfter.ScriptDuration,
        evaluationTaskBefore:
          evaluationMetricSamples?.before.TaskDuration ?? null,
        evaluationTaskAfter:
          evaluationMetricSamples?.after.TaskDuration ?? null,
        evaluationScriptBefore:
          evaluationMetricSamples?.before.ScriptDuration ?? null,
        evaluationScriptAfter:
          evaluationMetricSamples?.after.ScriptDuration ?? null,
      },
      randomCalls: diagnostic.randomCalls,
      rngState: diagnostic.rngState ?? null,
      controlUsage: diagnostic.controlUsage,
      nativeControlCallCount: controlCallCount(diagnostic.controlUsage),
      stateSha256: hash(JSON.stringify(state)),
      exportSha256: hash(exportSave),
      counts: diagnostic.counts,
    };
  } finally {
    await session.close();
  }
}

async function calibrateWorkload({ runner, save, settings }) {
  console.log("[P46] start native renderer workload calibration");
  const session = await runner.openSession({
    bundle: path.join(root, "evolve_automation.user.js"),
    save: structuredClone(save),
    settings,
    seed,
    epoch,
    perf: false,
    callbackProfile: false,
    nativeTrace: false,
  });
  try {
    const samples = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const before = await processSnapshot(runner);
      const metricsBefore = await session.metrics();
      const value = await session.evaluate((count) => {
        let result = 0x13579bdf;
        for (let index = 0; index < count; index++) {
          result = (Math.imul(result ^ index, 1664525) + 1013904223) | 0;
        }
        return result >>> 0;
      }, calibrationIterations);
      const after = await processSnapshot(runner);
      const metricsAfter = await session.metrics();
      const rendererCpu = accountRendererWindow(
        before.rows,
        after.rows,
        runner.browser.pid,
      );
      samples.push({
        repeat: repeat + 1,
        rendererCpu,
        taskDurationSec: round(
          metricsAfter.TaskDuration - metricsBefore.TaskDuration,
        ),
        scriptDurationSec: round(
          metricsAfter.ScriptDuration - metricsBefore.ScriptDuration,
        ),
        checksum: value,
      });
    }
    const valid =
      samples.every(
        (sample) =>
          sample.rendererCpu.identityVerified &&
          sample.rendererCpu.activeRendererCpuSec > 0,
      ) &&
      new Set(samples.map((sample) => sample.rendererCpu.activeRendererId))
        .size === 1;
    const rates = samples
      .slice(1)
      .map(
        (sample) =>
          sample.rendererCpu.activeRendererCpuSec / calibrationIterations,
      );
    const secondsPerIteration = medianRaw(rates);
    const calibrationValid =
      valid && Number.isFinite(secondsPerIteration) && secondsPerIteration > 0;
    console.log(`[P46] calibrated secondsPerIteration=${secondsPerIteration}`);
    return {
      iterationsPerEvaluation: calibrationIterations,
      samples,
      rendererProcessIds: [
        ...new Set(
          samples.map((sample) => sample.rendererCpu.activeRendererId),
        ),
      ],
      secondsPerIteration,
      secondsPerIterationRoundedForDisplay: round(secondsPerIteration, 12),
      valid: calibrationValid,
      source:
        "direct SystemInfo.getProcessInfo renderer CPU delta; no virtual/performance timer used",
    };
  } finally {
    await session.close();
  }
}

async function runCallbackAndGcDiagnostic({ runner, save, settings }) {
  const session = await runner.openSession({
    bundle: path.join(root, "evolve_automation.user.js"),
    save: structuredClone(save),
    settings,
    seed,
    epoch,
    perf: true,
    callbackProfile: true,
    nativeTrace: true,
    forwardPerfSummary: true,
  });
  try {
    const observer = await session.evaluate(() => {
      const supported = PerformanceObserver.supportedEntryTypes ?? [];
      if (!supported.includes("gc")) return { supported: false };
      window.__p46GcEntries = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__p46GcEntries.push({
            kind: entry.kind ?? null,
            durationMs: Number(entry.duration.toFixed(3)),
            startTimeMs: Number(entry.startTime.toFixed(3)),
          });
        }
      });
      observer.observe({ type: "gc", buffered: true });
      window.__p46GcObserver = observer;
      return { supported: true };
    });
    const metricsStart = await session.metrics();
    const startPeriod = await session.periods();
    const profilePeriods = 800;
    const halfPeriods = profilePeriods / 2;
    let warmEndPeriod = startPeriod;
    let warmMetrics = metricsStart;
    console.log(
      "[P46] start instrumented 800-period profile in 100-period chunks",
    );
    for (let advanced = 0; advanced < profilePeriods; advanced += 100) {
      await session.advance(100);
      if (advanced + 100 === halfPeriods) {
        warmEndPeriod = await session.periods();
        warmMetrics = await session.metrics();
      }
      console.log(`[P46] diagnostic periods advanced=${advanced + 100}`);
    }
    const endPeriod = await session.periods();
    const endMetrics = await session.metrics();
    const diagnostics = await session.diagnostics();
    const gcEntries = await session.evaluate(() => {
      window.__p46GcObserver?.disconnect();
      return window.__p46GcEntries ?? [];
    });
    const workTickCallbacks = (diagnostics.callbackDurationsMs ?? []).filter(
      (sample) => sample.period % settings.tickRate === 0,
    );
    const firstWindow = workTickCallbacks.filter(
      (sample) => sample.period > startPeriod && sample.period <= warmEndPeriod,
    );
    const secondWindow = workTickCallbacks.filter(
      (sample) => sample.period > warmEndPeriod && sample.period <= endPeriod,
    );
    return {
      browserPid: runner.browser.pid,
      pageTargetId: session.pageTargetId,
      callbackProfileEnabled: true,
      gcObserver: observer,
      gcEntries,
      totalPeriods: endPeriod - startPeriod,
      firstHalfPeriods: warmEndPeriod - startPeriod,
      secondHalfPeriods: endPeriod - warmEndPeriod,
      workTickCallbackLatencyMs: {
        firstHalf: summarize(firstWindow.map((sample) => sample.durationMs)),
        secondHalf: summarize(secondWindow.map((sample) => sample.durationMs)),
        observations: workTickCallbacks,
      },
      metricNames: Object.keys(endMetrics).sort(),
      compileMetricDeltas: Object.fromEntries(
        Object.keys(endMetrics)
          .filter((name) => /compile|optim/i.test(name))
          .map((name) => [
            name,
            round(endMetrics[name] - (metricsStart[name] ?? 0)),
          ]),
      ),
      taskDurationSec: {
        firstHalf: round(warmMetrics.TaskDuration - metricsStart.TaskDuration),
        secondHalf: round(endMetrics.TaskDuration - warmMetrics.TaskDuration),
      },
      scriptDurationSec: {
        firstHalf: round(
          warmMetrics.ScriptDuration - metricsStart.ScriptDuration,
        ),
        secondHalf: round(
          endMetrics.ScriptDuration - warmMetrics.ScriptDuration,
        ),
      },
      workTicksReportedByPerformanceSummary: diagnostics.workTicks,
      nativeInvocationCount: diagnostics.nativeInvocations?.length ?? null,
      nativeInvocationSha256:
        diagnostics.nativeInvocations === null
          ? null
          : hash(JSON.stringify(diagnostics.nativeInvocations)),
      perfSummaries: diagnostics.perfSummaries,
      randomCalls: diagnostics.randomCalls,
      rngState: diagnostics.rngState,
      controlCallCount: controlCallCount(diagnostics.controlUsage),
      finalExportSha256: hash(await session.exportSave()),
      instrumentationNote:
        "Diagnostic only. Callback timing, nativeTrace, eaPerformance phase timers, and PerformanceObserver GC collection are excluded from CPU comparisons.",
    };
  } finally {
    await session.close();
  }
}

function valueAtPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function pairedEffects(pairs, metric, baselineMean) {
  const effects = pairs
    .map(({ id, order, control, treatment }) => ({
      pairId: id,
      order,
      control: valueAtPath(control, metric),
      treatment: valueAtPath(treatment, metric),
    }))
    .map((entry) => ({ ...entry, effect: entry.treatment - entry.control }))
    .filter((entry) => Number.isFinite(entry.effect));
  const summary = summarize(effects.map((entry) => entry.effect));
  const interval = summary?.ci95Mean ?? null;
  return {
    effects: effects.map((entry) => ({
      ...entry,
      effect: round(entry.effect),
    })),
    summary,
    ci95RelativeToBaselinePercent:
      interval === null || !Number.isFinite(baselineMean) || baselineMean === 0
        ? null
        : interval.map((value) => round((value / baselineMean) * 100, 2)),
  };
}

async function readInputs() {
  const [saveText, settingsText, gameText, bundleText, harnessText] =
    await Promise.all([
      readFile(savePath, "utf8"),
      readFile(settingsPath, "utf8"),
      readFile(path.join(root, "test-artifacts/game/evolve-deadspace.js")),
      readFile(path.join(root, "evolve_automation.user.js")),
      readFile(fileURLToPath(import.meta.url)),
    ]);
  const settings = JSON.parse(settingsText);
  assert.ok(Number.isSafeInteger(settings.tickRate) && settings.tickRate > 0);
  assert.equal(periods % settings.tickRate, 0);
  return {
    saveText,
    save: parseSave(saveText),
    settings,
    gameText,
    bundleText,
    harnessText,
  };
}

async function writeEvidence(outputPath, evidence) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function main() {
  const outputPath = path.resolve(
    root,
    process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) ??
      path.relative(root, defaultOutput),
  );
  const inputs = await readInputs();
  const evidence = {
    protocol: {
      id: "P46-CPU-readiness-v1",
      decisionBudget: {
        browserProcesses: 2,
        coldNoopControlsPerProcess: [6, 3],
        warmControlsInFreshProcess: 2,
        pairedPositiveControls: pairOrder.length,
        pairsPerDose: 2,
        periodsPerMeasurementWindow: periods,
        explicitWarmupPeriods: warmupPeriods,
        maximumMeasurementWindows: 24,
        maximumWorkloadIterations,
      },
      sampleOrder:
        "metrics-before, process CPU before, advance, optional paired Runtime.evaluate workload with native CPU readings around it, process CPU after, metrics-after; final state/export/diagnostics/hashing after the measured CPU end read",
      positiveControl: {
        kind: "synchronous local integer loop in the already-loaded game page",
        targetPercentOfColdBaseline: dosePercents,
        changesGameState: false,
        mutatesDomOrGameGlobals: false,
      },
      timingFlags: { perf: false, callbackProfile: false, nativeTrace: false },
      virtualWarmupInMainCpuWindows: 0,
      diagnosticProfilePeriods: 800,
      diagnosticProfileAdvanceChunkPeriods: 100,
      browserFlagsOrCpuAffinityChanges: "none",
      priorAttempt:
        "Development attempts 1 and 2 were interrupted before a complete run: attempt 1 timed out in Runtime.callFunctionOn during the instrumented diagnostic; attempt 2 recorded three cold controls then exposed a rounded calibration-rate defect before a treatment. Attempt 3 is retained as p46-renderer-cpu-readiness-attempt3-invalid-dose.json: nine cold controls, two warm controls, and the diagnostic completed with process identity and parity, but the predeclared 250M loop cap rejected the calibrated 10% dose, so no paired controls ran. Attempt 3 is excluded from paired-effect estimates; its control and calibration rows remain available for audit.",
    },
    inputs: {
      repositoryRevision: execFileSync(
        "git",
        ["-C", root, "rev-parse", "HEAD"],
        { encoding: "utf8" },
      ).trim(),
      toolsGit: gitInfo(toolRoot),
      gameSnapshotCommit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
      gameSnapshotSha256: hash(inputs.gameText),
      bundleSha256: hash(inputs.bundleText),
      harnessSha256: hash(inputs.harnessText),
      runnerInputs: null,
      saveSha256: hash(inputs.saveText),
      settingsSha256: hash(JSON.stringify(inputs.settings)),
      settingsTickRate: inputs.settings.tickRate,
      seed,
      epoch: new Date(epoch).toISOString(),
      chromium: [],
      operatingSystem: {
        platform: process.platform,
        release: os.release(),
        architecture: os.arch(),
        logicalCpuCount: os.cpus().length,
      },
    },
    coldWindows: [],
    warmWindows: [],
    positiveControlCalibration: null,
    positiveControlPairs: [],
    callbackGcDiagnostic: null,
    analysis: null,
    validity: {
      processIdentity: true,
      deterministicParity: true,
      positiveControlCalibration: true,
    },
    status: "running",
    startedAt: new Date().toISOString(),
  };

  let runner = null;
  let baselineBefore = null;
  try {
    try {
      runner = await createChromiumRunner();
      evidence.inputs.runnerInputs = runner.inputs;
      evidence.inputs.chromium.push({
        ...runner.browser,
        group: "reused-browser-process",
      });
      for (let index = 1; index <= 3; index++) {
        evidence.coldWindows.push(
          await runWindow({
            runner,
            save: inputs.save,
            settings: inputs.settings,
            id: `same-process-pre-${index}`,
            group: "reused-browser-process",
          }),
        );
      }
      console.log("[P46] completed three reused-process pre-controls");

      baselineBefore = summarize(
        evidence.coldWindows.map((run) => run.rendererCpu.activeRendererCpuSec),
      );
      const calibration = await calibrateWorkload({
        runner,
        save: inputs.save,
        settings: inputs.settings,
      });
      const secondsPerIteration = calibration.secondsPerIteration;
      const doseIterations = Object.fromEntries(
        dosePercents.map((dose) => [
          dose,
          secondsPerIteration === null || baselineBefore === null
            ? null
            : Math.max(
                1,
                Math.round(
                  (baselineBefore.mean * (dose / 100)) / secondsPerIteration,
                ),
              ),
        ]),
      );
      const dosesValid = Object.values(doseIterations).every(
        (iterations) =>
          Number.isSafeInteger(iterations) &&
          iterations > 0 &&
          iterations <= maximumWorkloadIterations,
      );
      evidence.positiveControlCalibration = {
        ...calibration,
        baselineCpuMeanSec: baselineBefore?.mean ?? null,
        targets: Object.fromEntries(
          dosePercents.map((dose) => [
            dose,
            {
              targetPercent: dose,
              targetRendererCpuSec:
                baselineBefore === null
                  ? null
                  : round((baselineBefore.mean * dose) / 100),
              iterations: doseIterations[dose],
            },
          ]),
        ),
      };
      console.log(
        "[P46] calibration complete; beginning counterbalanced pairs",
      );
      if (
        !calibration.valid ||
        !dosesValid ||
        secondsPerIteration === null ||
        baselineBefore === null
      ) {
        evidence.validity.positiveControlCalibration = false;
        evidence.status = "calibration-invalid";
      } else {
        for (let index = 0; index < pairOrder.length; index++) {
          const { dose, order } = pairOrder[index];
          const pair = {
            id: `dose-${dose}-pair-${pairOrder.slice(0, index + 1).filter((entry) => entry.dose === dose).length}`,
            dosePercent: dose,
            order,
            control: null,
            treatment: null,
          };
          const runControl = async () =>
            runWindow({
              runner,
              save: inputs.save,
              settings: inputs.settings,
              id: `${pair.id}-control`,
              group: "reused-browser-process-positive-control",
              evaluation: "noop",
            });
          const runTreatment = async () =>
            runWindow({
              runner,
              save: inputs.save,
              settings: inputs.settings,
              id: `${pair.id}-treatment-${dose}pct`,
              group: "reused-browser-process-positive-control",
              evaluation: { iterations: doseIterations[dose] },
              dose,
            });
          if (order === "control-treatment") {
            pair.control = await runControl();
            pair.treatment = await runTreatment();
          } else {
            pair.treatment = await runTreatment();
            pair.control = await runControl();
          }
          evidence.positiveControlPairs.push(pair);
          console.log(
            `[P46] completed positive-control pair ${pair.id} order=${order}`,
          );
        }
      }

      for (let index = 1; index <= 3; index++) {
        evidence.coldWindows.push(
          await runWindow({
            runner,
            save: inputs.save,
            settings: inputs.settings,
            id: `same-process-post-${index}`,
            group: "reused-browser-process",
          }),
        );
      }
    } finally {
      if (runner !== null) await runner.close();
    }

    runner = await createChromiumRunner();
    console.log("[P46] started the fresh-browser control block");
    try {
      evidence.inputs.chromium.push({
        ...runner.browser,
        group: "fresh-browser-process",
      });
      for (let index = 1; index <= 3; index++) {
        evidence.coldWindows.push(
          await runWindow({
            runner,
            save: inputs.save,
            settings: inputs.settings,
            id: `fresh-process-cold-${index}`,
            group: "fresh-browser-process",
          }),
        );
      }
      for (let index = 1; index <= 2; index++) {
        evidence.warmWindows.push(
          await runWindow({
            runner,
            save: inputs.save,
            settings: inputs.settings,
            id: `fresh-process-warm-${index}`,
            group: "fresh-browser-process-explicit-warmup",
            warmup: warmupPeriods,
          }),
        );
      }
      evidence.callbackGcDiagnostic = await runCallbackAndGcDiagnostic({
        runner,
        save: inputs.save,
        settings: inputs.settings,
      });
    } finally {
      await runner.close();
    }

    const pairedRuns = evidence.positiveControlPairs.flatMap((pair) => [
      pair.control,
      pair.treatment,
    ]);
    const allRuns = [
      ...evidence.coldWindows,
      ...evidence.warmWindows,
      ...pairedRuns,
    ];
    evidence.validity.processIdentity =
      allRuns.every(
        (run) =>
          run.rendererCpu.identityVerified &&
          (!run.evaluationCpu ||
            run.evaluationCpu.rendererCpu.identityVerified) &&
          (!run.warmup || run.warmup.rendererCpu.identityVerified),
      ) &&
      (evidence.positiveControlCalibration?.samples ?? []).every(
        (sample) => sample.rendererCpu.identityVerified,
      );
    const parityGroups = [
      evidence.coldWindows.filter(
        (run) =>
          run.group === "reused-browser-process" ||
          run.group === "fresh-browser-process",
      ),
      evidence.warmWindows,
      ...evidence.positiveControlPairs.map((pair) => [
        pair.control,
        pair.treatment,
      ]),
    ];
    evidence.validity.deterministicParity = parityGroups.every((runs) => {
      const hashes = new Set(
        runs.map(
          (run) =>
            `${run.initialStateSha256}:${run.measuredStartStateSha256}:${run.stateSha256}:${run.exportSha256}:${run.randomCalls}:${run.rngState}:${run.nativeControlCallCount}`,
        ),
      );
      return hashes.size <= 1;
    });
    evidence.validity.positiveControlCalibration &&=
      evidence.positiveControlPairs.length === pairOrder.length;

    const noEvalCold = evidence.coldWindows.filter(
      (run) => run.evaluationCpu === null && run.warmup === null,
    );
    const reused = noEvalCold.filter(
      (run) => run.group === "reused-browser-process",
    );
    const fresh = noEvalCold.filter(
      (run) => run.group === "fresh-browser-process",
    );
    const baselineCpuMean =
      evidence.positiveControlCalibration?.baselineCpuMeanSec ?? null;
    const effectsByDose = Object.fromEntries(
      dosePercents.map((dose) => {
        const pairs = evidence.positiveControlPairs.filter(
          (pair) => pair.dosePercent === dose,
        );
        const taskBaselineMean = summarize(
          pairs.map((pair) => pair.control.taskDurationSec),
        )?.mean;
        const cpuEffects = pairedEffects(
          pairs,
          "rendererCpu.activeRendererCpuSec",
          baselineCpuMean,
        );
        return [
          dose,
          {
            targetPercent: dose,
            actualWorkloadCpuPercentOfBaseline: summarize(
              pairs.map(
                (pair) =>
                  (pair.treatment.evaluationCpu.rendererCpu
                    .activeRendererCpuSec /
                    baselineCpuMean) *
                  100,
              ),
            ),
            controlDifferenceRendererCpu: cpuEffects,
            controlDifferenceTaskDuration: pairedEffects(
              pairs,
              "taskDurationSec",
              taskBaselineMean,
            ),
            directWorkloadRendererCpuSec: summarize(
              pairs.map(
                (pair) =>
                  pair.treatment.evaluationCpu.rendererCpu.activeRendererCpuSec,
              ),
            ),
            directWorkloadTaskDurationSec: summarize(
              pairs.map((pair) => pair.treatment.evaluationCpu.taskDurationSec),
            ),
            directWorkloadScriptDurationSec: summarize(
              pairs.map(
                (pair) => pair.treatment.evaluationCpu.scriptDurationSec,
              ),
            ),
            runOrder: pairs.map((pair) => ({
              id: pair.id,
              order: pair.order,
              pairedCpuEffectSec:
                pair.treatment.rendererCpu.activeRendererCpuSec -
                pair.control.rendererCpu.activeRendererCpuSec,
            })),
          },
        ];
      }),
    );
    const hostPairs = noEvalCold.filter(
      (run) =>
        Number.isFinite(run.rendererCpu.activeRendererCpuSec) &&
        Number.isFinite(run.hostCpuBusyPercent),
    );
    const correlationsByGroup = Object.fromEntries(
      [...new Set(noEvalCold.map((run) => run.group))].map((group) => {
        const runs = noEvalCold.filter((run) => run.group === group);
        return [
          group,
          {
            rendererCpuBySequence: correlation(
              runs.map((run) => run.sequence),
              runs.map((run) => run.rendererCpu.activeRendererCpuSec),
            ),
            rendererCpuByHostBusyPercent: correlation(
              runs.map((run) => run.rendererCpu.activeRendererCpuSec),
              runs.map((run) => run.hostCpuBusyPercent),
            ),
          },
        ];
      }),
    );
    const pairedSort = (items) => items.toSorted((a, b) => a - b);
    const allControlCpu = noEvalCold.map(
      (run) => run.rendererCpu.activeRendererCpuSec,
    );
    evidence.analysis = {
      sameBundleControls: {
        reusedBrowserProcess: {
          rendererCpuSec: summarize(
            reused.map((run) => run.rendererCpu.activeRendererCpuSec),
          ),
          taskDurationSec: summarize(reused.map((run) => run.taskDurationSec)),
          order: reused.map((run) => ({
            id: run.id,
            rendererId: run.rendererCpu.activeRendererId,
            cpuSec: run.rendererCpu.activeRendererCpuSec,
            taskDurationSec: run.taskDurationSec,
          })),
        },
        freshBrowserProcess: {
          rendererCpuSec: summarize(
            fresh.map((run) => run.rendererCpu.activeRendererCpuSec),
          ),
          taskDurationSec: summarize(fresh.map((run) => run.taskDurationSec)),
          order: fresh.map((run) => ({
            id: run.id,
            rendererId: run.rendererCpu.activeRendererId,
            cpuSec: run.rendererCpu.activeRendererCpuSec,
            taskDurationSec: run.taskDurationSec,
          })),
        },
        combinedRendererCpuSec: summarize(allControlCpu),
        allPairwiseAbsoluteDifferencesSec: pairedSort(
          allControlCpu.flatMap((left, index) =>
            allControlCpu
              .slice(index + 1)
              .map((right) => Math.abs(right - left)),
          ),
        ).map((value) => round(value)),
        orderAndHostLoadByRun: hostPairs.map((run) => ({
          sequence: run.sequence,
          id: run.id,
          group: run.group,
          rendererCpuSec: run.rendererCpu.activeRendererCpuSec,
          hostCpuBusyPercent: run.hostCpuBusyPercent,
          nodeCpuSec: run.nodeCpuSec,
        })),
        correlationsByGroup,
        warmupControls: {
          rendererCpuSec: summarize(
            evidence.warmWindows.map(
              (run) => run.rendererCpu.activeRendererCpuSec,
            ),
          ),
          taskDurationSec: summarize(
            evidence.warmWindows.map((run) => run.taskDurationSec),
          ),
          note: "These start timing after 160 game periods, so their measured start state differs from cold P22 windows; compare the two warm controls only.",
        },
      },
      positiveControls: effectsByDose,
      gameParity: {
        allColdSameStateExport:
          new Set(noEvalCold.map((run) => run.exportSha256)).size <= 1,
        positivePairControlTreatmentParity: evidence.positiveControlPairs.map(
          (pair) => ({
            id: pair.id,
            sameExport:
              pair.control.exportSha256 === pair.treatment.exportSha256,
            sameRngCalls:
              pair.control.randomCalls === pair.treatment.randomCalls,
            sameRngState: pair.control.rngState === pair.treatment.rngState,
            sameNativeControlCallCount:
              pair.control.nativeControlCallCount ===
              pair.treatment.nativeControlCallCount,
            sameControlUsage:
              hash(JSON.stringify(pair.control.controlUsage)) ===
              hash(JSON.stringify(pair.treatment.controlUsage)),
          }),
        ),
        allMeasurementWindowsExpectedWorkTicks:
          periods / inputs.settings.tickRate,
      },
      identity: {
        verifiedEveryCounterRead: evidence.validity.processIdentity,
        browserProcessPids: evidence.inputs.chromium.map(({ group, pid }) => ({
          group,
          pid,
        })),
        rendererProcessIds: [
          ...new Set(
            [
              ...allRuns.map((run) => run.rendererCpu.activeRendererId),
              ...(evidence.positiveControlCalibration?.rendererProcessIds ??
                []),
            ].filter(Number.isFinite),
          ),
        ],
      },
    };
    const twoPercent = effectsByDose[2];
    const twoPercentInterval =
      twoPercent.controlDifferenceRendererCpu.summary?.ci95Mean;
    const twoPercentWorkloadMean =
      twoPercent.directWorkloadRendererCpuSec?.mean;
    const twoPercentEffectMean =
      twoPercent.controlDifferenceRendererCpu.summary?.mean;
    const twoPercentRecovery =
      Number.isFinite(twoPercentWorkloadMean) && twoPercentWorkloadMean > 0
        ? twoPercentEffectMean / twoPercentWorkloadMean
        : null;
    const allTwoPercentPairsPositive =
      twoPercent.controlDifferenceRendererCpu.effects.length === 2 &&
      twoPercent.controlDifferenceRendererCpu.effects.every(
        (entry) => entry.effect > 0,
      );
    evidence.analysis.measurementReadiness = {
      twoPercentWorkloadCpuRecoveredByNativeProcessCounter:
        Number.isFinite(twoPercentWorkloadMean) && twoPercentWorkloadMean > 0,
      pairedTotalCpuEffectRecoveryFraction: round(twoPercentRecovery, 3),
      twoPercentPairedEffectCiExcludesZero:
        Array.isArray(twoPercentInterval) && twoPercentInterval[0] > 0,
      bothCounterbalancedTwoPercentEffectsPositive: allTwoPercentPairsPositive,
      detectsCalibratedTwoPercentEffect:
        Array.isArray(twoPercentInterval) &&
        twoPercentInterval[0] > 0 &&
        allTwoPercentPairsPositive &&
        Number.isFinite(twoPercentRecovery) &&
        twoPercentRecovery >= 0.75 &&
        twoPercentRecovery <= 1.25,
      acceptanceRule:
        "Both counterbalanced paired CPU effects are positive, the two-sided 95% paired t interval excludes zero, and mean paired effect recovers 75–125% of the directly measured native renderer workload.",
    };
    evidence.analysis.optimizationOpportunityVerified = false;
    evidence.analysis.decision =
      !evidence.validity.processIdentity ||
      !evidence.validity.deterministicParity ||
      !evidence.validity.positiveControlCalibration
        ? "D — Measurement invalid"
        : evidence.analysis.measurementReadiness
              .detectsCalibratedTwoPercentEffect
          ? "A — Measurement ready"
          : evidence.analysis.optimizationOpportunityVerified
            ? "B — Measurement unresolved, hotspot established"
            : "C — No justified optimization";
    evidence.analysis.allocatorAdmission = evidence.analysis
      .measurementReadiness.detectsCalibratedTwoPercentEffect
      ? "eligible for a separately authorized future evaluation; not an allocator approval"
      : "not admitted; the 2% renderer CPU decision remains unresolved";
    evidence.validity.deterministicParity &&=
      evidence.analysis.gameParity.allColdSameStateExport &&
      evidence.analysis.gameParity.positivePairControlTreatmentParity.every(
        (pair) =>
          pair.sameExport &&
          pair.sameRngCalls &&
          pair.sameRngState &&
          pair.sameNativeControlCallCount &&
          pair.sameControlUsage,
      );
    evidence.status = "complete";
    evidence.finishedAt = new Date().toISOString();
    await writeEvidence(outputPath, evidence);
    console.log(
      JSON.stringify({
        outputPath,
        status: evidence.status,
        coldWindows: evidence.coldWindows.length,
        positivePairs: evidence.positiveControlPairs.length,
      }),
    );
  } catch (error) {
    evidence.status = "failed";
    evidence.failure = {
      name: error?.name ?? "Error",
      message: String(error?.message ?? error),
    };
    evidence.finishedAt = new Date().toISOString();
    await writeEvidence(outputPath, evidence);
    throw error;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
