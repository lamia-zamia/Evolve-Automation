import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createP35PreflightEvidence } from "../../experiments/p35-targeted-allocation-preflight.mjs";

const evidence = JSON.parse(
  await readFile(
    new URL(
      "../../experiments/p35-targeted-allocation-value-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

assert.deepEqual(await createP35PreflightEvidence(), evidence);
assert.equal(evidence.decision, "negative-preflight");
assert.equal(evidence.treatmentRun, false);
assert.equal(evidence.targetSelected, null);
assert.equal(evidence.interventionWindow, null);
assert.equal(evidence.replayInputs.p33P34LiveEligibilityParity, true);
assert.equal(evidence.liveTargetGroups.length, 4);

const secondFarm = evidence.targetAssessment.secondFarm;
assert.equal(secondFarm.firstEligiblePeriod, 80);
assert.equal(secondFarm.alreadyOwnedAtFirstEligible, 1);
assert.deepEqual(secondFarm.materialShortageAtFirstEligible, {
  Lumber: 0,
  Stone: 14,
});

const shed = evidence.targetAssessment.shed;
assert.equal(shed.firstObservedPeriod, 272);
assert.equal(shed.firstMoneyAffordablePeriod, 448);
assert.deepEqual(shed.materialShortageAtFirstEligible, {
  Lumber: 35,
  Stone: 45,
});
assert.equal(shed.estimatedMaterialClicksAtP19Stock, 80);
assert.equal(shed.directProductiveOutput, false);
assert.equal(shed.downstream.requiresASecondTargetEpisode, true);
assert.equal(shed.downstream.quarryPurchased, false);
assert.equal(shed.downstream.p20QuarryClicks.clicks, 48);

assert.equal(evidence.baseline.sustainableAtP5000AndP10000, true);
assert.deepEqual(
  evidence.baseline.researchGrants.map(({ period }) => period),
  [16, 56, 96, 192, 272, 456, 672, 936, 1216, 1536, 1896],
);
assert.equal(
  evidence.p34ReferenceCost.actualTreatmentExecutorMeasurement,
  null,
);
assert.equal(evidence.p34ReferenceCost.cpuTwoPercentGate, "unresolved");

console.log("P35 target-specific allocation negative preflight ok");
