import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const evidence = JSON.parse(
  await readFile(
    new URL(
      "../../experiments/p36-productive-resource-bootstrap-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const exact = (entry) =>
  entry.saveHashEqual &&
  entry.stateEqual &&
  entry.nativeCallsEqual &&
  entry.controlUsageEqual &&
  entry.rngEqual;

assert.equal(evidence.decision, "C");
assert.equal(evidence.treatmentRun, true);
assert.equal(evidence.arms.length, 4);
assert.ok(evidence.parity.AtoB.every(exact));
assert.ok(evidence.parity.CtoCRepeat.every(exact));
assert.deepEqual(evidence.parity.AtoCThroughFirstAuthorization.comparison, {
  period: 448,
  stateEqual: true,
  nativeCallsEqual: true,
  controlUsageEqual: true,
  rngEqual: true,
});

assert.equal(evidence.treatmentDivergencesFromA[0].period, 448);
assert.ok(
  evidence.treatmentDivergencesFromA.every(
    (entry) => entry.changedAreas.length > 0,
  ),
  "reported treatment divergences must include a real changed field",
);
assert.equal(evidence.treatmentResults.firstGather.targetId, "city-shed");
assert.equal(evidence.treatmentResults.shedPurchased.period, 584);
assert.equal(evidence.treatmentResults.quarryFirstEligible.period, 584);
assert.equal(evidence.treatmentResults.quarryPurchased, null);
assert.deepEqual(evidence.treatmentResults.gatherClicks, {
  shed: 79,
  quarry: 60,
  total: 139,
  byResource: { Lumber: 86, Stone: 53 },
});
assert.equal(
  evidence.treatmentResults.policyEvents.at(-1).reason,
  "shortage-exceeds-remaining-budget",
);
assert.deepEqual(evidence.treatmentResults.policyEvents.at(-1).shortage, {
  Lumber: 18,
  Stone: 0,
});
assert.equal(evidence.treatmentResults.foodSustainableAcrossSamples, true);
assert.equal(evidence.treatmentResults.noStarvationOrDeaths, true);
assert.equal(
  evidence.treatmentResults.positiveStoneProductionFromNativeJob,
  false,
);
assert.deepEqual(evidence.treatmentResults.downstreamPopulationAndJobChanges, [
  {
    period: 688,
    baselineAtFirstAuthorization: {
      population: 3,
      populationCapacity: 3,
      jobs: { farmer: 3 },
      buildings: { farm: 1, basic_housing: 3 },
    },
    treatmentAtBoundedStop: {
      population: 4,
      populationCapacity: 4,
      jobs: { farmer: 4 },
      buildings: { farm: 1, basic_housing: 4, shed: 1 },
    },
    nativeHousingPurchaseObserved: true,
  },
]);
assert.equal(evidence.performance.successfulGatherActions, 139);
assert.equal(evidence.performance.freshNativePriceProbes, 899);
assert.equal(evidence.performance.validationFences, 688);
assert.equal(evidence.performance.p34Modeled583_3MsUsed, false);
assert.equal(evidence.debugExposeSet, false);
assert.equal(evidence.debugGlobalsUsed, false);

console.log("P36 exact replay evidence and bounded-stop regression ok");
