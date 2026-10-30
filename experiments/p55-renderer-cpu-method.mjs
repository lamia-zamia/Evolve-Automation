import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import { nativeTraceCalls } from "./p54-1-activation-lifecycle-correction-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAVE_PATH = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
);
const SETTINGS_PATH = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const GAME_PATH = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const BUNDLE_PATH = path.join(
  root,
  "test-artifacts/local/evolve_automation.test-surface.user.js",
);
const BASELINE_TUNED_PATH = path.join(
  root,
  "test-artifacts/benchmark/settings/baseline-tuned.json",
);
const DEFAULT_OUTPUT_PATH = path.join(
  root,
  "test-artifacts/benchmark/tmp/p55-renderer-cpu-method-pilot.json",
);

export const P55_PLAN = Object.freeze({
  pilotPeriodCap: 4_000,
  initializationWarmupPeriods: 400,
  initializationWorkloadWarmupIterations: 1_000_000,
  calibrationPeriodsPerWindow: 56,
  exploratoryCalibrationIterations: Object.freeze([
    0, 30_000_000, 0, 60_000_000, 0, 90_000_000, 0,
  ]),
  verificationCalibrationWindows: Object.freeze([
    "placebo",
    "two",
    "placebo",
    "five",
    "placebo",
  ]),
  measurementPeriodsPerWindow: 48,
  placeboBlocks: 3,
  blocksPerPositiveControl: 4,
  semanticParityPeriodsPerArm: 160,
  scheduleSeed: 0x55c0ffee,
  rendererAttributionShare: 0.98,
  calibrationToleranceFraction: 0.25,
  twoPercentConsistencyTolerancePercentagePoints: 0.5,
  materialOrderEffectPercentagePoints: 1,
});

export const P55_PILOT_PERIODS =
  P55_PLAN.exploratoryCalibrationIterations.length *
    P55_PLAN.calibrationPeriodsPerWindow +
  P55_PLAN.verificationCalibrationWindows.length *
    P55_PLAN.calibrationPeriodsPerWindow +
  (P55_PLAN.placeboBlocks + 2 * P55_PLAN.blocksPerPositiveControl) *
    4 *
    P55_PLAN.measurementPeriodsPerWindow +
  3 * P55_PLAN.semanticParityPeriodsPerArm;

assert.ok(P55_PILOT_PERIODS <= P55_PLAN.pilotPeriodCap);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableJson = (value) => JSON.stringify(value);
const option = (name, fallback) =>
  process.argv
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function createP55Schedule(seed = P55_PLAN.scheduleSeed) {
  const specifications = [];
  for (let index = 0; index < P55_PLAN.placeboBlocks; index++)
    specifications.push({ condition: "placebo", replicate: index + 1 });
  for (const condition of ["two", "five"])
    for (let index = 0; index < P55_PLAN.blocksPerPositiveControl; index++)
      specifications.push({ condition, replicate: index + 1 });

  const random = seededRandom(seed);
  const shuffle = (values) => {
    for (let index = values.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [values[index], values[swap]] = [values[swap], values[index]];
    }
    return values;
  };
  const orientations = {
    placebo: shuffle(["ABBA", "BAAB", random() < 0.5 ? "ABBA" : "BAAB"]),
    two: shuffle(["ABBA", "ABBA", "BAAB", "BAAB"]),
    five: shuffle(["ABBA", "ABBA", "BAAB", "BAAB"]),
  };
  const orientationIndex = { placebo: 0, two: 0, five: 0 };
  for (const specification of specifications) {
    specification.orientation =
      orientations[specification.condition][
        orientationIndex[specification.condition]++
      ];
  }
  for (let index = specifications.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [specifications[index], specifications[swap]] = [
      specifications[swap],
      specifications[index],
    ];
  }

  const blocks = specifications.map((specification, index) => {
    const orientation = specification.orientation;
    const roles =
      orientation === "ABBA"
        ? ["control", "treatment", "treatment", "control"]
        : ["treatment", "control", "control", "treatment"];
    const windows = roles.map((role, position) => ({
      windowIndex: index * 4 + position,
      blockId: `B${String(index + 1).padStart(2, "0")}`,
      condition: specification.condition,
      replicate: specification.replicate,
      orientation,
      position: position + 1,
      role,
      dose:
        specification.condition === "placebo" || role === "control"
          ? "placebo"
          : specification.condition,
      periods: P55_PLAN.measurementPeriodsPerWindow,
    }));
    return {
      blockId: `B${String(index + 1).padStart(2, "0")}`,
      condition: specification.condition,
      replicate: specification.replicate,
      orientation,
      windows,
    };
  });

  return {
    algorithm: "Node LCG and Fisher-Yates; independent of game RNG",
    seed,
    blockCount: blocks.length,
    windowCount: blocks.reduce((sum, block) => sum + block.windows.length, 0),
    blocks,
  };
}

export function countNativeTraceRows(trace, predicate = () => true) {
  const calls = nativeTraceCalls(trace);
  const rawTraceRows = trace.filter(predicate).length;
  const nativeApiInvocations = calls.filter(predicate).length;
  assert.equal(rawTraceRows, nativeApiInvocations * 2);
  return { rawTraceRows, nativeApiInvocations };
}

export function hostCpuBusyPercent(before, after) {
  if (before.length !== after.length || before.length === 0) return null;
  let total = 0;
  let idle = 0;
  for (let index = 0; index < before.length; index++) {
    const previous = before[index].times;
    const current = after[index].times;
    for (const key of ["user", "nice", "sys", "irq", "idle"]) {
      const delta = current[key] - previous[key];
      if (delta < 0) return null;
      total += delta;
      if (key === "idle") idle += delta;
    }
  }
  return total > 0 ? (100 * (total - idle)) / total : null;
}

function cpuSnapshot() {
  return os.cpus().map((cpu) => ({
    speedMHz: cpu.speed,
    times: { ...cpu.times },
  }));
}

function callName(controlKey) {
  const separator = controlKey.lastIndexOf(".");
  return separator < 0 ? "unknown" : controlKey.slice(separator + 1);
}

export function deltaControlUsage(before, after) {
  const deltas = {};
  for (const key of new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])) {
    const previous = before?.[key] ?? { returned: 0, threw: 0 };
    const current = after?.[key] ?? { returned: 0, threw: 0 };
    const returned = current.returned - previous.returned;
    const threw = current.threw - previous.threw;
    assert.ok(
      returned >= 0 && threw >= 0,
      `control usage regressed for ${key}`,
    );
    if (returned !== 0 || threw !== 0) deltas[key] = { returned, threw };
  }
  return deltas;
}

export function summarizeControlUsage(usage) {
  const byMethod = {};
  const byControl = {};
  let nativeActions = 0;
  let researchActions = 0;
  let jobAssignments = 0;
  let otherControlCalls = 0;
  let threw = 0;
  for (const [key, counts] of Object.entries(usage)) {
    const method = callName(key);
    const calls = counts.returned + counts.threw;
    byControl[key] = calls;
    threw += counts.threw;
    byMethod[method] = (byMethod[method] ?? 0) + calls;
    if (method === "action") {
      nativeActions += calls;
      if (key.startsWith("tech-")) researchActions += calls;
    } else if (method === "setDefault") jobAssignments += calls;
    else otherControlCalls += calls;
  }
  return {
    byMethod,
    byControl,
    nativeActionInvocations: nativeActions,
    nativeResearchActionInvocations: researchActions,
    jobAssignmentInvocations: jobAssignments,
    otherControlInvocations: otherControlCalls,
    thrownInvocations: threw,
    totalNativeControlInvocations:
      nativeActions + jobAssignments + otherControlCalls,
  };
}

export function summarize(values) {
  const count = values.length;
  if (count === 0)
    return {
      sampleCount: 0,
      mean: null,
      standardDeviation: null,
      ci95: null,
    };
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  if (count === 1)
    return {
      sampleCount: 1,
      mean,
      standardDeviation: null,
      ci95: null,
    };
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1);
  const standardDeviation = Math.sqrt(variance);
  const t95 = {
    2: 12.706,
    3: 4.303,
    4: 3.182,
    5: 2.776,
    6: 2.571,
    7: 2.447,
    8: 2.365,
    9: 2.306,
    10: 2.262,
  }[count];
  if (t95 === undefined)
    return {
      sampleCount: count,
      mean,
      standardDeviation,
      ci95: null,
    };
  const halfWidth = (t95 * standardDeviation) / Math.sqrt(count);
  return {
    sampleCount: count,
    mean,
    standardDeviation,
    ci95: [mean - halfWidth, mean + halfWidth],
  };
}

export function estimateBlocksFor80PercentPower(
  standardDeviationPercentagePoints,
  targetEffectPercentagePoints = 2,
) {
  if (
    !Number.isFinite(standardDeviationPercentagePoints) ||
    standardDeviationPercentagePoints <= 0
  )
    return null;
  const normalApproximation =
    ((1.96 + 0.84) * standardDeviationPercentagePoints) /
    targetEffectPercentagePoints;
  return Math.max(2, Math.ceil(normalApproximation ** 2));
}

function finiteDelta(after, before) {
  if (!Number.isFinite(after) || !Number.isFinite(before)) return null;
  const delta = after - before;
  return delta >= 0 ? delta : null;
}

function processDeltaByKey(beforeRows, afterRows) {
  const before = new Map(
    beforeRows.map((row) => [`${row.type}:${row.id}`, row]),
  );
  const after = new Map(afterRows.map((row) => [`${row.type}:${row.id}`, row]));
  return Object.fromEntries(
    [...after.entries()].map(([key, row]) => [
      key,
      finiteDelta(row.cpuSec, before.get(key)?.cpuSec),
    ]),
  );
}

function rendererPids(rows) {
  return rows
    .filter((row) => row.type === "renderer")
    .map((row) => String(row.id))
    .sort();
}

function processRowsByType(rows) {
  return rows.reduce((out, row) => {
    out[row.type] = (out[row.type] ?? 0) + 1;
    return out;
  }, {});
}

function nodeCpuDelta(before, after) {
  return {
    userMicros: after.user - before.user,
    systemMicros: after.system - before.system,
  };
}

async function sampleBoundary(runner, session) {
  const timestampUtc = new Date().toISOString();
  const monotonicStartedMs = performance.now();
  const nodeCpuBefore = process.cpuUsage();
  const hostCpuBefore = cpuSnapshot();
  const processSampleStartedUtc = new Date().toISOString();
  const processSampleStartedMs = performance.now();
  const processCpuRows = await runner.processCpu();
  const processSampleCompletedMs = performance.now();
  const processSampleCompletedUtc = new Date().toISOString();
  const taskMetricsStartedUtc = new Date().toISOString();
  const taskMetricsStartedMs = performance.now();
  const taskMetrics = await session.metrics();
  const taskMetricsCompletedMs = performance.now();
  const taskMetricsCompletedUtc = new Date().toISOString();
  const hostCpuAfter = cpuSnapshot();
  const nodeCpuAfter = process.cpuUsage();
  return {
    timestampUtc,
    monotonicStartedMs,
    completedMonotonicMs: performance.now(),
    processSampleStartedMs,
    processSampleCompletedMs,
    processSampleStartedUtc,
    processSampleCompletedUtc,
    processSampleDurationMs: processSampleCompletedMs - processSampleStartedMs,
    taskMetricsStartedMs,
    taskMetricsCompletedMs,
    taskMetricsStartedUtc,
    taskMetricsCompletedUtc,
    taskMetricsDurationMs: taskMetricsCompletedMs - taskMetricsStartedMs,
    processCpuRows,
    processRowsByType: processRowsByType(processCpuRows),
    taskMetrics,
    hostCpuBefore,
    hostCpuAfter,
    hostCpuBusyPercent: hostCpuBusyPercent(hostCpuBefore, hostCpuAfter),
    nodeCpuBefore,
    nodeCpuAfter,
    nodeCpuSampleOverheadMicros: nodeCpuDelta(nodeCpuBefore, nodeCpuAfter),
  };
}

function requireMetric(metrics, key) {
  assert.ok(Number.isFinite(metrics?.[key]), `missing CDP metric ${key}`);
  return metrics[key];
}

function makeMeasurementWindow({
  descriptor,
  periods,
  periodStart,
  periodEnd,
  reloads,
  before,
  after,
  diagnosticsBefore,
  diagnosticsAfter,
  workloadBefore,
  workloadAfter,
  activeRendererPid,
  expectedRendererPids,
  expectedWorkCycles,
}) {
  const usageDelta = deltaControlUsage(
    diagnosticsBefore.controlUsage,
    diagnosticsAfter.controlUsage,
  );
  const controlSummary = summarizeControlUsage(usageDelta);
  const processDeltas = processDeltaByKey(
    before.processCpuRows,
    after.processCpuRows,
  );
  const rendererCpuSec = processDeltas[`renderer:${activeRendererPid}`] ?? null;
  const taskDurationSec = finiteDelta(
    after.taskMetrics.TaskDuration,
    before.taskMetrics.TaskDuration,
  );
  const scriptDurationSec = finiteDelta(
    after.taskMetrics.ScriptDuration,
    before.taskMetrics.ScriptDuration,
  );
  const workCycles = workloadAfter.cycles - workloadBefore.cycles;
  const processPidsBefore = rendererPids(before.processCpuRows);
  const processPidsAfter = rendererPids(after.processCpuRows);
  const callbackDoseIterations = workloadBefore.iterations;
  const invalidReasons = [];
  const expectedWorkloadCondition =
    descriptor.stage === "exploratory-calibration"
      ? "placebo"
      : descriptor.dose;
  if (periodEnd - periodStart !== periods)
    invalidReasons.push("corrupted-period-boundary");
  if (reloads !== 0 || diagnosticsAfter.loads !== diagnosticsBefore.loads)
    invalidReasons.push("page-or-process-lifecycle-churn");
  if (stableJson(processPidsBefore) !== stableJson(processPidsAfter))
    invalidReasons.push("renderer-process-churn");
  if (
    expectedRendererPids !== undefined &&
    stableJson(processPidsBefore) !== stableJson(expectedRendererPids)
  )
    invalidReasons.push("renderer-attribution-changed");
  if (
    activeRendererPid !== null &&
    !processPidsBefore.includes(String(activeRendererPid))
  )
    invalidReasons.push("active-renderer-pid-missing");
  if (workCycles !== expectedWorkCycles)
    invalidReasons.push("work-cycle-cadence-changed");
  if (
    workloadBefore.condition !== expectedWorkloadCondition ||
    workloadAfter.condition !== expectedWorkloadCondition ||
    workloadBefore.iterations !== workloadAfter.iterations
  )
    invalidReasons.push("incorrect-treatment-placement");
  const rendererDeltas = Object.entries(processDeltas).filter(([key]) =>
    key.startsWith("renderer:"),
  );
  if (
    taskDurationSec === null ||
    rendererDeltas.length === 0 ||
    rendererDeltas.some(([, delta]) => delta === null) ||
    (activeRendererPid !== null && rendererCpuSec === null)
  )
    invalidReasons.push("corrupted-cpu-measurement-boundary");
  if (diagnosticsAfter.events.some((event) => event.kind !== "log"))
    invalidReasons.push("gameplay-or-page-error");

  return {
    ...descriptor,
    periodStart,
    periodEnd,
    periodsAdvanced: periodEnd - periodStart,
    reloads,
    rendererPid: activeRendererPid,
    rendererPidsBefore: processPidsBefore,
    rendererPidsAfter: processPidsAfter,
    expectedRendererPids,
    processCpuRowsBefore: before.processCpuRows,
    processCpuRowsAfter: after.processCpuRows,
    processCpuDeltasByTypeAndPid: processDeltas,
    totalRendererCpuSec: Object.entries(processDeltas)
      .filter(([key]) => key.startsWith("renderer:"))
      .reduce((sum, [, value]) => sum + (value ?? 0), 0),
    activeRendererCpuSec: rendererCpuSec,
    taskMetricsBefore: before.taskMetrics,
    taskMetricsAfter: after.taskMetrics,
    taskDurationSec,
    scriptDurationSec,
    jsHeapUsedDeltaBytes: finiteDelta(
      after.taskMetrics.JSHeapUsedSize,
      before.taskMetrics.JSHeapUsedSize,
    ),
    jsHeapUsedDropped:
      after.taskMetrics.JSHeapUsedSize < before.taskMetrics.JSHeapUsedSize,
    jsHeapTotalDeltaBytes: finiteDelta(
      after.taskMetrics.JSHeapTotalSize,
      before.taskMetrics.JSHeapTotalSize,
    ),
    domNodeDelta:
      Number.isFinite(after.taskMetrics.Nodes) &&
      Number.isFinite(before.taskMetrics.Nodes)
        ? after.taskMetrics.Nodes - before.taskMetrics.Nodes
        : null,
    workCycles,
    expectedWorkCycles,
    callbackDoseIterations,
    cumulativeWorkloadIterations: callbackDoseIterations * workCycles,
    advanceWallMs: descriptor.advanceWallMs,
    runnerPeriodsPerSecond:
      (1000 * (periodEnd - periodStart)) / descriptor.advanceWallMs,
    advanceWallMsPerPeriod:
      descriptor.advanceWallMs / (periodEnd - periodStart),
    hostCpuBusyPercent: hostCpuBusyPercent(
      before.hostCpuBefore,
      after.hostCpuAfter,
    ),
    nodeCpuDeltaMicros: nodeCpuDelta(before.nodeCpuBefore, after.nodeCpuAfter),
    nodeCpuSampleOverheadMicros: {
      before: before.nodeCpuSampleOverheadMicros,
      after: after.nodeCpuSampleOverheadMicros,
    },
    hostCpuSamples: {
      before: before.hostCpuBefore,
      after: after.hostCpuAfter,
    },
    sampleTimestamps: {
      before: {
        utc: before.timestampUtc,
        monotonicMs: before.monotonicStartedMs,
        processSampleStartedUtc: before.processSampleStartedUtc,
        processSampleCompletedUtc: before.processSampleCompletedUtc,
        processSampleStartedMonotonicMs: before.processSampleStartedMs,
        processSampleCompletedMonotonicMs: before.processSampleCompletedMs,
        processSampleDurationMs: before.processSampleDurationMs,
        taskMetricsStartedUtc: before.taskMetricsStartedUtc,
        taskMetricsCompletedUtc: before.taskMetricsCompletedUtc,
        taskMetricsStartedMonotonicMs: before.taskMetricsStartedMs,
        taskMetricsCompletedMonotonicMs: before.taskMetricsCompletedMs,
        taskMetricsDurationMs: before.taskMetricsDurationMs,
      },
      after: {
        utc: after.timestampUtc,
        monotonicMs: after.monotonicStartedMs,
        processSampleStartedUtc: after.processSampleStartedUtc,
        processSampleCompletedUtc: after.processSampleCompletedUtc,
        processSampleStartedMonotonicMs: after.processSampleStartedMs,
        processSampleCompletedMonotonicMs: after.processSampleCompletedMs,
        processSampleDurationMs: after.processSampleDurationMs,
        taskMetricsStartedUtc: after.taskMetricsStartedUtc,
        taskMetricsCompletedUtc: after.taskMetricsCompletedUtc,
        taskMetricsStartedMonotonicMs: after.taskMetricsStartedMs,
        taskMetricsCompletedMonotonicMs: after.taskMetricsCompletedMs,
        taskMetricsDurationMs: after.taskMetricsDurationMs,
      },
    },
    controlUsageDelta: usageDelta,
    nativeControlSummary: controlSummary,
    diagnostics: {
      loadsBefore: diagnosticsBefore.loads,
      loadsAfter: diagnosticsAfter.loads,
      randomCallsBefore: diagnosticsBefore.randomCalls,
      randomCallsAfter: diagnosticsAfter.randomCalls,
      rngStateBefore: diagnosticsBefore.rngState,
      rngStateAfter: diagnosticsAfter.rngState,
      countsBefore: diagnosticsBefore.counts,
      countsAfter: diagnosticsAfter.counts,
      eventsBefore: diagnosticsBefore.events,
      eventsAfter: diagnosticsAfter.events,
    },
    valid: invalidReasons.length === 0,
    invalidReasons,
  };
}

function attributeRendererPid(calibrationWindows) {
  const rendererSets = calibrationWindows.flatMap((window) => [
    rendererPids(window.processCpuRowsBefore),
    rendererPids(window.processCpuRowsAfter),
  ]);
  assert.ok(rendererSets.length > 0 && rendererSets[0].length > 0);
  const expected = rendererSets[0];
  assert.ok(
    rendererSets.every((ids) => stableJson(ids) === stableJson(expected)),
    "renderer process set changed during calibration",
  );
  const totals = new Map(expected.map((pid) => [pid, 0]));
  for (const window of calibrationWindows) {
    const deltas = processDeltaByKey(
      window.processCpuRowsBefore,
      window.processCpuRowsAfter,
    );
    for (const pid of expected) {
      const delta = deltas[`renderer:${pid}`];
      assert.ok(
        Number.isFinite(delta),
        `renderer ${pid} is missing a CPU sample`,
      );
      totals.set(pid, totals.get(pid) + delta);
    }
  }
  const ranked = [...totals].toSorted((left, right) => right[1] - left[1]);
  const totalCpu = ranked.reduce((sum, [, cpu]) => sum + cpu, 0);
  const [pid, activeCpu] = ranked[0];
  assert.ok(
    totalCpu > 0,
    "renderer process CPU did not advance in calibration",
  );
  const share = activeCpu / totalCpu;
  assert.ok(
    share >= P55_PLAN.rendererAttributionShare,
    `active renderer share ${share} is ambiguous`,
  );
  return {
    activeRendererPid: Number(pid),
    rendererPids: expected.map(Number),
    activeRendererCpuSec: activeCpu,
    allRendererCpuSec: totalCpu,
    activeRendererShare: share,
    attributionMethod:
      "single game page; calibration CPU attribution from stable browser-target SystemInfo renderer rows",
  };
}

function rendererRate(window, pid) {
  const deltas = processDeltaByKey(
    window.processCpuRowsBefore,
    window.processCpuRowsAfter,
  );
  const cpu = deltas[`renderer:${pid}`];
  assert.ok(Number.isFinite(cpu) && window.workCycles > 0);
  return cpu / window.workCycles;
}

export function fitCalibration(exploratoryWindows, activeRendererPid) {
  const placeboWindows = exploratoryWindows.filter(
    (window) => window.callbackDoseIterations === 0,
  );
  const baselineRates = placeboWindows.map((window) =>
    rendererRate(window, activeRendererPid),
  );
  const baselineRate =
    baselineRates.reduce((sum, rate) => sum + rate, 0) / baselineRates.length;
  assert.ok(baselineRate > 0);
  const doseRows = [];
  for (const [index, window] of exploratoryWindows.entries()) {
    if (window.callbackDoseIterations === 0) continue;
    const baselineLocal =
      (rendererRate(exploratoryWindows[index - 1], activeRendererPid) +
        rendererRate(exploratoryWindows[index + 1], activeRendererPid)) /
      2;
    const treatmentRate = rendererRate(window, activeRendererPid);
    doseRows.push({
      iterations: window.callbackDoseIterations,
      baselineRatePerCycleSec: baselineLocal,
      treatmentRatePerCycleSec: treatmentRate,
      incrementalRatePerCycleSec: treatmentRate - baselineLocal,
      observedIncrementPercent:
        (100 * (treatmentRate - baselineLocal)) / baselineLocal,
    });
  }
  const slope =
    doseRows.reduce(
      (sum, row) => sum + row.iterations * row.incrementalRatePerCycleSec,
      0,
    ) / doseRows.reduce((sum, row) => sum + row.iterations ** 2, 0);
  assert.ok(slope > 0, "renderer CPU did not respond to callback workload");
  const doseResponseMonotonic = doseRows.every(
    (row, index) =>
      row.incrementalRatePerCycleSec > 0 &&
      (index === 0 ||
        row.incrementalRatePerCycleSec >
          doseRows[index - 1].incrementalRatePerCycleSec),
  );
  const twoIterations = Math.round((0.02 * baselineRate) / slope);
  const fiveIterations = Math.round((0.05 * baselineRate) / slope);
  assert.ok(
    twoIterations > 0 && fiveIterations > twoIterations,
    "renderer CPU calibration produced invalid positive doses",
  );
  return {
    baselineRendererCpuSecPerWorkCycle: baselineRate,
    rendererCpuSecPerIterationPerWorkCycle: slope,
    exploratoryDoses: doseRows,
    doseResponseMonotonic,
    twoIterations,
    fiveIterations,
    targetTwoPercent: (100 * (slope * twoIterations)) / baselineRate,
    targetFivePercent: (100 * (slope * fiveIterations)) / baselineRate,
  };
}

function calibrationVerification(verification, activeRendererPid) {
  const verificationResult = {};
  for (const condition of ["two", "five"]) {
    const doseWindow = verification.find((window) => window.dose === condition);
    const placeboWindows = verification.filter(
      (window) => window.dose === "placebo",
    );
    const doseIndex = verification.indexOf(doseWindow);
    const beforeControl = [...placeboWindows]
      .filter((window) => verification.indexOf(window) < doseIndex)
      .at(-1);
    const afterControl = placeboWindows.find(
      (window) => verification.indexOf(window) > doseIndex,
    );
    assert.ok(doseWindow && beforeControl && afterControl);
    const baselineRate =
      (rendererRate(beforeControl, activeRendererPid) +
        rendererRate(afterControl, activeRendererPid)) /
      2;
    const treatmentRate = rendererRate(doseWindow, activeRendererPid);
    const measuredPercent =
      (100 * (treatmentRate - baselineRate)) / baselineRate;
    const targetPercent = condition === "two" ? 2 : 5;
    const relativeError =
      Math.abs(measuredPercent - targetPercent) / targetPercent;
    verificationResult[condition] = {
      targetPercent,
      measuredPercent,
      relativeError,
      withinCalibrationTolerance:
        relativeError <= P55_PLAN.calibrationToleranceFraction,
      rendererCpuSecPerCycle: treatmentRate,
      baselineRendererCpuSecPerCycle: baselineRate,
    };
  }
  return verificationResult;
}

function summarizeState(state) {
  const species = state.race?.species ?? null;
  const resources = Object.fromEntries(
    ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((name) => [
      name,
      state.resource?.[name]
        ? {
            amount: state.resource[name].amount ?? null,
            diff: state.resource[name].diff ?? null,
          }
        : null,
    ]),
  );
  const buildings = Object.fromEntries(
    Object.entries(state.city ?? {})
      .filter(([, value]) => Number(value?.count ?? 0) !== 0)
      .map(([key, value]) => [key, value.count]),
  );
  const workers = Object.fromEntries(
    Object.entries(state.civic ?? {})
      .filter(([, value]) => Number(value?.workers ?? 0) !== 0)
      .map(([key, value]) => [key, value.workers]),
  );
  return {
    period: state.stats?.period ?? null,
    day: state.stats?.days ?? null,
    reset: state.stats?.reset ?? null,
    species,
    universe: state.race?.universe ?? null,
    totalUniverses: state.stats?.universes ?? null,
    ascensions: state.stats?.ascend ?? null,
    population: state.resource?.[species]?.amount ?? null,
    resources,
    buildings,
    workers,
    technologyCount: Object.keys(state.tech ?? {}).length,
    technologyLevels: state.tech ?? {},
  };
}

function blockEffect(block, windowsByIndex) {
  const windows = block.windows.map((entry) =>
    windowsByIndex.get(entry.windowIndex),
  );
  if (windows.some((window) => !window?.valid)) return null;
  const controlRates = windows
    .filter((window) => window.role === "control")
    .map((window) => window.activeRendererCpuSec / window.workCycles);
  const treatmentRates = windows
    .filter((window) => window.role === "treatment")
    .map((window) => window.activeRendererCpuSec / window.workCycles);
  const controlTaskRates = windows
    .filter((window) => window.role === "control")
    .map((window) => window.taskDurationSec / window.workCycles);
  const treatmentTaskRates = windows
    .filter((window) => window.role === "treatment")
    .map((window) => window.taskDurationSec / window.workCycles);
  const mean = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const controlCpu = mean(controlRates);
  const treatmentCpu = mean(treatmentRates);
  const controlTask = mean(controlTaskRates);
  const treatmentTask = mean(treatmentTaskRates);
  return {
    blockId: block.blockId,
    condition: block.condition,
    replicate: block.replicate,
    orientation: block.orientation,
    controlRendererCpuSecPerWorkCycle: controlCpu,
    treatmentRendererCpuSecPerWorkCycle: treatmentCpu,
    cpuEffectPercent: 100 * (treatmentCpu / controlCpu - 1),
    controlTaskDurationSecPerWorkCycle: controlTask,
    treatmentTaskDurationSecPerWorkCycle: treatmentTask,
    taskDurationEffectPercent: 100 * (treatmentTask / controlTask - 1),
    controlRunnerPeriodsPerSecond: mean(
      windows
        .filter((window) => window.role === "control")
        .map((window) => window.runnerPeriodsPerSecond),
    ),
    treatmentRunnerPeriodsPerSecond: mean(
      windows
        .filter((window) => window.role === "treatment")
        .map((window) => window.runnerPeriodsPerSecond),
    ),
    runnerSchedulingEffectPercent:
      100 *
      (mean(
        windows
          .filter((window) => window.role === "treatment")
          .map((window) => window.runnerPeriodsPerSecond),
      ) /
        mean(
          windows
            .filter((window) => window.role === "control")
            .map((window) => window.runnerPeriodsPerSecond),
        ) -
        1),
    controlWindowIndices: windows
      .filter((window) => window.role === "control")
      .map((window) => window.windowIndex),
    treatmentWindowIndices: windows
      .filter((window) => window.role === "treatment")
      .map((window) => window.windowIndex),
    workCycles: windows.reduce((sum, window) => sum + window.workCycles, 0),
    totalNativeControlCalls: windows.reduce(
      (sum, window) =>
        sum + window.nativeControlSummary.totalNativeControlInvocations,
      0,
    ),
    stateStart: block.stateStart ?? null,
    stateEnd: block.stateEnd ?? null,
  };
}

export function analyzeP55Blocks(blocks, windows) {
  const windowsByIndex = new Map(
    windows.map((window) => [window.windowIndex, window]),
  );
  const blockResults = blocks.map((block) =>
    blockEffect(block, windowsByIndex),
  );
  const byCondition = {};
  for (const condition of ["placebo", "two", "five"]) {
    const selected = blockResults.filter(
      (block) => block?.condition === condition,
    );
    byCondition[condition] = {
      rendererCpuEffect: summarize(
        selected.map((block) => block.cpuEffectPercent),
      ),
      taskDurationEffect: summarize(
        selected.map((block) => block.taskDurationEffectPercent),
      ),
      runnerSchedulingEffect: summarize(
        selected.map((block) => block.runnerSchedulingEffectPercent),
      ),
      blockEffects: selected,
    };
  }
  const orderEffects = {};
  for (const condition of ["two", "five"]) {
    const selected = blockResults.filter(
      (block) => block?.condition === condition,
    );
    const abba = selected
      .filter((block) => block.orientation === "ABBA")
      .map((block) => block.cpuEffectPercent);
    const baab = selected
      .filter((block) => block.orientation === "BAAB")
      .map((block) => block.cpuEffectPercent);
    const mean = (values) =>
      values.length === 0
        ? null
        : values.reduce((sum, value) => sum + value, 0) / values.length;
    const difference = mean(abba) - mean(baab);
    orderEffects[condition] = {
      abbaBlockEffectsPercent: abba,
      baabBlockEffectsPercent: baab,
      abbaMeanPercent: mean(abba),
      baabMeanPercent: mean(baab),
      abbaMinusBaabPercentagePoints: difference,
      material:
        Math.abs(difference) > P55_PLAN.materialOrderEffectPercentagePoints,
      materialityThresholdPercentagePoints:
        P55_PLAN.materialOrderEffectPercentagePoints,
    };
  }
  const allRates = windows
    .filter((window) => window.valid && window.workCycles > 0)
    .map((window) => ({
      index: window.windowIndex,
      cpuPerCycle: window.activeRendererCpuSec / window.workCycles,
      period: window.periodStart,
    }));
  return {
    blockEffects: blockResults,
    byCondition,
    orderEffects,
    windowCpuTrend: linearTrend(allRates.map((row) => row.cpuPerCycle)),
    windowPeriodSpan: {
      first: allRates[0]?.period ?? null,
      last: allRates.at(-1)?.period ?? null,
    },
    adjacentPlaceboComparisons: byCondition.placebo.blockEffects.map(
      (block) => ({
        blockId: block.blockId,
        effectPercent: block.cpuEffectPercent,
      }),
    ),
    allWindowsRetained: windows.length,
    invalidWindowCount: windows.filter((window) => !window.valid).length,
  };
}

function linearTrend(values) {
  if (values.length < 2) return { slopePerIndex: null, rSquared: null };
  const xs = values.map((_, index) => index);
  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const numerator = values.reduce(
    (sum, value, index) => sum + (xs[index] - xMean) * (value - yMean),
    0,
  );
  const denominator = xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const slopePerIndex = numerator / denominator;
  const total = values.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const residual = values.reduce(
    (sum, value, index) =>
      sum + (value - (yMean + slopePerIndex * (xs[index] - xMean))) ** 2,
    0,
  );
  return {
    slopePerIndex,
    rSquared: total === 0 ? null : 1 - residual / total,
  };
}

function summarizeStateDelta(before, after) {
  return {
    dayDelta:
      after.day === null || before.day === null ? null : after.day - before.day,
    populationDelta:
      after.population === null || before.population === null
        ? null
        : after.population - before.population,
    technologyCountDelta: after.technologyCount - before.technologyCount,
    changedTechnologyLevels: changedKeys(
      before.technologyLevels,
      after.technologyLevels,
    ),
    changedBuildings: changedKeys(before.buildings, after.buildings),
    changedWorkers: changedKeys(before.workers, after.workers),
    changedResources: changedKeys(before.resources, after.resources),
    resetChanged: after.reset !== before.reset,
    speciesChanged: after.species !== before.species,
    universeChanged: after.universe !== before.universe,
    totalUniversesDelta: after.totalUniverses - before.totalUniverses,
    ascensionsDelta: after.ascensions - before.ascensions,
  };
}

function changedKeys(before, after) {
  const changes = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
    if (stableJson(before[key]) !== stableJson(after[key]))
      changes[key] = { before: before[key] ?? null, after: after[key] ?? null };
  return changes;
}

function verifyParityRuns(runs) {
  const baseline = runs.find((run) => run.condition === "placebo");
  assert.ok(baseline);
  const parity = Object.fromEntries(
    runs
      .filter((run) => run.condition !== "placebo")
      .map((run) => [
        run.condition,
        {
          exportEqual: run.exportSha256 === baseline.exportSha256,
          stateEqual: run.stateSha256 === baseline.stateSha256,
          rngEqual:
            run.randomCalls === baseline.randomCalls &&
            run.rngState === baseline.rngState,
          nativeControlUsageEqual:
            stableJson(run.controlUsage) === stableJson(baseline.controlUsage),
          nativeApiTraceEqual:
            run.nativeApiTraceSha256 === baseline.nativeApiTraceSha256,
          nativeApiInvocationCountEqual:
            run.nativeApiInvocations === baseline.nativeApiInvocations,
          workCycleCountEqual: run.workCycles === baseline.workCycles,
        },
      ]),
  );
  const passed = Object.values(parity).every((result) =>
    Object.values(result).every(Boolean),
  );
  return { passed, baselineCondition: "placebo", comparisons: parity };
}

async function initializeWorkload(session, doses = undefined) {
  return session.evaluate((frozenDoses) => {
    let calibrationIterations = 0;
    let frozen = null;
    let condition = "placebo";
    let cycles = 0;
    let sink = 0;
    const workload = () => {
      cycles += 1;
      const iterations =
        frozen === null ? calibrationIterations : frozen[condition];
      let accumulator = sink | 0;
      for (let index = 0; index < iterations; index += 1)
        accumulator =
          (Math.imul(accumulator ^ index, 1_664_525) + 1_013_904_223) | 0;
      sink = accumulator;
    };
    const controller = Object.freeze({
      setCalibrationIterations(value) {
        if (frozen !== null || !Number.isSafeInteger(value) || value < 0)
          throw new Error("P55 calibration dose is invalid or already frozen");
        calibrationIterations = value;
      },
      freezeDoses(twoIterations, fiveIterations) {
        if (
          frozen !== null ||
          !Number.isSafeInteger(twoIterations) ||
          !Number.isSafeInteger(fiveIterations) ||
          twoIterations <= 0 ||
          fiveIterations <= twoIterations
        )
          throw new Error("P55 positive-control doses cannot be frozen");
        frozen = Object.freeze({
          placebo: 0,
          two: twoIterations,
          five: fiveIterations,
        });
        calibrationIterations = 0;
        condition = "placebo";
      },
      selectCondition(value) {
        if (frozen === null || !Object.hasOwn(frozen, value))
          throw new Error(
            "P55 condition is unavailable or doses are not frozen",
          );
        condition = value;
      },
      read() {
        return {
          cycles,
          sink,
          condition,
          iterations:
            frozen === null ? calibrationIterations : frozen[condition],
          dosesFrozen: frozen !== null,
        };
      },
    });
    const existing = window.__EA_TEST_HOOKS__;
    if (
      existing !== undefined &&
      (existing === null || typeof existing !== "object")
    )
      throw new Error("P55 expected the test-hook object");
    const replacement = {};
    if (existing !== undefined)
      Object.defineProperties(
        replacement,
        Object.getOwnPropertyDescriptors(existing),
      );
    Object.defineProperties(replacement, {
      p32GameAdvanceWorkload: {
        value: workload,
        enumerable: true,
        writable: false,
        configurable: false,
      },
      p55WorkloadControl: {
        value: controller,
        enumerable: true,
        writable: false,
        configurable: false,
      },
    });
    window.__EA_TEST_HOOKS__ = replacement;
    if (frozenDoses !== undefined)
      controller.freezeDoses(
        frozenDoses.twoIterations,
        frozenDoses.fiveIterations,
      );
    return {
      installed:
        typeof window.__EA_TEST_HOOKS__?.p32GameAdvanceWorkload === "function",
      hookReplaced: existing !== replacement,
      previousHookFrozen:
        existing === undefined ? null : Object.isFrozen(existing),
      workloadHasNoGameApiReferences:
        !/Math\.random|performance\.now|window\.evolve|\.action\s*\(/.test(
          workload.toString(),
        ),
    };
  }, doses);
}

async function setCalibrationDose(session, iterations) {
  return session.evaluate((value) => {
    const controller = window.__EA_TEST_HOOKS__?.p55WorkloadControl;
    if (typeof controller?.setCalibrationIterations !== "function")
      throw new Error("P55 calibration controller is missing");
    controller.setCalibrationIterations(value);
    return controller.read();
  }, iterations);
}

async function selectCondition(session, condition) {
  return session.evaluate((value) => {
    const controller = window.__EA_TEST_HOOKS__?.p55WorkloadControl;
    if (typeof controller?.selectCondition !== "function")
      throw new Error("P55 condition controller is missing");
    controller.selectCondition(value);
    return controller.read();
  }, condition);
}

async function readWorkloadControl(session) {
  return session.evaluate(() => {
    const read = window.__EA_TEST_HOOKS__?.p55WorkloadControl?.read;
    if (typeof read !== "function")
      throw new Error("P55 workload hook is missing");
    return read();
  });
}

async function freezeDoses(session, calibration) {
  return session.evaluate((doses) => {
    const controller = window.__EA_TEST_HOOKS__?.p55WorkloadControl;
    if (typeof controller?.freezeDoses !== "function")
      throw new Error("P55 dose freezer is missing");
    controller.freezeDoses(doses.twoIterations, doses.fiveIterations);
    return controller.read();
  }, calibration);
}

async function measureWindow({
  runner,
  session,
  descriptor,
  activeRendererPid,
  expectedRendererPids,
  expectedWorkCycles,
}) {
  const workloadBefore = await readWorkloadControl(session);
  const diagnosticsBefore = await session.diagnostics();
  const periodStart = await session.periods();
  const before = await sampleBoundary(runner, session);
  const advanceStartedMs = performance.now();
  const advance = await session.advance(descriptor.periods);
  const advanceWallMs = performance.now() - advanceStartedMs;
  const after = await sampleBoundary(runner, session);
  const diagnosticsAfter = await session.diagnostics();
  const workloadAfter = await readWorkloadControl(session);
  const periodEnd = advance.periods;
  return makeMeasurementWindow({
    descriptor: { ...descriptor, advanceWallMs },
    periods: descriptor.periods,
    periodStart,
    periodEnd,
    reloads: advance.reloads,
    before,
    after,
    diagnosticsBefore,
    diagnosticsAfter,
    workloadBefore,
    workloadAfter,
    activeRendererPid,
    expectedRendererPids,
    expectedWorkCycles,
  });
}

async function runParityCheck({
  save,
  settings,
  seed,
  epoch,
  twoIterations,
  fiveIterations,
}) {
  const runner = await createChromiumRunner();
  const runs = [];
  try {
    for (const condition of ["placebo", "two", "five"]) {
      const session = await runner.openSession({
        bundle: BUNDLE_PATH,
        save,
        settings,
        seed,
        epoch,
        nativeTrace: true,
      });
      try {
        await initializeWorkload(session, { twoIterations, fiveIterations });
        await selectCondition(session, condition);
        const cyclesBefore = (await readWorkloadControl(session)).cycles;
        const startPeriod = await session.periods();
        const advanceStartedMs = performance.now();
        const advance = await session.advance(
          P55_PLAN.semanticParityPeriodsPerArm,
        );
        const advanceWallMs = performance.now() - advanceStartedMs;
        const workload = await readWorkloadControl(session);
        const diagnostics = await session.diagnostics();
        const state = await session.readState();
        const exportSave = await session.exportSave();
        const trace = diagnostics.nativeInvocations ?? [];
        const calls = nativeTraceCalls(trace);
        assert.ok(trace.length > 0, "native parity trace was not captured");
        runs.push({
          condition,
          startPeriod,
          endPeriod: advance.periods,
          periodsAdvanced: advance.periods - startPeriod,
          workCycles: workload.cycles - cyclesBefore,
          doseIterations: workload.iterations,
          cumulativeWorkloadIterations:
            workload.iterations * (workload.cycles - cyclesBefore),
          advanceWallMs,
          randomCalls: diagnostics.randomCalls,
          rngState: diagnostics.rngState,
          controlUsage: diagnostics.controlUsage,
          nativeTraceRows: trace.length,
          nativeApiInvocations: calls.length,
          nativeApiTraceSha256: sha256(stableJson(calls)),
          stateSha256: sha256(stableJson(state)),
          exportSha256: sha256(exportSave),
          errorEvents: diagnostics.events.filter(
            (event) => event.kind !== "log",
          ),
        });
      } finally {
        await session.close();
      }
    }
    const parity = verifyParityRuns(runs);
    return {
      runner: runner.browser,
      periodsPerArm: P55_PLAN.semanticParityPeriodsPerArm,
      totalPeriods: runs.reduce((sum, run) => sum + run.periodsAdvanced, 0),
      tracePairsValidated: true,
      passed: parity.passed,
      parity,
      runs,
    };
  } finally {
    await runner.close();
  }
}

function summarizeAdjacentControlVariation(blocks, windows) {
  const windowsByIndex = new Map(
    windows.map((window) => [window.windowIndex, window]),
  );
  return blocks
    .filter((block) => block.condition === "placebo")
    .map((block) => {
      const ordered = block.windows.map((descriptor) =>
        windowsByIndex.get(descriptor.windowIndex),
      );
      return {
        blockId: block.blockId,
        orientation: block.orientation,
        consecutiveRendererCpuPerCyclePercentChanges: ordered
          .slice(1)
          .map((window, index) => {
            const previous = ordered[index];
            return (
              100 *
              (window.activeRendererCpuSec / previous.activeRendererCpuSec - 1)
            );
          }),
        controlCpuPerCycle: ordered.map(
          (window) => window.activeRendererCpuSec / window.workCycles,
        ),
      };
    });
}

function classifyMethod({
  processStable,
  callbackParity,
  calibration,
  analysis,
}) {
  if (!processStable || !callbackParity || !calibration.valid) return "D";
  if (!calibration.doseVerificationValid) return "B";
  const two = analysis.byCondition.two;
  const five = analysis.byCondition.five;
  const placebo = analysis.byCondition.placebo;
  if (!two.ci95 || !five.ci95 || !placebo.ci95) return "B";
  const twoDetectable = two.ci95[0] > 0;
  const fiveDetectable = five.ci95[0] > 0;
  const placeboNoEffect = placebo.ci95[0] <= 0 && placebo.ci95[1] >= 0;
  const twoDoseMatches =
    Math.abs(two.mean - calibration.twoMeasuredPercent) <=
    P55_PLAN.twoPercentConsistencyTolerancePercentagePoints;
  const orderStable = Object.values(analysis.orderEffects).every(
    (effect) => !effect.material,
  );
  return twoDetectable &&
    fiveDetectable &&
    placeboNoEffect &&
    twoDoseMatches &&
    orderStable
    ? "A"
    : "B";
}

async function stateBoundary(session) {
  const state = await session.readState();
  const summary = summarizeState(state);
  return { summary, sha256: sha256(stableJson(state)) };
}

async function loadInputs() {
  const [
    saveText,
    settingsText,
    gameBytes,
    bundleBytes,
    runnerBytes,
    bridgeBytes,
    runtimeBytes,
    harnessBytes,
  ] = await Promise.all([
    readFile(SAVE_PATH, "utf8"),
    readFile(SETTINGS_PATH, "utf8"),
    readFile(GAME_PATH),
    readFile(BUNDLE_PATH),
    readFile(path.join(root, "tools/chromium-evolve-runner.mjs")),
    readFile(path.join(root, "tools/chromium/bridge.js")),
    readFile(path.join(root, "src/bootstrap/captured-runtime-control.ts")),
    readFile(fileURLToPath(import.meta.url)),
  ]);
  const settings = JSON.parse(settingsText);
  return {
    save: parseSave(saveText),
    settings,
    seed: 42,
    epoch: Date.parse("2026-09-21T00:00:00.000Z"),
    metadata: {
      game: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
      gameSnapshotSha256: sha256(gameBytes),
      savePath: path.relative(root, SAVE_PATH).replaceAll("\\", "/"),
      saveSha256: sha256(saveText),
      settingsPath: path.relative(root, SETTINGS_PATH).replaceAll("\\", "/"),
      settingsSha256: sha256(settingsText),
      testSurfaceBundlePath: path
        .relative(root, BUNDLE_PATH)
        .replaceAll("\\", "/"),
      testSurfaceBundleSha256: sha256(bundleBytes),
      callbackSourceSha256: sha256(runtimeBytes),
      runnerSha256: sha256(runnerBytes),
      bridgeSha256: sha256(bridgeBytes),
      harnessSha256: sha256(harnessBytes),
      baselineTunedFixturePresent: await access(BASELINE_TUNED_PATH)
        .then(() => true)
        .catch(() => false),
    },
  };
}

async function main() {
  assert.ok(P55_PILOT_PERIODS <= P55_PLAN.pilotPeriodCap);
  const outputPath = path.resolve(
    root,
    option("out", path.relative(root, DEFAULT_OUTPUT_PATH)),
  );
  const inputs = await loadInputs();
  const schedule = createP55Schedule();
  const runner = await createChromiumRunner();
  const session = await runner.openSession({
    bundle: BUNDLE_PATH,
    save: inputs.save,
    settings: inputs.settings,
    seed: inputs.seed,
    epoch: inputs.epoch,
  });
  const evidence = {
    schema: "p55-renderer-cpu-method-pilot-v1",
    status: "running",
    decision: null,
    inputs: inputs.metadata,
    runner: {
      browser: runner.browser,
      inputs: runner.inputs,
      pageTargetId: session.pageTargetId,
      rendererPid: null,
      browserProcessPid: runner.browser.pid,
    },
    plan: {
      pilotPeriodCap: P55_PLAN.pilotPeriodCap,
      initializationWarmupPeriods: P55_PLAN.initializationWarmupPeriods,
      calibrationWindowCount:
        P55_PLAN.exploratoryCalibrationIterations.length +
        P55_PLAN.verificationCalibrationWindows.length,
      calibrationPeriodsPerWindow: P55_PLAN.calibrationPeriodsPerWindow,
      measurementWindowCount: schedule.windowCount,
      measurementPeriodsPerWindow: P55_PLAN.measurementPeriodsPerWindow,
      calibrationPeriodsTotal:
        (P55_PLAN.exploratoryCalibrationIterations.length +
          P55_PLAN.verificationCalibrationWindows.length) *
        P55_PLAN.calibrationPeriodsPerWindow,
      measurementPeriodsTotal:
        schedule.windowCount * P55_PLAN.measurementPeriodsPerWindow,
      pilotPeriods: P55_PILOT_PERIODS,
      semanticParityPeriods: 3 * P55_PLAN.semanticParityPeriodsPerArm,
      pilotCapIncludesSemanticParity: true,
      initializationPeriodsExcludedFromPilotCap:
        P55_PLAN.initializationWarmupPeriods,
      callbackCadenceExpectedWorkCycles:
        P55_PLAN.measurementPeriodsPerWindow / 8,
      measurementMethod:
        "single page and renderer; 0%, 2%, and 5% callback doses in randomized counterbalanced blocks",
      acceptanceMetric:
        "browser-target SystemInfo renderer process CPU seconds",
      supportingMetric: "CDP TaskDuration delta seconds",
      diagnosticMetric: "CDP ScriptDuration delta seconds",
      invalidationReasons: [
        "process or renderer PID churn",
        "corrupted period/CPU sampling boundary",
        "incorrect callback treatment placement",
        "native gameplay parity failure",
        "work-cycle cadence change",
        "other objectively broken instrumentation",
      ],
      ordinaryCpuVariationIsNotAnInvalidationReason: true,
      noNativeCatalogProbeAdded: true,
      noStateRewindOrMutation: true,
    },
    callbackPlacement: {
      hook: "p32GameAdvanceWorkload",
      sourceLocation:
        "runCycle test-surface hook before gameplay state reset and owner phases",
      workloadChangesOnlyClosureLocals: true,
      callbackOrderingChanged: false,
      settingsStateRngOrControlResolutionChanged: false,
      callbackProfileEnabled: false,
      performancePhaseProfilingEnabled: false,
      nativeTraceEnabledDuringCpuPilot: false,
    },
    initialization: null,
    calibration: {
      exploratoryWindows: [],
      verificationWindows: [],
      dosesFrozen: false,
      fitValid: false,
      doseVerificationValid: false,
      rendererAttribution: null,
      fittedDoses: null,
      verification: null,
      valid: false,
    },
    semanticParity: null,
    schedule,
    measurement: {
      windows: [],
      blocks: [],
      adjacentPlaceboVariation: [],
      processStable: false,
      allValidWindowsRetained: true,
    },
    statisticalAnalysis: null,
  };

  try {
    const hookInstallation = await initializeWorkload(session);
    assert.equal(hookInstallation.installed, true);
    assert.equal(hookInstallation.workloadHasNoGameApiReferences, true);
    evidence.callbackPlacement.hookInstallation = hookInstallation;
    const initialLoads = (await session.diagnostics()).loads;
    await setCalibrationDose(
      session,
      P55_PLAN.initializationWorkloadWarmupIterations,
    );
    const warmupStartPeriod = await session.periods();
    const warmupStartedMs = performance.now();
    const warmupResult = await session.advance(
      P55_PLAN.initializationWarmupPeriods,
    );
    const warmupWorkload = await readWorkloadControl(session);
    evidence.initialization = {
      warmupPeriodsRequested: P55_PLAN.initializationWarmupPeriods,
      warmupPeriodsAdvanced: warmupResult.periods - warmupStartPeriod,
      warmupWorkCycles: warmupWorkload.cycles,
      warmupWallMs: performance.now() - warmupStartedMs,
      workloadWarmupIterationsPerCycle:
        P55_PLAN.initializationWorkloadWarmupIterations,
      workloadWarmupTotalIterations:
        P55_PLAN.initializationWorkloadWarmupIterations * warmupWorkload.cycles,
      pageLoadsBefore: initialLoads,
      pageLoadsAfter: (await session.diagnostics()).loads,
      excludedFromPilotPeriodCap: true,
      purpose: "settle game callback and V8 loop warmup before CPU calibration",
    };
    await setCalibrationDose(session, 0);

    const exploratoryIterations = P55_PLAN.exploratoryCalibrationIterations;
    for (const [index, iterations] of exploratoryIterations.entries()) {
      await setCalibrationDose(session, iterations);
      const descriptor = {
        stage: "exploratory-calibration",
        calibrationIndex: index,
        dose: iterations === 0 ? "placebo" : "calibration",
        role: "process-cpu-dose-fit",
        periods: P55_PLAN.calibrationPeriodsPerWindow,
      };
      const window = await measureWindow({
        runner,
        session,
        descriptor,
        activeRendererPid: null,
        expectedRendererPids: undefined,
        expectedWorkCycles: P55_PLAN.calibrationPeriodsPerWindow / 8,
      });
      window.callbackDoseIterations = iterations;
      window.dose = descriptor.dose;
      evidence.calibration.exploratoryWindows.push(window);
      if (!window.valid)
        throw new Error("P55 calibration window was objectively invalid");
    }

    const rendererAttribution = attributeRendererPid(
      evidence.calibration.exploratoryWindows,
    );
    evidence.calibration.rendererAttribution = rendererAttribution;
    evidence.runner.rendererPid = rendererAttribution.activeRendererPid;
    const fitted = fitCalibration(
      evidence.calibration.exploratoryWindows,
      rendererAttribution.activeRendererPid,
    );
    evidence.calibration.fittedDoses = fitted;
    evidence.calibration.fitValid = fitted.doseResponseMonotonic;
    if (!evidence.calibration.fitValid) {
      evidence.status =
        "D — renderer CPU calibration dose response was not monotonic";
      throw new Error("P55 high-dose callback calibration was not monotonic");
    }
    const frozen = await freezeDoses(session, fitted);
    assert.equal(frozen.dosesFrozen, true);
    evidence.calibration.dosesFrozen = true;

    for (const [
      index,
      condition,
    ] of P55_PLAN.verificationCalibrationWindows.entries()) {
      await selectCondition(session, condition);
      const descriptor = {
        stage: "dose-verification",
        calibrationIndex: index,
        dose: condition,
        role: "frozen-dose-cpu-check",
        periods: P55_PLAN.calibrationPeriodsPerWindow,
      };
      const window = await measureWindow({
        runner,
        session,
        descriptor,
        activeRendererPid: rendererAttribution.activeRendererPid,
        expectedRendererPids: rendererAttribution.rendererPids.map(String),
        expectedWorkCycles: P55_PLAN.calibrationPeriodsPerWindow / 8,
      });
      evidence.calibration.verificationWindows.push(window);
      if (!window.valid)
        throw new Error("P55 dose verification window was objectively invalid");
    }
    const verification = calibrationVerification(
      evidence.calibration.verificationWindows,
      rendererAttribution.activeRendererPid,
    );
    evidence.calibration.verification = verification;
    evidence.calibration.twoMeasuredPercent = verification.two.measuredPercent;
    evidence.calibration.fiveMeasuredPercent =
      verification.five.measuredPercent;
    evidence.calibration.doseVerificationValid = Object.values(
      verification,
    ).every((result) => result.withinCalibrationTolerance);
    evidence.calibration.valid = evidence.calibration.fitValid;

    const expectedRendererPids = rendererAttribution.rendererPids.map(String);
    const expectedWorkCycles = P55_PLAN.measurementPeriodsPerWindow / 8;
    let nextWindowIndex = 0;
    let currentState = await stateBoundary(session);
    let processStable = true;
    for (const block of schedule.blocks) {
      block.stateStart = currentState;
      for (const descriptor of block.windows) {
        const selected = await selectCondition(session, descriptor.dose);
        assert.equal(selected.dosesFrozen, true);
        const window = await measureWindow({
          runner,
          session,
          descriptor: {
            stage: "measurement",
            windowIndex: nextWindowIndex,
            blockId: block.blockId,
            blockCondition: block.condition,
            replicate: block.replicate,
            orientation: block.orientation,
            role: descriptor.role,
            dose: descriptor.dose,
            doseLabel:
              descriptor.dose === "placebo"
                ? "0%"
                : descriptor.dose === "two"
                  ? "approximately 2%"
                  : "approximately 5%",
            periods: descriptor.periods,
          },
          activeRendererPid: rendererAttribution.activeRendererPid,
          expectedRendererPids,
          expectedWorkCycles,
        });
        window.windowIndex = nextWindowIndex;
        window.role = descriptor.role;
        window.dose = descriptor.dose;
        window.nativeActions =
          window.nativeControlSummary.nativeActionInvocations;
        window.nativeResearchActions =
          window.nativeControlSummary.nativeResearchActionInvocations;
        window.nativeOtherControlCalls =
          window.nativeControlSummary.otherControlInvocations;
        window.rootOrProgressionIndicators = {
          periods: window.periodEnd - window.periodStart,
          days: null,
          workerAndBuildingChangesAtBlockBoundariesOnly: true,
        };
        evidence.measurement.windows.push(window);
        nextWindowIndex += 1;
        if (!window.valid) {
          processStable = false;
          evidence.measurement.processStable = false;
          evidence.status = "D — invalid renderer/callback measurement window";
          throw new Error("P55 measurement window was objectively invalid");
        }
      }
      const endBoundary = await stateBoundary(session);
      block.stateEnd = endBoundary;
      block.stateDelta = summarizeStateDelta(
        block.stateStart.summary,
        endBoundary.summary,
      );
      block.stateChangedDuringBlock =
        block.stateStart.sha256 !== endBoundary.sha256;
      currentState = endBoundary;
    }
    evidence.measurement.processStable = processStable;
    evidence.measurement.blocks = analyzeP55Blocks(
      schedule.blocks,
      evidence.measurement.windows,
    ).blockEffects;
    evidence.measurement.adjacentPlaceboVariation =
      summarizeAdjacentControlVariation(
        schedule.blocks,
        evidence.measurement.windows,
      );
    evidence.measurement.nativeGameplayDrift = evidence.measurement.windows.map(
      (window) => ({
        windowIndex: window.windowIndex,
        periodStart: window.periodStart,
        dose: window.dose,
        workCycles: window.workCycles,
        nativeActions: window.nativeActions,
        nativeJobAssignments:
          window.nativeControlSummary.jobAssignmentInvocations,
        nativeResearchActions: window.nativeResearchActions,
        otherNativeControlCalls: window.nativeOtherControlCalls,
        nativeControlCountsByMethod: window.nativeControlSummary.byMethod,
        taskDurationSec: window.taskDurationSec,
        rendererCpuSec: window.activeRendererCpuSec,
      }),
    );

    evidence.semanticParity = await runParityCheck({
      save: inputs.save,
      settings: inputs.settings,
      seed: inputs.seed,
      epoch: inputs.epoch,
      twoIterations: fitted.twoIterations,
      fiveIterations: fitted.fiveIterations,
    });
    if (!evidence.semanticParity.passed) {
      evidence.status = "D — gameplay parity failed";
      throw new Error("P55 positive-control gameplay parity failed");
    }

    const analysis = analyzeP55Blocks(
      schedule.blocks,
      evidence.measurement.windows,
    );
    const processStableFinal = evidence.measurement.windows.every(
      (window) => window.valid,
    );
    evidence.measurement.processStable = processStableFinal;
    evidence.statisticalAnalysis = {
      experimentalUnit:
        "balanced four-window block; work ticks are correlated subsamples",
      confidenceInterval:
        "two-sided 95% Student t interval over independent block effects",
      noOutlierRemoval: true,
      analysis,
      placeboFalsePositiveCheck:
        analysis.byCondition.placebo.rendererCpuEffect.ci95 === null
          ? "insufficient blocks for an interval"
          : analysis.byCondition.placebo.rendererCpuEffect.ci95[0] <= 0 &&
              analysis.byCondition.placebo.rendererCpuEffect.ci95[1] >= 0
            ? "no detectable A/A placebo effect"
            : "A/A placebo interval excludes zero",
      twoPercentPowerEstimate:
        analysis.byCondition.two.rendererCpuEffect.standardDeviation === null
          ? null
          : {
              confidenceLevel: 0.95,
              targetPower: 0.8,
              effectPercentagePoints: 2,
              currentIndependentBlockCount:
                analysis.byCondition.two.rendererCpuEffect.sampleCount,
              estimatedRequiredBlocks: estimateBlocksFor80PercentPower(
                analysis.byCondition.two.rendererCpuEffect.standardDeviation,
              ),
              method:
                "normal approximation using observed block-level SD; independent block, not work-tick, units",
            },
      orderMaterialityThresholdPercentagePoints:
        P55_PLAN.materialOrderEffectPercentagePoints,
    };
    evidence.calibration.twoMeasuredPercent = verification.two.measuredPercent;
    evidence.decision = classifyMethod({
      processStable: processStableFinal,
      callbackParity: evidence.semanticParity.passed,
      calibration: {
        ...evidence.calibration,
        twoMeasuredPercent: verification.two.measuredPercent,
      },
      analysis,
    });
    evidence.status =
      evidence.decision === "A"
        ? "A — provisionally qualified for further method validation"
        : evidence.decision === "B"
          ? "B — valid within-renderer method; 2% sensitivity not qualified"
          : "C — within-renderer workload comparison is uninterpretable";
  } catch (error) {
    if (evidence.status === "running")
      evidence.status = `D — instrumentation stopped: ${String(error)}`;
    evidence.instrumentationError = String(error?.stack ?? error);
  } finally {
    const phaseWindows = {
      exploratoryCalibration: evidence.calibration.exploratoryWindows,
      frozenDoseVerification: evidence.calibration.verificationWindows,
      measurement: evidence.measurement.windows,
    };
    const summarizeDose = (windows) => ({
      callbackCount: windows.reduce(
        (sum, window) => sum + (window.workCycles ?? 0),
        0,
      ),
      iterations: windows.reduce(
        (sum, window) =>
          sum + (window.callbackDoseIterations ?? 0) * (window.workCycles ?? 0),
        0,
      ),
    });
    const parityRuns = evidence.semanticParity?.runs ?? [];
    evidence.cumulativeWorkloadDose = {
      initialization: {
        callbackCount: evidence.initialization?.warmupWorkCycles ?? 0,
        iterations: evidence.initialization?.workloadWarmupTotalIterations ?? 0,
      },
      phases: Object.fromEntries(
        Object.entries(phaseWindows).map(([phase, windows]) => [
          phase,
          summarizeDose(windows),
        ]),
      ),
      semanticParity: {
        callbackCount: parityRuns.reduce(
          (sum, run) => sum + (run.workCycles ?? 0),
          0,
        ),
        iterations: parityRuns.reduce(
          (sum, run) => sum + (run.cumulativeWorkloadIterations ?? 0),
          0,
        ),
      },
      totalCallbackCount:
        (evidence.initialization?.warmupWorkCycles ?? 0) +
        Object.values(phaseWindows).reduce(
          (sum, windows) => sum + summarizeDose(windows).callbackCount,
          0,
        ) +
        parityRuns.reduce((sum, run) => sum + (run.workCycles ?? 0), 0),
      totalInjectedIterations:
        (evidence.initialization?.workloadWarmupTotalIterations ?? 0) +
        Object.values(phaseWindows).reduce(
          (sum, windows) => sum + summarizeDose(windows).iterations,
          0,
        ) +
        parityRuns.reduce(
          (sum, run) => sum + (run.cumulativeWorkloadIterations ?? 0),
          0,
        ),
    };
    await session.close().catch(() => undefined);
    await runner.close().catch(() => undefined);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  }

  console.log(
    JSON.stringify({
      outputPath,
      status: evidence.status,
      decision: evidence.decision,
      pilotPeriods: evidence.plan.pilotPeriods,
      windowsRetained: evidence.measurement.windows.length,
      activeRendererPid: evidence.runner.rendererPid,
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
