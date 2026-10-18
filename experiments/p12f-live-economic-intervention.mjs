import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { compareGoalStrategies } from "../src/domain/economy/goal-feasibility.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "test-artifacts/benchmark/tmp");
const capturePath = path.join(tmp, "p12f-p12b-capture.json");
const outputPath =
  process.argv.find((argument) => argument.startsWith("--out="))?.slice(6) ??
  path.join(tmp, "p12f-live-economic-intervention.json");

execFileSync(
  process.execPath,
  [
    path.join(root, "experiments/p12b-native-prerequisite-capture.mjs"),
    "--out=" + capturePath,
  ],
  { cwd: root, stdio: "inherit", maxBuffer: 32 * 1024 * 1024 },
);

const capture = JSON.parse(await readFile(capturePath, "utf8"));
const independent = capture.explicitIndependentCapture;
const planner = independent.planner;
const projection = planner.resourceProjection;
const steelCandidate = projection.candidates.find(
  ({ actionId }) => actionId === "tech-steel_containers",
);
assert.ok(steelCandidate?.nativeOffer?.price);
assert.equal(independent.smelterPermission, "disabled");
assert.equal(independent.smelterPlan?.input?.initialised, false);

const validityEpoch = projection.validityEpoch;
const stocks = independent.catalog.resourceSamples.flatMap((sample) =>
  sample.present &&
  Number.isFinite(sample.holding) &&
  Number.isFinite(sample.capacity) &&
  Number.isFinite(sample.netRate)
    ? [
        {
          resourceId: sample.resourceId,
          poolId: "anywhere",
          amount: sample.holding,
          capacity: sample.capacity,
          netRate: sample.netRate,
          rateConfidence: "observed",
          validityEpoch,
        },
      ]
    : [],
);
const requirements = steelCandidate.nativeOffer.price.map(
  ({ resourceId, amount }) => ({
    resourceId,
    poolId: "anywhere",
    amount,
  }),
);
const unavailableSmelterCandidate = {
  id: "captured-smelter-steel-demand",
  goalId: "current-action:tech-steel_containers",
  preconditions: {
    satisfied: false,
    reasons: [
      "autoSmelter is explicitly disabled in the current settings",
      "the current save has no initialized Smelter input or iSmelter control",
    ],
  },
  acquisitionCosts: undefined,
  productionChanges: undefined,
  effectsComplete: false,
  effectAuthority: "provisional",
  validityEpoch,
  unavailableReasons: [
    "native resource acquisition or reassignment costs are not captured",
    "complete marginal and collateral production effects are not captured",
    "the current Smelter producer and native control are unavailable",
  ],
};
const compare = () =>
  compareGoalStrategies(
    unavailableSmelterCandidate.goalId,
    requirements,
    stocks,
    [],
    [unavailableSmelterCandidate],
    validityEpoch,
    false,
  );
compare();
const comparisonSamplesMs = [];
let comparison;
for (let index = 0; index < 5; index += 1) {
  const started = performance.now();
  comparison = compare();
  comparisonSamplesMs.push(performance.now() - started);
}
const sortedComparisonSamples = [...comparisonSamplesMs].sort(
  (left, right) => left - right,
);

assert.equal(comparison.winner, undefined);
assert.equal(comparison.strategies[1].status, "unavailable");
assert.equal(comparison.strategies[1].actionable, false);
assert.equal(
  capture.productionParity.baselineAndCandidateEqual &&
    capture.productionParity.controlUsageEqual &&
    capture.productionParity.orderedNativeInvocationsEqual &&
    capture.productionParity.researchDrawCountsEqual,
  true,
);
assert.deepEqual(
  capture.productionParity.baselineResearchActionInvocations,
  [],
);
assert.deepEqual(
  capture.productionParity.candidateResearchActionInvocations,
  [],
);

const report = {
  pinnedGameCommit: capture.snapshotCommit,
  inputIdentity: capture.inputs,
  actionId: steelCandidate.actionId,
  nativeResearchOffer: steelCandidate.nativeOffer,
  currentRequirementFeasibility: steelCandidate.currentAffordability,
  intervention: {
    id: unavailableSmelterCandidate.id,
    nativeReader: "createCapturedSmelterAutomation.readPlanForDiagnostics",
    permission: independent.smelterPermission,
    observedReader: independent.smelterPlan,
    unavailableReasons: unavailableSmelterCandidate.unavailableReasons,
  },
  comparison,
  measurement: {
    reusedNativeCatalogAndResourceCaptureWallMs: independent.captureCallWallMs,
    reusedResourceObservationBatches: independent.resourceObservationBenchmark,
    smelterReaderWallMs: independent.smelterPlanReadElapsedMs,
    marginalEffectAcquisition: {
      status: "unavailable",
      measuredMs: 0,
      reason:
        "no supported result observation can isolate the Smelter marginal without applying a production reassignment",
    },
    pureStrategyComparison: {
      repeats: comparisonSamplesMs.length,
      medianMs: sortedComparisonSamples[2],
      maxMs: sortedComparisonSamples.at(-1),
      samplesMs: comparisonSamplesMs,
    },
    totalCandidateEvaluation: {
      candidates: 1,
      marginalEffectsAcquired: 0,
      comparisonSamples: comparisonSamplesMs.length,
    },
  },
  productionParity: capture.productionParity,
};
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      outputPath,
      actionId: report.actionId,
      interventionPermission: report.intervention.permission,
      comparisonWinner: comparison.winner,
      interventionStatus: comparison.strategies[1].status,
    },
    null,
    2,
  ),
);
