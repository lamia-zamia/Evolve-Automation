import assert from "node:assert/strict";

import {
  P55_PILOT_PERIODS,
  P55_PLAN,
  analyzeP55Blocks,
  countNativeTraceRows,
  createP55Schedule,
  deltaControlUsage,
  estimateBlocksFor80PercentPower,
  fitCalibration,
  hostCpuBusyPercent,
  summarize,
  summarizeControlUsage,
} from "../../experiments/p55-renderer-cpu-method.mjs";

assert.equal(P55_PILOT_PERIODS, 3_264);
assert.ok(P55_PILOT_PERIODS <= P55_PLAN.pilotPeriodCap);

const schedule = createP55Schedule();
assert.deepEqual(schedule, createP55Schedule());
assert.notDeepEqual(schedule, createP55Schedule(7));
assert.equal(schedule.blockCount, 11);
assert.equal(schedule.windowCount, 44);
for (const condition of ["two", "five"]) {
  const blocks = schedule.blocks.filter(
    (block) => block.condition === condition,
  );
  assert.deepEqual(blocks.map((block) => block.orientation).toSorted(), [
    "ABBA",
    "ABBA",
    "BAAB",
    "BAAB",
  ]);
}
for (const block of schedule.blocks) {
  assert.equal(block.windows.length, 4);
  assert.equal(
    block.windows.filter((window) => window.role === "control").length,
    2,
  );
  assert.equal(
    block.windows.filter((window) => window.role === "treatment").length,
    2,
  );
  assert.deepEqual(
    block.windows.map((window) => window.position),
    [1, 2, 3, 4],
  );
}

const syntheticWindows = schedule.blocks.flatMap((block) =>
  block.windows.map((window) => {
    const baseline = 0.2 + window.windowIndex * 0.0001;
    const effect =
      block.condition === "placebo"
        ? 0
        : block.condition === "two"
          ? 0.02
          : 0.05;
    const roleEffect = window.role === "treatment" ? effect : 0;
    const cpuRate = baseline * (1 + roleEffect);
    const taskRate = 0.16 * (1 + roleEffect);
    return {
      ...window,
      valid: true,
      workCycles: P55_PLAN.measurementPeriodsPerWindow / 8,
      activeRendererCpuSec:
        cpuRate * (P55_PLAN.measurementPeriodsPerWindow / 8),
      taskDurationSec: taskRate * (P55_PLAN.measurementPeriodsPerWindow / 8),
      runnerPeriodsPerSecond: 70,
      nativeControlSummary: { totalNativeControlInvocations: 0 },
    };
  }),
);
const analysis = analyzeP55Blocks(schedule.blocks, syntheticWindows);
assert.equal(analysis.allWindowsRetained, 44);
assert.equal(analysis.invalidWindowCount, 0);
assert.ok(Math.abs(analysis.byCondition.placebo.rendererCpuEffect.mean) < 0.01);
assert.ok(Math.abs(analysis.byCondition.two.rendererCpuEffect.mean - 2) < 0.01);
assert.ok(
  Math.abs(analysis.byCondition.five.rendererCpuEffect.mean - 5) < 0.01,
);
assert.ok(analysis.byCondition.two.rendererCpuEffect.ci95);
assert.equal(analysis.orderEffects.two.material, false);
assert.equal(analysis.orderEffects.five.material, false);

const calibrationWindows = P55_PLAN.exploratoryCalibrationIterations.map(
  (iterations) => {
    const baselinePerCycleSec = 0.2;
    const iterationCostSec = 1e-10;
    return {
      callbackDoseIterations: iterations,
      workCycles: P55_PLAN.calibrationPeriodsPerWindow / 8,
      processCpuRowsBefore: [{ type: "renderer", id: 900, cpuSec: 10 }],
      processCpuRowsAfter: [
        {
          type: "renderer",
          id: 900,
          cpuSec:
            10 +
            (P55_PLAN.calibrationPeriodsPerWindow / 8) *
              (baselinePerCycleSec + iterations * iterationCostSec),
        },
      ],
    };
  },
);
const calibration = fitCalibration(calibrationWindows, 900);
assert.equal(calibration.doseResponseMonotonic, true);
assert.equal(calibration.twoIterations, 40_000_000);
assert.equal(calibration.fiveIterations, 100_000_000);
assert.ok(Math.abs(calibration.targetTwoPercent - 2) < 1e-8);
assert.ok(Math.abs(calibration.targetFivePercent - 5) < 1e-8);

assert.equal(
  hostCpuBusyPercent(
    [{ times: { user: 100, nice: 0, sys: 50, irq: 0, idle: 850 } }],
    [{ times: { user: 120, nice: 0, sys: 60, irq: 0, idle: 920 } }],
  ),
  30,
);
assert.equal(
  hostCpuBusyPercent(
    [{ times: { user: 10, nice: 0, sys: 0, irq: 0, idle: 10 } }],
    [{ times: { user: 9, nice: 0, sys: 0, irq: 0, idle: 10 } }],
  ),
  null,
);

const usageDelta = deltaControlUsage(
  { "buildQueue.setData": { returned: 10, threw: 1 } },
  {
    "buildQueue.setData": { returned: 15, threw: 1 },
    "city-rock_quarry.action": { returned: 2, threw: 0 },
  },
);
assert.deepEqual(usageDelta, {
  "buildQueue.setData": { returned: 5, threw: 0 },
  "city-rock_quarry.action": { returned: 2, threw: 0 },
});
assert.deepEqual(summarizeControlUsage(usageDelta), {
  byMethod: { setData: 5, action: 2 },
  byControl: {
    "buildQueue.setData": 5,
    "city-rock_quarry.action": 2,
  },
  nativeActionInvocations: 2,
  nativeResearchActionInvocations: 0,
  jobAssignmentInvocations: 0,
  otherControlInvocations: 5,
  thrownInvocations: 0,
  totalNativeControlInvocations: 7,
});

assert.deepEqual(summarize([]), {
  sampleCount: 0,
  mean: null,
  standardDeviation: null,
  ci95: null,
});
assert.deepEqual(summarize([2]), {
  sampleCount: 1,
  mean: 2,
  standardDeviation: null,
  ci95: null,
});
assert.equal(summarize([2, 4, 6]).mean, 4);
assert.ok(estimateBlocksFor80PercentPower(1) >= 2);
assert.equal(estimateBlocksFor80PercentPower(null), null);

const trace = [
  { order: 0, period: 720, elementId: "buildQueue", method: "setData" },
  { order: 1, period: 720, elementId: "buildQueue", method: "setData" },
  { order: 2, period: 720, elementId: "city-rock_quarry", method: "action" },
  { order: 3, period: 720, elementId: "city-rock_quarry", method: "action" },
];
assert.deepEqual(
  countNativeTraceRows(
    trace,
    (entry) => entry.period === 720 && entry.method === "setData",
  ),
  { rawTraceRows: 2, nativeApiInvocations: 1 },
);
assert.throws(() => countNativeTraceRows(trace.slice(0, -1)), /call pairs/);

console.log(
  "ok P55 renderer CPU schedule, counterbalance, controls, and accounting",
);
