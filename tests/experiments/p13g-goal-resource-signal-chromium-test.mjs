import assert from "node:assert/strict";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  accountProcessCpu,
  createChromiumRunner,
} from "../../tools/chromium-evolve-runner.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const signalBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/domain/economy/goal-resource-signal.ts"],
  bundle: true,
  format: "iife",
  globalName: "__EA_P13G_SIGNAL__",
  write: false,
  platform: "browser",
  target: ["esnext"],
});
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata}\n${signalBundle.outputFiles[0].text}\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}) }; window.__EA_TEST_HOOKS__.evaluateP13GSignal = __EA_P13G_SIGNAL__.evaluateGoalResourceSignal;`,
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
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p13g-goal-resource-signal.user.js",
);
await mkdir(path.dirname(bundlePath), { recursive: true });
await writeFile(bundlePath, built.outputFiles[0].contents);

const base = () => ({
  goalId: "goal:current",
  goalStatus: "active",
  actionId: "native:action",
  goalActionAuthority: "verified",
  resourceId: "Steel",
  poolId: "civilization-wide",
  required: 250,
  provenance: "native-immediate-price",
  confidence: "verified",
  observation: {
    id: "research-offers-17",
    generation: 17,
    rootGeneration: 4,
    progressionGeneration: "progression-12",
    ownerCycle: 30,
    permissionGeneration: 2,
    smelterControlGeneration: 8,
    demandGeneration: 11,
    stockObservationId: "stock:30",
    stockGeneration: 5,
    demandIdentity: "demand:30",
    aggregateTarget: 1_000,
    constructionTargetIdentity: "construction:coal-power",
  },
  offer: {
    freshness: "current",
    present: true,
    priceIdentity: "native-price:steel-250",
    generation: 17,
    rootGeneration: 4,
    progressionGeneration: "progression-12",
    controlGeneration: 17,
    poolId: "civilization-wide",
  },
  current: {
    ownerCycle: 30,
    observationId: "research-offers-17",
    rootGeneration: 4,
    progressionGeneration: "progression-12",
    controlGeneration: 17,
    offerGeneration: 17,
    priceIdentity: "native-price:steel-250",
    demandGeneration: 11,
    stockGeneration: 5,
    stockObservationId: "stock:30",
    permissionGeneration: 2,
    permissionEnabled: true,
    smelterControlGeneration: 8,
    demandIdentity: "demand:30",
    aggregateTarget: 1_000,
    constructionTargetIdentity: "construction:coal-power",
  },
  stock: { amount: 10, capacity: 33_516, poolId: "civilization-wide" },
  demand: {
    aggregateTarget: 1_000,
    currentDemand: 990,
    allocation: 1,
    constructionSavingTarget: {
      id: "construction:coal-power",
      poolId: undefined,
      resourceTarget: 1_000,
    },
    knownCommitments: [],
    commitmentCoverage: "complete",
    spendingOrderKnown: true,
  },
  unknownEvidence: [],
  blockingEvidence: [],
});

const cases = [];
const represented = base();
cases.push({
  input: represented,
  status: "already-represented",
  requiredTarget: undefined,
});
const additional = base();
additional.demand.aggregateTarget = 100;
additional.current.aggregateTarget = 100;
additional.observation.aggregateTarget = 100;
additional.demand.currentDemand = 90;
cases.push({
  input: additional,
  status: "additional-target-supported",
  requiredTarget: 250,
});
const unresolved = base();
unresolved.demand.aggregateTarget = 100;
unresolved.current.aggregateTarget = 100;
unresolved.observation.aggregateTarget = 100;
unresolved.demand.commitmentCoverage = "unknown";
cases.push({
  input: unresolved,
  status: "competing-spending-unresolved",
  requiredTarget: undefined,
});
const constructionOnly = base();
constructionOnly.demand.aggregateTarget = 100;
constructionOnly.current.aggregateTarget = 100;
constructionOnly.observation.aggregateTarget = 100;
constructionOnly.demand.constructionSavingTarget = {
  id: "construction:known",
  poolId: "civilization-wide",
  resourceTarget: 100,
};
cases.push({
  input: constructionOnly,
  status: "additional-target-supported",
  requiredTarget: 250,
});
const resourceThresholdMet = base();
resourceThresholdMet.stock.amount = 250;
cases.push({
  input: resourceThresholdMet,
  status: "resource-threshold-met",
  requiredTarget: undefined,
});
const goalActuallySatisfied = base();
goalActuallySatisfied.goalStatus = "satisfied";
cases.push({
  input: goalActuallySatisfied,
  status: "goal-already-satisfied",
  requiredTarget: undefined,
});
const unknownControlGeneration = base();
unknownControlGeneration.offer.controlGeneration = undefined;
unknownControlGeneration.current.controlGeneration = undefined;
cases.push({
  input: unknownControlGeneration,
  status: "goal-evidence-unavailable",
  unavailableReason: "native-control-replaced",
});
const staleResearch = base();
staleResearch.offer.freshness = "previous-cycle";
cases.push({
  input: staleResearch,
  status: "goal-evidence-unavailable",
  unavailableReason: "native-offer-not-current",
});
const regionalMismatch = base();
regionalMismatch.poolId = "city:1";
cases.push({
  input: regionalMismatch,
  status: "goal-evidence-unavailable",
  unavailableReason: "native-offer-supply-pool-mismatch",
});
const notSelected = base();
notSelected.goalActionAuthority = "advisory";
cases.push({
  input: notSelected,
  status: "goal-evidence-unavailable",
  unavailableReason: "goal-action-selection-not-established",
});

const runner = await createChromiumRunner({
  game: path.join(root, "test-artifacts/game/evolve-deadspace.js"),
});
try {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: null,
    settings: { masterScriptToggle: true, autoSmelter: false },
    seed: 42,
  });
  try {
    const results = await session.evaluate((rows) => {
      const evaluate = globalThis.__EA_TEST_HOOKS__.evaluateP13GSignal;
      return rows.map(({ input }) => evaluate(input));
    }, cases);
    for (let index = 0; index < cases.length; index++) {
      const expected = cases[index];
      const result = results[index];
      assert.equal(result.status, expected.status);
      assert.equal(result.requiredTarget, expected.requiredTarget);
      if (expected.unavailableReason !== undefined)
        assert.ok(
          result.unavailableReasons.includes(expected.unavailableReason),
        );
      assert.equal(result.executableAuthorization, false);
    }
    assert.equal(results[0].constructionSavingTarget.resourceTarget, 1_000);

    const beforeCalibration = await runner.processCpu();
    const beforeCalibrationMetrics = await session.metrics();
    await session.evaluate(() => {
      const now = globalThis.__EA_RUNNER__.nativeNow;
      const end = now() + 120;
      let value = 0;
      while (now() < end)
        for (let index = 1; index <= 500; index++)
          value = (value + Math.imul(index, value + index)) | 0;
      return value;
    });
    const afterCalibrationMetrics = await session.metrics();
    const afterCalibration = await runner.processCpu();
    const calibration = accountProcessCpu(beforeCalibration, afterCalibration);
    const renderer = calibration.rows
      .filter((row) => row.type === "renderer" && row.cpuSec !== undefined)
      .toSorted((left, right) => right.cpuSec - left.cpuSec)[0];
    assert.ok(renderer, "renderer CPU calibration did not identify a renderer");

    const beforeSignal = await runner.processCpu();
    const beforeSignalMetrics = await session.metrics();
    const pureMeasurement = await session.evaluate((input) => {
      const evaluate = globalThis.__EA_TEST_HOOKS__.evaluateP13GSignal;
      const now = globalThis.__EA_RUNNER__.nativeNow;
      const batches = 16;
      const callsPerBatch = 1_000;
      const signalMs = [];
      const emptyMs = [];
      let signalStatus;
      for (let batch = 0; batch < batches; batch++) {
        let start = now();
        for (let call = 0; call < callsPerBatch; call++)
          signalStatus = evaluate(input).status;
        signalMs.push(now() - start);
        start = now();
        let emptyChecksum = 0;
        for (let call = 0; call < callsPerBatch; call++)
          emptyChecksum = (emptyChecksum + (call & 1)) | 0;
        signalStatus = emptyChecksum === -1 ? "impossible" : signalStatus;
        emptyMs.push(now() - start);
      }
      return { batches, callsPerBatch, signalMs, emptyMs, signalStatus };
    }, cases[0].input);
    const afterSignalMetrics = await session.metrics();
    const afterSignal = await runner.processCpu();
    const measuredCpu = accountProcessCpu(
      beforeSignal,
      afterSignal,
      renderer.id,
    );
    const median = (values) =>
      [...values].sort((left, right) => left - right)[
        Math.floor(values.length / 2)
      ];
    const calls = pureMeasurement.batches * pureMeasurement.callsPerBatch;
    const signalMedianMsPerCall =
      (median(pureMeasurement.signalMs) / pureMeasurement.callsPerBatch) * 1000;
    const emptyMedianMsPerCall =
      (median(pureMeasurement.emptyMs) / pureMeasurement.callsPerBatch) * 1000;
    const measured = {
      browser: runner.browser.version,
      rendererId: renderer.id,
      fixture:
        "synthetic verified native offer; already represented by incumbent target",
      calls,
      signalStatus: pureMeasurement.signalStatus,
      signalMedianMsPerCall,
      emptyMedianMsPerCall,
      rendererCpuSec: measuredCpu.rendererCpuSec,
      taskDurationSec:
        afterSignalMetrics.TaskDuration - beforeSignalMetrics.TaskDuration,
      calibrationTaskDurationSec:
        afterCalibrationMetrics.TaskDuration -
        beforeCalibrationMetrics.TaskDuration,
      scope:
        "bounded pure computation; not a production runtime or 2% CPU result",
    };
    await mkdir(path.join(root, "test-artifacts/benchmark/tmp"), {
      recursive: true,
    });
    await writeFile(
      path.join(
        root,
        "test-artifacts/benchmark/tmp/p13g-goal-resource-signal-chromium.json",
      ),
      `${JSON.stringify(measured, null, 2)}\n`,
    );
    console.log(JSON.stringify(measured));
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
  await unlink(bundlePath).catch(() => {});
}
