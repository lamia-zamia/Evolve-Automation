import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const evidence = JSON.parse(
  readFileSync(
    new URL(
      "../../experiments/p34-allocation-execution-cost-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

assert.equal(evidence.clockCalibration.virtualElapsedMs, 0);
assert.ok(evidence.clockCalibration.nativeElapsedMs >= 40);
assert.equal(evidence.measurement.shadowInvocations, 625);
assert.equal(evidence.measurement.reservationCapturePasses, 625);
assert.ok(evidence.measurement.nativeShadowDirectElapsedMs.total > 0);

for (const phase of [
  "orderingGenerationStamp",
  "currentTargetEvidencePublication",
  "rootProgressionControlGenerationCapture",
  "resourceAndQueueObservations",
  "handoffAndCompetingClaimObservation",
  "reservationCapture",
  "pureShadowEvaluation",
  "snapshotFreezingAndDiagnosticRecording",
]) {
  const sample = evidence.measurement.nonOverlappingPhaseSamples[phase];
  assert.equal(sample.count, 625, `${phase} has a sample for each work cycle`);
  assert.ok(sample.total >= 0);
  assert.ok(sample.max >= sample.p95);
}

assert.equal(evidence.executionTimeValidation.measured.period, 80);
assert.equal(evidence.executionTimeValidation.measured.actionId, "city-farm");
assert.deepEqual(
  evidence.executionTimeValidation.measured.freshPrice.cost,
  evidence.executionTimeValidation.measured.capturedOrderPrice,
);
assert.equal(evidence.executionTimeValidation.actionPriceProbeCount, 280);
assert.equal(
  evidence.executionTimeValidation.allFreshPricesMatchCurrentOrder,
  true,
);
assert.equal(evidence.executionTimeValidation.exportUnchanged, true);
assert.equal(evidence.executionTimeValidation.nativeActionsIssued, 0);

assert.ok(
  evidence.p19VsShadowParity.every(
    (checkpoint) =>
      checkpoint.nativeCallsEqual &&
      checkpoint.stateEqual &&
      checkpoint.controlUsageEqual &&
      checkpoint.rngEqual &&
      checkpoint.exportHashEqual,
  ),
);
assert.equal(evidence.authorityCounts.firstPositive.period, 80);
assert.equal(evidence.authorityCounts.firstPositive.target.id, "city-farm");
assert.equal(
  evidence.arms[1].checkpoints.find(({ period }) => period === 80).state
    .buildings.farm,
  1,
);
assert.equal(evidence.arms[1].checkpoints.at(-1).state.jobs.farmer, 3);
assert.equal(evidence.arms[2].checkpoints.at(-1).state.jobs.farmer, 3);
assert.ok(
  evidence.authorityCounts.rejectionReasons["active-handoff-conflict"] > 0,
);
assert.ok(
  evidence.authorityCounts.rejectionReasons[
    "non-gatherable-unaffordable:Money"
  ] > 0,
);
assert.equal(evidence.decision.outcome, "B");
